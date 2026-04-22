import { getConversation } from '$lib/server/services/conversations';
import { detectLanguage } from '$lib/server/services/language';
import {
	assertPromptReadyAttachments,
	isAttachmentReadinessError,
} from '$lib/server/services/knowledge';
import type {
	ChatTurnRequestError,
	ParsedChatTurnRequest,
	PreflightedChatTurn,
} from './types';

type PreflightResult =
	| { ok: true; value: PreflightedChatTurn }
	| { ok: false; error: ChatTurnRequestError };

export async function preflightChatTurn(params: {
	userId: string;
	translationEnabled?: boolean;
	request: ParsedChatTurnRequest;
}): Promise<PreflightResult> {
	const { userId, translationEnabled = false, request } = params;
	const conversation = await getConversation(userId, request.conversationId);
	if (!conversation) {
		return { ok: false, error: { status: 404, error: 'Conversation not found' } };
	}

	if (request.attachmentIds.length > 0) {
		try {
			await assertPromptReadyAttachments({
				userId,
				conversationId: request.conversationId,
				attachmentIds: request.attachmentIds,
				traceId: request.attachmentTraceId,
			});
		} catch (error) {
			if (isAttachmentReadinessError(error)) {
				return {
					ok: false,
					error: {
						status: error.status,
						error: error.message,
						code: error.code,
						attachmentIds: error.attachmentIds,
					},
				};
			}
			throw error;
		}
	}

	return {
		ok: true,
		value: {
			...request,
			sourceLanguage: detectLanguage(request.normalizedMessage),
			translationEnabled,
		},
	};
}
