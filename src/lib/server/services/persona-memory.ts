import { createHash, randomUUID } from 'crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	artifacts,
	conversations,
	personaMemoryClusterMembers,
	personaMemoryClusters,
	personaMemoryOverviews,
} from '$lib/server/db/schema';
import type {
	PersonaMemoryClass,
	PersonaMemoryDomain,
	PersonaMemoryItem,
	PersonaMemoryMemberItem,
	PersonaMemoryState,
	PersonaMemoryTemporalInfo,
	PersonaMemoryTemporalKind,
	PersonaMemoryTemporalFreshness,
	PersonaMemoryTopicStatus,
} from '$lib/types';
import { parseJsonRecord as parseJsonRecordOrNull } from '$lib/server/utils/json';
import { clipText, normalizeWhitespace } from '$lib/server/utils/text';
import { areNearDuplicateArtifactTexts } from './evidence-family';
import {
	buildArtifactVisibilityCondition,
	getArtifactOwnershipScope,
	isArtifactCanonicallyOwned,
	parseWorkingDocumentMetadata,
	selectLatestGeneratedDocumentCandidatesByFamily,
} from './knowledge/store';
import { listPersonaMemories } from './honcho';
import { recordMemoryEvents } from './memory-events';
import { queuePersonaClusterSemanticEmbeddingRefresh } from './semantic-embedding-refresh';
import { shortlistSemanticMatchesBySubject } from './semantic-ranking';
import { canUseContextSummarizer, requestStructuredControlModel } from './task-state';
import { classifyMemoryBatch } from './task-state/control-model';
import { shouldIncludePersonaMemoryInGeneratedContext } from '../utils/conversation-boundary-filter';
import {
	determineTeiWinningMode,
	logTeiRetrievalSummary,
	type SemanticShortlistDiagnostics,
	type TeiRerankDiagnostics,
} from './tei-observability';
import { canUseTeiReranker, rerankItems } from './tei-reranker';
import { scoreMatch } from './working-set';
import type { HonchoPersonaMemoryRecord } from './honcho';

const DAY_MS = 86_400_000;
const DREAM_MIN_CHANGES = 10;
const DREAM_INTERVAL_MS = DAY_MS;
const FULL_SWEEP_INTERVAL_MS = 7 * DAY_MS;
const ACTIVE_PROMPT_LIMIT = 8;
const DORMANT_PROMPT_LIMIT = 2;
const PROMPT_TEXT_BUDGET = 1600;
const PROMPT_REFRESH_THROTTLE_MS = 60_000;
const PERSONA_SEMANTIC_SHORTLIST_LIMIT = 12;
const PERSONA_RERANK_LIMIT = 8;
const SEMANTIC_RECONCILE_MIN_CONFIDENCE = 72;
const MAX_SEMANTIC_CANDIDATES = 4;
const ensureClustersReadyInFlight = new Map<string, Promise<void>>();
const promptRefreshTriggeredAt = new Map<string, number>();
const personaRuntimeEpochByUser = new Map<string, number>();

type ClusterPlan = {
	clusterId: string;
	records: HonchoPersonaMemoryRecord[];
	canonicalText: string;
	memoryClass: PersonaMemoryClass;
	salienceScore: number;
	pinned: boolean;
	metadata: Record<string, unknown>;
	firstSeenAt: number;
	lastSeenAt: number;
	lastDreamedAt: number;
	state: PersonaMemoryState;
	decayAt: number | null;
	archiveAt: number | null;
};

function getPersonaRuntimeEpoch(userId: string): number {
	return personaRuntimeEpochByUser.get(userId) ?? 0;
}

function isPersonaRuntimeEpochCurrent(userId: string, epoch: number): boolean {
	return getPersonaRuntimeEpoch(userId) === epoch;
}

export function clearPersonaMemoryRuntimeStateForUser(userId: string): void {
	personaRuntimeEpochByUser.set(userId, getPersonaRuntimeEpoch(userId) + 1);
	ensureClustersReadyInFlight.delete(userId);
	promptRefreshTriggeredAt.delete(userId);
}

type ExistingClusterSnapshot = {
	canonicalText: string;
	memoryClass: PersonaMemoryClass;
	salienceScore: number;
	pinned: boolean;
	metadata: Record<string, unknown>;
	lastDreamedAt: number | null;
	memberIds: string[];
};

type PendingMemoryEvent = {
	eventKey: string;
	userId: string;
	domain: 'persona' | 'temporal' | 'preference';
	eventType:
		| 'persona_fact_updated'
		| 'deadline_set'
		| 'deadline_extended'
		| 'deadline_completed'
		| 'preference_updated';
	subjectId: string | null;
	relatedId: string | null;
	observedAt: number;
	payload: Record<string, unknown>;
};

type InventoryFingerprint = {
	subject: string;
	item: string;
	context: string;
	date: string;
	key: string;
};

type DreamClassification = {
	canonicalText: string;
	memoryClass: PersonaMemoryClass;
	salienceScore: number;
	stateHint?: PersonaMemoryState | null;
	supersededBy?: string | null;
};

