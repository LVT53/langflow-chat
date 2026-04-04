import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { touchConversation } from '$lib/server/services/conversations';
import { sendMessage } from '$lib/server/services/langflow';
import { getConfig } from '$lib/server/config-store';
import { createMessage } from '$lib/server/services/messages';
import { logAttachmentTrace } from '$lib/server/services/attachment-trace';
import { isAttachmentReadinessError } from '$lib/server/services/knowledge';
import { buildSendResponseText, buildUpstreamMessage } from '$lib/server/services/chat-turn/execute';
import {
	persistAssistantEvidence,
	persistAssistantTurnState,
	persistUserTurnAttachments,
	runPostTurnTasks,
} from '$lib/server/services/chat-turn/finalize';
import { preflightChatTurn } from '$lib/server/services/chat-turn/preflight';
import { parseChatTurnRequest } from '$lib/server/services/chat-turn/request';

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	const parsedRequest = await parseChatTurnRequest(event.request, getConfig(), 'send');
	if (!parsedRequest.ok) {
		return json({ error: parsedRequest.error.error }, { status: parsedRequest.error.status });
	}

	const preflight = await preflightChatTurn({
		userId: user.id,
		translationEnabled: user.translationEnabled,
		request: parsedRequest.value,
	});
	if (!preflight.ok) {
		return json(
			{
				error: preflight.error.error,
				code: preflight.error.code,
				attachmentIds: preflight.error.attachmentIds,
			},
			{ status: preflight.error.status }
		);
	}

	const turn = preflight.value;

	try {
		const upstreamMessage = await buildUpstreamMessage(turn);
		const {
			text,
			contextStatus,
			taskState: initialTaskState,
			contextDebug: initialContextDebug,
			honchoContext,
			honchoSnapshot,
		} = await sendMessage(upstreamMessage, turn.conversationId, turn.modelId, user.id, {
			attachmentIds: turn.attachmentIds,
			activeDocumentArtifactId: turn.activeDocumentArtifactId,
			attachmentTraceId: turn.attachmentTraceId,
		});
		const responseText = await buildSendResponseText({
			responseText: text,
			sourceLanguage: turn.sourceLanguage,
			translationEnabled: turn.translationEnabled,
		});

		const userMessage = await createMessage(turn.conversationId, 'user', turn.normalizedMessage);
		await persistUserTurnAttachments({
			userId: user.id,
			conversationId: turn.conversationId,
			messageId: userMessage.id,
			normalizedMessage: turn.normalizedMessage,
			attachmentIds: turn.attachmentIds,
		});

		const assistantMessage = await createMessage(
			turn.conversationId,
			'assistant',
			responseText,
			undefined,
			undefined,
			{ evidenceStatus: 'pending' }
		);
		const turnState = await persistAssistantTurnState({
			userId: user.id,
			conversationId: turn.conversationId,
			normalizedMessage: turn.normalizedMessage,
			assistantResponse: responseText,
			attachmentIds: turn.attachmentIds,
			contextStatus,
			initialTaskState,
			initialContextDebug,
			userMessageId: userMessage.id,
			assistantMessageId: assistantMessage.id,
			continuitySource: 'send',
			honchoContext,
			honchoSnapshot,
		});
		await touchConversation(user.id, turn.conversationId).catch(() => undefined);

		void persistAssistantEvidence({
			logPrefix: '[SEND]',
			userId: user.id,
			conversationId: turn.conversationId,
			assistantMessageId: assistantMessage.id,
			normalizedMessage: turn.normalizedMessage,
			attachmentIds: turn.attachmentIds,
			taskState: turnState.taskState,
			contextStatus,
			contextDebug: turnState.contextDebug,
			initialTaskState,
			initialContextDebug,
		});
		void runPostTurnTasks({
			logPrefix: '[SEND]',
			userId: user.id,
			conversationId: turn.conversationId,
			upstreamMessage,
			assistantMirrorContent: text,
			workCapsule: turnState.workCapsule,
			personaMemorySnapshotPromise: turn.personaMemorySnapshotPromise,
			maintenanceReason: 'chat_send',
		});

		return json({
			response: { text: responseText },
			conversationId: turn.conversationId,
			contextStatus,
			activeWorkingSet: turnState.activeWorkingSet,
			taskState: turnState.taskState,
			contextDebug: turnState.contextDebug,
		});
	} catch (error) {
		console.error('Langflow sendMessage error:', error);
		if (turn.attachmentTraceId) {
			logAttachmentTrace('send_failure', {
				traceId: turn.attachmentTraceId,
				conversationId: turn.conversationId,
				attachmentIds: turn.attachmentIds,
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
