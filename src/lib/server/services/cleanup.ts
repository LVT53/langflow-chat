import { rm } from 'fs/promises';
import { join } from 'path';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	artifacts,
	chatGeneratedFiles,
	conversationContextStatus,
	conversationDrafts,
	conversationTaskStates,
	conversationWorkingSetItems,
	conversations,
	knowledgeVaults,
	memoryEvents,
	memoryProjectTaskLinks,
	memoryProjects,
	personaMemoryAttributions,
	projects,
	semanticEmbeddings,
	sessions,
	taskCheckpoints,
	taskStateEvidenceLinks,
	users,
	messageAnalytics,
} from '$lib/server/db/schema';
import { verifyPassword } from './auth';
import {
	artifactHasReferencesOutsideConversation,
	getSourceArtifactIdForNormalizedArtifact,
	hardDeleteArtifactsForUser,
	listConversationOwnedArtifacts,
} from './knowledge';
import {
	deleteAllHonchoStateForUser,
	deleteConversationHonchoState,
} from './honcho';
import { deleteAllChatFilesForConversation, deleteAllChatFilesForUser } from './chat-files';
import { clearMessageEvidenceForUser } from './messages';
import { deleteAllPersonaMemoryStateForUser } from './persona-memory';
import { clearKnowledgeMemoryRuntimeStateForUser } from './memory';

export type DeleteUserAccountResult =
	| { status: 'deleted' }
	| { status: 'not_found' }
	| { status: 'incorrect_password' };

export type ResetUserAccountResult =
	| { status: 'reset' }
	| { status: 'not_found' }
	| { status: 'incorrect_password' };

export async function deleteUserAccountWithCleanup(
	userId: string,
	password: string
): Promise<DeleteUserAccountResult> {
	const [user] = await db.select().from(users).where(eq(users.id, userId));
	if (!user) {
		return { status: 'not_found' };
	}

	const valid = await verifyPassword(password, user.passwordHash);
	if (!valid) {
		return { status: 'incorrect_password' };
	}

	await deleteAllHonchoStateForUser(userId);
	await rm(join(process.cwd(), 'data', 'knowledge', userId), {
		recursive: true,
		force: true,
	});
	await rm(join(process.cwd(), 'data', 'avatars', `${userId}.webp`), {
		force: true,
	});

	await db.delete(users).where(eq(users.id, userId));
	return { status: 'deleted' };
}

export async function deleteUserAccountAsAdminWithCleanup(userId: string): Promise<boolean> {
	const [user] = await db.select().from(users).where(eq(users.id, userId));
	if (!user) {
		return false;
	}

	await deleteAllHonchoStateForUser(userId);
	await rm(join(process.cwd(), 'data', 'knowledge', userId), {
		recursive: true,
		force: true,
	});
	await rm(join(process.cwd(), 'data', 'avatars', `${userId}.webp`), {
		force: true,
	});

	await db.delete(users).where(eq(users.id, userId));
	return true;
}