const EXPLICIT_TEMPORAL_CUE_PATTERN =
	/\b(today|tonight|tomorrow|yesterday|now|this morning|this afternoon|this evening|this weekend|this week|next week|last week|this month|next month|last month|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i;
const DOCUMENT_MEMORY_DIRECT_CUE_PATTERN =
	/\b(generated file|generated document|chat file id:|generated file version:|assistant response context:|extracted file content:)\b/i;
const DOCUMENT_MEMORY_REFERENCE_PATTERN =
	/\b(file|document|draft|report|brief|proposal|slides|presentation|spreadsheet|worksheet|pdf|docx|xlsx|pptx|odt|rtf|xml|svg)\b/i;
const EXPLICIT_MEMORY_CORRECTION_PATTERN =
	/\b(actually|that's wrong|that is wrong|incorrect|not true|i never said|i didn't say|i did not say|not anymore|no longer|instead|rather than|correction)\b/i;

export const PERSONA_MEMORY_DREAM_SYSTEM_PROMPT =
	'You organize persona memories. Return strict JSON only with canonicalText, memoryClass, salienceScore, timeBound, stateHint, supersededBy. memoryClass must be one of perishable_fact, short_term_constraint, active_project_context, situational_context, stable_preference, identity_profile, long_term_context. Use short_term_constraint for deadlines, short-lived time pressure, or temporary availability constraints. Use active_project_context for currently active work that matters across near-future chats but is not just a durable preference. Prefer compact canonical wording and classify temporary inventory or availability as perishable_fact. Do not infer or invent dates or times for events unless the raw memory text explicitly states them. If a memory mentions a date, meeting, appointment, trip, or other event without an explicit date/time, keep the timing unspecified instead of saying today, now, or adding a calendar date.';

type DreamClusterPayload = {
	rawMemories: Array<{
		id: string;
		content: string;
		scope: HonchoPersonaMemoryRecord['scope'];
		sessionId: string | null;
	}>;
	defaultCanonicalText: string;
	defaultMemoryClass: PersonaMemoryClass;
	defaultSalience: number;
};

type SemanticFingerprint = {
	subject: string | null;
	slot: string | null;
};

type PersonaDocumentMemoryCandidate = {
	id: string;
	type: 'source_document' | 'normalized_document' | 'generated_output';
	name: string;
	label: string;
	summary: string | null;
	contentText: string | null;
	updatedAt: number;
};

type PreferencePolarity = 'positive' | 'negative';

type PreferenceSlotMetadata = {
	preferenceDomain: string;
	preferenceSlot: string;
	preferenceValue: string;
	preferencePolarity: PreferencePolarity;
	preferenceConfidence: number;
};

type FactSlotMetadata = {
	factDomain: 'location' | 'role' | 'employer' | 'study' | 'availability';
	factSubject: string;
	factSlot: string;
	factValue: string;
};

const PREFERENCE_METADATA_KEYS = [
	'preferenceDomain',
	'preferenceSlot',
	'preferenceValue',
	'preferencePolarity',
	'preferenceConfidence',
];

const FRAMEWORK_ALIASES: Record<string, string> = {
	laravel: 'laravel',
	symfony: 'symfony',
	rails: 'rails',
	'django': 'django',
	'next.js': 'next.js',
	nextjs: 'next.js',
	'sveltekit': 'sveltekit',
	express: 'express',
	nestjs: 'nestjs',
	'vue': 'vue',
};

const LANGUAGE_ALIASES: Record<string, string> = {
	typescript: 'typescript',
	javascript: 'javascript',
	php: 'php',
	python: 'python',
	rust: 'rust',
	go: 'go',
	java: 'java',
	'c#': 'c#',
	csharp: 'c#',
	ruby: 'ruby',
	swift: 'swift',
	kotlin: 'kotlin',
};

const EDITOR_ALIASES: Record<string, string> = {
	neovim: 'neovim',
	vim: 'vim',
	'vs code': 'vs_code',
	vscode: 'vs_code',
	intellij: 'intellij',
	'jetbrains': 'jetbrains',
	emacs: 'emacs',
	sublime: 'sublime_text',
};

const OPERATING_SYSTEM_ALIASES: Record<string, string> = {
	macos: 'macos',
	'os x': 'macos',
	windows: 'windows',
	linux: 'linux',
	ubuntu: 'ubuntu',
	arch: 'arch',
	fedora: 'fedora',
};

const TOOL_ALIASES: Record<string, string> = {
	figma: 'figma',
	docker: 'docker',
	git: 'git',
	notion: 'notion',
	slack: 'slack',
	linear: 'linear',
	photoshop: 'photoshop',
};

const STYLE_VALUE_ALIASES: Record<string, string> = {
	concise: 'concise',
	detailed: 'detailed',
	direct: 'direct',
	structured: 'structured',
	formal: 'formal',
	casual: 'casual',
	gentle: 'gentle',
	blunt: 'blunt',
};

const NUMBER_WORDS: Record<string, number> = {
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
	couple: 2,
};

const TOPIC_STOP_WORDS = new Set([
	'the',
	'a',
	'an',
	'and',
	'or',
	'to',
	'for',
	'of',
	'on',
	'in',
	'with',
	'by',
	'from',
	'this',
	'that',
	'these',
	'those',
	'currently',
	'right',
	'now',
	'temporary',
	'temporarily',
	'working',
	'work',
	'project',
	'due',
	'deadline',
	'days',
	'day',
	'weeks',
	'week',
	'hours',
	'hour',
	'time',
	'constrained',
	'constraint',
	'only',
	'have',
	'has',
	'had',
	'within',
	'finish',
	'complete',
	'completing',
	'preparing',
	'building',
	'writing',
	'applying',
]);

function normalizeMemoryText(value: string): string {
	return normalizeWhitespace(value).toLowerCase();
}

function stripTrailingPeriod(value: string): string {
	return normalizeWhitespace(value).replace(/[.]+$/, '');
}

function getPersonaMemoryDomain(memoryClass: PersonaMemoryClass): PersonaMemoryDomain {
	if (memoryClass === 'stable_preference') return 'preference';
	if (
		memoryClass === 'short_term_constraint' ||
		memoryClass === 'active_project_context' ||
		memoryClass === 'situational_context' ||
		memoryClass === 'perishable_fact'
	) {
		return 'temporal';
	}
	return 'persona';
}

function canonicalizePreferenceValue(
	value: string,
	aliases: Record<string, string>
): string | null {
	const normalized = normalizeMemoryText(value);
	for (const [alias, canonical] of Object.entries(aliases)) {
		if (normalized === alias || normalized.includes(alias)) {
			return canonical;
		}
	}
	return null;
}

function detectPreferencePolarity(text: string): PreferencePolarity {
	return /\b(dislikes|hates|avoids|does not like|doesn't like|disfavors)\b/i.test(text)
		? 'negative'
		: 'positive';
}

function buildPreferenceSlotMetadata(params: {
	domain: string;
	slot: string;
	value: string;
	polarity: PreferencePolarity;
	confidence: number;
}): PreferenceSlotMetadata {
	return {
		preferenceDomain: params.domain,
		preferenceSlot: params.slot,
		preferenceValue: params.value,
		preferencePolarity: params.polarity,
		preferenceConfidence: params.confidence,
	};
}

function toRecordWithoutPreferenceMetadata(
	metadata: Record<string, unknown>
): Record<string, unknown> {
	const next = { ...metadata };
	for (const key of PREFERENCE_METADATA_KEYS) {
		delete next[key];
	}
	return next;
}

export function extractPreferenceSlotMetadata(text: string): PreferenceSlotMetadata | null {
	const normalized = stripTrailingPeriod(text);
	const polarity = detectPreferencePolarity(normalized);

	const communicationStyleMatch = normalized.match(
		/\b(?:communication style|feedback style|tone)\b(?:\s+(?:is|should be|leans? toward|prefers?)\s+)(concise|detailed|direct|structured|formal|casual|gentle|blunt)\b/i
	);
	if (communicationStyleMatch) {
		const value = canonicalizePreferenceValue(communicationStyleMatch[1], STYLE_VALUE_ALIASES);
		if (value) {
			return buildPreferenceSlotMetadata({
				domain: 'communication',
				slot: 'communication_style',
				value,
				polarity,
				confidence: 96,
			});
		}
	}

	const writingStyleMatch = normalized.match(
		/\b(?:writing style|writing tone)\b(?:\s+(?:is|should be|leans? toward|prefers?)\s+)(concise|detailed|direct|structured|formal|casual)\b/i
	);
	if (writingStyleMatch) {
		const value = canonicalizePreferenceValue(writingStyleMatch[1], STYLE_VALUE_ALIASES);
		if (value) {
			return buildPreferenceSlotMetadata({
				domain: 'writing',
				slot: 'writing_style',
				value,
				polarity,
				confidence: 96,
			});
		}
	}

	const responseStyleMatch = normalized.match(
		/\bprefers?\s+(concise|detailed|direct|structured|formal|casual|gentle|blunt)\s+(?:answers|responses|feedback|communication|writing)\b/i
	);
	if (responseStyleMatch) {
		const value = canonicalizePreferenceValue(responseStyleMatch[1], STYLE_VALUE_ALIASES);
		if (value) {
			const slot = /\bwriting\b/i.test(normalized) ? 'writing_style' : 'communication_style';
			return buildPreferenceSlotMetadata({
				domain: slot === 'writing_style' ? 'writing' : 'communication',
				slot,
				value,
				polarity,
				confidence: 90,
			});
		}
	}

	const frameworkMatch = normalized.match(
		/\b(?:favorite|preferred|go-to)\s+(?:(php|javascript|typescript|frontend|backend)\s+)?framework\b(?:\s+(?:is|=)\s+)?(.+)$/i
	);
	if (frameworkMatch) {
		const value = canonicalizePreferenceValue(frameworkMatch[2], FRAMEWORK_ALIASES);
		if (value) {
			return buildPreferenceSlotMetadata({
				domain: frameworkMatch[1] ? normalizeMemoryText(frameworkMatch[1]) : 'development',
				slot: frameworkMatch[1]
					? `framework:${normalizeMemoryText(frameworkMatch[1])}`
					: 'framework',
				value,
				polarity,
				confidence: 94,
			});
		}
	}

	const prefersFrameworkForWork = normalized.match(/\b(?:prefers?|likes|loves|dislikes|hates)\s+(.+?)\s+for\s+(php|javascript|typescript)\s+work\b/i);
	if (prefersFrameworkForWork) {
		const value = canonicalizePreferenceValue(prefersFrameworkForWork[1], FRAMEWORK_ALIASES);
		if (value) {
			const language = normalizeMemoryText(prefersFrameworkForWork[2]);
			return buildPreferenceSlotMetadata({
				domain: language,
				slot: `framework:${language}`,
				value,
				polarity,
				confidence: 92,
			});
		}
	}

	const languageMatch = normalized.match(
		/\b(?:favorite|preferred)\s+language\b(?:\s+(?:is|=)\s+)?(.+)$/i
	);
	if (languageMatch) {
		const value = canonicalizePreferenceValue(languageMatch[1], LANGUAGE_ALIASES);
		if (value) {
			return buildPreferenceSlotMetadata({
				domain: 'development',
				slot: 'language',
				value,
				polarity,
				confidence: 94,
			});
		}
	}

	const editorMatch = normalized.match(
		/\b(?:favorite|preferred)\s+editor\b(?:\s+(?:is|=)\s+)?(.+)$/i
	);
	if (editorMatch) {
		const value = canonicalizePreferenceValue(editorMatch[1], EDITOR_ALIASES);
		if (value) {
			return buildPreferenceSlotMetadata({
				domain: 'development',
				slot: 'editor',
				value,
				polarity,
				confidence: 94,
			});
		}
	}

	const operatingSystemMatch = normalized.match(
		/\b(?:favorite|preferred)\s+(?:operating system|os)\b(?:\s+(?:is|=)\s+)?(.+)$/i
	);
	if (operatingSystemMatch) {
		const value = canonicalizePreferenceValue(operatingSystemMatch[1], OPERATING_SYSTEM_ALIASES);
		if (value) {
			return buildPreferenceSlotMetadata({
				domain: 'development',
				slot: 'operating_system',
				value,
				polarity,
				confidence: 94,
			});
		}
	}

	const toolMatch = normalized.match(
		/\b(?:favorite|preferred|go-to)\s+tool\b(?:\s+(?:is|=)\s+)?(.+)$/i
	);
	if (toolMatch) {
		const value = canonicalizePreferenceValue(toolMatch[1], TOOL_ALIASES);
		if (value) {
			return buildPreferenceSlotMetadata({
				domain: 'workflow',
				slot: 'tool',
				value,
				polarity,
				confidence: 90,
			});
		}
	}

	const genericToolPreference = normalized.match(/\b(?:prefers?|likes|loves|dislikes|hates)\s+(.+?)\b/i);
	if (genericToolPreference) {
		const entity = genericToolPreference[1];
		const frameworkValue = canonicalizePreferenceValue(entity, FRAMEWORK_ALIASES);
		if (frameworkValue) {
			return buildPreferenceSlotMetadata({
				domain: 'development',
				slot: 'framework',
				value: frameworkValue,
				polarity,
				confidence: 76,
			});
		}

		const languageValue = canonicalizePreferenceValue(entity, LANGUAGE_ALIASES);
		if (languageValue) {
			return buildPreferenceSlotMetadata({
				domain: 'development',
				slot: 'language',
				value: languageValue,
				polarity,
				confidence: 76,
			});
		}

		const editorValue = canonicalizePreferenceValue(entity, EDITOR_ALIASES);
		if (editorValue) {
			return buildPreferenceSlotMetadata({
				domain: 'development',
				slot: 'editor',
				value: editorValue,
				polarity,
				confidence: 76,
			});
		}

		const operatingSystemValue = canonicalizePreferenceValue(entity, OPERATING_SYSTEM_ALIASES);
		if (operatingSystemValue) {
			return buildPreferenceSlotMetadata({
				domain: 'development',
				slot: 'operating_system',
				value: operatingSystemValue,
				polarity,
				confidence: 76,
			});
		}

		const toolValue = canonicalizePreferenceValue(entity, TOOL_ALIASES);
		if (toolValue) {
			return buildPreferenceSlotMetadata({
				domain: 'workflow',
				slot: 'tool',
				value: toolValue,
				polarity,
				confidence: 72,
			});
		}
	}

	return null;
}

export function hasExplicitTemporalCue(text: string): boolean {
	return EXPLICIT_TEMPORAL_CUE_PATTERN.test(text);
}

function recordsHaveExplicitTemporalCue(records: HonchoPersonaMemoryRecord[]): boolean {
	return records.some((record) => hasExplicitTemporalCue(record.content));
}

function normalizeDocumentMemoryMatchText(text: string): string {
	return normalizeWhitespace(text).toLowerCase();
}

function trimGeneratedDocumentLabel(label: string): string[] {
	const variants = new Set<string>();
	const trimmed = label.trim();
	if (!trimmed) return [];
	variants.add(trimmed);
	variants.add(trimmed.replace(/\s+generated file$/i, '').trim());
	variants.add(trimmed.replace(/\.[a-z0-9]{1,8}$/i, '').trim());
	variants.add(trimmed.replace(/\s+generated file$/i, '').replace(/\.[a-z0-9]{1,8}$/i, '').trim());
	return Array.from(variants).filter((value) => value.length >= 4);
}

function hasStrongDocumentTextOverlap(recordText: string, candidateText: string | null): boolean {
	if (!candidateText) return false;
	const normalizedRecord = normalizeDocumentMemoryMatchText(recordText);
	const normalizedCandidate = normalizeDocumentMemoryMatchText(candidateText);
	if (!normalizedRecord || !normalizedCandidate) return false;
	if (normalizedRecord.length >= 80 && normalizedCandidate.includes(normalizedRecord)) return true;
	if (normalizedCandidate.length >= 80 && normalizedRecord.includes(normalizedCandidate)) return true;
	return areNearDuplicateArtifactTexts(normalizedRecord, normalizedCandidate);
}

function recordReferencesDocumentCandidate(
	recordText: string,
	candidate: Pick<PersonaDocumentMemoryCandidate, 'label' | 'name'>
): boolean {
	if (!DOCUMENT_MEMORY_REFERENCE_PATTERN.test(recordText)) return false;
	const normalizedRecord = normalizeDocumentMemoryMatchText(recordText);
	return trimGeneratedDocumentLabel(candidate.label)
		.concat(trimGeneratedDocumentLabel(candidate.name))
		.some((label) => {
			const normalizedLabel = normalizeDocumentMemoryMatchText(label);
			return normalizedLabel.length >= 4 && normalizedRecord.includes(normalizedLabel);
		});
}

function isArtifactDerivedPersonaRecord(params: {
	record: HonchoPersonaMemoryRecord;
	candidates: PersonaDocumentMemoryCandidate[];
}): boolean {
	const content = params.record.content?.trim();
	if (!content) return false;
	if (DOCUMENT_MEMORY_DIRECT_CUE_PATTERN.test(content)) return true;

	for (const candidate of params.candidates) {
		if (
			hasStrongDocumentTextOverlap(content, candidate.summary) ||
			hasStrongDocumentTextOverlap(content, candidate.contentText)
		) {
			return true;
		}
		if (recordReferencesDocumentCandidate(content, candidate)) {
			return true;
		}
	}

	return false;
}

function isArtifactDerivedPersonaItem(params: {
	item: PersonaMemoryItem;
	candidates: PersonaDocumentMemoryCandidate[];
}): boolean {
	const texts = [
		params.item.rawCanonicalText,
		params.item.canonicalText,
		...params.item.members.map((member) => member.content),
	].filter((value): value is string => Boolean(value?.trim()));

	return texts.some((content, index) =>
		isArtifactDerivedPersonaRecord({
			record: {
				id: `${params.item.id}:${index}`,
				content,
				createdAt: params.item.lastSeenAt,
				scope: 'self',
				sessionId: params.item.members[0]?.sessionId ?? null,
			},
			candidates: params.candidates,
		})
	);
}

async function listPersonaDocumentMemoryCandidates(
	userId: string
): Promise<PersonaDocumentMemoryCandidate[]> {
	const ownershipScope = await getArtifactOwnershipScope(userId);
	const rows = await db
		.select({
			id: artifacts.id,
			userId: artifacts.userId,
			conversationId: artifacts.conversationId,
			type: artifacts.type,
			name: artifacts.name,
			summary: artifacts.summary,
			contentText: artifacts.contentText,
			metadataJson: artifacts.metadataJson,
			updatedAt: artifacts.updatedAt,
		})
		.from(artifacts)
		.where(
			and(
				buildArtifactVisibilityCondition({ userId, ownershipScope }),
				inArray(artifacts.type, ['source_document', 'normalized_document', 'generated_output'])
			)
		)
		.orderBy(desc(artifacts.updatedAt))
		.limit(120);

	const parsedCandidates = rows
		.filter((row) =>
			isArtifactCanonicallyOwned({
				userId,
				ownershipScope,
				artifact: row,
			})
		)
		.map((row) => {
			if (
				typeof row.id !== 'string' ||
				(row.type !== 'source_document' &&
					row.type !== 'normalized_document' &&
					row.type !== 'generated_output') ||
				typeof row.name !== 'string' ||
				!(row.updatedAt instanceof Date)
			) {
				return null;
			}
			const metadata = parseJsonRecordOrNull(row.metadataJson ?? null);
			const documentMetadata = parseWorkingDocumentMetadata(metadata);
			const label = documentMetadata.documentLabel ?? row.name;

			return {
				id: row.id,
				type: row.type,
				name: row.name,
				label,
				summary: typeof row.summary === 'string' ? clipText(row.summary, 4_000) : null,
				contentText:
					typeof row.contentText === 'string' ? clipText(row.contentText, 8_000) : null,
				updatedAt: row.updatedAt.getTime(),
				metadata,
			};
		})
		.filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

	const latestGeneratedIds = new Set(
		selectLatestGeneratedDocumentCandidatesByFamily(
			parsedCandidates
				.filter((candidate) => candidate.type === 'generated_output')
				.map((candidate) => ({
					artifactId: candidate.id,
					artifactName: candidate.name,
					updatedAt: candidate.updatedAt,
					metadata: candidate.metadata,
				}))
		).map((candidate) => candidate.artifactId)
	);

	return parsedCandidates
		.filter((candidate) => {
			if (candidate.type !== 'generated_output') return true;
			return latestGeneratedIds.has(candidate.id);
		})
		.map(({ metadata: _metadata, ...candidate }) => candidate);
}

export async function filterArtifactDerivedPersonaRecords(params: {
	userId: string;
	records: HonchoPersonaMemoryRecord[];
}): Promise<HonchoPersonaMemoryRecord[]> {
	if (params.records.length === 0) return params.records;

	const candidates = await listPersonaDocumentMemoryCandidates(params.userId).catch(() => []);
	if (candidates.length === 0) {
		return params.records.filter((record) => !DOCUMENT_MEMORY_DIRECT_CUE_PATTERN.test(record.content));
	}

	return params.records.filter(
		(record) =>
			!isArtifactDerivedPersonaRecord({
				record,
				candidates,
			})
	);
}

async function filterArtifactDerivedPersonaItems(
	userId: string,
	items: PersonaMemoryItem[]
): Promise<PersonaMemoryItem[]> {
	if (items.length === 0) return items;

	const candidates = await listPersonaDocumentMemoryCandidates(userId).catch(() => []);
	if (candidates.length === 0) {
		return items.filter((item) => {
			const sourceText = item.rawCanonicalText ?? item.canonicalText;
			if (!DOCUMENT_MEMORY_DIRECT_CUE_PATTERN.test(sourceText)) return true;
			return item.memoryClass === 'stable_preference' || item.memoryClass === 'identity_profile';
		});
	}

	return items.filter((item) => {
		const artifactDerived = isArtifactDerivedPersonaItem({ item, candidates });
		if (!artifactDerived) return true;
		return item.memoryClass === 'stable_preference' || item.memoryClass === 'identity_profile';
	});
}

export function buildDreamClusterPayload(params: {
	records: HonchoPersonaMemoryRecord[];
	defaultCanonicalText: string;
	defaultMemoryClass: PersonaMemoryClass;
	defaultSalience: number;
}): DreamClusterPayload {
	return {
		rawMemories: params.records.map((record) => ({
			id: record.id,
			content: record.content,
			scope: record.scope,
			sessionId: record.sessionId ?? null,
		})),
		defaultCanonicalText: params.defaultCanonicalText,
		defaultMemoryClass: params.defaultMemoryClass,
		defaultSalience: params.defaultSalience,
	};
}

export function sanitizeDreamedCanonicalText(params: {
	canonicalText: string | null | undefined;
	defaultCanonicalText: string;
	records: HonchoPersonaMemoryRecord[];
}): string {
	const candidate = normalizeWhitespace(params.canonicalText ?? '');
	if (!candidate) {
		return params.defaultCanonicalText;
	}

	if (!recordsHaveExplicitTemporalCue(params.records) && hasExplicitTemporalCue(candidate)) {
		return params.defaultCanonicalText;
	}

	return candidate;
}

function hashKey(value: string): string {
	return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function clusterIdForKey(userId: string, key: string): string {
	return `pmc_${hashKey(`${userId}:${key}`)}`;
}

function clip(value: string, maxLength: number): string {
	return clipText(value, maxLength);
}

function parseJsonRecord(value: string | null): Record<string, unknown> {
	return parseJsonRecordOrNull(value) ?? {};
}

type TemporalMetadata = {
	kind: PersonaMemoryTemporalKind;
	freshness: PersonaMemoryTemporalFreshness;
	observedAt: number;
	effectiveAt: number | null;
	expiresAt: number | null;
	relative: boolean;
	resolved: boolean;
};

function parseNumberToken(value: string | undefined): number | null {
	if (!value) return null;
	const normalized = normalizeMemoryText(value);
	if (/^\d+$/.test(normalized)) {
		return Number(normalized);
	}
	return NUMBER_WORDS[normalized] ?? null;
}

function addDurationMs(base: number, amount: number, unit: string): number {
	const normalized = normalizeMemoryText(unit);
	if (normalized.startsWith('hour')) return base + amount * 60 * 60 * 1000;
	if (normalized.startsWith('week')) return base + amount * 7 * DAY_MS;
	if (normalized.startsWith('month')) return base + amount * 30 * DAY_MS;
	return base + amount * DAY_MS;
}

function formatIsoDate(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}

function stripTrailingPunctuation(value: string): string {
	return normalizeWhitespace(value).replace(/[.!?]+$/, '');
}

function deriveTopicKey(text: string): string | null {
	const normalized = stripTrailingPunctuation(text);
	const explicitMatch = normalized.match(
		/\b(?:working on|preparing|building|writing|drafting|finishing|completing|submitting|applying for|finish|complete|submit)\s+(.+?)(?:\s+(?:due|by|within|in|before|after)\b|[.;]|$)/i
	);
	if (explicitMatch?.[1]) {
		const candidate = normalizeWhitespace(explicitMatch[1])
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, ' ')
			.split(/\s+/)
			.filter((token) => token && !TOPIC_STOP_WORDS.has(token))
			.slice(0, 4)
			.join(' ');
		if (candidate) return candidate;
	}

	const fallback = normalized
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, ' ')
		.split(/\s+/)
		.filter((token) => token.length > 2 && !TOPIC_STOP_WORDS.has(token))
		.slice(0, 4)
		.join(' ');
	return fallback || null;
}

function hasShortTermConstraintCue(text: string): boolean {
	const normalized = normalizeMemoryText(text);
	return (
		/\b(deadline|due|time[- ]constrained|only have|time pressure|urgent|due date|must finish|need to finish|need to submit|submission)\b/.test(
			normalized
		) ||
		(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|couple)(?:\s+more)?\s+(hours?|days?|weeks?|months?)\b/.test(
			normalized
		) &&
			/\b(in|within|left|remaining|have|got|more|another)\b/.test(normalized))
	);
}

