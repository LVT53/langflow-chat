import { randomUUID } from 'crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { messages, messageAnalytics } from '$lib/server/db/schema';
import type { ChatMessage, MessageEvidenceSummary, MessageRole, ThinkingSegment } from '$lib/types';
import { getConfig } from '$lib/server/config-store';
import { listMessageAttachments } from './knowledge';

function getModelDisplayName(modelId?: string | null): string | undefined {
	if (!modelId) return undefined;
	const config = getConfig();
	if (modelId === 'model1') return config.model1.displayName;
	if (modelId === 'model2') return config.model2.displayName;
	return undefined;
}

function mapRowToChatMessage(
	row: typeof messages.$inferSelect,
	modelId?: string | null
): ChatMessage {
	// Restore full interleaved thinkingSegments from persisted JSON.
	// The column stores the complete segment array (text + tool_call entries in order)
	// so the expanded ThinkingBlock view is identical to what was shown during streaming.
	let thinkingSegments: ChatMessage['thinkingSegments'];
	if (row.toolCalls) {
		try {
			const parsed = JSON.parse(row.toolCalls) as ThinkingSegment[];
			if (Array.isArray(parsed) && parsed.length > 0) {
				thinkingSegments = parsed;
			}
		} catch {
			// Malformed JSON — silently ignore, fall back to flat thinking text
		}
	}

	let evidenceSummary: MessageEvidenceSummary | undefined;
	if (row.metadataJson) {
		try {
			const parsed = JSON.parse(row.metadataJson) as { evidenceSummary?: MessageEvidenceSummary };
			if (parsed?.evidenceSummary && Array.isArray(parsed.evidenceSummary.groups)) {
				evidenceSummary = parsed.evidenceSummary;
			}
		} catch {
			// Ignore malformed metadata and fall back to the core message payload.
		}
	}

	return {
		id: row.id,
		role: row.role as MessageRole,
		content: row.content,
		thinking: row.thinking ?? undefined,
		thinkingSegments,
		timestamp: row.createdAt.getTime(),
		modelDisplayName: getModelDisplayName(modelId),
		evidenceSummary,
	};
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
	const [result, attachmentMap] = await Promise.all([
		db
			.select({
				message: messages,
				model: messageAnalytics.model
			})
			.from(messages)
			.leftJoin(messageAnalytics, eq(messages.id, messageAnalytics.messageId))
			.where(eq(messages.conversationId, conversationId))
			.orderBy(asc(messages.createdAt)),
		listMessageAttachments(conversationId),
	]);

	return result.map((row) => ({
		...mapRowToChatMessage(row.message, row.model),
		attachments: attachmentMap.get(row.message.id) ?? [],
	}));
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
	thinkingSegments?: ThinkingSegment[],
	metadata?: { evidenceSummary?: MessageEvidenceSummary | null }
): Promise<ChatMessage> {
	const [message] = await db
		.insert(messages)
		.values({
			id: randomUUID(),
			conversationId,
			role,
			content,
			thinking: thinking ?? null,
			toolCalls: thinkingSegments && thinkingSegments.length > 0
				? JSON.stringify(thinkingSegments)
				: null,
			metadataJson: metadata ? JSON.stringify(metadata) : null,
		})
		.returning();

	return mapRowToChatMessage(message);
}
