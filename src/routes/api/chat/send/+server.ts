import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getConversation, touchConversation } from '$lib/server/services/conversations';
import { sendMessage } from '$lib/server/services/langflow';
import { getConfig, normalizeModelSelection } from '$lib/server/config-store';
import { createMessage, updateMessageEvidence } from '$lib/server/services/messages';
import { buildAssistantEvidenceSummary } from '$lib/server/services/message-evidence';
import {
	createAttachmentTraceId,
	logAttachmentTrace,
} from '$lib/server/services/attachment-trace';
import {
	capturePersonaMemorySnapshot,
	mirrorMessage,
	mirrorWorkCapsuleConclusion,
	syncConversationPersonaMemoryAttributions,
} from '$lib/server/services/honcho';
import {
	assertPromptReadyAttachments,
	attachArtifactsToMessage,
	createGeneratedOutputArtifact,
	getConversationWorkingSet,
	getArtifactsForUser,
	isAttachmentReadinessError,
	listConversationSourceArtifactIds,
	refreshConversationWorkingSet,
	upsertWorkCapsule
} from '$lib/server/services/knowledge';
import {
	getContextDebugState,
	getConversationTaskState,
	updateTaskStateCheckpoint,
} from '$lib/server/services/task-state';
import { detectLanguage } from '$lib/server/services/language';
import {
	translateEnglishToHungarian,
	translateHungarianToEnglish
} from '$lib/server/services/translator';

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	let body: { message?: unknown; conversationId?: unknown; model?: unknown; attachmentIds?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { message, conversationId, model, attachmentIds } = body;

	if (typeof message !== 'string' || message.trim().length === 0) {
		return json({ error: 'Message must be a non-empty string' }, { status: 400 });
	}

	const { maxMessageLength } = getConfig();
	if (message.length > maxMessageLength) {
		return json(
			{ error: `Message exceeds maximum length of ${maxMessageLength} characters` },
			{ status: 400 }
		);
	}

	if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
		return json({ error: 'conversationId is required' }, { status: 400 });
	}

	// Validate model parameter
	const modelId =
		model === 'model1' || model === 'model2'
			? normalizeModelSelection(model, getConfig())
			: undefined;
	const safeAttachmentIds = Array.isArray(attachmentIds)
		? attachmentIds.filter((id): id is string => typeof id === 'string')
		: [];
	const attachmentTraceId =
		safeAttachmentIds.length > 0 ? createAttachmentTraceId('send') : undefined;

	const conversation = await getConversation(user.id, conversationId);
	if (!conversation) {
		return json({ error: 'Conversation not found' }, { status: 404 });
	}

	try {
		if (safeAttachmentIds.length > 0) {
			await assertPromptReadyAttachments({
				userId: user.id,
				conversationId,
				attachmentIds: safeAttachmentIds,
				traceId: attachmentTraceId,
			});
		}

		const normalizedMessage = message.trim();
		const sourceLanguage = detectLanguage(normalizedMessage);
		const isTranslationEnabled = user.translationEnabled;
		const personaMemorySnapshotPromise = capturePersonaMemorySnapshot(user.id).catch(
			() => undefined
		);

		const upstreamMessage =
			sourceLanguage === 'hu' && isTranslationEnabled
				? await translateHungarianToEnglish(normalizedMessage)
				: normalizedMessage;

		const { text, contextStatus, taskState: initialTaskState, contextDebug: initialContextDebug } = await sendMessage(
			upstreamMessage,
			conversationId,
			modelId,
			user.id,
			{ attachmentIds: safeAttachmentIds, attachmentTraceId }
		);
		const responseText =
			sourceLanguage === 'hu' && isTranslationEnabled
				? await translateEnglishToHungarian(text)
				: text;

		const userMessage = await createMessage(conversationId, 'user', normalizedMessage);
		if (safeAttachmentIds.length > 0) {
			await attachArtifactsToMessage({
				userId: user.id,
				conversationId,
				messageId: userMessage.id,
				artifactIds: safeAttachmentIds
			});
		}
		await refreshConversationWorkingSet({
			userId: user.id,
			conversationId,
			message: normalizedMessage,
			attachmentIds: safeAttachmentIds
		});
		const assistantMessage = await createMessage(
			conversationId,
			'assistant',
			responseText,
			undefined,
			undefined,
			{ evidenceStatus: 'pending' }
		);
		const sourceArtifactIds = safeAttachmentIds.length > 0
			? safeAttachmentIds
			: await listConversationSourceArtifactIds(user.id, conversationId);
		const outputArtifact = await createGeneratedOutputArtifact({
			userId: user.id,
			conversationId,
			messageId: assistantMessage.id,
			content: responseText,
			sourceArtifactIds
		});
		const workCapsule = await upsertWorkCapsule({ userId: user.id, conversationId });
		const activeWorkingSet = await refreshConversationWorkingSet({
			userId: user.id,
			conversationId,
			message: normalizedMessage,
			latestOutputArtifactId: outputArtifact?.id ?? null
		}).catch(async () => getConversationWorkingSet(user.id, conversationId));
		const taskState = await updateTaskStateCheckpoint({
			userId: user.id,
			conversationId,
			message: normalizedMessage,
			assistantResponse: responseText,
			attachmentIds: safeAttachmentIds,
			promptArtifactIds: contextStatus?.workingSetArtifactIds ?? [],
			userMessageId: userMessage.id,
			assistantMessageId: assistantMessage.id,
		}).catch(async () => getConversationTaskState(user.id, conversationId));
		const contextDebug = await getContextDebugState(user.id, conversationId).catch(() => null);
		await touchConversation(user.id, conversationId).catch(() => undefined);

		void (async () => {
			try {
				const currentAttachments =
					safeAttachmentIds.length > 0 ? await getArtifactsForUser(user.id, safeAttachmentIds) : [];
				const messageEvidence = await buildAssistantEvidenceSummary({
					message: normalizedMessage,
					taskState: taskState ?? initialTaskState ?? null,
					contextStatus: contextStatus ?? null,
					contextDebug: contextDebug ?? initialContextDebug ?? null,
					currentAttachments,
				});
				await updateMessageEvidence(assistantMessage.id, {
					evidenceSummary: messageEvidence,
					evidenceStatus: messageEvidence ? 'ready' : 'none',
				});
			} catch (error) {
				console.error('[SEND] Failed to persist assistant evidence summary:', error);
				await updateMessageEvidence(assistantMessage.id, {
					evidenceStatus: 'failed',
				}).catch(() => undefined);
			}
		})();

		const honchoTasks: Promise<unknown>[] = [
			mirrorMessage(user.id, conversationId, 'user', upstreamMessage).catch((err) =>
				console.error('[HONCHO] Mirror user message failed:', err)
			),
			mirrorMessage(user.id, conversationId, 'assistant', text).catch((err) =>
				console.error('[HONCHO] Mirror assistant message failed:', err)
			),
		];
		if (workCapsule?.workflowSummary) {
			honchoTasks.push(
				mirrorWorkCapsuleConclusion({
					userId: user.id,
					conversationId,
					content: `${workCapsule.taskSummary ?? workCapsule.artifact.name}\n${workCapsule.workflowSummary}`
				}).catch((err) => console.error('[HONCHO] Mirror work capsule failed:', err))
			);
		}
		void Promise.allSettled(honchoTasks)
			.then(async () =>
				syncConversationPersonaMemoryAttributions({
					userId: user.id,
					conversationId,
					beforeIds: await personaMemorySnapshotPromise,
					attempts: 3,
					delayMs: 300,
				})
			)
			.catch((err) => console.error('[HONCHO] Persona memory attribution sync failed:', err));

		return json({
			response: { text: responseText },
			conversationId,
			contextStatus,
			activeWorkingSet,
			taskState,
			contextDebug,
		});
	} catch (error) {
		console.error('Langflow sendMessage error:', error);
		if (attachmentTraceId) {
			logAttachmentTrace('send_failure', {
				traceId: attachmentTraceId,
				conversationId,
				attachmentIds: safeAttachmentIds,
				errorMessage: error instanceof Error ? error.message : String(error),
				errorCode:
					typeof error === 'object' && error !== null && 'code' in error
						? (error as { code?: unknown }).code ?? null
						: null,
			});
		}
		if (isAttachmentReadinessError(error)) {
			return json(
				{ error: error.message, code: error.code, attachmentIds: error.attachmentIds },
				{ status: error.status }
			);
		}
		return json(
			{ error: 'Failed to get response from AI. Please try again.' },
			{ status: 502 }
		);
	}
};