function hasActiveProjectCue(text: string): boolean {
	const normalized = normalizeMemoryText(text);
	return /\b(currently|right now|working on|building|preparing|writing|drafting|applying|shipping|finishing|completing)\b/.test(
		normalized
	);
}

function hasResolvedTemporalCue(text: string): boolean {
	const normalized = normalizeMemoryText(text);
	return /\b(deadline passed|passed the deadline|finished|completed|submitted|done with|wrapped up|no longer|not time[- ]constrained anymore|got an extension|was extended)\b/.test(
		normalized
	);
}

function resolveRelativeExpiryFromText(text: string, referenceTime: number): {
	expiresAt: number | null;
	relative: boolean;
} {
	const normalized = normalizeMemoryText(text);
	const durationMatch = normalized.match(
		/\b(?:in|within|for|next|only have|have|got|another)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple)(?:\s+more)?\s+(hours?|days?|weeks?|months?)\b/
	);
	if (durationMatch) {
		const amount = parseNumberToken(durationMatch[1]);
		if (amount) {
			return {
				expiresAt: addDurationMs(referenceTime, amount, durationMatch[2]),
				relative: true,
			};
		}
	}

	const remainingMatch = normalized.match(
		/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple)\s+(hours?|days?|weeks?|months?)\s+(?:left|remaining)\b/
	);
	if (remainingMatch) {
		const amount = parseNumberToken(remainingMatch[1]);
		if (amount) {
			return {
				expiresAt: addDurationMs(referenceTime, amount, remainingMatch[2]),
				relative: true,
			};
		}
	}

	if (/\btoday|tonight\b/.test(normalized)) {
		return { expiresAt: referenceTime + DAY_MS, relative: true };
	}
	if (/\btomorrow\b/.test(normalized)) {
		return { expiresAt: referenceTime + 2 * DAY_MS, relative: true };
	}
	if (/\bthis week\b/.test(normalized)) {
		return { expiresAt: referenceTime + 7 * DAY_MS, relative: true };
	}
	if (/\bnext week\b/.test(normalized)) {
		return { expiresAt: referenceTime + 14 * DAY_MS, relative: true };
	}

	return { expiresAt: null, relative: false };
}

function getTemporalFreshness(params: {
	expiresAt: number | null;
	resolved: boolean;
	now?: number;
}): PersonaMemoryTemporalFreshness {
	const now = params.now ?? Date.now();
	if (params.resolved) return 'historical';
	if (!params.expiresAt) return 'unknown';
	if (now >= params.expiresAt) return 'expired';
	if (params.expiresAt - now <= 2 * DAY_MS) return 'stale';
	return 'active';
}

function buildHistoricalTemporalText(text: string, observedAt: number): string {
	return `As of ${formatIsoDate(observedAt)}, ${stripTrailingPunctuation(text)}.`;
}

function deriveTopicStatus(params: {
	memoryClass: PersonaMemoryClass;
	state: PersonaMemoryState;
	temporal: TemporalMetadata | null;
}): PersonaMemoryTopicStatus | null {
	if (
		params.temporal?.freshness === 'expired' ||
		params.temporal?.freshness === 'historical' ||
		params.state === 'archived'
	) {
		return 'historical';
	}
	if (
		params.memoryClass === 'short_term_constraint' ||
		params.memoryClass === 'active_project_context' ||
		params.memoryClass === 'situational_context'
	) {
		return params.state === 'dormant' ? 'dormant' : 'active';
	}
	return null;
}

function deriveTemporalMetadata(params: {
	canonicalText: string;
	records: HonchoPersonaMemoryRecord[];
	memoryClass: PersonaMemoryClass;
	now?: number;
}): TemporalMetadata | null {
	const now = params.now ?? Date.now();
	const latestRecordAt = Math.max(...params.records.map((record) => record.createdAt));
	const text = stripTrailingPunctuation(params.canonicalText);
	const resolved = hasResolvedTemporalCue(text);

	let kind: PersonaMemoryTemporalKind | null = null;
	if (params.memoryClass === 'short_term_constraint') {
		kind = 'deadline';
	} else if (params.memoryClass === 'active_project_context' || params.memoryClass === 'situational_context') {
		kind = 'project_window';
	} else if (params.memoryClass === 'perishable_fact') {
		kind = 'availability';
	}

	if (!kind) return null;

	const { expiresAt, relative } = resolveRelativeExpiryFromText(text, latestRecordAt);
	const freshness = getTemporalFreshness({ expiresAt, resolved, now });
	return {
		kind,
		freshness,
		observedAt: latestRecordAt,
		effectiveAt: latestRecordAt,
		expiresAt,
		relative,
		resolved,
	};
}

function temporalMetadataFromRecord(
	metadata: Record<string, unknown> | null
): TemporalMetadata | null {
	if (!metadata) return null;
	const temporal = metadata.temporal;
	if (!temporal || typeof temporal !== 'object' || Array.isArray(temporal)) return null;
	const record = temporal as Record<string, unknown>;
	if (
		typeof record.kind !== 'string' ||
		typeof record.freshness !== 'string' ||
		typeof record.observedAt !== 'number' ||
		typeof record.relative !== 'boolean' ||
		typeof record.resolved !== 'boolean'
	) {
		return null;
	}
	return {
		kind: record.kind as PersonaMemoryTemporalKind,
		freshness: getTemporalFreshness({
			expiresAt: typeof record.expiresAt === 'number' ? record.expiresAt : null,
			resolved: record.resolved,
		}),
		observedAt: record.observedAt,
		effectiveAt: typeof record.effectiveAt === 'number' ? record.effectiveAt : null,
		expiresAt: typeof record.expiresAt === 'number' ? record.expiresAt : null,
		relative: record.relative,
		resolved: record.resolved,
	};
}

function parseInventoryFingerprint(text: string): InventoryFingerprint | null {
	const normalized = normalizeWhitespace(text).replace(/[.]+$/, '');
	const match = normalized.match(/^(.+?) has (.+?) available for (.+?) on (.+)$/i);
	if (!match) return null;

	const [, subject, item, context, date] = match;
	return {
		subject: normalizeWhitespace(subject),
		item: normalizeWhitespace(item),
		context: normalizeWhitespace(context),
		date: normalizeWhitespace(date),
		key: `inventory:${normalizeMemoryText(subject)}:${normalizeMemoryText(context)}:${normalizeMemoryText(date)}`,
	};
}

function buildInventoryCanonical(
	fingerprint: InventoryFingerprint,
	records: HonchoPersonaMemoryRecord[]
): string {
	const items = Array.from(
		new Set(
			records
				.map((record) => parseInventoryFingerprint(record.content)?.item)
				.filter((item): item is string => Boolean(item))
		)
	).sort((left, right) => left.localeCompare(right));

	if (items.length === 0) {
		return `${fingerprint.subject} had items available for ${fingerprint.context} on ${fingerprint.date}.`;
	}

	if (items.length === 1) {
		return `${fingerprint.subject} had ${items[0]} available for ${fingerprint.context} on ${fingerprint.date}.`;
	}

	const head = items.slice(0, -1).join(', ');
	const tail = items[items.length - 1];
	return `${fingerprint.subject} had ${head}, and ${tail} available for ${fingerprint.context} on ${fingerprint.date}.`;
}

export function classifyMemoryTextDeterministically(text: string): PersonaMemoryClass {
	const normalized = normalizeMemoryText(text);

	if (
		/\b(fridge|pantry|freezer|leftovers?|meal prep|grocery|groceries|available|today|tonight|this week|for dinner|for lunch|for breakfast|in stock|expir(?:e|es|ing))\b/.test(
			normalized
		) ||
		/\b(have|has)\b.+\b(fridge|pantry|freezer|leftovers?)\b/.test(normalized)
	) {
		return 'perishable_fact';
	}

	if (hasShortTermConstraintCue(normalized)) {
		return 'short_term_constraint';
	}

	if (hasActiveProjectCue(normalized)) {
		return 'active_project_context';
	}

	if (
		/\b(plan|planning|currently|right now|this month|this week|temporary|working on|applying|preparing)\b/.test(
			normalized
		)
	) {
		return 'situational_context';
	}

	if (
		/\b(prefers?|preferences?|likes|dislikes|favorite|usually|communication style|tone|writing style|framework|stack|toolchain|tooling)\b/.test(
			normalized
		)
	) {
		return 'stable_preference';
	}

	if (
		/\b(name is|i am|works as|studies|lives in|birthday|born|identity|profession|occupation)\b/.test(
			normalized
		)
	) {
		return 'identity_profile';
	}

	return 'long_term_context';
}

function normalizeDreamMemoryClass(
	canonicalText: string,
	memoryClass: PersonaMemoryClass
): PersonaMemoryClass {
	if (memoryClass !== 'situational_context') return memoryClass;
	if (hasShortTermConstraintCue(canonicalText)) return 'short_term_constraint';
	if (hasActiveProjectCue(canonicalText)) return 'active_project_context';
	return memoryClass;
}

function computeSalienceScore(params: {
	memoryClass: PersonaMemoryClass;
	sourceCount: number;
	lastSeenAt: number;
	now?: number;
}): number {
	const now = params.now ?? Date.now();
	const ageDays = Math.max(0, Math.floor((now - params.lastSeenAt) / DAY_MS));
	const base =
		params.memoryClass === 'identity_profile'
			? 88
			: params.memoryClass === 'stable_preference'
				? 76
				: params.memoryClass === 'long_term_context'
					? 66
					: params.memoryClass === 'short_term_constraint'
						? 64
						: params.memoryClass === 'active_project_context'
							? 60
						: params.memoryClass === 'situational_context'
							? 54
							: 42;
	const support = Math.min(12, Math.max(0, params.sourceCount - 1) * 4);
	const decayPenalty =
		params.memoryClass === 'perishable_fact'
			? ageDays * 6
			: params.memoryClass === 'short_term_constraint'
				? ageDays * 5
				: params.memoryClass === 'active_project_context'
					? ageDays * 3
			: params.memoryClass === 'situational_context'
				? ageDays * 2
				: params.memoryClass === 'long_term_context'
					? Math.floor(ageDays / 14)
					: params.memoryClass === 'stable_preference'
						? Math.floor(ageDays / 30)
						: Math.floor(ageDays / 45);
	return Math.max(6, Math.min(100, base + support - decayPenalty));
}

