import { rm } from 'fs/promises';
import { join } from 'path';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	artifacts,
	conversationContextStatus,
	conversationTaskStates,
	conversationWorkingSetItems,
	conversations,
	memoryProjects,
	personaMemoryAttributions,
	users,
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
import { clearMessageEvidenceForUser } from './messages';

export type DeleteUserAccountResult =
	| { status: 'deleted' }
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
	await deleteAllHonchoStateForUser(userId);

	const artifactRows = await db
		.select({ id: artifacts.id })
		.from(artifacts)
		.where(eq(artifacts.userId, userId));
	const deletedArtifactIds = artifactRows.map((row) => row.id);

	if (deletedArtifactIds.length > 0) {
		await hardDeleteArtifactsForUser(userId, deletedArtifactIds);
	}

	await db.transaction((tx) => {
		tx.delete(conversationTaskStates).where(eq(conversationTaskStates.userId, userId));
		tx.delete(memoryProjects).where(eq(memoryProjects.userId, userId));
		tx.delete(personaMemoryAttributions).where(eq(personaMemoryAttributions.userId, userId));
		tx.delete(conversationWorkingSetItems).where(eq(conversationWorkingSetItems.userId, userId));
		tx.delete(conversationContextStatus).where(eq(conversationContextStatus.userId, userId));
	});

	await clearMessageEvidenceForUser(userId);

	return { deletedArtifactIds };
}
