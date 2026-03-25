import { inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { conversations } from '$lib/server/db/schema';
import type { KnowledgeMemoryPayload, PersonaMemoryItem } from '$lib/types';
import {
	forgetAllPersonaMemories,
	forgetPersonaMemory,
	getPeerContext,
	listPersonaMemories,
} from './honcho';
import { forgetTaskMemory, listTaskMemoryItems } from './task-state';

export type KnowledgeMemoryAction =
	| { action: 'forget_persona_memory'; conclusionId: string }
	| { action: 'forget_all_persona_memory' }
	| { action: 'forget_task_memory'; taskId: string };

async function enrichPersonaMemories(
	userId: string
): Promise<PersonaMemoryItem[]> {
	const records = await listPersonaMemories(userId);
	const conversationIds = Array.from(
		new Set(
			records
				.map((record) => record.sessionId)
				.filter((sessionId): sessionId is string => Boolean(sessionId))
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
		id: record.id,
		content: record.content,
		scope: record.scope,
		sessionId: record.sessionId,
		conversationId: record.sessionId,
		conversationTitle: record.sessionId ? titleMap.get(record.sessionId) ?? null : null,
		createdAt: record.createdAt,
	}));
}

export async function getKnowledgeMemory(userId: string): Promise<KnowledgeMemoryPayload> {
	const [personaMemories, taskMemories, overview] = await Promise.all([
		enrichPersonaMemories(userId),
		listTaskMemoryItems(userId),
		getPeerContext(userId),
	]);

	return {
		personaMemories,
		taskMemories,
		summary: {
			personaCount: personaMemories.length,
			taskCount: taskMemories.length,
			overview,
		},
	};
}

export async function applyKnowledgeMemoryAction(
	userId: string,
	payload: KnowledgeMemoryAction
): Promise<KnowledgeMemoryPayload> {
	switch (payload.action) {
		case 'forget_persona_memory':
			await forgetPersonaMemory(userId, payload.conclusionId);
			break;
		case 'forget_all_persona_memory':
			await forgetAllPersonaMemories(userId);
			break;
		case 'forget_task_memory':
			await forgetTaskMemory(userId, payload.taskId);
			break;
	}

	return getKnowledgeMemory(userId);
}
