import type { RequestHandler } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth/hooks';
import { getConversation, touchConversation } from '$lib/server/services/conversations';
import { sendMessageStream } from '$lib/server/services/langflow';
import { config } from '$lib/server/env';
import { createMessage } from '$lib/server/services/messages';
import { detectLanguage } from '$lib/server/services/language';
import {
	StreamingHungarianTranslator,
	translateHungarianToEnglish
} from '$lib/server/services/translator';

const STREAM_TIMEOUT_MS = 120_000;

type StreamErrorCode = 'timeout' | 'network' | 'backend_failure';

type UpstreamEvent = {
	event: string;
	data: unknown;
};

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

function parseMaybeJson(value: unknown): unknown {
	if (typeof value !== 'string') {
		return value;
	}

	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function parseSseBlock(block: string): UpstreamEvent | null {
	let event = 'message';
	const dataLines: string[] = [];

	for (const rawLine of block.split('\n')) {
		const line = rawLine.trimEnd();
		if (!line || line.startsWith(':')) continue;

		if (line.startsWith('event:')) {
			event = line.slice('event:'.length).trim() || 'message';
			continue;
		}

		if (line.startsWith('data:')) {
			dataLines.push(line.slice('data:'.length).trimStart());
		}
	}

	if (dataLines.length === 0 && event === 'message') {
		return null;
	}

	return {
		event,
		data: parseMaybeJson(dataLines.join('\n'))
	};
}

function parseJsonBlock(block: string): UpstreamEvent | null {
	try {
		const parsed = JSON.parse(block) as { event?: unknown; data?: unknown };
		return {
			event: typeof parsed.event === 'string' ? parsed.event : 'message',
			data: parsed.data
		};
	} catch {
		return null;
	}
}

async function* parseUpstreamEvents(
	stream: ReadableStream<Uint8Array>
): AsyncGenerator<UpstreamEvent, void, unknown> {
	const reader = stream.pipeThrough(new TextDecoderStream()).getReader();
	let buffer = '';

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (!value) continue;

			buffer += value;
			buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

			let separatorIndex = buffer.indexOf('\n\n');
			while (separatorIndex !== -1) {
				const block = buffer.slice(0, separatorIndex).trim();
				buffer = buffer.slice(separatorIndex + 2);

				if (block) {
					const event = block.includes('event:') || block.includes('data:')
						? parseSseBlock(block)
						: parseJsonBlock(block);
					if (event) {
						yield event;
					}
				}

				separatorIndex = buffer.indexOf('\n\n');
			}
		}

		const finalBlock = buffer.trim();
		if (finalBlock) {
			const event = finalBlock.includes('event:') || finalBlock.includes('data:')
				? parseSseBlock(finalBlock)
				: parseJsonBlock(finalBlock);
			if (event) {
				yield event;
			}
		}
	} finally {
		reader.releaseLock();
	}
}

function getNestedObject(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function getSender(value: unknown): string | null {
	const payload = getNestedObject(value);
	if (!payload) return null;

	const sender =
		typeof payload.sender === 'string'
			? payload.sender
			: typeof payload.sender_name === 'string'
				? payload.sender_name
				: null;
	if (sender) {
		return sender.toLowerCase();
	}

	if ('data' in payload) {
		return getSender(payload.data);
	}

	return null;
}

function getTextContent(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}

	const payload = getNestedObject(value);
	if (!payload) return '';

	for (const key of ['text', 'chunk', 'content']) {
		const candidate = payload[key];
		if (typeof candidate === 'string' && candidate.length > 0) {
			return candidate;
		}
	}

	if ('data' in payload) {
		return getTextContent(payload.data);
	}

	return '';
}

function extractAssistantChunk(eventType: string, rawData: unknown): string {
	const data = parseMaybeJson(rawData);
	const sender = getSender(data);

	if (sender && ['user', 'human'].includes(sender)) {
		return '';
	}

	if (
		sender &&
		!['assistant', 'ai', 'machine', 'model'].includes(sender) &&
		eventType !== 'token'
	) {
		return '';
	}

	return getTextContent(data);
}

function toIncrementalChunk(
	eventType: string,
	chunk: string,
	lastSnapshot: string,
	emittedText: string
): {
	chunk: string;
	lastSnapshot: string;
	emittedText: string;
} {
	if (eventType === 'token') {
		return {
			chunk,
			lastSnapshot,
			emittedText: emittedText + chunk
		};
	}

	if (!chunk) {
		return {
			chunk: '',
			lastSnapshot,
			emittedText
		};
	}

	if (emittedText) {
		if (chunk === emittedText) {
			return {
				chunk: '',
				lastSnapshot: chunk,
				emittedText
			};
		}

		if (chunk.startsWith(emittedText)) {
			const delta = chunk.slice(emittedText.length);
			return {
				chunk: delta,
				lastSnapshot: chunk,
				emittedText: emittedText + delta
			};
		}

		if (emittedText.startsWith(chunk)) {
			return {
				chunk: '',
				lastSnapshot: chunk,
				emittedText
			};
		}
	}

	if (!lastSnapshot) {
		return {
			chunk,
			lastSnapshot: chunk,
			emittedText: emittedText + chunk
		};
	}

	if (chunk === lastSnapshot) {
		return {
			chunk: '',
			lastSnapshot,
			emittedText
		};
	}

	if (chunk.startsWith(lastSnapshot)) {
		const delta = chunk.slice(lastSnapshot.length);
		return {
			chunk: delta,
			lastSnapshot: chunk,
			emittedText: emittedText + delta
		};
	}

	if (lastSnapshot.startsWith(chunk)) {
		return {
			chunk: '',
			lastSnapshot,
			emittedText
		};
	}

	return {
		chunk,
		lastSnapshot: chunk,
		emittedText: emittedText + chunk
	};
}

