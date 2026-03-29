import { inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { conversations } from '$lib/server/db/schema';
import type {
	KnowledgeMemoryOverviewSource,
	KnowledgeMemoryOverviewStatus,
	KnowledgeMemoryPayload,
	PersonaMemoryItem,
} from '$lib/types';
import {
	forgetAllPersonaMemories,
	forgetPersonaMemory,
	getHonchoAssistantPeerId,
	getHonchoUserPeerId,
	getPeerContext,
	isHonchoEnabled,
} from './honcho';
import { runUserMemoryMaintenance } from './memory-maintenance';
import {
	deletePersonaMemoryClustersForConclusionIds,
	ensurePersonaMemoryClustersReady,
	getPersonaMemoryClusterConclusionIds,
	listPersonaMemoryClusters,
} from './persona-memory';
import {
	forgetFocusContinuity,
	forgetTaskMemory,
	listFocusContinuityItems,
	listTaskMemoryItems,
} from './task-state';

const DAY_MS = 86_400_000;
const OVERVIEW_MIN_DURABLE_ITEMS = 2;
const OVERVIEW_RECENT_SITUATIONAL_MS = 21 * DAY_MS;
const OVERVIEW_SECTION_ITEM_LIMIT = 3;

export type KnowledgeMemoryAction =
	| { action: 'forget_persona_memory'; clusterId?: string; conclusionId?: string }
	| { action: 'forget_all_persona_memory' }
	| { action: 'forget_task_memory'; taskId: string }
	| { action: 'forget_focus_continuity'; continuityId: string }
	| { action: 'forget_project_memory'; projectId: string };

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceAllCaseInsensitive(text: string, needle: string, replacement: string): string {
	if (!needle.trim()) return text;
	return text.replace(new RegExp(escapeRegExp(needle), 'gi'), replacement);
}

function sanitizeMemoryText(
	text: string | null,
	userId: string,
	userDisplayName: string
): string | null {
	if (!text?.trim()) return text;

	const safeDisplayName = userDisplayName.trim() || 'the user';
	const honchoUserPeerId = getHonchoUserPeerId(userId);
	const honchoAssistantPeerId = getHonchoAssistantPeerId(userId);
	let sanitized = text;

	sanitized = sanitized.replace(
		new RegExp(`\\bthe user\\s+${escapeRegExp(userId)}\\b`, 'gi'),
		safeDisplayName
	);
	sanitized = sanitized.replace(
		new RegExp(`\\buser\\s+${escapeRegExp(userId)}\\b`, 'gi'),
		safeDisplayName
	);
	sanitized = sanitized.replace(
		new RegExp(`\\bthe user\\s+${escapeRegExp(honchoUserPeerId)}\\b`, 'gi'),
		safeDisplayName
	);
	sanitized = sanitized.replace(
		new RegExp(`\\buser\\s+${escapeRegExp(honchoUserPeerId)}\\b`, 'gi'),
		safeDisplayName
	);
	sanitized = replaceAllCaseInsensitive(sanitized, honchoAssistantPeerId, 'AlfyAI');
	sanitized = replaceAllCaseInsensitive(sanitized, honchoUserPeerId, safeDisplayName);
	sanitized = replaceAllCaseInsensitive(sanitized, userId, safeDisplayName);

	return sanitized;
}

function normalizeOverviewSentence(text: string): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return '';
	return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function isDurableOverviewCandidate(memory: PersonaMemoryItem, now = Date.now()): boolean {
	if (memory.state === 'archived') return false;

	switch (memory.memoryClass) {
		case 'perishable_fact':
			return false;
		case 'situational_context':
			return (
				memory.state === 'active' &&
				now - memory.lastSeenAt <= OVERVIEW_RECENT_SITUATIONAL_MS &&
				memory.salienceScore >= 52
			);
		case 'long_term_context':
			return memory.pinned || memory.state === 'active' || memory.salienceScore >= 58;
		case 'stable_preference':
		case 'identity_profile':
			return true;
	}
}

function sortOverviewMemories(left: PersonaMemoryItem, right: PersonaMemoryItem): number {
	const stateRank = (state: PersonaMemoryItem['state']) =>
		state === 'active' ? 0 : state === 'dormant' ? 1 : 2;
	return (
		stateRank(left.state) - stateRank(right.state) ||
		Number(right.pinned) - Number(left.pinned) ||
		right.salienceScore - left.salienceScore ||
		right.lastSeenAt - left.lastSeenAt
	);
}

function buildOverviewSection(
	title: string,
	memories: PersonaMemoryItem[]
): string | null {
	if (memories.length === 0) return null;
	const items = memories
		.slice()
		.sort(sortOverviewMemories)
		.slice(0, OVERVIEW_SECTION_ITEM_LIMIT)
		.map((memory) => `- ${normalizeOverviewSentence(memory.canonicalText)}`);

	return `### ${title}\n${items.join('\n')}`;
}

function buildLocalPersonaOverview(personaMemories: PersonaMemoryItem[]): {
	overview: string | null;
	durablePersonaCount: number;
} {
	const durableMemories = personaMemories.filter((memory) => isDurableOverviewCandidate(memory));
	const durablePersonaCount = durableMemories.length;
	if (durablePersonaCount < OVERVIEW_MIN_DURABLE_ITEMS) {
		return { overview: null, durablePersonaCount };
	}

	const sections = [
		buildOverviewSection(
			'Stable Preferences',
			durableMemories.filter((memory) => memory.memoryClass === 'stable_preference')
		),
		buildOverviewSection(
			'Identity And Profile',
			durableMemories.filter((memory) => memory.memoryClass === 'identity_profile')
		),
		buildOverviewSection(
			'Long-Term Context',
			durableMemories.filter((memory) => memory.memoryClass === 'long_term_context')
		),
		buildOverviewSection(
			'Recent Situational Context',
			durableMemories.filter((memory) => memory.memoryClass === 'situational_context')
		),
	].filter((section): section is string => Boolean(section));

	return {
		overview: sections.length > 0 ? sections.join('\n\n') : null,
		durablePersonaCount,
	};
}

function selectKnowledgeOverview(params: {
	personaMemories: PersonaMemoryItem[];
	honchoOverview: string | null;
	honchoEnabled: boolean;
}): {
	overview: string | null;
	overviewSource: KnowledgeMemoryOverviewSource;
	overviewStatus: KnowledgeMemoryOverviewStatus;
	durablePersonaCount: number;
} {
	const fallback = buildLocalPersonaOverview(params.personaMemories);

	if (params.honchoOverview?.trim()) {
		return {
			overview: params.honchoOverview.trim(),
			overviewSource: 'honcho',
			overviewStatus: 'ready',
			durablePersonaCount: fallback.durablePersonaCount,
		};
	}

	if (fallback.overview) {
		return {
			overview: fallback.overview,
			overviewSource: 'persona_fallback',
			overviewStatus: 'ready',
			durablePersonaCount: fallback.durablePersonaCount,
		};
	}

	if (!params.honchoEnabled) {
		return {
			overview: null,
			overviewSource: null,
			overviewStatus: 'disabled',
			durablePersonaCount: fallback.durablePersonaCount,
		};
	}

	return {
		overview: null,
		overviewSource: null,
		overviewStatus:
			fallback.durablePersonaCount >= OVERVIEW_MIN_DURABLE_ITEMS
				? 'temporarily_unavailable'
				: 'not_enough_durable_memory',
		durablePersonaCount: fallback.durablePersonaCount,
	};
}

async function enrichPersonaMemories(
	userId: string,
	userDisplayName: string
): Promise<PersonaMemoryItem[]> {
	const records = await listPersonaMemoryClusters(userId);
	const conversationIds = Array.from(
		new Set(
			records.flatMap((record) =>
				record.members
					.map((member) => member.sessionId)
					.filter((sessionId): sessionId is string => Boolean(sessionId))
			)
		)
	);

	const titleRows =
		conversationIds.length > 0
			? await db
					.select({
						id: conversations.id,
						title: conversations.title,
					})
					.from(conversations)
					.where(inArray(conversations.id, conversationIds))
			: [];
	const titleMap = new Map(titleRows.map((row) => [row.id, row.title]));

	return records.map((record) => ({
		...record,
		canonicalText:
			sanitizeMemoryText(record.canonicalText, userId, userDisplayName) ?? record.canonicalText,
		conversationTitles: record.conversationTitles.map(
			(title) => sanitizeMemoryText(title, userId, userDisplayName) ?? title
		),
		members: record.members.map((member) => ({
			...member,
			content: sanitizeMemoryText(member.content, userId, userDisplayName) ?? member.content,
			conversationTitle: member.sessionId ? titleMap.get(member.sessionId) ?? member.conversationTitle : member.conversationTitle,
		})),
	}));
}

export async function getKnowledgeMemory(
	userId: string,
	userDisplayName: string
): Promise<KnowledgeMemoryPayload> {
	void ensurePersonaMemoryClustersReady(userId, 'knowledge_read').catch((error) => {
		console.warn('[KNOWLEDGE_MEMORY] Background persona cluster refresh failed', {
			userId,
			reason: 'knowledge_read',
			error,
		});
	});

	const [personaMemories, taskMemories, focusContinuities, overview] = await Promise.all([
		enrichPersonaMemories(userId, userDisplayName),
		listTaskMemoryItems(userId),
		listFocusContinuityItems(userId),
		getPeerContext(userId, userDisplayName),
	]);
	const overviewSummary = selectKnowledgeOverview({
		personaMemories,
		honchoOverview: sanitizeMemoryText(overview, userId, userDisplayName),
		honchoEnabled: isHonchoEnabled(),
	});

	return {
		personaMemories,
		taskMemories: taskMemories.map((taskMemory) => ({
			...taskMemory,
			objective:
				sanitizeMemoryText(taskMemory.objective, userId, userDisplayName) ??
				taskMemory.objective,
			checkpointSummary: sanitizeMemoryText(
				taskMemory.checkpointSummary,
				userId,
				userDisplayName
			),
		})),
		focusContinuities: focusContinuities.map((continuity) => ({
			...continuity,
			name:
				sanitizeMemoryText(continuity.name, userId, userDisplayName) ??
				continuity.name,
			summary: sanitizeMemoryText(continuity.summary, userId, userDisplayName),
			conversationTitles: continuity.conversationTitles.map(
				(title) => sanitizeMemoryText(title, userId, userDisplayName) ?? title
			),
		})),
		summary: {
			personaCount: personaMemories.length,
			taskCount: taskMemories.length,
			focusContinuityCount: focusContinuities.length,
			overview: overviewSummary.overview,
			overviewSource: overviewSummary.overviewSource,
			overviewStatus: overviewSummary.overviewStatus,
			durablePersonaCount: overviewSummary.durablePersonaCount,
		},
	};
}

export async function applyKnowledgeMemoryAction(
	userId: string,
	userDisplayName: string,
	payload: KnowledgeMemoryAction
): Promise<KnowledgeMemoryPayload> {
	switch (payload.action) {
		case 'forget_persona_memory':
			if (typeof payload.clusterId === 'string') {
				const conclusionIds = await getPersonaMemoryClusterConclusionIds(userId, payload.clusterId);
				for (const conclusionId of conclusionIds) {
					await forgetPersonaMemory(userId, conclusionId);
				}
				await deletePersonaMemoryClustersForConclusionIds(userId, conclusionIds);
			} else if (typeof payload.conclusionId === 'string') {
				await forgetPersonaMemory(userId, payload.conclusionId);
				await deletePersonaMemoryClustersForConclusionIds(userId, [payload.conclusionId]);
			}
			break;
		case 'forget_all_persona_memory':
			await forgetAllPersonaMemories(userId);
			break;
		case 'forget_task_memory':
			await forgetTaskMemory(userId, payload.taskId);
			break;
		case 'forget_focus_continuity':
			await forgetFocusContinuity(userId, payload.continuityId);
			break;
		case 'forget_project_memory':
			await forgetFocusContinuity(userId, payload.projectId);
			break;
	}

	await runUserMemoryMaintenance(userId, `knowledge_memory:${payload.action}`);
	return getKnowledgeMemory(userId, userDisplayName);
}