function getExplicitMemoryConfidence(
	metadata: Record<string, unknown> | null,
	memoryClass: PersonaMemoryClass
): number | null {
	if (!metadata) return null;

	if (memoryClass === 'stable_preference' && typeof metadata.preferenceConfidence === 'number') {
		return Math.max(0, Math.min(100, Math.round(metadata.preferenceConfidence)));
	}

	return null;
}

function computeRepairedSalienceScore(params: {
	memoryClass: PersonaMemoryClass;
	sourceCount: number;
	lastSeenAt: number;
	state: PersonaMemoryState;
	metadata?: Record<string, unknown> | null;
	now?: number;
}): number {
	const base = computeSalienceScore({
		memoryClass: params.memoryClass,
		sourceCount: params.sourceCount,
		lastSeenAt: params.lastSeenAt,
		now: params.now,
	});
	const temporal = temporalMetadataFromRecord(params.metadata ?? null);
	const topicStatus = deriveTopicStatus({
		memoryClass: params.memoryClass,
		state: params.state,
		temporal,
	});
	const explicitConfidence = getExplicitMemoryConfidence(params.metadata ?? null, params.memoryClass);

	let penalty = 0;

	if (params.sourceCount <= 1 && params.memoryClass !== 'identity_profile') {
		penalty += 6;
	}

	if (explicitConfidence !== null) {
		if (explicitConfidence < 70) {
			penalty += 8;
		} else if (explicitConfidence < 82) {
			penalty += 4;
		}
	}

	if (params.state === 'dormant') {
		penalty += params.memoryClass === 'stable_preference' ? 4 : 8;
	}

	if (topicStatus === 'historical') {
		penalty += 10;
	} else if (topicStatus === 'dormant') {
		penalty += 4;
	}

	const correctionObservedAt =
		typeof params.metadata?.correctionObservedAt === 'number'
			? Math.round(params.metadata.correctionObservedAt)
			: null;
	const correctionCount =
		typeof params.metadata?.correctionCount === 'number'
			? Math.max(0, Math.round(params.metadata.correctionCount))
			: 0;
	if (correctionObservedAt !== null && params.lastSeenAt <= correctionObservedAt) {
		penalty += 8 + Math.min(6, correctionCount * 2);
	}

	return Math.max(6, Math.min(100, base - penalty));
}

function recomputePlanSalience(plan: ClusterPlan, now?: number): void {
	plan.salienceScore = computeRepairedSalienceScore({
		memoryClass: plan.memoryClass,
		sourceCount: plan.records.length,
		lastSeenAt: plan.lastSeenAt,
		state: plan.state,
		metadata: plan.metadata,
		now,
	});
}

function getDecayWindow(memoryClass: PersonaMemoryClass): {
	dormantMs: number | null;
	archiveMs: number | null;
} {
	switch (memoryClass) {
		case 'perishable_fact':
			return { dormantMs: DAY_MS, archiveMs: 10 * DAY_MS };
		case 'short_term_constraint':
			return { dormantMs: 2 * DAY_MS, archiveMs: 14 * DAY_MS };
		case 'active_project_context':
			return { dormantMs: 14 * DAY_MS, archiveMs: 45 * DAY_MS };
		case 'situational_context':
			return { dormantMs: 10 * DAY_MS, archiveMs: 30 * DAY_MS };
		case 'long_term_context':
			return { dormantMs: 60 * DAY_MS, archiveMs: 365 * DAY_MS };
		case 'stable_preference':
			return { dormantMs: 365 * DAY_MS, archiveMs: null };
		case 'identity_profile':
			return { dormantMs: null, archiveMs: null };
	}
}

export function deriveStateFromDecay(params: {
	memoryClass: PersonaMemoryClass;
	lastSeenAt: number;
	pinned: boolean;
	stateHint?: PersonaMemoryState | null;
	metadata?: Record<string, unknown>;
	now?: number;
}): {
	state: PersonaMemoryState;
	decayAt: number | null;
	archiveAt: number | null;
} {
	const now = params.now ?? Date.now();
	const superseded = typeof params.metadata?.supersededByClusterId === 'string';
	if (superseded) {
		return {
			state: 'archived',
			decayAt: null,
			archiveAt: now,
		};
	}

	const temporal = temporalMetadataFromRecord(params.metadata ?? null);
	if (temporal?.freshness === 'expired' || temporal?.freshness === 'historical') {
		return {
			state: 'archived',
			decayAt: temporal.expiresAt,
			archiveAt: temporal.expiresAt ?? now,
		};
	}

	if (params.pinned) {
		return {
			state: 'active',
			decayAt: null,
			archiveAt: null,
		};
	}

	const { dormantMs, archiveMs } = getDecayWindow(params.memoryClass);
	const decayAt = dormantMs ? params.lastSeenAt + dormantMs : null;
	const archiveAt = archiveMs ? params.lastSeenAt + archiveMs : null;

	if (params.memoryClass === 'identity_profile') {
		return {
			state: params.stateHint === 'archived' ? 'dormant' : 'active',
			decayAt: null,
			archiveAt: null,
		};
	}

	if (archiveAt && now >= archiveAt) {
		return { state: 'archived', decayAt, archiveAt };
	}
	if (decayAt && now >= decayAt) {
		return { state: 'dormant', decayAt, archiveAt };
	}
	return { state: 'active', decayAt, archiveAt };
}

function buildClusterGroups(records: HonchoPersonaMemoryRecord[]): Array<{
	key: string;
	records: HonchoPersonaMemoryRecord[];
	inventoryFingerprint?: InventoryFingerprint;
}> {
	const sorted = records.slice().sort((left, right) => right.createdAt - left.createdAt);
	const assigned = new Set<string>();
	const groups: Array<{
		key: string;
		records: HonchoPersonaMemoryRecord[];
		inventoryFingerprint?: InventoryFingerprint;
	}> = [];

	const inventoryGroups = new Map<
		string,
		{ fingerprint: InventoryFingerprint; records: HonchoPersonaMemoryRecord[] }
	>();
	for (const record of sorted) {
		const fingerprint = parseInventoryFingerprint(record.content);
		if (!fingerprint) continue;
		const group = inventoryGroups.get(fingerprint.key) ?? {
			fingerprint,
			records: [],
		};
		group.records.push(record);
		inventoryGroups.set(fingerprint.key, group);
		assigned.add(record.id);
	}

	for (const { fingerprint, records: groupRecords } of inventoryGroups.values()) {
		groups.push({
			key: fingerprint.key,
			records: groupRecords,
			inventoryFingerprint: fingerprint,
		});
	}

	const hashGroups = new Map<string, HonchoPersonaMemoryRecord[]>();
	for (const record of sorted) {
		if (assigned.has(record.id)) continue;
		const hash = normalizeMemoryText(record.content).split(/\s+/).slice(0, 5).join(' ');
		const group = hashGroups.get(hash) ?? [];
		group.push(record);
		hashGroups.set(hash, group);
	}

	for (const record of sorted) {
		if (assigned.has(record.id)) continue;
		const group = [record];
		assigned.add(record.id);
		const baseText = normalizeMemoryText(record.content);
		
		const hash = baseText.split(/\s+/).slice(0, 5).join(' ');
		const candidateGroup = hashGroups.get(hash) ?? [];

		for (const candidate of candidateGroup) {
			if (assigned.has(candidate.id)) continue;
			const candidateText = normalizeMemoryText(candidate.content);
			if (
				baseText === candidateText ||
				areNearDuplicateArtifactTexts(record.content, candidate.content)
			) {
				group.push(candidate);
				assigned.add(candidate.id);
			}
		}

		groups.push({
			key: `memory:${hashKey(group.map((item) => normalizeMemoryText(item.content)).sort().join('|'))}`,
			records: group,
		});
	}

	return groups;
}

function deriveCanonicalText(params: {
	records: HonchoPersonaMemoryRecord[];
	inventoryFingerprint?: InventoryFingerprint;
}): string {
	if (params.inventoryFingerprint) {
		return buildInventoryCanonical(params.inventoryFingerprint, params.records);
	}

	const representative = params.records
		.slice()
		.sort((left, right) => {
			const lengthDiff = right.content.length - left.content.length;
			if (lengthDiff !== 0) return lengthDiff;
			return right.createdAt - left.createdAt;
		})[0];

	return clip(representative?.content ?? '', 320);
}

function deriveSemanticFingerprint(text: string): SemanticFingerprint {
	const normalized = normalizeWhitespace(text).replace(/[.]+$/, '');
	const patterns = [
		/^(.+?) (is|are) (.+)$/i,
		/^(.+?) (likes|dislikes|loves|hates|prefers) (.+)$/i,
		/^(.+?) lives in (.+)$/i,
		/^(.+?) works as (.+)$/i,
		/^(.+?) moved to (.+)$/i,
		/^(.+?) studies (.+)$/i,
	];

	for (const pattern of patterns) {
		const match = normalized.match(pattern);
		if (!match) continue;
		const subject = normalizeMemoryText(match[1]);
		const slot = normalizeMemoryText(match[2]);
		return { subject, slot };
	}

	return { subject: null, slot: null };
}

export function extractFactSlotMetadata(text: string): FactSlotMetadata | null {
	const normalized = normalizeWhitespace(text).replace(/[.]+$/, '');
	const patterns: Array<{
		pattern: RegExp;
		domain: FactSlotMetadata['factDomain'];
		slot: string;
	}> = [
		{ pattern: /^(.+?) lives in (.+)$/i, domain: 'location', slot: 'location:current' },
		{ pattern: /^(.+?) moved to (.+)$/i, domain: 'location', slot: 'location:current' },
		{ pattern: /^(.+?) is based in (.+)$/i, domain: 'location', slot: 'location:current' },
		{ pattern: /^(.+?) is located in (.+)$/i, domain: 'location', slot: 'location:current' },
		{ pattern: /^(.+?) works as (.+)$/i, domain: 'role', slot: 'role:current' },
		{ pattern: /^(.+?) works at (.+)$/i, domain: 'employer', slot: 'employer:current' },
		{ pattern: /^(.+?) studies (.+)$/i, domain: 'study', slot: 'study:current' },
		{ pattern: /^(.+?) is available (.+)$/i, domain: 'availability', slot: 'availability:current' },
		{ pattern: /^(.+?) is unavailable (.+)$/i, domain: 'availability', slot: 'availability:current' },
	];

	for (const candidate of patterns) {
		const match = normalized.match(candidate.pattern);
		if (!match) continue;
		const factSubject = normalizeMemoryText(match[1]);
		const factValue = normalizeMemoryText(match[2]);
		if (!factSubject || !factValue) continue;
		return {
			factDomain: candidate.domain,
			factSubject,
			factSlot: candidate.slot,
			factValue,
		};
	}

	return null;
}

function isSemanticMemoryClass(memoryClass: PersonaMemoryClass): boolean {
	return (
		memoryClass === 'identity_profile' ||
		memoryClass === 'stable_preference' ||
		memoryClass === 'short_term_constraint' ||
		memoryClass === 'active_project_context' ||
		memoryClass === 'situational_context' ||
		memoryClass === 'long_term_context'
	);
}

function semanticOverlapScore(left: ClusterPlan, right: ClusterPlan): number {
	if (!isSemanticMemoryClass(left.memoryClass) || !isSemanticMemoryClass(right.memoryClass)) {
		return 0;
	}

	if (
		normalizeMemoryText(left.canonicalText) === normalizeMemoryText(right.canonicalText)
	) {
		return 0;
	}

	const leftFingerprint = deriveSemanticFingerprint(left.canonicalText);
	const rightFingerprint = deriveSemanticFingerprint(right.canonicalText);
	const sameSubject =
		Boolean(leftFingerprint.subject) &&
		leftFingerprint.subject === rightFingerprint.subject;
	const sameSlot = Boolean(leftFingerprint.slot) && leftFingerprint.slot === rightFingerprint.slot;
	const lexicalScore = Math.max(
		scoreMatch(left.canonicalText, right.canonicalText),
		scoreMatch(right.canonicalText, left.canonicalText)
	);

	if (sameSubject && sameSlot) {
		return 1.0;
	}
	if (sameSubject && lexicalScore >= 0.26) {
		return 0.84 + Math.min(0.12, lexicalScore * 0.2);
	}
	if (lexicalScore >= 0.42 && left.memoryClass === right.memoryClass) {
		return lexicalScore;
	}

	return 0;
}

