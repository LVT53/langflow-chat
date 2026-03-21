import { randomUUID } from 'crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { messages } from '$lib/server/db/schema';
import type { ChatMessage, MessageRole, ToolCallEntry } from '$lib/types';

function mapRowToChatMessage(row: typeof messages.$inferSelect): ChatMessage {
	// Reconstruct thinkingSegments from persisted tool_calls JSON.
	// Text segments are not stored separately (to avoid duplicating the thinking
	// column), so on load segments contain only tool_call entries. ThinkingBlock
	// renders the flat `thinking` text first, then the tool calls below it.
	let thinkingSegments: ChatMessage['thinkingSegments'];
	if (row.toolCalls) {
		try {
			const entries = JSON.parse(row.toolCalls) as ToolCallEntry[];
			if (Array.isArray(entries) && entries.length > 0) {
				thinkingSegments = entries.map((tc) => ({
					type: 'tool_call' as const,
					name: tc.name,
					input: tc.input,
					status: tc.status
				}));
			}
		} catch {
			// Malformed JSON — silently ignore, fall back to flat thinking text
		}
	}

	return {
		id: row.id,
		role: row.role as MessageRole,
		content: row.content,
		thinking: row.thinking ?? undefined,
		thinkingSegments,
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
	thinking?: string,
	toolCalls?: ToolCallEntry[]
): Promise<ChatMessage> {
	const [message] = await db
		.insert(messages)
		.values({
			id: randomUUID(),
			conversationId,
			role,
			content,
			thinking: thinking ?? null,
			toolCalls: toolCalls && toolCalls.length > 0 ? JSON.stringify(toolCalls) : null
		})
		.returning();

	return mapRowToChatMessage(message);
}
