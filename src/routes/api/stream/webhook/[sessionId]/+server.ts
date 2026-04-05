import type { RequestHandler } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth/hooks';
import { webhookBuffer } from '$lib/server/services/webhook-buffer';
import { createJsonErrorResponse } from '$lib/server/api/responses';

const POLL_INTERVAL_MS = 100;
const STREAM_TIMEOUT_MS = 120_000;

export const GET: RequestHandler = async (event) => {
	requireAuth(event);

	const sessionId = event.params['sessionId'] as string;

	if (!sessionId || sessionId.trim().length === 0) {
		return createJsonErrorResponse('sessionId is required', 400);
	}

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		start(controller) {
			let sentCount = 0;
			let intervalId: ReturnType<typeof setInterval> | undefined;
			let closed = false;

			function cleanup() {
				if (closed) return;
				closed = true;
				if (intervalId !== undefined) {
					clearInterval(intervalId);
				}
				clearTimeout(timeoutId);
				webhookBuffer.clearSession(sessionId);
			}

			function close() {
				cleanup();
				try {
					controller.close();
				} catch (_) {
					void 0;
				}
			}

			const timeoutId = setTimeout(() => {
				try {
					controller.enqueue(
						encoder.encode(
							`event: error\ndata: ${JSON.stringify({ message: 'Stream timed out' })}\n\n`
						)
					);
				} catch (_) {
					void 0;
				}
				close();
			}, STREAM_TIMEOUT_MS);

			intervalId = setInterval(() => {
				if (closed) return;

				try {
					const result = webhookBuffer.getSentences(sessionId);

					if (result === null) {
						return;
					}

					const { sentences, isComplete } = result;

					while (sentCount < sentences.length) {
						const text = sentences[sentCount];
						controller.enqueue(
							encoder.encode(
								`event: sentence\ndata: ${JSON.stringify({ text, index: sentCount })}\n\n`
							)
						);
						sentCount++;
					}

					if (isComplete && sentCount >= sentences.length) {
						controller.enqueue(encoder.encode(`event: end\ndata: {}\n\n`));
						close();
					}
				} catch {
					close();
				}
			}, POLL_INTERVAL_MS);
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
