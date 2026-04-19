import type { RequestHandler } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth/hooks';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { messages } from '$lib/server/db/schema';
import { getConversation } from '$lib/server/services/conversations';
import { getConfig } from '$lib/server/config-store';
import { cleanupFailedTurn } from '$lib/server/services/chat-turn/retry-cleanup';
import { preflightChatTurn } from '$lib/server/services/chat-turn/preflight';
import { parseChatTurnRequest } from '$lib/server/services/chat-turn/request';
import { createJsonErrorResponse } from '$lib/server/api/responses';
import { createStreamJsonErrorResponse } from '$lib/server/services/chat-turn/stream';
import { buildUpstreamMessage } from '$lib/server/services/chat-turn/execute';
import { runChatStreamOrchestrator } from '$lib/server/services/chat-turn/stream-orchestrator';

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const runtimeConfig = getConfig();

	let body: {
		conversationId?: unknown;
		assistantMessageId?: unknown;
		activeDocumentArtifactId?: unknown;
	};
	try {
		body = await event.request.json();
	} catch {
		return createJsonErrorResponse('Invalid JSON body', 400);
	}

	const { conversationId, assistantMessageId, activeDocumentArtifactId } = body;
	if (typeof conversationId !== 'string' || !conversationId.trim()) {
		return createJsonErrorResponse('conversationId is required', 400);
	}
	if (typeof assistantMessageId !== 'string' || !assistantMessageId.trim()) {
		return createJsonErrorResponse('assistantMessageId is required', 400);
	}

	const conversation = await getConversation(user.id, conversationId);
	if (!conversation) {
		return createJsonErrorResponse('Conversation not found', 404);
	}

	const [assistantMsg] = await db
		.select({ role: messages.role })
		.from(messages)
		.where(
			and(
				eq(messages.id, assistantMessageId),
				eq(messages.conversationId, conversationId),
			),
		)
		.limit(1);

	if (!assistantMsg || assistantMsg.role !== 'assistant') {
		return createJsonErrorResponse('Assistant message not found', 404);
	}

	let cleanupResult;
	try {
		cleanupResult = await cleanupFailedTurn({
			userId: user.id,
			conversationId,
			assistantMessageId,
		});
	} catch (error) {
		console.error('[RETRY] Cleanup failed:', error);
		return new Response(
			JSON.stringify({
				error: 'Retry cleanup failed',
				details: error instanceof Error ? error.message : String(error),
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			},
		);
	}

	if (cleanupResult.warnings.length > 0) {
		console.warn('[RETRY] Cleanup warnings:', cleanupResult.warnings);
	}

	const [userMsg] = await db
		.select({ content: messages.content })
		.from(messages)
		.where(
			and(
				eq(messages.conversationId, conversationId),
				eq(messages.role, 'user'),
			),
		)
		.orderBy(desc(messages.createdAt))
		.limit(1);

	if (!userMsg || !userMsg.content.trim()) {
		return createJsonErrorResponse('No user message found to retry', 400);
	}

	const syntheticBody = new Request('https://internal', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			message: userMsg.content,
			conversationId,
			activeDocumentArtifactId:
				typeof activeDocumentArtifactId === 'string' && activeDocumentArtifactId.trim()
					? activeDocumentArtifactId.trim()
					: undefined,
			skipPersistUserMessage: true,
		}),
	});

	const parsedRequest = await parseChatTurnRequest(syntheticBody, runtimeConfig, 'stream');
	if (!parsedRequest.ok) {
		return createStreamJsonErrorResponse(parsedRequest.error);
	}

	const preflight = await preflightChatTurn({
		userId: user.id,
		translationEnabled: user.translationEnabled,
		request: parsedRequest.value,
	});
	if (!preflight.ok) {
		return createStreamJsonErrorResponse(preflight.error);
	}

	const turn = preflight.value;

	let upstreamMessage = turn.normalizedMessage;
	try {
		upstreamMessage = await buildUpstreamMessage(turn);
	} catch (error) {
		console.error('[RETRY] Input translation error:', error);
		return createStreamJsonErrorResponse({
			status: 502,
			error: 'Failed to prepare the translated prompt.',
		});
	}

	const requestStartTime = Date.now();

	return runChatStreamOrchestrator({
		user: {
			id: user.id,
			displayName: user.displayName,
			email: user.email,
			translationEnabled: user.translationEnabled,
		},
		turn,
		upstreamMessage,
		downstreamAbortSignal: event.request.signal,
		requestStartTime,
		isReconnect: false,
	});
};