async function applyTargetedSemanticSupersession(plans: ClusterPlan[]): Promise<void> {
	if (!canUseContextSummarizer()) {
		return;
	}

	const ordered = plans
		.filter((plan) => isSemanticMemoryClass(plan.memoryClass))
		.slice()
		.sort((left, right) => right.lastSeenAt - left.lastSeenAt);
	const byId = new Map(ordered.map((plan) => [plan.clusterId, plan]));

	type RawSemanticSupersession = {
		supersedesClusterIds?: string[];
		confidence?: number;
		rationale?: string;
	};

	for (const primary of ordered) {
		if (primary.state === 'archived') continue;

		const candidates = ordered
			.filter((candidate) => {
				if (candidate.clusterId === primary.clusterId) return false;
				if (candidate.state === 'archived') return false;
				if (candidate.lastSeenAt >= primary.lastSeenAt) return false;
				return semanticOverlapScore(primary, candidate) >= 0.42;
			})
			.sort(
				(left, right) =>
					semanticOverlapScore(primary, right) - semanticOverlapScore(primary, left) ||
					right.lastSeenAt - left.lastSeenAt
			)
			.slice(0, MAX_SEMANTIC_CANDIDATES);

		if (candidates.length === 0) continue;

		try {
			const response = await requestStructuredControlModel<RawSemanticSupersession>({
				system:
					'You reconcile persona memories. Return strict JSON with supersedesClusterIds, confidence, rationale. Only mark an older candidate as superseded when the primary memory clearly replaces it for the same subject/topic. Do not mark related-but-compatible facts as superseded.',
				user: JSON.stringify(
					{
						primary: {
							clusterId: primary.clusterId,
							canonicalText: primary.canonicalText,
							memoryClass: primary.memoryClass,
							lastSeenAt: primary.lastSeenAt,
						},
						candidates: candidates.map((candidate) => ({
							clusterId: candidate.clusterId,
							canonicalText: candidate.canonicalText,
							memoryClass: candidate.memoryClass,
							lastSeenAt: candidate.lastSeenAt,
							overlapScore: semanticOverlapScore(primary, candidate),
						})),
					},
					null,
					2
				),
				maxTokens: 240,
				temperature: 0.0,
			});

			const confidence =
				typeof response?.confidence === 'number'
					? Math.max(0, Math.min(100, Math.round(response.confidence)))
					: 0;
			if (confidence < SEMANTIC_RECONCILE_MIN_CONFIDENCE) {
				continue;
			}

			const supersededIds = Array.isArray(response?.supersedesClusterIds)
				? response.supersedesClusterIds.filter((value): value is string => typeof value === 'string')
				: [];

			for (const candidateId of supersededIds) {
				const candidate = byId.get(candidateId);
				if (!candidate || candidate.state === 'archived') continue;
				candidate.metadata = {
					...candidate.metadata,
					supersededByClusterId: primary.clusterId,
					supersessionReason: 'semantic_replace',
					semanticSupersessionConfidence: confidence,
					semanticSupersessionRationale:
						typeof response?.rationale === 'string' ? clip(response.rationale, 220) : null,
				};
				candidate.state = 'archived';
				candidate.decayAt = null;
				candidate.archiveAt = Date.now();
			}
		} catch (error) {
			console.error('[PERSONA_MEMORY] Semantic supersession failed:', error);
		}
	}
}

function applyDeterministicFactSupersession(plans: ClusterPlan[]): void {
	const grouped = new Map<string, ClusterPlan[]>();

	for (const plan of plans) {
		if (plan.state === 'archived') continue;
		const fact = ensureFactSlotMetadata(plan);
		if (!fact) continue;
		const items = grouped.get(`${fact.factSubject}:${fact.factSlot}`) ?? [];
		items.push(plan);
		grouped.set(`${fact.factSubject}:${fact.factSlot}`, items);
	}

	for (const items of grouped.values()) {
		if (items.length <= 1) continue;
		const ordered = items.slice().sort((left, right) => right.lastSeenAt - left.lastSeenAt);
		const newest = ordered[0];
		const newestFact = ensureFactSlotMetadata(newest);
		if (!newestFact) continue;
		for (const older of ordered.slice(1)) {
			const olderFact = ensureFactSlotMetadata(older);
			if (!olderFact) continue;
			if (
				olderFact.factValue === newestFact.factValue ||
				normalizeMemoryText(older.canonicalText) === normalizeMemoryText(newest.canonicalText)
			) {
				continue;
			}
			older.metadata = {
				...older.metadata,
				...olderFact,
				supersededByClusterId: newest.clusterId,
				supersessionReason: 'fact_slot',
			};
			older.state = 'archived';
			older.decayAt = null;
			older.archiveAt = Date.now();
		}
	}
}

function hasExplicitMemoryCorrectionCue(text: string): boolean {
	return EXPLICIT_MEMORY_CORRECTION_PATTERN.test(text);
}

function computeCorrectionOverlap(primary: ClusterPlan, candidate: ClusterPlan): number {
	const primaryText = normalizeWhitespace(
		[primary.canonicalText, ...primary.records.map((record) => record.content)].join(' ')
	);
	const candidateText = normalizeWhitespace(
		[candidate.canonicalText, ...candidate.records.map((record) => record.content)].join(' ')
	);
	const primaryTopicKey =
		typeof primary.metadata.topicKey === 'string' && primary.metadata.topicKey.trim()
			? String(primary.metadata.topicKey)
			: null;
	const candidateTopicKey =
		typeof candidate.metadata.topicKey === 'string' && candidate.metadata.topicKey.trim()
			? String(candidate.metadata.topicKey)
			: null;

	if (primaryTopicKey && candidateTopicKey && primaryTopicKey === candidateTopicKey) {
		return 1;
	}
	if (
		primaryTopicKey &&
		candidateTopicKey &&
		(primaryTopicKey.includes(candidateTopicKey) || candidateTopicKey.includes(primaryTopicKey))
	) {
		return 0.9;
	}

	const tokenize = (text: string): string[] =>
		normalizeMemoryText(text)
			.split(/\s+/)
			.filter((token) => token.length > 2 && !TOPIC_STOP_WORDS.has(token));
	const primaryTokens = tokenize(primaryText);
	const candidateTokens = tokenize(candidateText);
	if (primaryTokens.length > 0 && candidateTokens.length > 0) {
		const candidateTokenSet = new Set(candidateTokens);
		const sharedCount = primaryTokens.filter((token) => candidateTokenSet.has(token)).length;
		const overlapRatio = sharedCount / Math.min(primaryTokens.length, candidateTokens.length);
		if (overlapRatio >= 0.6) {
			return overlapRatio;
		}
	}

	const lexical = Math.max(
		scoreMatch(primaryText, candidateText),
		scoreMatch(primary.canonicalText, candidate.canonicalText)
	);
	return lexical;
}

function applyDeterministicCorrectionSignals(plans: ClusterPlan[]): void {
	const correctionSources = plans
		.filter((plan) =>
			plan.records.some((record) => hasExplicitMemoryCorrectionCue(record.content))
		)
		.sort((left, right) => right.lastSeenAt - left.lastSeenAt);

	for (const source of correctionSources) {
		for (const candidate of plans) {
			if (candidate.clusterId === source.clusterId) continue;
			if (candidate.lastSeenAt >= source.lastSeenAt) continue;
			if (candidate.state === 'archived') continue;

			const overlap = computeCorrectionOverlap(source, candidate);
			if (overlap < 0.42) continue;

			const priorCorrectionCount =
				typeof candidate.metadata.correctionCount === 'number'
					? Math.max(0, Math.round(candidate.metadata.correctionCount))
					: 0;
			const priorCorrectionObservedAt =
				typeof candidate.metadata.correctionObservedAt === 'number'
					? Math.round(candidate.metadata.correctionObservedAt)
					: 0;

			candidate.metadata = {
				...candidate.metadata,
				correctionObservedAt: Math.max(priorCorrectionObservedAt, source.lastSeenAt),
				correctionCount: priorCorrectionCount + 1,
				correctedByClusterId: source.clusterId,
				correctionReason: 'explicit_user_correction',
			};
		}
	}
}

function applyTemporalSupersession(plans: ClusterPlan[]): void {
	const grouped = new Map<string, ClusterPlan[]>();

	for (const plan of plans) {
		const temporal = temporalMetadataFromRecord(plan.metadata);
		if (!temporal) continue;
		const topicKey =
			typeof plan.metadata.topicKey === 'string' && plan.metadata.topicKey.trim()
				? String(plan.metadata.topicKey)
				: null;
		if (!topicKey) continue;
		const key = `${temporal.kind}:${topicKey}`;
		const items = grouped.get(key) ?? [];
		items.push(plan);
		grouped.set(key, items);
	}

	for (const items of grouped.values()) {
		if (items.length <= 1) continue;
		const ordered = items.slice().sort((left, right) => right.lastSeenAt - left.lastSeenAt);
		const newest =
			ordered.find((plan) => {
				const temporal = temporalMetadataFromRecord(plan.metadata);
				return (
					plan.state !== 'archived' &&
					temporal?.freshness !== 'expired' &&
					temporal?.freshness !== 'historical'
				);
			}) ?? ordered[0];
		const newestTemporal = temporalMetadataFromRecord(newest.metadata);
		if (!newestTemporal) continue;

		for (const older of ordered.slice(1)) {
			if (older.clusterId === newest.clusterId) continue;
			older.metadata = {
				...older.metadata,
				supersededByClusterId: newest.clusterId,
				supersessionReason: 'temporal_update',
			};
			older.state = 'archived';
			older.decayAt = newestTemporal.expiresAt;
			older.archiveAt = Date.now();
		}
	}
}

function getPreferenceSlotMetadata(plan: ClusterPlan): PreferenceSlotMetadata | null {
	const metadata = plan.metadata;
	if (
		typeof metadata.preferenceDomain !== 'string' ||
		typeof metadata.preferenceSlot !== 'string' ||
		typeof metadata.preferenceValue !== 'string' ||
		(metadata.preferencePolarity !== 'positive' && metadata.preferencePolarity !== 'negative')
	) {
		return null;
	}

	const confidence =
		typeof metadata.preferenceConfidence === 'number'
			? Math.max(0, Math.min(100, Math.round(metadata.preferenceConfidence)))
			: 0;
	if (confidence < 60) return null;

	return {
		preferenceDomain: metadata.preferenceDomain,
		preferenceSlot: metadata.preferenceSlot,
		preferenceValue: metadata.preferenceValue,
		preferencePolarity: metadata.preferencePolarity,
		preferenceConfidence: confidence,
	};
}

function ensurePreferenceSlotMetadata(plan: ClusterPlan): PreferenceSlotMetadata | null {
	const existing = getPreferenceSlotMetadata(plan);
	if (existing) return existing;
	if (plan.memoryClass !== 'stable_preference') return null;

	const extracted = extractPreferenceSlotMetadata(plan.canonicalText);
	if (!extracted) return null;

	plan.metadata = {
		...plan.metadata,
		...extracted,
	};
	return extracted;
}

function getFactSlotMetadata(plan: ClusterPlan): FactSlotMetadata | null {
	const metadata = plan.metadata;
	if (
		typeof metadata.factDomain !== 'string' ||
		typeof metadata.factSubject !== 'string' ||
		typeof metadata.factSlot !== 'string' ||
		typeof metadata.factValue !== 'string'
	) {
		return null;
	}

	if (
		metadata.factDomain !== 'location' &&
		metadata.factDomain !== 'role' &&
		metadata.factDomain !== 'employer' &&
		metadata.factDomain !== 'study' &&
		metadata.factDomain !== 'availability'
	) {
		return null;
	}

	return {
		factDomain: metadata.factDomain,
		factSubject: metadata.factSubject,
		factSlot: metadata.factSlot,
		factValue: metadata.factValue,
	};
}

function ensureFactSlotMetadata(plan: ClusterPlan): FactSlotMetadata | null {
	const existing = getFactSlotMetadata(plan);
	if (existing) return existing;
	if (
		plan.memoryClass !== 'identity_profile' &&
		plan.memoryClass !== 'situational_context' &&
		plan.memoryClass !== 'long_term_context'
	) {
		return null;
	}

	const extracted = extractFactSlotMetadata(plan.canonicalText);
	if (!extracted) return null;

	plan.metadata = {
		...plan.metadata,
		...extracted,
	};
	return extracted;
}

function applyDeterministicPreferenceSupersession(plans: ClusterPlan[]): void {
	const grouped = new Map<string, ClusterPlan[]>();

	for (const plan of plans) {
		if (plan.memoryClass !== 'stable_preference' || plan.state === 'archived') continue;
		const preference = ensurePreferenceSlotMetadata(plan);
		if (!preference) continue;
		const key = `${preference.preferenceSlot}`;
		const items = grouped.get(key) ?? [];
		items.push(plan);
		grouped.set(key, items);
	}

	for (const items of grouped.values()) {
		if (items.length <= 1) continue;
		const ordered = items.slice().sort((left, right) => right.lastSeenAt - left.lastSeenAt);

		for (const primary of ordered) {
			if (primary.state === 'archived') continue;
			const primaryPreference = ensurePreferenceSlotMetadata(primary);
			if (!primaryPreference) continue;

			for (const candidate of ordered) {
				if (candidate.clusterId === primary.clusterId || candidate.state === 'archived') continue;
				if (candidate.lastSeenAt >= primary.lastSeenAt) continue;
				const candidatePreference = ensurePreferenceSlotMetadata(candidate);
				if (!candidatePreference) continue;

				const sameSlot =
					primaryPreference.preferenceSlot === candidatePreference.preferenceSlot;
				const sameValue =
					primaryPreference.preferenceValue === candidatePreference.preferenceValue;
				const samePolarity =
					primaryPreference.preferencePolarity === candidatePreference.preferencePolarity;

				if (!sameSlot) continue;
				if ((samePolarity && sameValue) || (!samePolarity && !sameValue)) {
					continue;
				}

				candidate.metadata = {
					...candidate.metadata,
					supersededByClusterId: primary.clusterId,
					supersessionReason: 'preference_slot',
				};
				candidate.state = 'archived';
				candidate.decayAt = null;
				candidate.archiveAt = Date.now();
			}
		}
	}
}

