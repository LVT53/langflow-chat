import { createAttachmentTraceId } from '$lib/server/services/attachment-trace';
import { normalizeModelSelection, type RuntimeConfig } from '$lib/server/config-store';
import type {
	ChatTurnRequestError,
	ChatTurnRoute,
	ParsedChatTurnRequest,
} from './types';

type ParseResult =
	| { ok: true; value: ParsedChatTurnRequest }
	| { ok: false; error: ChatTurnRequestError };

type RequestBody = {
	message?: unknown;
	conversationId?: unknown;
	model?: unknown;
	skipPersistUserMessage?: unknown;
	attachmentIds?: unknown;
};

export async function parseChatTurnRequest(
	request: Request,
	runtimeConfig: RuntimeConfig,
	route: ChatTurnRoute
): Promise<ParseResult> {
	let body: RequestBody;
	try {
		body = await request.json();
	} catch {
		return { ok: false, error: { status: 400, error: 'Invalid JSON body' } };
	}

	const { message, conversationId, model, skipPersistUserMessage, attachmentIds } = body;
	if (typeof message !== 'string' || message.trim().length === 0) {
		return {
			ok: false,
			error: { status: 400, error: 'Message must be a non-empty string' },
		};
	}

	if (message.length > runtimeConfig.maxMessageLength) {
		return {
			ok: false,
			error: {
				status: 400,
				error: `Message exceeds maximum length of ${runtimeConfig.maxMessageLength} characters`,
			},
		};
	}

	if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
		return { ok: false, error: { status: 400, error: 'conversationId is required' } };
	}

	const modelId =
		model === 'model1' || model === 'model2'
			? normalizeModelSelection(model, runtimeConfig)
			: undefined;
	const modelDisplayName =
		modelId === 'model2' ? runtimeConfig.model2.displayName : runtimeConfig.model1.displayName;
	const safeAttachmentIds = Array.isArray(attachmentIds)
		? attachmentIds.filter((id): id is string => typeof id === 'string')
		: [];

	return {
		ok: true,
		value: {
			conversationId,
			normalizedMessage: message.trim(),
			modelId,
			modelDisplayName,
			attachmentIds: safeAttachmentIds,
			skipPersistUserMessage: skipPersistUserMessage === true,
			attachmentTraceId:
				safeAttachmentIds.length > 0 ? createAttachmentTraceId(route) : undefined,
		},
	};
}
