import { randomUUID } from 'crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { messages } from '$lib/server/db/schema';
import type { ChatMessage, MessageRole } from '$lib/types';

function mapRowToChatMessage(row: typeof messages.$inferSelect): ChatMessage {
	return {
		id: row.id,
		role: row.role as MessageRole,
		content: row.content,
		thinking: row.thinking ?? undefined,
		timestamp: row.createdAt.getTime()
	};
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
	const result = await db
		.select()
		.from(messages)
		.where(eq(messages.conversationId, conversationId))
		.orderBy(asc(messages.createdAt));

	return result.map(mapRowToChatMessage);
}

export async function deleteMessages(ids: string[]): Promise<void> {
	if (ids.length === 0) return;
	await db.delete(messages).where(inArray(messages.id, ids));
}

export async function createMessage(
	conversationId: string,
	role: MessageRole,
	content: string,
	thinking?: string
): Promise<ChatMessage> {
	const [message] = await db
		.insert(messages)
		.values({
			id: randomUUID(),
			conversationId,
			role,
			content,
			thinking: thinking ?? null
		})
		.returning();

	return mapRowToChatMessage(message);
}