function collectPersonaMemoryEvents(params: {
	userId: string;
	plans: ClusterPlan[];
	existingSnapshots: Map<string, ExistingClusterSnapshot>;
}): PendingMemoryEvent[] {
	const events: PendingMemoryEvent[] = [];
	const seenEventKeys = new Set<string>();
	const planById = new Map(params.plans.map((plan) => [plan.clusterId, plan]));
	const existingDeadlinesByTopic = new Map<
		string,
		{
			clusterId: string;
			temporal: PersonaMemoryTemporalInfo;
		}
	>();

	for (const [clusterId, snapshot] of params.existingSnapshots.entries()) {
		const temporal = temporalMetadataFromRecord(snapshot.metadata);
		const topicKey =
			typeof snapshot.metadata.topicKey === 'string' && snapshot.metadata.topicKey.trim()
				? snapshot.metadata.topicKey
				: null;
		if (!temporal || temporal.kind !== 'deadline' || !topicKey) {
			continue;
		}
		existingDeadlinesByTopic.set(topicKey, {
			clusterId,
			temporal,
		});
	}

	for (const plan of params.plans) {
		const supersededById =
			typeof plan.metadata.supersededByClusterId === 'string'
				? plan.metadata.supersededByClusterId
				: null;
		const supersessionReason =
			typeof plan.metadata.supersessionReason === 'string'
				? plan.metadata.supersessionReason
				: null;

		if (plan.memoryClass === 'stable_preference' && supersededById && supersessionReason === 'preference_slot') {
			const successor = planById.get(supersededById);
			const preference = successor ? getPreferenceSlotMetadata(successor) : null;
			const eventKey = `preference_updated:${plan.clusterId}:${supersededById}`;
			if (!seenEventKeys.has(eventKey)) {
				seenEventKeys.add(eventKey);
				events.push({
					eventKey,
					userId: params.userId,
					domain: 'preference',
					eventType: 'preference_updated',
					subjectId: supersededById,
					relatedId: plan.clusterId,
					observedAt: successor?.lastSeenAt ?? plan.lastSeenAt,
					payload: {
						preferenceSlot: preference?.preferenceSlot ?? null,
						preferenceValue: preference?.preferenceValue ?? null,
						preferencePolarity: preference?.preferencePolarity ?? null,
						previousCanonicalText: plan.canonicalText,
						currentCanonicalText: successor?.canonicalText ?? null,
					},
				});
			}
		}

		if (
			supersededById &&
			supersessionReason === 'fact_slot' &&
			(plan.memoryClass === 'identity_profile' ||
				plan.memoryClass === 'situational_context' ||
				plan.memoryClass === 'long_term_context')
		) {
			const successor = planById.get(supersededById);
			const fact = successor ? getFactSlotMetadata(successor) : getFactSlotMetadata(plan);
			const eventKey = `persona_fact_updated:${plan.clusterId}:${supersededById}`;
			if (!seenEventKeys.has(eventKey)) {
				seenEventKeys.add(eventKey);
				events.push({
					eventKey,
					userId: params.userId,
					domain: 'persona',
					eventType: 'persona_fact_updated',
					subjectId: supersededById,
					relatedId: plan.clusterId,
					observedAt: successor?.lastSeenAt ?? plan.lastSeenAt,
					payload: {
						factDomain: fact?.factDomain ?? null,
						factSlot: fact?.factSlot ?? null,
						factValue: fact?.factValue ?? null,
						previousCanonicalText: plan.canonicalText,
						currentCanonicalText: successor?.canonicalText ?? null,
					},
				});
			}
		}

		const temporal = temporalMetadataFromRecord(plan.metadata);
		const topicKey =
			typeof plan.metadata.topicKey === 'string' && plan.metadata.topicKey.trim()
				? String(plan.metadata.topicKey)
				: null;
		if (!temporal || temporal.kind !== 'deadline' || !topicKey || plan.state === 'archived') {
			continue;
		}

		const previousDeadline = existingDeadlinesByTopic.get(topicKey) ?? null;
		const previousExpiresAt = previousDeadline?.temporal.expiresAt ?? null;
		const currentExpiresAt = temporal.expiresAt ?? null;
		const eventType =
			temporal.freshness === 'expired' || temporal.freshness === 'historical'
				? previousDeadline
					? 'deadline_completed'
					: null
				: !previousDeadline
					? 'deadline_set'
					: previousDeadline.clusterId !== plan.clusterId ||
						  previousExpiresAt !== currentExpiresAt ||
						  previousDeadline.temporal.freshness !== temporal.freshness
						? 'deadline_extended'
						: null;
		if (!eventType) {
			continue;
		}

		const eventKey =
			eventType === 'deadline_set'
				? `deadline_set:${plan.clusterId}`
				: `${eventType}:${previousDeadline?.clusterId ?? 'none'}:${plan.clusterId}`;
		if (seenEventKeys.has(eventKey)) {
			continue;
		}
		seenEventKeys.add(eventKey);
		events.push({
			eventKey,
			userId: params.userId,
			domain: 'temporal',
			eventType,
			subjectId: plan.clusterId,
			relatedId: previousDeadline?.clusterId ?? null,
			observedAt: plan.lastSeenAt,
			payload: {
				topicKey,
				canonicalText: plan.canonicalText,
				expiresAt: currentExpiresAt,
				previousExpiresAt,
				freshness: temporal.freshness,
			},
		});
	}

	return events;
}

async function dreamCluster(params: {
	records: HonchoPersonaMemoryRecord[];
	defaultCanonicalText: string;
	defaultMemoryClass: PersonaMemoryClass;
	defaultSalience: number;
}): Promise<DreamClassification> {
	if (!canUseContextSummarizer()) {
		return {
			canonicalText: params.defaultCanonicalText,
			memoryClass: params.defaultMemoryClass,
			salienceScore: params.defaultSalience,
		};
	}

	type RawDreamResponse = {
		canonicalText?: string;
		memoryClass?: PersonaMemoryClass;
		salienceScore?: number;
		timeBound?: string;
		stateHint?: PersonaMemoryState;
		supersededBy?: string | null;
	};

	try {
		const response = await requestStructuredControlModel<RawDreamResponse>({
			system: PERSONA_MEMORY_DREAM_SYSTEM_PROMPT,
			user: JSON.stringify(buildDreamClusterPayload(params), null, 2),
			maxTokens: 260,
			temperature: 0.0,
		});

		const nextMemoryClass =
			response?.memoryClass === 'perishable_fact' ||
			response?.memoryClass === 'short_term_constraint' ||
			response?.memoryClass === 'active_project_context' ||
			response?.memoryClass === 'situational_context' ||
			response?.memoryClass === 'stable_preference' ||
			response?.memoryClass === 'identity_profile' ||
			response?.memoryClass === 'long_term_context'
				? response.memoryClass
				: params.defaultMemoryClass;

		return {
			canonicalText: clip(
				sanitizeDreamedCanonicalText({
					canonicalText: response?.canonicalText,
					defaultCanonicalText: params.defaultCanonicalText,
					records: params.records,
				}),
				320
			),
			memoryClass: nextMemoryClass,
			salienceScore:
				typeof response?.salienceScore === 'number'
					? Math.max(0, Math.min(100, Math.round(response.salienceScore)))
					: params.defaultSalience,
			stateHint: response?.stateHint ?? null,
			supersededBy:
				typeof response?.supersededBy === 'string' && response.supersededBy.trim()
					? response.supersededBy
					: null,
		};
	} catch (error) {
		console.error('[PERSONA_MEMORY] Dream classification failed:', error);
		return {
			canonicalText: params.defaultCanonicalText,
			memoryClass: params.defaultMemoryClass,
			salienceScore: params.defaultSalience,
		};
	}
}

async function loadExistingClusterSnapshots(
	userId: string
): Promise<Map<string, ExistingClusterSnapshot>> {
	const rows = await db
		.select({
			cluster: personaMemoryClusters,
			member: personaMemoryClusterMembers,
		})
		.from(personaMemoryClusters)
		.leftJoin(
			personaMemoryClusterMembers,
			and(
				eq(personaMemoryClusters.clusterId, personaMemoryClusterMembers.clusterId),
				eq(personaMemoryClusters.userId, personaMemoryClusterMembers.userId)
			)
		)
		.where(eq(personaMemoryClusters.userId, userId))
		.orderBy(desc(personaMemoryClusters.updatedAt));

	const snapshots = new Map<string, ExistingClusterSnapshot>();
	for (const row of rows) {
		const existing = snapshots.get(row.cluster.clusterId) ?? {
			canonicalText: row.cluster.canonicalText,
			memoryClass: row.cluster.memoryClass as PersonaMemoryClass,
			salienceScore: row.cluster.salienceScore,
			pinned: row.cluster.pinned === 1,
			metadata: parseJsonRecord(row.cluster.metadataJson),
			lastDreamedAt: row.cluster.lastDreamedAt ? row.cluster.lastDreamedAt.getTime() : null,
			memberIds: [],
		};
		if (row.member?.conclusionId) {
			existing.memberIds.push(row.member.conclusionId);
		}
		snapshots.set(row.cluster.clusterId, existing);
	}

	return snapshots;
}

function computeDreamGate(params: {
	rawRecords: HonchoPersonaMemoryRecord[];
	existingSnapshots: Map<string, ExistingClusterSnapshot>;
	now?: number;
	force?: boolean;
}): { shouldDream: boolean; fullSweep: boolean } {
	const now = params.now ?? Date.now();
	if (params.force) {
		return { shouldDream: true, fullSweep: true };
	}

	if (params.rawRecords.length === 0) {
		return { shouldDream: params.existingSnapshots.size > 0, fullSweep: false };
	}

	let lastDreamAt = 0;
	const memberIds = new Set<string>();
	for (const snapshot of params.existingSnapshots.values()) {
		lastDreamAt = Math.max(lastDreamAt, snapshot.lastDreamedAt ?? 0);
		for (const memberId of snapshot.memberIds) {
			memberIds.add(memberId);
		}
	}

	const changedCount = params.rawRecords.filter(
		(record) => !memberIds.has(record.id) || record.createdAt > lastDreamAt
	).length;
	const age = lastDreamAt > 0 ? now - lastDreamAt : Number.POSITIVE_INFINITY;
	const fullSweep = age >= FULL_SWEEP_INTERVAL_MS;
	const shouldDream =
		params.existingSnapshots.size === 0 ||
		changedCount >= DREAM_MIN_CHANGES ||
		age >= DREAM_INTERVAL_MS;

	return { shouldDream, fullSweep };
}

function applyStateOnlyRefresh(
	row: typeof personaMemoryClusters.$inferSelect
): {
	state: PersonaMemoryState;
	decayAt: Date | null;
	archiveAt: Date | null;
	salienceScore: number;
} {
	const metadata = parseJsonRecord(row.metadataJson);
	const lastSeenAt = row.lastSeenAt ? row.lastSeenAt.getTime() : row.updatedAt.getTime();
	const next = deriveStateFromDecay({
		memoryClass: row.memoryClass as PersonaMemoryClass,
		lastSeenAt,
		pinned: row.pinned === 1,
		metadata,
	});

	return {
		state: next.state,
		decayAt: next.decayAt ? new Date(next.decayAt) : null,
		archiveAt: next.archiveAt ? new Date(next.archiveAt) : null,
		salienceScore: computeRepairedSalienceScore({
			memoryClass: row.memoryClass as PersonaMemoryClass,
			sourceCount: row.sourceCount,
			lastSeenAt,
			state: next.state,
			metadata,
		}),
	};
}

export async function refreshPersonaClusterStates(userId: string): Promise<void> {
	const rows = await db
		.select()
		.from(personaMemoryClusters)
		.where(eq(personaMemoryClusters.userId, userId));

	for (const row of rows) {
		const next = applyStateOnlyRefresh(row);
		if (
			next.state === row.state &&
			(next.decayAt?.getTime() ?? null) === (row.decayAt?.getTime() ?? null) &&
			(next.archiveAt?.getTime() ?? null) === (row.archiveAt?.getTime() ?? null) &&
			next.salienceScore === row.salienceScore
		) {
			continue;
		}
		await db
			.update(personaMemoryClusters)
			.set({
				state: next.state,
				salienceScore: next.salienceScore,
				decayAt: next.decayAt,
				archiveAt: next.archiveAt,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(personaMemoryClusters.userId, userId),
					eq(personaMemoryClusters.clusterId, row.clusterId)
				)
			);
	}
}

export async function ensurePersonaMemoryClustersReady(
	userId: string,
	reason = 'read'
): Promise<void> {
	const existing = ensureClustersReadyInFlight.get(userId);
	if (existing) {
		return existing;
	}

	const pending = (async () => {
		const runtimeEpoch = getPersonaRuntimeEpoch(userId);
		const [unfilteredRawRecords, existingSnapshots] = await Promise.all([
			listPersonaMemories(userId).catch(() => []),
			loadExistingClusterSnapshots(userId),
		]);
		if (!isPersonaRuntimeEpochCurrent(userId, runtimeEpoch)) {
			return;
		}
		const rawRecords = await filterArtifactDerivedPersonaRecords({
			userId,
			records: unfilteredRawRecords,
		});
		const rawNewestAt = rawRecords.reduce(
			(max, record) => Math.max(max, record.createdAt),
			0
		);
		const latestDreamAt = Array.from(existingSnapshots.values()).reduce(
			(max, snapshot) => Math.max(max, snapshot.lastDreamedAt ?? 0),
			0
		);
		const force = rawRecords.length > 0 && existingSnapshots.size === 0;
		const gate = computeDreamGate({
			rawRecords,
			existingSnapshots,
			force,
		});

		if (existingSnapshots.size > 0 && rawRecords.length === 0) {
			await syncPersonaMemoryClusters({
				userId,
				rawRecords,
				reason,
				runtimeEpoch,
			});
			return;
		}

		if (force || gate.shouldDream) {
			await syncPersonaMemoryClusters({
				userId,
				rawRecords,
				reason,
				artifactFilterApplied: true,
				force,
				runtimeEpoch,
			});
			return;
		}

		if (rawNewestAt <= latestDreamAt || rawRecords.length > 0) {
			if (!isPersonaRuntimeEpochCurrent(userId, runtimeEpoch)) {
				return;
			}
			await refreshPersonaClusterStates(userId);
		}
	})().finally(() => {
		ensureClustersReadyInFlight.delete(userId);
	});

	ensureClustersReadyInFlight.set(userId, pending);
	return pending;
}

