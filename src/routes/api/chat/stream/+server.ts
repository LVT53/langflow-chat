import type { RequestHandler } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth/hooks';
import { getConversation, touchConversation } from '$lib/server/services/conversations';
import { sendMessageStream } from '$lib/server/services/langflow';
import { config } from '$lib/server/env';
import { EventSourceParserStream } from 'eventsource-parser/stream';

const STREAM_TIMEOUT_MS = 120_000;

type StreamErrorCode = 'timeout' | 'network' | 'backend_failure';

const FRIENDLY_STREAM_ERRORS: Record<StreamErrorCode, string> = {
	timeout: 'The response is taking too long. Please try again.',
	network: 'We could not reach the chat service. Check your connection and try again.',
	backend_failure: 'We hit a temporary issue generating a response. Please try again.'
};

function classifyStreamError(rawMessage: string): StreamErrorCode {
	const message = rawMessage.toLowerCase();

	if (message.includes('timeout') || message.includes('timed out') || message.includes('abort')) {
		return 'timeout';
	}

	if (
		message.includes('network') ||
		message.includes('fetch') ||
		message.includes('econn') ||
		message.includes('enotfound') ||
		message.includes('socket') ||
		message.includes('connection')
	) {
		return 'network';
	}

	return 'backend_failure';
}

function streamErrorEvent(code: StreamErrorCode): string {
	return `event: error\ndata: ${JSON.stringify({ code, message: FRIENDLY_STREAM_ERRORS[code] })}\n\n`;
}

function extractErrorMessage(rawData: string): string {
	if (!rawData) return 'Streaming failed';

	try {
		const parsed = JSON.parse(rawData);
		if (typeof parsed === 'string') return parsed;
		if (parsed && typeof parsed === 'object') {
			if (typeof parsed.message === 'string') return parsed.message;
			if (typeof parsed.error === 'string') return parsed.error;
		}
	} catch {
		return rawData;
	}

	return rawData;
}

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	let body: { message?: unknown; conversationId?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const { message, conversationId } = body;

	if (typeof message !== 'string' || message.trim().length === 0) {
		return new Response(JSON.stringify({ error: 'Message must be a non-empty string' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (message.length > config.maxMessageLength) {
		return new Response(
			JSON.stringify({
				error: `Message exceeds maximum length of ${config.maxMessageLength} characters`
			}),
			{ status: 400, headers: { 'Content-Type': 'application/json' } }
		);
	}

	if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
		return new Response(JSON.stringify({ error: 'conversationId is required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const conversation = await getConversation(user.id, conversationId);
	if (!conversation) {
		return new Response(JSON.stringify({ error: 'Conversation not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const encoder = new TextEncoder();
	const downstreamAbortSignal = event.request.signal;
	let cancelStream = () => undefined;

	const stream = new ReadableStream({
		async start(controller) {
			const upstreamAbortController = new AbortController();
			let closed = false;

			const removeDownstreamAbortListener = () => {
				downstreamAbortSignal.removeEventListener('abort', closeStream);
			};

			const closeStream = () => {
				if (closed) return;
				closed = true;
				removeDownstreamAbortListener();
				upstreamAbortController.abort();
				try {
					controller.close();
				} catch {
					return;
				}
			};

			cancelStream = closeStream;

			if (downstreamAbortSignal.aborted) {
				closeStream();
				return;
			}

			downstreamAbortSignal.addEventListener('abort', closeStream, { once: true });

			const enqueueChunk = (chunk: string): boolean => {
				if (closed) return false;

				try {
					controller.enqueue(encoder.encode(chunk));
					return true;
				} catch {
					closed = true;
					upstreamAbortController.abort();
					return false;
				}
			};

			const emitError = (code: StreamErrorCode) => enqueueChunk(streamErrorEvent(code));

			const timeoutId = setTimeout(() => {
				if (closed) return;
				emitError('timeout');
				closeStream();
			}, STREAM_TIMEOUT_MS);

			try {
				const langflowStream = await sendMessageStream(message.trim(), conversationId, {
					signal: upstreamAbortController.signal
				});
				if (closed) return;

				const eventStream = (langflowStream as unknown as ReadableStream<Uint8Array>)
					.pipeThrough(
						new TextDecoderStream() as unknown as TransformStream<Uint8Array, string>
					)
					.pipeThrough(new EventSourceParserStream());

				const reader = eventStream.getReader();

				try {
					while (!closed) {
						const { done, value } = await reader.read();
						if (done || closed) break;
						if (!value) continue;

						const eventType = value.event ?? 'message';
						const rawData = value.data ?? '';

						if (rawData === '[DONE]') {
							enqueueChunk(`event: end\ndata: {}\n\n`);
							break;
						}

						if (eventType === 'add_message' || eventType === 'message') {
							let chunk = '';
							try {
								const parsed = JSON.parse(rawData);
								chunk =
									parsed.text ??
									parsed.chunk ??
									(typeof parsed === 'string' ? parsed : '');
							} catch {
								chunk = rawData;
							}

							if (chunk) {
								enqueueChunk(`event: token\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
							}
						} else if (eventType === 'error') {
							const upstreamMessage = extractErrorMessage(rawData);
							emitError(classifyStreamError(upstreamMessage));
							break;
						}
					}
				} finally {
					reader.releaseLock();
				}

				if (!closed) {
					touchConversation(user.id, conversationId).catch(() => undefined);
				}
			} catch (err) {
				if (!closed) {
					const rawMessage = err instanceof Error ? err.message : String(err);
					console.error('Chat stream error:', err);
					emitError(classifyStreamError(rawMessage));
				}
			} finally {
				clearTimeout(timeoutId);
				closeStream();
				cancelStream = () => undefined;
			}
		},
		cancel() {
			cancelStream();
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
