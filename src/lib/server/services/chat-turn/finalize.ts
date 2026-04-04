import { recordMessageAnalytics } from '$lib/server/services/analytics';
import { clearConversationDraft } from '$lib/server/services/conversation-drafts';
import {
	mirrorMessage,
	mirrorWorkCapsuleConclusion,
	syncConversationPersonaMemoryAttributions,
} from '$lib/server/services/honcho';
import {
	attachArtifactsToMessage,
	createGeneratedOutputArtifact,
	getConversationWorkingSet,
	getArtifactsForUser,
	listConversationSourceArtifactIds,
	refreshConversationWorkingSet,
	upsertWorkCapsule,
} from '$lib/server/services/knowledge';
import { runUserMemoryMaintenance } from '$lib/server/services/memory-maintenance';
import { buildAssistantEvidenceSummary } from '$lib/server/services/message-evidence';
import {
	updateMessageEvidence,
	updateMessageHonchoMetadata,
} from '$lib/server/services/messages';
import {
	applyProjectContinuitySignalFromMessage,
	attachContinuityToTaskState,
	getContextDebugState,
	getConversationTaskState,
	syncTaskContinuityFromTaskState,
	updateTaskStateCheckpoint,
} from '$lib/server/services/task-state';
import type {
	PersistAssistantEvidenceParams,
	PersistAssistantTurnStateParams,
	PersistAssistantTurnStateResult,
	RunPostTurnTasksParams,
	WorkCapsuleSummary,
	WorkingSetItem,
} from './types';

async function refreshWorkingSetWithAttachments(params: {
	userId: string;
	conversationId: string;
	messageId: string;
	normalizedMessage: string;
	attachmentIds: string[];
}): Promise<WorkingSetItem[] | undefined> {
	if (params.attachmentIds.length === 0) return undefined;

	await attachArtifactsToMessage({
		userId: params.userId,
		conversationId: params.conversationId,
		messageId: params.messageId,
		artifactIds: params.attachmentIds,
	});

	return refreshConversationWorkingSet({
		userId: params.userId,
		conversationId: params.conversationId,
		message: params.normalizedMessage,
		attachmentIds: params.attachmentIds,
	});
}

export async function persistUserTurnAttachments(params: {
	userId: string;
	conversationId: string;
	messageId: string;
	normalizedMessage: string;
	attachmentIds: string[];
}): Promise<WorkingSetItem[] | undefined> {
	return refreshWorkingSetWithAttachments(params);
}

export async function persistAssistantTurnState(
	params: PersistAssistantTurnStateParams
): Promise<PersistAssistantTurnStateResult> {
	const analytics = params.analytics ?? null;
	if (analytics) {
		recordMessageAnalytics({
			messageId: params.assistantMessageId,
			userId: params.userId,
			model: analytics.model,
			completionTokens: analytics.completionTokens,
			reasoningTokens: analytics.reasoningTokens,
			generationTimeMs: analytics.generationTimeMs,
		}).catch(() => undefined);
	}

	const sourceArtifactIds =
		params.attachmentIds.length > 0
			? params.attachmentIds
			: await listConversationSourceArtifactIds(params.userId, params.conversationId);
	const outputArtifact = await createGeneratedOutputArtifact({
		userId: params.userId,
		conversationId: params.conversationId,
		messageId: params.assistantMessageId,
		content: params.assistantResponse,
		sourceArtifactIds,
	});
	const workCapsule = (await upsertWorkCapsule({
		userId: params.userId,
		conversationId: params.conversationId,
	})) as WorkCapsuleSummary;
	const activeWorkingSet = await refreshConversationWorkingSet({
		userId: params.userId,
		conversationId: params.conversationId,
		message: params.normalizedMessage,
		activeDocumentArtifactId: params.activeDocumentArtifactId,
		selectedGeneratedArtifactId: outputArtifact?.id ?? null,
	}).catch(async () => getConversationWorkingSet(params.userId, params.conversationId));
	let taskState = await updateTaskStateCheckpoint({
		userId: params.userId,
		conversationId: params.conversationId,
		message: params.normalizedMessage,
		assistantResponse: params.assistantResponse,
		attachmentIds: params.attachmentIds,
		promptArtifactIds: params.contextStatus?.workingSetArtifactIds ?? [],
		userMessageId: params.userMessageId ?? null,
		assistantMessageId: params.assistantMessageId,
	}).catch(async () => getConversationTaskState(params.userId, params.conversationId));

	if (taskState) {
		await syncTaskContinuityFromTaskState({
			userId: params.userId,
			taskState,
		}).catch((error) =>
			console.error(
				`[CONTINUITY] Failed to sync focus continuity from ${params.continuitySource}:`,
				error
			)
		);
		await applyProjectContinuitySignalFromMessage({
			userId: params.userId,
			taskState,
			message: params.normalizedMessage,
		}).catch((error) =>
			console.error(
				`[CONTINUITY] Failed to apply project continuity signal from ${params.continuitySource}:`,
				error
			)
		);
	}

	taskState = await attachContinuityToTaskState(params.userId, taskState ?? null).catch(
		() => taskState ?? null
	);
	await updateMessageHonchoMetadata(params.assistantMessageId, {
		honchoContext: params.honchoContext,
		honchoSnapshot: params.honchoSnapshot,
	}).catch(() => undefined);
	const contextDebug = await getContextDebugState(params.userId, params.conversationId).catch(
		() => null
	);
	await clearConversationDraft(params.userId, params.conversationId).catch(() => undefined);

	return {
		activeWorkingSet,
		taskState,
		contextDebug,
		workCapsule,
	};
}