export async function syncPersonaMemoryClusters(params: {
	userId: string;
	rawRecords: HonchoPersonaMemoryRecord[];
	reason?: string;
	force?: boolean;
	artifactFilterApplied?: boolean;
	runtimeEpoch?: number;
}): Promise<{ dreamed: boolean; fullSweep: boolean; clusterCount: number }> {
	const runtimeEpoch = params.runtimeEpoch ?? getPersonaRuntimeEpoch(params.userId);
	if (!isPersonaRuntimeEpochCurrent(params.userId, runtimeEpoch)) {
		return {
			dreamed: false,
			fullSweep: false,
			clusterCount: 0,
		};
	}
	const filteredRawRecords = params.artifactFilterApplied
		? params.rawRecords
		: await filterArtifactDerivedPersonaRecords({
				userId: params.userId,
				records: params.rawRecords,
			});
	const existingSnapshots = await loadExistingClusterSnapshots(params.userId);
	const gate = computeDreamGate({
		rawRecords: filteredRawRecords,
		existingSnapshots,
		force: params.force,
	});

	if (!gate.shouldDream) {
		if (!isPersonaRuntimeEpochCurrent(params.userId, runtimeEpoch)) {
			return {
				dreamed: false,
				fullSweep: false,
				clusterCount: 0,
			};
		}
		await refreshPersonaClusterStates(params.userId);
		return {
			dreamed: false,
			fullSweep: false,
			clusterCount: existingSnapshots.size,
		};
	}

	const groups = buildClusterGroups(filteredRawRecords);
	const now = Date.now();
	const plans: ClusterPlan[] = [];

	const chunkArray = <T>(arr: T[], size: number): T[][] => {
		return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
			arr.slice(i * size, i * size + size)
		);
	};

	const batches = chunkArray(groups, 20);

	for (const batch of batches) {
		const classifications = await classifyMemoryBatch(
			batch.flatMap(group => 
				group.records.map(record => ({ id: record.id, content: record.content }))
			)
		);
		
		const personalGroups = batch.filter(group => {
			if (!classifications) return true;
			const groupClassifications = classifications.filter(c => 
				group.records.some(r => r.id === c.id)
			);
			if (groupClassifications.length === 0) return true;
			return !groupClassifications.every(c => c.status === 'FOREIGN');
		});

		const dreamResults = await Promise.all(
			personalGroups.map(async (group) => {
				const clusterId = clusterIdForKey(params.userId, group.key);
				const existing = existingSnapshots.get(clusterId);
				const defaultCanonicalText = deriveCanonicalText({
					records: group.records,
					inventoryFingerprint: group.inventoryFingerprint,
				});
				const defaultMemoryClass = group.inventoryFingerprint
					? ('perishable_fact' as const)
					: classifyMemoryTextDeterministically(defaultCanonicalText);
				const defaultSalience = computeSalienceScore({
					memoryClass: defaultMemoryClass,
					sourceCount: group.records.length,
					lastSeenAt: Math.max(...group.records.map((record) => record.createdAt)),
					now,
				});

				const memberIds = group.records.map((record) => record.id).sort();
				const dirty =
					gate.fullSweep ||
					!existing ||
					memberIds.join('|') !== existing.memberIds.slice().sort().join('|');
				
				let dream;
				if (dirty) {
					try {
						dream = await dreamCluster({
							records: group.records,
							defaultCanonicalText,
							defaultMemoryClass,
							defaultSalience,
						});
					} catch (error) {
						console.error('[PERSONA_MEMORY] Dream failed for group:', error);
						dream = {
							canonicalText: defaultCanonicalText,
							memoryClass: defaultMemoryClass,
							salienceScore: defaultSalience,
							stateHint: null,
							supersededBy: null,
						};
					}
				} else {
					dream = {
						canonicalText: existing.canonicalText,
						memoryClass: existing.memoryClass,
						salienceScore: existing.salienceScore,
						stateHint: null,
						supersededBy:
							typeof existing.metadata.supersededByClusterId === 'string'
								? String(existing.metadata.supersededByClusterId)
								: null,
					};
				}

				return { group, clusterId, existing, dream, memberIds };
			})
		);

		for (const { group, clusterId, existing, dream, memberIds } of dreamResults) {
			const normalizedMemoryClass = normalizeDreamMemoryClass(
				dream.canonicalText,
				dream.memoryClass
			);

			const pinned = existing?.pinned ?? false;
			const firstSeenAt = Math.min(...group.records.map((record) => record.createdAt));
			const lastSeenAt = Math.max(...group.records.map((record) => record.createdAt));
			const preferenceMetadata =
				normalizedMemoryClass === 'stable_preference'
					? extractPreferenceSlotMetadata(dream.canonicalText)
					: null;
			const temporalMetadata = deriveTemporalMetadata({
				canonicalText: dream.canonicalText,
				records: group.records,
				memoryClass: normalizedMemoryClass,
				now,
			});
			const topicKey = deriveTopicKey(dream.canonicalText);
			const metadata = {
				...toRecordWithoutPreferenceMetadata(existing?.metadata ?? {}),
				clusterKey: group.key,
				conclusionIds: memberIds,
				dreamReason: params.reason ?? 'manual',
				supersededByClusterId: dream.supersededBy ?? null,
				temporal: temporalMetadata,
				activeConstraint:
					(normalizedMemoryClass === 'short_term_constraint' ||
						temporalMetadata?.kind === 'deadline') &&
					temporalMetadata?.freshness !== 'expired' &&
					temporalMetadata?.freshness !== 'historical',
				topicKey,
				...(preferenceMetadata ?? {}),
			};
			const decay = deriveStateFromDecay({
				memoryClass: normalizedMemoryClass,
				lastSeenAt,
				pinned,
				stateHint: dream.stateHint,
				metadata,
				now,
			});

			plans.push({
				clusterId,
				records: group.records,
				canonicalText: dream.canonicalText,
				memoryClass: normalizedMemoryClass,
				salienceScore: computeRepairedSalienceScore({
					memoryClass: normalizedMemoryClass,
					sourceCount: group.records.length,
					lastSeenAt,
					state: decay.state,
					metadata,
					now,
				}),
				pinned,
				metadata,
				firstSeenAt: Math.min(firstSeenAt, existing?.firstSeenAt ?? Number.MAX_SAFE_INTEGER),
				lastSeenAt,
				lastDreamedAt: now,
				state: decay.state,
				decayAt: decay.decayAt,
				archiveAt: decay.archiveAt,
			});
		}
	}

	applyDeterministicPreferenceSupersession(plans);
	applyTemporalSupersession(plans);
	applyDeterministicFactSupersession(plans);
	await applyTargetedSemanticSupersession(plans);
	applyDeterministicFactSupersession(plans);
	applyDeterministicCorrectionSignals(plans);
	for (const plan of plans) {
		recomputePlanSalience(plan, now);
	}
	if (!isPersonaRuntimeEpochCurrent(params.userId, runtimeEpoch)) {
		return {
			dreamed: false,
			fullSweep: false,
			clusterCount: 0,
		};
	}
	const pendingMemoryEvents = collectPersonaMemoryEvents({
		userId: params.userId,
		plans,
		existingSnapshots,
	});

	if (plans.length > 0) {
		await db
			.insert(personaMemoryClusters)
			.values(
				plans.map((plan) => ({
					clusterId: plan.clusterId,
					userId: params.userId,
					canonicalText: plan.canonicalText,
					memoryClass: plan.memoryClass,
					state: plan.state,
					salienceScore: plan.salienceScore,
					sourceCount: plan.records.length,
					firstSeenAt: new Date(plan.firstSeenAt),
					lastSeenAt: new Date(plan.lastSeenAt),
					lastDreamedAt: new Date(plan.lastDreamedAt),
					decayAt: plan.decayAt ? new Date(plan.decayAt) : null,
					archiveAt: plan.archiveAt ? new Date(plan.archiveAt) : null,
					pinned: plan.pinned ? 1 : 0,
					metadataJson: JSON.stringify(plan.metadata),
					updatedAt: new Date(),
				}))
			)
			.onConflictDoUpdate({
				target: personaMemoryClusters.clusterId,
				set: {
					canonicalText: sql.raw(`excluded.${personaMemoryClusters.canonicalText.name}`),
					memoryClass: sql.raw(`excluded.${personaMemoryClusters.memoryClass.name}`),
					state: sql.raw(`excluded.${personaMemoryClusters.state.name}`),
					salienceScore: sql.raw(`excluded.${personaMemoryClusters.salienceScore.name}`),
					sourceCount: sql.raw(`excluded.${personaMemoryClusters.sourceCount.name}`),
					firstSeenAt: sql.raw(`excluded.${personaMemoryClusters.firstSeenAt.name}`),
					lastSeenAt: sql.raw(`excluded.${personaMemoryClusters.lastSeenAt.name}`),
					lastDreamedAt: sql.raw(`excluded.${personaMemoryClusters.lastDreamedAt.name}`),
					decayAt: sql.raw(`excluded.${personaMemoryClusters.decayAt.name}`),
					archiveAt: sql.raw(`excluded.${personaMemoryClusters.archiveAt.name}`),
					pinned: sql.raw(`excluded.${personaMemoryClusters.pinned.name}`),
					metadataJson: sql.raw(`excluded.${personaMemoryClusters.metadataJson.name}`),
					updatedAt: sql.raw(`excluded.${personaMemoryClusters.updatedAt.name}`),
				}
			});

		await db
			.insert(personaMemoryClusterMembers)
			.values(
				plans.flatMap((plan) =>
					plan.records.map((record) => ({
						id: randomUUID(),
						clusterId: plan.clusterId,
						userId: params.userId,
						conclusionId: record.id,
						content: record.content,
						scope: record.scope,
						sessionId: record.sessionId,
						createdAt: new Date(record.createdAt),
						updatedAt: new Date(),
					}))
				)
			)
			.onConflictDoUpdate({
				target: [
					personaMemoryClusterMembers.userId,
					personaMemoryClusterMembers.conclusionId,
				],
				set: {
					clusterId: sql.raw(`excluded.${personaMemoryClusterMembers.clusterId.name}`),
					content: sql.raw(`excluded.${personaMemoryClusterMembers.content.name}`),
					scope: sql.raw(`excluded.${personaMemoryClusterMembers.scope.name}`),
					sessionId: sql.raw(`excluded.${personaMemoryClusterMembers.sessionId.name}`),
					updatedAt: sql.raw(`excluded.${personaMemoryClusterMembers.updatedAt.name}`),
				}
			});
	}

	if (pendingMemoryEvents.length > 0) {
		await recordMemoryEvents(pendingMemoryEvents).catch((error) =>
			console.error('[PERSONA_MEMORY] Failed to record memory events:', error)
		);
	}

	if (plans.length > 0) {
		queuePersonaClusterSemanticEmbeddingRefresh(
			plans.map((plan) => ({
				clusterId: plan.clusterId,
				userId: params.userId,
				canonicalText: plan.canonicalText,
				memoryClass: plan.memoryClass,
				state: plan.state,
			}))
		);
	}

	return {
		dreamed: true,
		fullSweep: gate.fullSweep,
		clusterCount: plans.length,
	};
}

