import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { touchConversation } from '$lib/server/services/conversations';
import { sendMessage } from '$lib/server/services/langflow';
import { getConfig } from '$lib/server/config-store';
import { createMessage } from '$lib/server/services/messages';
import { logAttachmentTrace } from '$lib/server/services/attachment-trace';
import { isAttachmentReadinessError } from '$lib/server/services/knowledge';
import { normalizeAssistantOutput } from '$lib/server/services/chat-turn/execute';
import {
	persistAssistantEvidence,
	persistAssistantTurnState,
	persistUserTurnAttachments,
	runPostTurnTasks,
} from '$lib/server/services/chat-turn/finalize';
import { preflightChatTurn } from '$lib/server/services/chat-turn/preflight';
import { parseChatTurnRequest } from '$lib/server/services/chat-turn/request';
import { checkStreamCapacity } from '$lib/server/services/chat-turn/active-streams';
import { estimateTokenCount } from '$lib/utils/tokens';
import { getPersonalityProfile } from '$lib/server/services/personality-profiles';

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	// Check capacity limits before processing
	const capacity = checkStreamCapacity(user.id);
	if (!capacity.allowed) {
		console.warn('[CHAT_SEND] Rejected due to capacity', {
			userId: user.id,
			reason: capacity.reason,
			retryAfterSeconds: capacity.retryAfterSeconds,
			currentGlobalCount: capacity.currentGlobalCount,
			currentUserCount: capacity.currentUserCount,
		});

		return json(
			{
				error: 'Server at capacity. Please try again later.',
				code: 'CAPACITY_EXCEEDED',
				reason: capacity.reason,
				retryAfter: capacity.retryAfterSeconds,
			},
			{
				status: 503,
				headers: {
					'Retry-After': String(capacity.retryAfterSeconds ?? 10),
					'Cache-Control': 'no-store',
				},
			}
		);
	}

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
		const upstreamMessage = turn.normalizedMessage;
		const modelUser = {
			id: user.id,
			displayName: user.displayName,
			email: user.email,
		};

		let personalityPrompt: string | undefined;
		if (turn.personalityProfileId) {
			const profile = await getPersonalityProfile(turn.personalityProfileId).catch(() => null);
			personalityPrompt = profile?.promptText || undefined;
		}

		const langflowResult = await sendMessage(
			upstreamMessage,
			turn.conversationId,
			turn.modelId,
			modelUser,
			{
				attachmentIds: turn.attachmentIds,
				activeDocumentArtifactId: turn.activeDocumentArtifactId,
				attachmentTraceId: turn.attachmentTraceId,
				personalityPrompt,
			}
		);
		const text = langflowResult.text ?? '';
		const contextStatus = langflowResult.contextStatus;
		const initialTaskState = langflowResult.taskState;
		const initialContextDebug = langflowResult.contextDebug;
		const honchoContext = langflowResult.honchoContext;
		const honchoSnapshot = langflowResult.honchoSnapshot;
		const responseText = normalizeAssistantOutput(text);

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
			{ evidenceStatus: 'pending', modelDisplayName: turn.modelDisplayName }
		);
		const turnState = await persistAssistantTurnState({
			userId: user.id,
			conversationId: turn.conversationId,
			normalizedMessage: turn.normalizedMessage,
			assistantResponse: responseText,
			attachmentIds: turn.attachmentIds,
			activeDocumentArtifactId: turn.activeDocumentArtifactId,
			contextStatus,
			initialTaskState,
			initialContextDebug,
			userMessageId: userMessage.id,
			assistantMessageId: assistantMessage.id,
			analytics: {
				model: turn.modelId ?? 'model1',
				modelDisplayName: turn.modelDisplayName,
				promptTokens: estimateTokenCount(upstreamMessage),
				completionTokens: estimateTokenCount(responseText),
				generationTimeMs: undefined,
				providerUsage: langflowResult.providerUsage,
			},
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
