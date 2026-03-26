import { inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { conversations } from '$lib/server/db/schema';
import type { KnowledgeMemoryPayload, PersonaMemoryItem } from '$lib/types';
import {
	forgetAllPersonaMemories,
	forgetPersonaMemory,
	getHonchoAssistantPeerId,
	getHonchoUserPeerId,
	getPeerContext,
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
	await ensurePersonaMemoryClustersReady(userId, 'knowledge_read');

	const [personaMemories, taskMemories, focusContinuities, overview] = await Promise.all([
		enrichPersonaMemories(userId, userDisplayName),
		listTaskMemoryItems(userId),
		listFocusContinuityItems(userId),
		getPeerContext(userId, userDisplayName),
	]);

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
			overview: sanitizeMemoryText(overview, userId, userDisplayName),
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