export async function listPersonaMemoryClusters(userId: string): Promise<PersonaMemoryItem[]> {
	const rows = await db
		.select({
			cluster: personaMemoryClusters,
			member: personaMemoryClusterMembers,
			conversationTitle: conversations.title,
		})
		.from(personaMemoryClusters)
		.leftJoin(
			personaMemoryClusterMembers,
			and(
				eq(personaMemoryClusters.clusterId, personaMemoryClusterMembers.clusterId),
				eq(personaMemoryClusters.userId, personaMemoryClusterMembers.userId)
			)
		)
		.leftJoin(conversations, eq(personaMemoryClusterMembers.sessionId, conversations.id))
		.where(eq(personaMemoryClusters.userId, userId))
		.orderBy(desc(personaMemoryClusters.salienceScore), desc(personaMemoryClusters.updatedAt));

	const grouped = new Map<string, PersonaMemoryItem>();
	for (const row of rows) {
		const metadata = parseJsonRecord(row.cluster.metadataJson);
		const rawCanonicalText = row.cluster.canonicalText;
		const temporal = temporalMetadataFromRecord(metadata);
		const derivedState = deriveStateFromDecay({
			memoryClass: row.cluster.memoryClass as PersonaMemoryClass,
			lastSeenAt: row.cluster.lastSeenAt?.getTime() ?? row.cluster.updatedAt.getTime(),
			pinned: row.cluster.pinned === 1,
			metadata,
		});
		const topicKey =
			typeof metadata.topicKey === 'string' && metadata.topicKey.trim()
				? metadata.topicKey
				: null;
		const existing = grouped.get(row.cluster.clusterId) ?? {
			id: row.cluster.clusterId,
			canonicalText:
				temporal?.freshness === 'expired' || temporal?.freshness === 'historical'
					? buildHistoricalTemporalText(rawCanonicalText, temporal.observedAt)
					: rawCanonicalText,
			rawCanonicalText,
			domain: getPersonaMemoryDomain(row.cluster.memoryClass as PersonaMemoryClass),
			memoryClass: row.cluster.memoryClass as PersonaMemoryClass,
			state: derivedState.state,
			salienceScore: row.cluster.salienceScore,
			sourceCount: row.cluster.sourceCount,
			conversationTitles: [],
			firstSeenAt: row.cluster.firstSeenAt?.getTime() ?? row.cluster.createdAt.getTime(),
			lastSeenAt: row.cluster.lastSeenAt?.getTime() ?? row.cluster.updatedAt.getTime(),
			pinned: row.cluster.pinned === 1,
			temporal,
			activeConstraint:
				metadata.activeConstraint === true ||
				((row.cluster.memoryClass as PersonaMemoryClass) === 'short_term_constraint' &&
					temporal?.freshness !== 'expired' &&
					temporal?.freshness !== 'historical'),
			topicKey,
			topicStatus: deriveTopicStatus({
				memoryClass: row.cluster.memoryClass as PersonaMemoryClass,
				state: derivedState.state,
				temporal,
			}),
			supersededById:
				typeof metadata.supersededByClusterId === 'string'
					? metadata.supersededByClusterId
					: null,
			supersessionReason:
				typeof metadata.supersessionReason === 'string' ? metadata.supersessionReason : null,
			members: [] as PersonaMemoryMemberItem[],
		};

		if (
			row.conversationTitle &&
			!existing.conversationTitles.includes(row.conversationTitle) &&
			existing.conversationTitles.length < 3
		) {
			existing.conversationTitles.push(row.conversationTitle);
		}

		if (row.member?.conclusionId) {
			existing.members.push({
				id: row.member.conclusionId,
				content: row.member.content,
				scope: row.member.scope as PersonaMemoryMemberItem['scope'],
				sessionId: row.member.sessionId ?? null,
				conversationTitle: row.conversationTitle ?? null,
				createdAt: row.member.createdAt.getTime(),
			});
		}

		grouped.set(row.cluster.clusterId, existing);
	}

	const filtered = await filterArtifactDerivedPersonaItems(userId, Array.from(grouped.values()));

	return filtered.sort((left, right) => {
		const stateRank = (state: PersonaMemoryState): number =>
			state === 'active' ? 0 : state === 'dormant' ? 1 : 2;
		const byState = stateRank(left.state) - stateRank(right.state);
		if (byState !== 0) return byState;
		if (left.salienceScore !== right.salienceScore) return right.salienceScore - left.salienceScore;
		return right.lastSeenAt - left.lastSeenAt;
	});
}

export async function getPersonaMemoryClusterConclusionIds(
	userId: string,
	clusterId: string
): Promise<string[]> {
	const rows = await db
		.select({ conclusionId: personaMemoryClusterMembers.conclusionId })
		.from(personaMemoryClusterMembers)
		.where(
			and(
				eq(personaMemoryClusterMembers.userId, userId),
				eq(personaMemoryClusterMembers.clusterId, clusterId)
			)
		);

	return rows.map((row) => row.conclusionId);
}

async function buildPersonaQueryScoreMaps(params: {
	userId: string;
	query: string;
	items: PersonaMemoryItem[];
}): Promise<{
	semanticScoreById: Map<string, number>;
	rerankScoreById: Map<string, number>;
	semanticDiagnostics: SemanticShortlistDiagnostics | null;
	rerankDiagnostics: TeiRerankDiagnostics | null;
}> {
	const trimmedQuery = params.query.trim();
	if (!trimmedQuery || params.items.length === 0) {
		return {
			semanticScoreById: new Map(),
			rerankScoreById: new Map(),
			semanticDiagnostics: null,
			rerankDiagnostics: null,
		};
	}

	let semanticDiagnostics: SemanticShortlistDiagnostics | null = null;
	const semanticMatches =
		(await shortlistSemanticMatchesBySubject({
			userId: params.userId,
			subjectType: 'persona_cluster',
			query: trimmedQuery,
			items: params.items,
			getSubjectId: (item) => item.id,
			limit: PERSONA_SEMANTIC_SHORTLIST_LIMIT,
			onDiagnostics: (diagnostics) => {
				semanticDiagnostics = diagnostics;
			},
		})) ?? [];
	const semanticScoreById = new Map(
		semanticMatches.map((match) => [match.subjectId, match.semanticScore])
	);

	let rerankScoreById = new Map<string, number>();
	let rerankDiagnostics: TeiRerankDiagnostics | null = null;
	if (canUseTeiReranker() && semanticMatches.length > 1) {
		try {
			const reranked = await rerankItems({
				query: trimmedQuery,
				items: semanticMatches.map((match) => match.item),
				getText: (item) => item.rawCanonicalText ?? item.canonicalText,
				maxTexts: PERSONA_RERANK_LIMIT,
				onDiagnostics: (diagnostics) => {
					rerankDiagnostics = diagnostics;
				},
			});

			if (reranked && reranked.items.length > 0) {
				rerankScoreById = new Map(
					reranked.items.map((entry) => [entry.item.id, entry.score])
				);
			}
		} catch (error) {
			console.error('[PERSONA_MEMORY] Semantic reranker failed:', {
				userId: params.userId,
				error,
			});
		}
	}

	return {
		semanticScoreById,
		rerankScoreById,
		semanticDiagnostics,
		rerankDiagnostics,
	};
}

function getPersonaLexicalMatchScore(item: PersonaMemoryItem, query: string): number {
	return Math.max(
		scoreMatch(query, item.rawCanonicalText ?? item.canonicalText),
		item.topicKey ? scoreMatch(query, item.topicKey) : 0
	);
}

function getPersonaQueryMatchScore(params: {
	item: PersonaMemoryItem;
	query: string;
	semanticScoreById: Map<string, number>;
	rerankScoreById: Map<string, number>;
}): number {
	const lexicalScore = getPersonaLexicalMatchScore(params.item, params.query);
	const semanticScore = params.semanticScoreById.get(params.item.id) ?? 0;
	const rerankScore = params.rerankScoreById.get(params.item.id) ?? 0;

	return lexicalScore + semanticScore * 3 + rerankScore * 4;
}

export async function buildPersonaPromptContext(
	userId: string,
	query: string
): Promise<string> {
	const now = Date.now();
	const lastRefreshAt = promptRefreshTriggeredAt.get(userId) ?? 0;
	if (
		!ensureClustersReadyInFlight.has(userId) &&
		now - lastRefreshAt >= PROMPT_REFRESH_THROTTLE_MS
	) {
		promptRefreshTriggeredAt.set(userId, now);
		void ensurePersonaMemoryClustersReady(userId, 'prompt_read').catch((error) => {
			console.warn('[PERSONA_MEMORY] Background cluster refresh failed', {
				userId,
				reason: 'prompt_read',
				error,
			});
		});
	}

	const items = (await listPersonaMemoryClusters(userId)).filter((item) => {
		if (item.state === 'archived') return false;
		if (item.topicStatus === 'historical') return false;
		if (item.temporal?.freshness === 'expired' || item.temporal?.freshness === 'historical') {
			return false;
		}
		return true;
	});
	if (items.length === 0) return '';

	const { semanticScoreById, rerankScoreById, semanticDiagnostics, rerankDiagnostics } =
		await buildPersonaQueryScoreMaps({
		userId,
		query,
		items,
	});

	const isGeneratedDocumentRequest =
		/\bgenerate_file\b/i.test(query) ||
		(/\b(?:generate|create|write|draft|make)\b/i.test(query) &&
			/\b(?:file|document|pdf|report|presentation|deck|slide|spreadsheet)\b/i.test(query));

	const activeConstraints = items
		.filter((item) => item.state === 'active' && item.activeConstraint)
		.map((item) => ({
			item,
			matchScore: getPersonaQueryMatchScore({
				item,
				query,
				semanticScoreById,
				rerankScoreById,
			}),
			constraintRank:
				item.activeConstraint && item.temporal?.freshness === 'active'
					? 2
					: item.activeConstraint && item.temporal?.freshness === 'stale'
						? 1
						: 0,
		}))
		.filter((entry) =>
			shouldIncludePersonaMemoryInGeneratedContext({
				memoryCanonicalText: entry.item.canonicalText,
				currentQuery: query,
				queryOverlap: entry.matchScore,
				isGeneratedDocumentRequest,
			})
		)
		.sort(
			(left, right) =>
				right.constraintRank - left.constraintRank ||
				right.matchScore - left.matchScore ||
				right.item.salienceScore - left.item.salienceScore ||
				right.item.lastSeenAt - left.item.lastSeenAt
		)
		.slice(0, ACTIVE_PROMPT_LIMIT);
	const active = items
		.filter((item) => item.state === 'active' && !item.activeConstraint)
		.map((item) => ({
			item,
			matchScore: getPersonaQueryMatchScore({
				item,
				query,
				semanticScoreById,
				rerankScoreById,
			}),
		}))
		.filter((entry) =>
			shouldIncludePersonaMemoryInGeneratedContext({
				memoryCanonicalText: entry.item.canonicalText,
				currentQuery: query,
				queryOverlap: entry.matchScore,
				isGeneratedDocumentRequest,
			})
		)
		.sort(
			(left, right) =>
				right.matchScore - left.matchScore ||
				right.item.salienceScore - left.item.salienceScore ||
				right.item.lastSeenAt - left.item.lastSeenAt
		)
		.slice(0, ACTIVE_PROMPT_LIMIT);
	const dormant = items
		.filter((item) => item.state === 'dormant' && !item.activeConstraint)
		.map((item) => ({
			item,
			matchScore: getPersonaQueryMatchScore({
				item,
				query,
				semanticScoreById,
				rerankScoreById,
			}),
		}))
		.filter((entry) => entry.matchScore >= 0.1)
		.filter((entry) =>
			shouldIncludePersonaMemoryInGeneratedContext({
				memoryCanonicalText: entry.item.canonicalText,
				currentQuery: query,
				queryOverlap: entry.matchScore,
				isGeneratedDocumentRequest,
			})
		)
		.sort(
			(left, right) =>
				right.matchScore - left.matchScore ||
				Number(right.item.activeConstraint) - Number(left.item.activeConstraint) ||
				right.item.salienceScore - left.item.salienceScore
		)
		.slice(0, DORMANT_PROMPT_LIMIT)
		.map((entry) => entry.item);

	const selected = Array.from(
		new Map(
			[
				...activeConstraints.map((entry) => entry.item),
				...active.map((entry) => entry.item),
				...dormant,
			].map((item) => [item.id, item])
		).values()
	);
	if (selected.length === 0) return '';

	const winningCandidates = [
		...activeConstraints.map((entry) => ({
			item: entry.item,
			matchScore: entry.matchScore,
		})),
		...active.map((entry) => ({
			item: entry.item,
			matchScore: entry.matchScore,
		})),
		...dormant.map((item) => ({
			item,
			matchScore: getPersonaQueryMatchScore({
				item,
				query,
				semanticScoreById,
				rerankScoreById,
			}),
		})),
	].sort(
		(left, right) =>
			right.matchScore - left.matchScore ||
			right.item.salienceScore - left.item.salienceScore ||
			right.item.lastSeenAt - left.item.lastSeenAt
	);
	const winningCandidate = winningCandidates[0] ?? null;
	logTeiRetrievalSummary({
		scope: 'persona_prompt',
		userId,
		queryLength: query.trim().length,
		candidateCount: items.length,
		semantic: semanticDiagnostics,
		rerank: rerankDiagnostics,
		winningMode: determineTeiWinningMode({
			lexicalScore: winningCandidate
				? getPersonaLexicalMatchScore(winningCandidate.item, query)
				: 0,
			semanticScore: winningCandidate
				? semanticScoreById.get(winningCandidate.item.id) ?? 0
				: 0,
			rerankScore: winningCandidate
				? rerankScoreById.get(winningCandidate.item.id) ?? 0
				: 0,
		}),
		winnerId: winningCandidate?.item.id ?? null,
		extra: {
			selectedCount: selected.length,
			activeConstraintCount: activeConstraints.length,
			activeCount: active.length,
			dormantCount: dormant.length,
		},
	});

	const lines: string[] = [];
	let used = 0;
	for (const item of selected) {
		const line = `- ${item.canonicalText}`;
		used += line.length;
		if (used > PROMPT_TEXT_BUDGET) break;
		lines.push(line);
	}

	return lines.length > 0 ? lines.join('\n') : '';
}

export async function deletePersonaMemoryClustersForConclusionIds(
	userId: string,
	conclusionIds: string[]
): Promise<void> {
	if (conclusionIds.length === 0) return;

	const rows = await db
		.select({ clusterId: personaMemoryClusterMembers.clusterId })
		.from(personaMemoryClusterMembers)
		.where(
			and(
				eq(personaMemoryClusterMembers.userId, userId),
				inArray(personaMemoryClusterMembers.conclusionId, conclusionIds)
			)
		);

	const clusterIds = Array.from(new Set(rows.map((row) => row.clusterId)));
	if (clusterIds.length === 0) return;

	await db
		.delete(personaMemoryClusters)
		.where(
			and(
				eq(personaMemoryClusters.userId, userId),
				inArray(personaMemoryClusters.clusterId, clusterIds)
			)
		);
}

export async function deleteAllPersonaMemoryStateForUser(userId: string): Promise<void> {
	clearPersonaMemoryRuntimeStateForUser(userId);
	await db.transaction((tx) => {
		tx.delete(personaMemoryOverviews).where(eq(personaMemoryOverviews.userId, userId)).run();
		tx.delete(personaMemoryClusterMembers).where(eq(personaMemoryClusterMembers.userId, userId)).run();
		tx.delete(personaMemoryClusters).where(eq(personaMemoryClusters.userId, userId)).run();
	});
}
