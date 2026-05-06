import { and, eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/db";
import { conversations, deepResearchJobs } from "$lib/server/db/schema";
import { deleteAllChatFilesForConversation } from "../chat-files";
import { deleteConversationHonchoState } from "../honcho";
import {
	artifactHasReferencesOutsideConversation,
	getSourceArtifactIdForNormalizedArtifact,
	hardDeleteArtifactsForUser,
	listConversationOwnedArtifacts,
} from "../knowledge";

const DELETE_BLOCKING_DEEP_RESEARCH_STATUSES = [
	"awaiting_plan",
	"awaiting_approval",
	"approved",
	"running",
] as const;

export type ConversationDeleteBlockingDeepResearchJob = {
	id: string;
	status: string;
	stage: string | null;
};

export class ConversationDeleteBlockedByDeepResearchError extends Error {
	readonly code = "active_deep_research_jobs";
	readonly jobs: ConversationDeleteBlockingDeepResearchJob[];

	constructor(jobs: ConversationDeleteBlockingDeepResearchJob[]) {
		super("Conversation has active Deep Research jobs");
		this.name = "ConversationDeleteBlockedByDeepResearchError";
		this.jobs = jobs;
	}
}

export async function deleteConversationWithCleanup(
	userId: string,
	conversationId: string,
): Promise<{
	deletedArtifactIds: string[];
	preservedArtifactIds: string[];
} | null> {
	const [conversation] = await db
		.select({ id: conversations.id })
		.from(conversations)
		.where(
			and(
				eq(conversations.id, conversationId),
				eq(conversations.userId, userId),
			),
		)
		.limit(1);

	if (!conversation) {
		return null;
	}

	const activeDeepResearchJobs = await db
		.select({
			id: deepResearchJobs.id,
			status: deepResearchJobs.status,
			stage: deepResearchJobs.stage,
		})
		.from(deepResearchJobs)
		.where(
			and(
				eq(deepResearchJobs.userId, userId),
				eq(deepResearchJobs.conversationId, conversationId),
				inArray(deepResearchJobs.status, DELETE_BLOCKING_DEEP_RESEARCH_STATUSES),
			),
		);

	if (activeDeepResearchJobs.length > 0) {
		console.warn(
			"[CONVERSATION_DELETE] Blocked conversation delete with active Deep Research jobs",
			{
				userId,
				conversationId,
				jobs: activeDeepResearchJobs,
			},
		);
		throw new ConversationDeleteBlockedByDeepResearchError(activeDeepResearchJobs);
	}

	await deleteConversationHonchoState(userId, conversationId);

	const ownedArtifacts = await listConversationOwnedArtifacts(
		userId,
		conversationId,
	);
	const deletedArtifactIds: string[] = [];
	const preservedArtifactIds: string[] = [];

	for (const artifact of ownedArtifacts) {
		if (artifact.type === "normalized_document") {
			const sourceArtifactId = await getSourceArtifactIdForNormalizedArtifact(
				userId,
				artifact.id,
			);
			if (
				sourceArtifactId &&
				(await artifactHasReferencesOutsideConversation(
					userId,
					sourceArtifactId,
					conversationId,
				))
			) {
				preservedArtifactIds.push(artifact.id);
				continue;
			}
		}

		if (
			await artifactHasReferencesOutsideConversation(
				userId,
				artifact.id,
				conversationId,
			)
		) {
			preservedArtifactIds.push(artifact.id);
			continue;
		}
		deletedArtifactIds.push(artifact.id);
	}

	await hardDeleteArtifactsForUser(userId, deletedArtifactIds);
	await deleteAllChatFilesForConversation(conversationId);

	await db
		.delete(conversations)
		.where(
			and(
				eq(conversations.id, conversationId),
				eq(conversations.userId, userId),
			),
		);

	return {
		deletedArtifactIds,
		preservedArtifactIds,
	};
}