export async function persistAssistantEvidence(
	params: PersistAssistantEvidenceParams
): Promise<void> {
	try {
		const currentAttachments =
			params.attachmentIds.length > 0
				? await getArtifactsForUser(params.userId, params.attachmentIds)
				: [];
		const messageEvidence = await buildAssistantEvidenceSummary({
			userId: params.userId,
			message: params.normalizedMessage,
			taskState: params.taskState ?? params.initialTaskState ?? null,
			contextStatus: params.contextStatus ?? null,
			contextDebug: params.contextDebug ?? params.initialContextDebug ?? null,
			toolCalls: params.toolCalls?.filter((tool) => tool.status === 'done'),
			currentAttachments,
		});
		await updateMessageEvidence(params.assistantMessageId, {
			evidenceSummary: messageEvidence,
			evidenceStatus: messageEvidence ? 'ready' : 'none',
		});
	} catch (error) {
		console.error(`${params.logPrefix} Failed to persist assistant evidence summary:`, error);
		await updateMessageEvidence(params.assistantMessageId, {
			evidenceStatus: 'failed',
		}).catch(() => undefined);
	}
}

export async function runPostTurnTasks(params: RunPostTurnTasksParams): Promise<void> {
	const honchoTasks: Promise<unknown>[] = [
		mirrorMessage(params.userId, params.conversationId, 'user', params.upstreamMessage).catch(
			(err) => console.error('[HONCHO] Mirror user message failed:', err)
		),
	];

	if (params.assistantMirrorContent?.trim()) {
		honchoTasks.push(
			mirrorMessage(
				params.userId,
				params.conversationId,
				'assistant',
				params.assistantMirrorContent
			).catch((err) => console.error('[HONCHO] Mirror assistant message failed:', err))
		);
	}

	if (params.workCapsule?.workflowSummary) {
		honchoTasks.push(
			mirrorWorkCapsuleConclusion({
				userId: params.userId,
				conversationId: params.conversationId,
				content: `${params.workCapsule.taskSummary ?? params.workCapsule.artifact.name}\n${params.workCapsule.workflowSummary}`,
			}).catch((err) => console.error('[HONCHO] Mirror work capsule failed:', err))
		);
	}

	try {
		await Promise.allSettled(honchoTasks);
		await syncConversationPersonaMemoryAttributions({
			userId: params.userId,
			conversationId: params.conversationId,
			beforeIds: await params.personaMemorySnapshotPromise,
			attempts: 3,
			delayMs: 300,
		});
		await runUserMemoryMaintenance(params.userId, params.maintenanceReason);
	} catch (error) {
		console.error(`${params.logPrefix} Post-turn memory maintenance failed:`, error);
	}
}
