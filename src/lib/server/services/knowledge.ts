import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { artifacts } from '$lib/server/db/schema';
import type { ArtifactSummary, KnowledgeDocumentItem, WorkCapsule } from '$lib/types';
import { ensureGeneratedOutputRetrievalBackfill } from './evidence-family';
import { mapWorkCapsuleFromArtifactRow } from './knowledge/capsules';
import {
	buildArtifactVisibilityCondition,
	getArtifactOwnershipScope,
	isArtifactCanonicallyOwned,
	knowledgeArtifactListSelection,
	listLogicalDocuments,
	mapArtifactSummary,
} from './knowledge/store';

export {
	AttachmentReadinessError,
	assertPromptReadyAttachments,
	artifactHasReferencesOutsideConversation,
	attachArtifactsToMessage,
	buildArtifactVisibilityCondition,
	createArtifactLink,
	createNormalizedArtifact,
	deleteArtifactForUser,
	deleteKnowledgeArtifactsByAction,
	getArtifactForUser,
	getArtifactOwnershipScope,
	getArtifactsForUser,
	getCompactionUiThreshold,
	getMaxModelContext,
	getSourceArtifactIdForNormalizedArtifact,
	getTargetConstructedContext,
	hardDeleteArtifactsForUser,
	isAttachmentReadinessError,
	listArtifactLinksForUser,
	listConversationArtifacts,
	listConversationOwnedArtifacts,
	listConversationSourceArtifactIds,
	listMessageAttachments,
	resolvePromptAttachmentArtifacts,
	saveUploadedArtifact,
	searchVaultDocuments,
	WORKING_SET_DOCUMENT_TOKEN_BUDGET,
	WORKING_SET_OUTPUT_TOKEN_BUDGET,
	WORKING_SET_PROMPT_TOKEN_BUDGET,
} from './knowledge/store';
export type { KnowledgeBulkAction } from './knowledge/store';

export {
	createGeneratedOutputArtifact,
	findRelevantWorkCapsules,
	upsertWorkCapsule,
} from './knowledge/capsules';

export {
	findRelevantKnowledgeArtifacts,
	getConversationContextStatus,
	getConversationWorkingSet,
	refreshConversationWorkingSet,
	selectWorkingSetArtifactsForPrompt,
	updateConversationContextStatus,
} from './knowledge/context';

export async function listKnowledgeArtifacts(userId: string): Promise<{
	documents: KnowledgeDocumentItem[];
	results: ArtifactSummary[];
	workflows: WorkCapsule[];
}> {
	await ensureGeneratedOutputRetrievalBackfill(userId);
	const ownershipScope = await getArtifactOwnershipScope(userId);

	const rows = await db
		.select(knowledgeArtifactListSelection)
		.from(artifacts)
		.where(buildArtifactVisibilityCondition({ userId, ownershipScope }))
		.orderBy(desc(artifacts.updatedAt));
	const scopedRows = rows.filter((row) =>
		isArtifactCanonicallyOwned({
			userId,
			ownershipScope,
			artifact: row,
		})
	);

	const documents = await listLogicalDocuments(userId);

	const latestGeneratedByConversation = new Map<string, (typeof rows)[number]>();
	for (const row of scopedRows) {
		if (row.type !== 'generated_output') continue;
		const key = row.conversationId ?? row.id;
		if (!latestGeneratedByConversation.has(key)) {
			latestGeneratedByConversation.set(key, row);
		}
	}

	return {
		documents,
		results: Array.from(latestGeneratedByConversation.values()).map(mapArtifactSummary),
		workflows: scopedRows
			.filter((row) => row.type === 'work_capsule')
			.map((row) => mapWorkCapsuleFromArtifactRow(row)),
	};
}