export async function resetUserAccountStateWithCleanup(
	userId: string,
	password: string
): Promise<ResetUserAccountResult> {
	const [user] = await db.select().from(users).where(eq(users.id, userId));
	if (!user) {
		return { status: 'not_found' };
	}

	const valid = await verifyPassword(password, user.passwordHash);
	if (!valid) {
		return { status: 'incorrect_password' };
	}

	clearKnowledgeMemoryRuntimeStateForUser(userId);
	await deleteAllPersonaMemoryStateForUser(userId);
	await deleteAllHonchoStateForUser(userId);

	await deleteAllChatFilesForUser(userId);

	const artifactRows = await db
		.select({ id: artifacts.id })
		.from(artifacts)
		.where(eq(artifacts.userId, userId));
	const artifactIds = artifactRows.map((row) => row.id);
	if (artifactIds.length > 0) {
		await hardDeleteArtifactsForUser(userId, artifactIds);
	}

	await rm(join(process.cwd(), 'data', 'knowledge', userId), {
		recursive: true,
		force: true,
	});

	await db.transaction((tx) => {
		tx.delete(sessions).where(eq(sessions.userId, userId));
		tx.delete(messageAnalytics).where(eq(messageAnalytics.userId, userId));
		tx.delete(chatGeneratedFiles).where(eq(chatGeneratedFiles.userId, userId));
		tx.delete(conversationDrafts).where(eq(conversationDrafts.userId, userId));
		tx.delete(taskStateEvidenceLinks).where(eq(taskStateEvidenceLinks.userId, userId));
		tx.delete(taskCheckpoints).where(eq(taskCheckpoints.userId, userId));
		tx.delete(memoryProjectTaskLinks).where(eq(memoryProjectTaskLinks.userId, userId));
		tx.delete(conversationTaskStates).where(eq(conversationTaskStates.userId, userId));
		tx.delete(memoryProjects).where(eq(memoryProjects.userId, userId));
		tx.delete(memoryEvents).where(eq(memoryEvents.userId, userId));
		tx.delete(personaMemoryAttributions).where(eq(personaMemoryAttributions.userId, userId));
		tx.delete(semanticEmbeddings).where(eq(semanticEmbeddings.userId, userId));
		tx.delete(conversationWorkingSetItems).where(eq(conversationWorkingSetItems.userId, userId));
		tx.delete(conversationContextStatus).where(eq(conversationContextStatus.userId, userId));
		tx.delete(projects).where(eq(projects.userId, userId));
		tx.delete(knowledgeVaults).where(eq(knowledgeVaults.userId, userId));
		tx.delete(conversations).where(eq(conversations.userId, userId));
	});

	return { status: 'reset' };
}

export async function deleteConversationWithCleanup(
	userId: string,
	conversationId: string
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
				eq(conversations.userId, userId)
			)
		)
		.limit(1);

	if (!conversation) {
		return null;
	}

	await deleteConversationHonchoState(userId, conversationId);

	const ownedArtifacts = await listConversationOwnedArtifacts(userId, conversationId);
	const deletedArtifactIds: string[] = [];
	const preservedArtifactIds: string[] = [];

	for (const artifact of ownedArtifacts) {
		if (artifact.type === 'normalized_document') {
			const sourceArtifactId = await getSourceArtifactIdForNormalizedArtifact(userId, artifact.id);
			if (
				sourceArtifactId &&
				(await artifactHasReferencesOutsideConversation(userId, sourceArtifactId, conversationId))
			) {
				preservedArtifactIds.push(artifact.id);
				continue;
			}
		}

		if (await artifactHasReferencesOutsideConversation(userId, artifact.id, conversationId)) {
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
				eq(conversations.userId, userId)
			)
		);

	return {
		deletedArtifactIds,
		preservedArtifactIds,
	};
}

export async function resetKnowledgeBaseState(userId: string): Promise<{
	deletedArtifactIds: string[];
}> {
	clearKnowledgeMemoryRuntimeStateForUser(userId);
	await deleteAllHonchoStateForUser(userId);
	await deleteAllPersonaMemoryStateForUser(userId);

	const artifactRows = await db
		.select({ id: artifacts.id })
		.from(artifacts)
		.where(eq(artifacts.userId, userId));
	const deletedArtifactIds = artifactRows.map((row) => row.id);

	if (deletedArtifactIds.length > 0) {
		await hardDeleteArtifactsForUser(userId, deletedArtifactIds);
	}

	await db.transaction((tx) => {
		tx.delete(taskStateEvidenceLinks).where(eq(taskStateEvidenceLinks.userId, userId));
		tx.delete(taskCheckpoints).where(eq(taskCheckpoints.userId, userId));
		tx.delete(memoryProjectTaskLinks).where(eq(memoryProjectTaskLinks.userId, userId));
		tx.delete(conversationTaskStates).where(eq(conversationTaskStates.userId, userId));
		tx.delete(memoryProjects).where(eq(memoryProjects.userId, userId));
		tx.delete(memoryEvents).where(eq(memoryEvents.userId, userId));
		tx.delete(personaMemoryAttributions).where(eq(personaMemoryAttributions.userId, userId));
		tx.delete(semanticEmbeddings).where(eq(semanticEmbeddings.userId, userId));
		tx.delete(conversationWorkingSetItems).where(eq(conversationWorkingSetItems.userId, userId));
		tx.delete(conversationContextStatus).where(eq(conversationContextStatus.userId, userId));
	});

	await clearMessageEvidenceForUser(userId);

	return { deletedArtifactIds };
}
