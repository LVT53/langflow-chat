import { eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import {
	artifacts,
	conversationContextStatus,
	conversationTaskStates,
	conversationWorkingSetItems,
	memoryEvents,
	memoryProjects,
	memoryProjectTaskLinks,
	personaMemoryAttributions,
	semanticEmbeddings,
	taskCheckpoints,
	taskStateEvidenceLinks,
} from "$lib/server/db/schema";
import {
	deleteAllHonchoStateForUser,
	rotateHonchoPeerIdentity,
} from "../honcho";
import {
	buildArtifactVisibilityCondition,
	getArtifactOwnershipScope,
	hardDeleteArtifactsForUser,
} from "../knowledge";
import { clearKnowledgeMemoryRuntimeStateForUser } from "../memory";
import { clearMessageEvidenceForUser } from "../messages";
import { deleteAllPersonaMemoryStateForUser } from "../persona-memory";

export async function resetKnowledgeBaseState(userId: string): Promise<{
	deletedArtifactIds: string[];
}> {
	clearKnowledgeMemoryRuntimeStateForUser(userId);
	await deleteAllHonchoStateForUser(userId);
	await deleteAllPersonaMemoryStateForUser(userId);
	await rotateHonchoPeerIdentity(userId);

	const ownershipScope = await getArtifactOwnershipScope(userId);
	const artifactRows = await db
		.select({ id: artifacts.id })
		.from(artifacts)
		.where(buildArtifactVisibilityCondition({ userId, ownershipScope }));
	const deletedArtifactIds = artifactRows.map((row) => row.id);

	if (deletedArtifactIds.length > 0) {
		await hardDeleteArtifactsForUser(userId, deletedArtifactIds);
	}

	await db.transaction((tx) => {
		tx.delete(taskStateEvidenceLinks)
			.where(eq(taskStateEvidenceLinks.userId, userId))
			.run();
		tx.delete(taskCheckpoints).where(eq(taskCheckpoints.userId, userId)).run();
		tx.delete(memoryProjectTaskLinks)
			.where(eq(memoryProjectTaskLinks.userId, userId))
			.run();
		tx.delete(conversationTaskStates)
			.where(eq(conversationTaskStates.userId, userId))
			.run();
		tx.delete(memoryProjects).where(eq(memoryProjects.userId, userId)).run();
		tx.delete(memoryEvents).where(eq(memoryEvents.userId, userId)).run();
		tx.delete(personaMemoryAttributions)
			.where(eq(personaMemoryAttributions.userId, userId))
			.run();
		tx.delete(semanticEmbeddings)
			.where(eq(semanticEmbeddings.userId, userId))
			.run();
		tx.delete(conversationWorkingSetItems)
			.where(eq(conversationWorkingSetItems.userId, userId))
			.run();
		tx.delete(conversationContextStatus)
			.where(eq(conversationContextStatus.userId, userId))
			.run();
	});

	await clearMessageEvidenceForUser(userId);

	return { deletedArtifactIds };
}
