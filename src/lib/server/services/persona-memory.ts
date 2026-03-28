import { createHash, randomUUID } from 'crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	conversations,
	personaMemoryClusterMembers,
	personaMemoryClusters,
} from '$lib/server/db/schema';
import type {
	PersonaMemoryClass,
	PersonaMemoryItem,
	PersonaMemoryMemberItem,
	PersonaMemoryState,
} from '$lib/types';
import { parseJsonRecord as parseJsonRecordOrNull } from '$lib/server/utils/json';
import { clipText, normalizeWhitespace } from '$lib/server/utils/text';
import { areNearDuplicateArtifactTexts } from './evidence-family';
import { listPersonaMemories } from './honcho';
import { canUseContextSummarizer, requestStructuredControlModel } from './task-state';
import { scoreMatch } from './working-set';
import type { HonchoPersonaMemoryRecord } from './honcho';

const DAY_MS = 86_400_000;
const DREAM_MIN_CHANGES = 10;
const DREAM_INTERVAL_MS = DAY_MS;
const FULL_SWEEP_INTERVAL_MS = 7 * DAY_MS;
const ACTIVE_PROMPT_LIMIT = 8;
const DORMANT_PROMPT_LIMIT = 2;
const PROMPT_TEXT_BUDGET = 1600;
const SEMANTIC_RECONCILE_MIN_CONFIDENCE = 72;
const MAX_SEMANTIC_CANDIDATES = 4;
const ensureClustersReadyInFlight = new Map<string, Promise<void>>();

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