function extractErrorMessage(rawData: unknown): string {
	const data = parseMaybeJson(rawData);

	if (typeof data === 'string') return data;

	const payload = getNestedObject(data);
	if (!payload) return 'Streaming failed';

	if (typeof payload.message === 'string') return payload.message;
	if (typeof payload.error === 'string') return payload.error;
	if ('data' in payload) return extractErrorMessage(payload.data);

	return 'Streaming failed';
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

	const normalizedMessage = message.trim();
	const sourceLanguage = detectLanguage(normalizedMessage);

	let upstreamMessage = normalizedMessage;
	try {
		if (sourceLanguage === 'hu') {
			upstreamMessage = await translateHungarianToEnglish(normalizedMessage);
		}
	} catch (error) {
		console.error('Input translation error:', error);
		return new Response(JSON.stringify({ error: 'Failed to prepare the translated prompt.' }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const encoder = new TextEncoder();
	const downstreamAbortSignal = event.request.signal;
	let cancelStream = () => undefined;

	const stream = new ReadableStream({
			async start(controller) {
				const upstreamAbortController = new AbortController();
				const outputTranslator =
					sourceLanguage === 'hu' ? new StreamingHungarianTranslator() : null;
				let closed = false;
				let ended = false;
				let fullResponse = '';
				let lastAssistantSnapshot = '';
				let emittedAssistantText = '';

			const closeStream = () => {
				if (closed) return;
				closed = true;
				downstreamAbortSignal.removeEventListener('abort', closeStream);
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

			const emitToken = (chunk: string) => {
				fullResponse += chunk;
				return enqueueChunk(`event: token\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
			};

			const emitError = (code: StreamErrorCode) => enqueueChunk(streamErrorEvent(code));

			const completeSuccess = () => {
				if (ended || closed) return;
				ended = true;
				enqueueChunk(`event: end\ndata: {}\n\n`);
				createMessage(conversationId, 'user', normalizedMessage).catch(() => undefined);
				if (fullResponse.trim()) {
					createMessage(conversationId, 'assistant', fullResponse).catch(() => undefined);
				}
				touchConversation(user.id, conversationId).catch(() => undefined);
				closeStream();
			};

			const failStream = (code: StreamErrorCode) => {
				if (ended || closed) return;
				ended = true;
				emitError(code);
				closeStream();
			};

			const timeoutId = setTimeout(() => {
				failStream('timeout');
			}, STREAM_TIMEOUT_MS);

			try {
				const langflowStream = await sendMessageStream(upstreamMessage, conversationId, {
					signal: upstreamAbortController.signal
				});
				if (closed) return;

				for await (const upstreamEvent of parseUpstreamEvents(langflowStream)) {
					if (closed) break;

					const { event: eventType, data } = upstreamEvent;
					if (data === '[DONE]' || eventType === 'end') {
						if (outputTranslator) {
							for (const chunk of await outputTranslator.flush()) {
								if (!emitToken(chunk)) {
									return;
								}
							}
						}
						completeSuccess();
						return;
					}

					if (eventType === 'error') {
						failStream(classifyStreamError(extractErrorMessage(data)));
						return;
					}

					const rawChunk = extractAssistantChunk(eventType, data);
					if (!rawChunk) {
						continue;
					}

					const incremental = toIncrementalChunk(
						eventType,
						rawChunk,
						lastAssistantSnapshot,
						emittedAssistantText
					);
					lastAssistantSnapshot = incremental.lastSnapshot;
					emittedAssistantText = incremental.emittedText;
					const chunk = incremental.chunk;
					if (!chunk) continue;

					if (!outputTranslator) {
						if (!emitToken(chunk)) {
							return;
						}
						continue;
					}

					for (const translatedChunk of await outputTranslator.addChunk(chunk)) {
						if (!emitToken(translatedChunk)) {
							return;
						}
					}
				}

				if (outputTranslator) {
					for (const chunk of await outputTranslator.flush()) {
						if (!emitToken(chunk)) {
							return;
						}
					}
				}
				completeSuccess();
			} catch (error) {
				if (!closed) {
					console.error('Chat stream error:', error);
					failStream(
						classifyStreamError(error instanceof Error ? error.message : String(error))
					);
				}
			} finally {
				clearTimeout(timeoutId);
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
