import { randomUUID } from 'crypto';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { conversations, messages, messageAnalytics } from '$lib/server/db/schema';
import type {
	ChatMessage,
	MessageEvidenceStatusState,
	MessageEvidenceSummary,
	MessageRole,
	ThinkingSegment,
} from '$lib/types';
import { getConfig } from '$lib/server/config-store';
import { listMessageAttachments } from './knowledge';

type PersistedMessageMetadata = {
	evidenceSummary?: MessageEvidenceSummary | null;
	evidenceStatus?: MessageEvidenceStatusState;
};

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

	const metadata = parseMetadata(row.metadataJson);
	const evidenceSummary =
		metadata?.evidenceSummary && Array.isArray(metadata.evidenceSummary.groups)
			? metadata.evidenceSummary
			: undefined;
	const evidencePending = metadata?.evidenceStatus === 'pending' && !evidenceSummary;

	return {
		id: row.id,
		renderKey: row.id,
		role: row.role as MessageRole,
		content: row.content,
		thinking: row.thinking ?? undefined,
		thinkingSegments,
		timestamp: row.createdAt.getTime(),
		modelDisplayName: getModelDisplayName(modelId),
		evidenceSummary,
		evidencePending,
	};
}

function parseMetadata(value: string | null): PersistedMessageMetadata | null {
	if (!value) return null;
	try {
		const parsed = JSON.parse(value) as PersistedMessageMetadata;
		return parsed && typeof parsed === 'object' ? parsed : null;
	} catch {
		return null;
	}
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
	metadata?: PersistedMessageMetadata
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

export async function getMessageEvidenceState(
	conversationId: string,
	messageId: string
): Promise<{
	status: MessageEvidenceStatusState;
	evidenceSummary: MessageEvidenceSummary | null;
} | null> {
	const [row] = await db
		.select({ metadataJson: messages.metadataJson })
		.from(messages)
		.where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
		.limit(1);

	if (!row) return null;

	const metadata = parseMetadata(row.metadataJson);
	const evidenceSummary =
		metadata?.evidenceSummary && Array.isArray(metadata.evidenceSummary.groups)
			? metadata.evidenceSummary
			: null;

	return {
		status: metadata?.evidenceStatus ?? (evidenceSummary ? 'ready' : 'none'),
		evidenceSummary,
	};
}

export async function updateMessageEvidence(
	messageId: string,
	params: {
		evidenceSummary?: MessageEvidenceSummary | null;
		evidenceStatus: MessageEvidenceStatusState;
	}
): Promise<void> {
	const [row] = await db
		.select({ metadataJson: messages.metadataJson })
		.from(messages)
		.where(eq(messages.id, messageId))
		.limit(1);

	if (!row) return;

	const existing = parseMetadata(row.metadataJson) ?? {};
	const next: PersistedMessageMetadata = {
		...existing,
		evidenceStatus: params.evidenceStatus,
	};

	if (params.evidenceSummary && params.evidenceSummary.groups.length > 0) {
		next.evidenceSummary = params.evidenceSummary;
		next.evidenceStatus = 'ready';
	} else if (params.evidenceStatus !== 'ready') {
		delete next.evidenceSummary;
	}

	await db
		.update(messages)
		.set({
			metadataJson: JSON.stringify(next),
		})
		.where(eq(messages.id, messageId));
}

export async function clearMessageEvidenceForUser(userId: string): Promise<void> {
	const conversationRows = await db
		.select({ id: conversations.id })
		.from(conversations)
		.where(eq(conversations.userId, userId));
	const conversationIds = conversationRows.map((row) => row.id);
	if (conversationIds.length === 0) return;

	const rows = await db
		.select({ id: messages.id, metadataJson: messages.metadataJson })
		.from(messages)
		.where(inArray(messages.conversationId, conversationIds));

	for (const row of rows) {
		const metadata = parseMetadata(row.metadataJson);
		if (!metadata || (!('evidenceSummary' in metadata) && !('evidenceStatus' in metadata))) {
			continue;
		}

		const next = { ...metadata };
		delete next.evidenceSummary;
		delete next.evidenceStatus;

		await db
			.update(messages)
			.set({
				metadataJson: Object.keys(next).length > 0 ? JSON.stringify(next) : null,
			})
			.where(eq(messages.id, row.id));
	}
}