type ExistingClusterSnapshot = {
	canonicalText: string;
	memoryClass: PersonaMemoryClass;
	salienceScore: number;
	pinned: boolean;
	metadata: Record<string, unknown>;
	lastDreamedAt: number | null;
	memberIds: string[];
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

export const PERSONA_MEMORY_DREAM_SYSTEM_PROMPT =
	'You organize persona memories. Return strict JSON only with canonicalText, memoryClass, salienceScore, timeBound, stateHint, supersededBy. memoryClass must be one of perishable_fact, situational_context, stable_preference, identity_profile, long_term_context. Prefer compact canonical wording and classify temporary inventory or availability as perishable_fact. Do not infer or invent dates or times for events unless the raw memory text explicitly states them. If a memory mentions a date, meeting, appointment, trip, or other event without an explicit date/time, keep the timing unspecified instead of saying today, now, or adding a calendar date.';

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

function normalizeMemoryText(value: string): string {
	return normalizeWhitespace(value).toLowerCase();
}

export function hasExplicitTemporalCue(text: string): boolean {
	return EXPLICIT_TEMPORAL_CUE_PATTERN.test(text);
}

function recordsHaveExplicitTemporalCue(records: HonchoPersonaMemoryRecord[]): boolean {
	return records.some((record) => hasExplicitTemporalCue(record.content));
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

function clusterIdForKey(key: string): string {
	return `pmc_${hashKey(key)}`;
}

function clip(value: string, maxLength: number): string {
	return clipText(value, maxLength);
}

function parseJsonRecord(value: string | null): Record<string, unknown> {
	return parseJsonRecordOrNull(value) ?? {};
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

function classifyMemoryTextDeterministically(text: string): PersonaMemoryClass {
	const normalized = normalizeMemoryText(text);

	if (
		/\b(fridge|pantry|freezer|available|today|tonight|this week|for dinner|in stock)\b/.test(
			normalized
		)
	) {
		return 'perishable_fact';
	}

	if (
		/\b(plan|planning|currently|right now|this month|this week|temporary|working on|applying|preparing)\b/.test(
			normalized
		)
	) {
		return 'situational_context';
	}

	if (
		/\b(prefer|likes|dislikes|favorite|usually|communication style|tone|writing style)\b/.test(
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
					: params.memoryClass === 'situational_context'
						? 54
						: 42;
	const support = Math.min(12, Math.max(0, params.sourceCount - 1) * 4);
	const decayPenalty =
		params.memoryClass === 'perishable_fact'
			? ageDays * 4
			: params.memoryClass === 'situational_context'
				? ageDays * 2
				: Math.floor(ageDays / 7);
	return Math.max(6, Math.min(100, base + support - decayPenalty));
}

function getDecayWindow(memoryClass: PersonaMemoryClass): {
	dormantMs: number | null;
	archiveMs: number | null;
} {
	switch (memoryClass) {
		case 'perishable_fact':
			return { dormantMs: 3 * DAY_MS, archiveMs: 21 * DAY_MS };
		case 'situational_context':
			return { dormantMs: 14 * DAY_MS, archiveMs: 45 * DAY_MS };
		case 'long_term_context':
			return { dormantMs: 30 * DAY_MS, archiveMs: 120 * DAY_MS };
		case 'stable_preference':
			return { dormantMs: 180 * DAY_MS, archiveMs: 540 * DAY_MS };
		case 'identity_profile':
			return { dormantMs: null, archiveMs: null };
	}
}

function deriveStateFromDecay(params: {
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

	for (const record of sorted) {
		if (assigned.has(record.id)) continue;
		const group = [record];
		assigned.add(record.id);
		const baseText = normalizeMemoryText(record.content);
		for (const candidate of sorted) {
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

function deriveSupersessionSignature(text: string): string | null {
	const normalized = normalizeWhitespace(text).replace(/[.]+$/, '');
	const patterns = [
		/^(.+?) (is|are) (.+)$/i,
		/^(.+?) (likes|dislikes|loves|hates|prefers) (.+)$/i,
		/^(.+?) lives in (.+)$/i,
		/^(.+?) works as (.+)$/i,
	];

	for (const pattern of patterns) {
		const match = normalized.match(pattern);
		if (!match) continue;
		const subject = normalizeMemoryText(match[1]);
		const verb = normalizeMemoryText(match[2]);
		return `${subject}:${verb}`;
	}

	return null;
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

function isSemanticMemoryClass(memoryClass: PersonaMemoryClass): boolean {
	return (
		memoryClass === 'identity_profile' ||
		memoryClass === 'stable_preference' ||
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

function markSupersededClusters(plans: ClusterPlan[]): void {
	const grouped = new Map<string, ClusterPlan[]>();

	for (const plan of plans) {
		const signature = deriveSupersessionSignature(plan.canonicalText);
		if (!signature) continue;
		const items = grouped.get(signature) ?? [];
		items.push(plan);
		grouped.set(signature, items);
	}

	for (const items of grouped.values()) {
		if (items.length <= 1) continue;
		const ordered = items.slice().sort((left, right) => right.lastSeenAt - left.lastSeenAt);
		const newest = ordered[0];
		for (const older of ordered.slice(1)) {
			if (normalizeMemoryText(older.canonicalText) === normalizeMemoryText(newest.canonicalText)) {
				continue;
			}
			older.metadata = {
				...older.metadata,
				supersededByClusterId: newest.clusterId,
			};
			older.state = 'archived';
			older.decayAt = null;
			older.archiveAt = Date.now();
		}
	}
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
			eq(personaMemoryClusters.clusterId, personaMemoryClusterMembers.clusterId)
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
			(next.archiveAt?.getTime() ?? null) === (row.archiveAt?.getTime() ?? null)
		) {
			continue;
		}
		await db
			.update(personaMemoryClusters)
			.set({
				state: next.state,
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
		const [rawRecords, existingSnapshots] = await Promise.all([
			listPersonaMemories(userId).catch(() => []),
			loadExistingClusterSnapshots(userId),
		]);
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
			});
			return;
		}

		if (force || gate.shouldDream) {
			await syncPersonaMemoryClusters({
				userId,
				rawRecords,
				reason,
				force,
			});
			return;
		}

		if (rawNewestAt <= latestDreamAt || rawRecords.length > 0) {
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
}): Promise<{ dreamed: boolean; fullSweep: boolean; clusterCount: number }> {
	const existingSnapshots = await loadExistingClusterSnapshots(params.userId);
	const gate = computeDreamGate({
		rawRecords: params.rawRecords,
		existingSnapshots,
		force: params.force,
	});

	if (!gate.shouldDream) {
		await refreshPersonaClusterStates(params.userId);
		return {
			dreamed: false,
			fullSweep: false,
			clusterCount: existingSnapshots.size,
		};
	}

	const groups = buildClusterGroups(params.rawRecords);
	const now = Date.now();
	const plans: ClusterPlan[] = [];

	for (const group of groups) {
		const clusterId = clusterIdForKey(group.key);
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
		const dream = dirty
			? await dreamCluster({
					records: group.records,
					defaultCanonicalText,
					defaultMemoryClass,
					defaultSalience,
				})
			: {
					canonicalText: existing.canonicalText,
					memoryClass: existing.memoryClass,
					salienceScore: existing.salienceScore,
					stateHint: null,
					supersededBy:
						typeof existing.metadata.supersededByClusterId === 'string'
							? String(existing.metadata.supersededByClusterId)
							: null,
				};

		const pinned = existing?.pinned ?? false;
		const firstSeenAt = Math.min(...group.records.map((record) => record.createdAt));
		const lastSeenAt = Math.max(...group.records.map((record) => record.createdAt));
		const metadata = {
			...(existing?.metadata ?? {}),
			clusterKey: group.key,
			conclusionIds: memberIds,
			dreamReason: params.reason ?? 'manual',
			supersededByClusterId: dream.supersededBy ?? null,
		};
		const decay = deriveStateFromDecay({
			memoryClass: dream.memoryClass,
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
			memoryClass: dream.memoryClass,
			salienceScore: computeSalienceScore({
				memoryClass: dream.memoryClass,
				sourceCount: group.records.length,
				lastSeenAt,
				now,
			}),
			pinned,
			metadata,
			firstSeenAt,
			lastSeenAt,
			lastDreamedAt: now,
			state: decay.state,
			decayAt: decay.decayAt,
			archiveAt: decay.archiveAt,
		});
	}

	markSupersededClusters(plans);
	await applyTargetedSemanticSupersession(plans);
	markSupersededClusters(plans);
	await db.delete(personaMemoryClusterMembers).where(eq(personaMemoryClusterMembers.userId, params.userId));
	await db.delete(personaMemoryClusters).where(eq(personaMemoryClusters.userId, params.userId));

	if (plans.length > 0) {
		await db.insert(personaMemoryClusters).values(
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
		);

		await db.insert(personaMemoryClusterMembers).values(
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
			eq(personaMemoryClusters.clusterId, personaMemoryClusterMembers.clusterId)
		)
		.leftJoin(conversations, eq(personaMemoryClusterMembers.sessionId, conversations.id))
		.where(eq(personaMemoryClusters.userId, userId))
		.orderBy(desc(personaMemoryClusters.salienceScore), desc(personaMemoryClusters.updatedAt));

	const grouped = new Map<string, PersonaMemoryItem>();
	for (const row of rows) {
		const existing = grouped.get(row.cluster.clusterId) ?? {
			id: row.cluster.clusterId,
			canonicalText: row.cluster.canonicalText,
			memoryClass: row.cluster.memoryClass as PersonaMemoryClass,
			state: row.cluster.state as PersonaMemoryState,
			salienceScore: row.cluster.salienceScore,
			sourceCount: row.cluster.sourceCount,
			conversationTitles: [],
			firstSeenAt: row.cluster.firstSeenAt?.getTime() ?? row.cluster.createdAt.getTime(),
			lastSeenAt: row.cluster.lastSeenAt?.getTime() ?? row.cluster.updatedAt.getTime(),
			pinned: row.cluster.pinned === 1,
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

	return Array.from(grouped.values()).sort((left, right) => {
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

export async function buildPersonaPromptContext(
	userId: string,
	query: string
): Promise<string> {
	await ensurePersonaMemoryClustersReady(userId, 'prompt_read');

	const items = (await listPersonaMemoryClusters(userId)).filter((item) => item.state !== 'archived');
	if (items.length === 0) return '';

	const active = items
		.filter((item) => item.state === 'active')
		.sort((left, right) => right.salienceScore - left.salienceScore)
		.slice(0, ACTIVE_PROMPT_LIMIT);
	const dormant = items
		.filter((item) => item.state === 'dormant')
		.map((item) => ({
			item,
			matchScore: scoreMatch(query, item.canonicalText),
		}))
		.filter((entry) => entry.matchScore >= 0.1)
		.sort((left, right) => right.matchScore - left.matchScore || right.item.salienceScore - left.item.salienceScore)
		.slice(0, DORMANT_PROMPT_LIMIT)
		.map((entry) => entry.item);

	const selected = Array.from(new Map([...active, ...dormant].map((item) => [item.id, item])).values());
	if (selected.length === 0) return '';

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
