import { parseJsonStringArray } from '$lib/server/utils/json';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { conversationDrafts } from '$lib/server/db/schema';
import type {
	Artifact,
	ArtifactSummary,
	ConversationDraft,
	PendingAttachment,
} from '$lib/types';
import { resolvePromptAttachmentArtifacts } from './knowledge';


function toArtifactSummary(artifact: Artifact): ArtifactSummary {
	return {
		id: artifact.id,
		type: artifact.type,
		retrievalClass: artifact.retrievalClass,
		name: artifact.name,
		mimeType: artifact.mimeType ?? null,
		sizeBytes: artifact.sizeBytes ?? null,
		conversationId: artifact.conversationId ?? null,
		summary: artifact.summary ?? null,
		createdAt: artifact.createdAt,
		updatedAt: artifact.updatedAt,
	};
}

function hasMeaningfulDraft(draftText: string, selectedAttachmentIds: string[]): boolean {
	return draftText.trim().length > 0 || selectedAttachmentIds.length > 0;
}

export async function getConversationDraft(
	userId: string,
	conversationId: string
): Promise<ConversationDraft | null> {
	const [row] = await db
		.select()
		.from(conversationDrafts)
		.where(
			and(
				eq(conversationDrafts.userId, userId),
				eq(conversationDrafts.conversationId, conversationId)
			)
		)
		.limit(1);

	if (!row) return null;

	const selectedAttachmentIds = parseJsonStringArray(row.selectedAttachmentIdsJson);
	const resolved =
		selectedAttachmentIds.length > 0
			? await resolvePromptAttachmentArtifacts(userId, selectedAttachmentIds).catch(() => null)
			: null;
	const pendingAttachments: PendingAttachment[] =
		resolved?.items
			.map((item) => {
				if (!item.displayArtifact) return null;
				return {
					artifact: toArtifactSummary(item.displayArtifact),
					promptReady: item.promptReady,
					promptArtifactId: item.promptArtifact?.id ?? null,
					readinessError: item.readinessError ?? null,
				};
			})
			.filter((item): item is PendingAttachment => Boolean(item)) ?? [];

	return {
		conversationId: row.conversationId,
		draftText: row.draftText ?? '',
		selectedAttachmentIds,
		selectedAttachments: pendingAttachments,
		updatedAt: row.updatedAt.getTime(),
	};
}

export async function upsertConversationDraft(params: {
	userId: string;
	conversationId: string;
	draftText: string;
	selectedAttachmentIds: string[];
}): Promise<ConversationDraft | null> {
	const selectedAttachmentIds = Array.from(new Set(params.selectedAttachmentIds));
	const draftText = params.draftText;

	if (!hasMeaningfulDraft(draftText, selectedAttachmentIds)) {
		await clearConversationDraft(params.userId, params.conversationId);
		return null;
	}

	await db
		.insert(conversationDrafts)
		.values({
			conversationId: params.conversationId,
			userId: params.userId,
			draftText,
			selectedAttachmentIdsJson: JSON.stringify(selectedAttachmentIds),
			updatedAt: new Date(),
		})
		.onConflictDoUpdate({
			target: conversationDrafts.conversationId,
			set: {
				userId: params.userId,
				draftText,
				selectedAttachmentIdsJson: JSON.stringify(selectedAttachmentIds),
				updatedAt: new Date(),
			},
		});

	return getConversationDraft(params.userId, params.conversationId);
}

export async function clearConversationDraft(userId: string, conversationId: string): Promise<void> {
	await db
		.delete(conversationDrafts)
		.where(
			and(
				eq(conversationDrafts.userId, userId),
				eq(conversationDrafts.conversationId, conversationId)
			)
		);
}
