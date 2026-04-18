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
	userMessage?: unknown;
	conversationId?: unknown;
	streamId?: unknown;
	model?: unknown;
	skipPersistUserMessage?: unknown;
	attachmentIds?: unknown;
	activeDocumentArtifactId?: unknown;
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

	const {
		message,
		userMessage,
		conversationId,
		streamId,
		model,
		skipPersistUserMessage,
		attachmentIds,
		activeDocumentArtifactId,
	} = body;

	// Allow empty message when reconnecting to an existing stream (streamId provided)
	const isReconnect = typeof streamId === 'string' && streamId.trim().length > 0;

	const rawMessage = isReconnect && typeof userMessage === 'string' ? userMessage : message;
	const normalizedMessage = typeof rawMessage === 'string' ? rawMessage.trim() : '';

	if (!isReconnect && normalizedMessage.length === 0) {
		return {
			ok: false,
			error: { status: 400, error: 'Message must be a non-empty string' },
		};
	}

	if (normalizedMessage.length > runtimeConfig.maxMessageLength) {
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
			normalizedMessage,
			streamId:
				typeof streamId === 'string' && streamId.trim().length > 0
					? streamId.trim()
					: undefined,
			modelId,
			modelDisplayName,
			attachmentIds: safeAttachmentIds,
			activeDocumentArtifactId:
				typeof activeDocumentArtifactId === 'string' && activeDocumentArtifactId.trim().length > 0
					? activeDocumentArtifactId.trim()
					: undefined,
			skipPersistUserMessage: skipPersistUserMessage === true,
			attachmentTraceId:
				safeAttachmentIds.length > 0 ? createAttachmentTraceId(route) : undefined,
		},
	};
}
