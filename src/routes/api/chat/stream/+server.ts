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

// Nemotron-style thinking tags
const THINKING_OPEN_TAG = '<thinking>';
const THINKING_CLOSE_TAG = '</thinking>';

// Hermes 4-style thinking tags
const HERMES_THINKING_OPEN_TAG = '<think>';
const HERMES_THINKING_CLOSE_TAG = '</think>';

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

function isAbruptUpstreamTermination(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const message = error.message.toLowerCase();
	const cause = 'cause' in error ? (error as Error & { cause?: unknown }).cause : undefined;
	const causeCode =
		cause && typeof cause === 'object' && 'code' in cause ? (cause as { code?: unknown }).code : undefined;

	return (
		message.includes('terminated') ||
		message.includes('socket') ||
		causeCode === 'UND_ERR_SOCKET'
	);
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

function parseEventBlock(block: string): UpstreamEvent | null {
	return block.includes('event:') || block.includes('data:')
		? parseSseBlock(block)
		: parseJsonBlock(block);
}

function getPartialTagPrefixLength(value: string, tag: string): number {
	const maxLength = Math.min(value.length, tag.length - 1);

	for (let length = maxLength; length > 0; length -= 1) {
		if (value.endsWith(tag.slice(0, length))) {
			return length;
		}
	}

	return 0;
}

async function* parseUpstreamEvents(
	stream: ReadableStream<Uint8Array>
): AsyncGenerator<UpstreamEvent, void, unknown> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	try {
		while (true) {
			let chunk: ReadableStreamReadResult<Uint8Array>;
			try {
				chunk = await reader.read();
			} catch (error) {
				const finalBlock = buffer.trim();
				if (finalBlock) {
					const event = parseEventBlock(finalBlock);
					if (event) {
						yield event;
						return;
					}
				}
				throw error;
			}

			const { done, value } = chunk;
			if (done) break;
			if (!value) continue;

			buffer += decoder.decode(value, { stream: true });
			buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

			if (buffer.includes('event:') || buffer.includes('data:')) {
				let separatorIndex = buffer.indexOf('\n\n');
				while (separatorIndex !== -1) {
					const block = buffer.slice(0, separatorIndex).trim();
					buffer = buffer.slice(separatorIndex + 2);

					if (block) {
						const event = parseEventBlock(block);
						if (event) {
							yield event;
						}
					}

					separatorIndex = buffer.indexOf('\n\n');
				}
				continue;
			}

			let newlineIndex = buffer.indexOf('\n');
			while (newlineIndex !== -1) {
				const line = buffer.slice(0, newlineIndex).trim();
				buffer = buffer.slice(newlineIndex + 1);

				if (line) {
					const event = parseJsonBlock(line);
					if (event) {
						yield event;
					} else {
						buffer = `${line}\n${buffer}`;
						break;
					}
				}

				newlineIndex = buffer.indexOf('\n');
			}
		}

		buffer += decoder.decode();
		buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

		const finalBlock = buffer.trim();
		if (finalBlock) {
			const event = parseEventBlock(finalBlock);
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

function getFirstChoice(value: unknown): Record<string, unknown> | null {
	const payload = getNestedObject(value);
	if (!payload || !Array.isArray(payload.choices) || payload.choices.length === 0) {
		return null;
	}

	const [firstChoice] = payload.choices;
	return getNestedObject(firstChoice);
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

	const choice = getFirstChoice(payload);
	if (choice) {
		for (const key of ['delta', 'message']) {
			if (key in choice) {
				const nestedContent = getTextContent(choice[key]);
				if (nestedContent) {
					return nestedContent;
				}
			}
		}
	}

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

function getReasoningContent(value: unknown): string | null {
	const payload = getNestedObject(value);
	if (!payload) return null;

	const choice = getFirstChoice(payload);
	if (choice) {
		for (const key of ['delta', 'message']) {
			if (key in choice) {
				const nestedReasoning = getReasoningContent(choice[key]);
				if (nestedReasoning) {
					return nestedReasoning;
				}
			}
		}
	}

	if (typeof payload.reasoning === 'string' && payload.reasoning.trim()) {
		return payload.reasoning.trim();
	}

	if (typeof payload.reasoning_content === 'string' && payload.reasoning_content.trim()) {
		return payload.reasoning_content.trim();
	}

	if (typeof payload.thinking === 'string' && payload.thinking.trim()) {
		return payload.thinking.trim();
	}

	if ('data' in payload) {
		return getReasoningContent(payload.data);
	}

	return null;
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

function estimateTokenCount(text: string): number {
	const trimmed = text.trim();
	if (!trimmed) return 0;

	const segments = trimmed.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+/gu) ?? [];
	let estimated = 0;

	for (const segment of segments) {
		if (/^[\p{L}\p{N}]+$/u.test(segment)) {
			const isAscii = /^[\x00-\x7F]+$/.test(segment);
			estimated += Math.max(1, Math.ceil(segment.length / (isAscii ? 4 : 2)));
			continue;
		}

		estimated += segment.length;
	}

	return estimated;
}

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	let body: { message?: unknown; conversationId?: unknown; model?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const { message, conversationId, model } = body;

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

	// Validate model parameter
	const modelId = model === 'model1' || model === 'model2' ? model : undefined;

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

			let thinkingContent = '';
			let inlineThinkingBuffer = '';
			let insideInlineThinking = false;

			const emitThinking = (reasoning: string) => {
				if (!reasoning) {
					return true;
				}

				thinkingContent += reasoning;
				return enqueueChunk(`event: thinking\ndata: ${JSON.stringify({ text: reasoning })}\n\n`);
			};

			const emitVisibleToken = (chunk: string) => {
				if (!chunk) {
					return true;
				}

				fullResponse += chunk;
				return enqueueChunk(`event: token\ndata: ${JSON.stringify({ text: chunk })}\n\n`);
			};

			const emitInlineToken = (chunk: string) => {
				if (!chunk) {
					return true;
				}

				inlineThinkingBuffer += chunk;

				while (inlineThinkingBuffer) {
					if (insideInlineThinking) {
						// Check for both Nemotron and Hermes close tags
						const nemotronCloseIndex = inlineThinkingBuffer.indexOf(THINKING_CLOSE_TAG);
						const hermesCloseIndex = inlineThinkingBuffer.indexOf(HERMES_THINKING_CLOSE_TAG);
						
						let closeIndex = -1;
						let closeTagLength = 0;
						
						if (nemotronCloseIndex !== -1 && hermesCloseIndex !== -1) {
							// Both found, use the first one
							if (nemotronCloseIndex < hermesCloseIndex) {
								closeIndex = nemotronCloseIndex;
								closeTagLength = THINKING_CLOSE_TAG.length;
							} else {
								closeIndex = hermesCloseIndex;
								closeTagLength = HERMES_THINKING_CLOSE_TAG.length;
							}
						} else if (nemotronCloseIndex !== -1) {
							closeIndex = nemotronCloseIndex;
							closeTagLength = THINKING_CLOSE_TAG.length;
						} else if (hermesCloseIndex !== -1) {
							closeIndex = hermesCloseIndex;
							closeTagLength = HERMES_THINKING_CLOSE_TAG.length;
						}
						
						if (closeIndex !== -1) {
							const thinkingChunk = inlineThinkingBuffer.slice(0, closeIndex);
							if (thinkingChunk && !emitThinking(thinkingChunk)) {
								return false;
							}
							inlineThinkingBuffer = inlineThinkingBuffer.slice(
								closeIndex + closeTagLength
							);
							insideInlineThinking = false;
							continue;
						}

						// Check for partial close tags (both formats)
						const partialNemotronCloseLength = getPartialTagPrefixLength(
							inlineThinkingBuffer,
							THINKING_CLOSE_TAG
						);
						const partialHermesCloseLength = getPartialTagPrefixLength(
							inlineThinkingBuffer,
							HERMES_THINKING_CLOSE_TAG
						);
						const partialCloseLength = Math.max(partialNemotronCloseLength, partialHermesCloseLength);
						
						const flushLength = inlineThinkingBuffer.length - partialCloseLength;
						if (flushLength > 0) {
							const thinkingChunk = inlineThinkingBuffer.slice(0, flushLength);
							if (!emitThinking(thinkingChunk)) {
								return false;
							}
							inlineThinkingBuffer = inlineThinkingBuffer.slice(flushLength);
						}
						break;
					}

					// Check for both Nemotron and Hermes open tags
					const nemotronOpenIndex = inlineThinkingBuffer.indexOf(THINKING_OPEN_TAG);
					const hermesOpenIndex = inlineThinkingBuffer.indexOf(HERMES_THINKING_OPEN_TAG);
					
					let openIndex = -1;
					let openTagLength = 0;
					
					if (nemotronOpenIndex !== -1 && hermesOpenIndex !== -1) {
						// Both found, use the first one
						if (nemotronOpenIndex < hermesOpenIndex) {
							openIndex = nemotronOpenIndex;
							openTagLength = THINKING_OPEN_TAG.length;
						} else {
							openIndex = hermesOpenIndex;
							openTagLength = HERMES_THINKING_OPEN_TAG.length;
						}
					} else if (nemotronOpenIndex !== -1) {
						openIndex = nemotronOpenIndex;
						openTagLength = THINKING_OPEN_TAG.length;
					} else if (hermesOpenIndex !== -1) {
						openIndex = hermesOpenIndex;
						openTagLength = HERMES_THINKING_OPEN_TAG.length;
					}
					
					if (openIndex !== -1) {
						const visibleChunk = inlineThinkingBuffer.slice(0, openIndex);
						if (visibleChunk && !emitVisibleToken(visibleChunk)) {
							return false;
						}
						inlineThinkingBuffer = inlineThinkingBuffer.slice(
							openIndex + openTagLength
						);
						insideInlineThinking = true;
						continue;
					}

					// Check for partial open tags (both formats)
					const partialNemotronOpenLength = getPartialTagPrefixLength(
						inlineThinkingBuffer,
						THINKING_OPEN_TAG
					);
					const partialHermesOpenLength = getPartialTagPrefixLength(
						inlineThinkingBuffer,
						HERMES_THINKING_OPEN_TAG
					);
					const partialOpenLength = Math.max(partialNemotronOpenLength, partialHermesOpenLength);
					
					const flushLength = inlineThinkingBuffer.length - partialOpenLength;
					if (flushLength > 0) {
						const visibleChunk = inlineThinkingBuffer.slice(0, flushLength);
						if (!emitVisibleToken(visibleChunk)) {
							return false;
						}
						inlineThinkingBuffer = inlineThinkingBuffer.slice(flushLength);
					}
					break;
				}

				return true;
			};

			const flushInlineThinkingBuffer = () => {
				if (!inlineThinkingBuffer) {
					return true;
				}

				const remainder = inlineThinkingBuffer;
				inlineThinkingBuffer = '';

				if (insideInlineThinking) {
					insideInlineThinking = false;
					return emitThinking(remainder);
				}

				return emitVisibleToken(remainder);
			};

			const emitError = (code: StreamErrorCode) => enqueueChunk(streamErrorEvent(code));

			const completeSuccess = (wasStopped = false) => {
				if (ended || closed) return;
				ended = true;
				const thinkingTokenCount = estimateTokenCount(thinkingContent);
				const responseTokenCount = estimateTokenCount(fullResponse);
				const totalTokenCount = thinkingTokenCount + responseTokenCount;
				console.log(
					'[STREAM] End - thinkingTokenCount:',
					thinkingTokenCount,
					'responseTokenCount:',
					responseTokenCount,
					'totalTokenCount:',
					totalTokenCount,
					'thinkingLength:',
					thinkingContent.length,
					'wasStopped:',
					wasStopped
				);
				enqueueChunk(
					`event: end\ndata: ${JSON.stringify({
						thinkingTokenCount,
						responseTokenCount,
						totalTokenCount,
						thinking: thinkingContent || undefined,
						wasStopped
					})}\n\n`
				);
				createMessage(conversationId, 'user', normalizedMessage).catch(() => undefined);
				if (fullResponse.trim()) {
					createMessage(conversationId, 'assistant', fullResponse, thinkingContent || undefined).catch(
						() => undefined
					);
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
			console.log('[STREAM] Starting upstream request', {
				userId: user.id,
				conversationId,
				sourceLanguage,
				normalizedMessageLength: normalizedMessage.length,
				upstreamMessageLength: upstreamMessage.length,
				modelId
			});
			const langflowStream = await sendMessageStream(upstreamMessage, conversationId, modelId, {
				signal: upstreamAbortController.signal
			});
				console.log('[STREAM] Upstream stream connected', { conversationId });
				if (closed) return;
				let upstreamEventCount = 0;

				for await (const upstreamEvent of parseUpstreamEvents(langflowStream)) {
					if (closed) break;

					const { event: eventType, data } = upstreamEvent;
					upstreamEventCount += 1;
					if (upstreamEventCount <= 8 || eventType === 'error') {
						const dataPreview =
							typeof data === 'string'
								? data.slice(0, 500)
								: JSON.stringify(data).slice(0, 500);
						console.log('[STREAM] Upstream event', {
							index: upstreamEventCount,
							eventType,
							dataPreview
						});
					}
					if (data === '[DONE]' || eventType === 'end') {
						if (outputTranslator) {
							for (const chunk of await outputTranslator.flush()) {
								if (!emitInlineToken(chunk)) {
									return;
								}
							}
						}
						if (!flushInlineThinkingBuffer()) {
							return;
						}
						completeSuccess();
						return;
					}

					if (eventType === 'error') {
						console.error('[STREAM] Upstream error event payload', {
							conversationId,
							data:
								typeof data === 'string'
									? data
									: JSON.stringify(data).slice(0, 2000)
						});
						failStream(classifyStreamError(extractErrorMessage(data)));
						return;
					}

					const rawChunk = extractAssistantChunk(eventType, data);
					const reasoningChunk = getReasoningContent(data);
					if (reasoningChunk) {
						console.log('[STREAM] Thinking chunk extracted:', reasoningChunk.slice(0, 100));
						if (!emitThinking(`${reasoningChunk}\n`)) {
							return;
						}
					}
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

					console.log('[STREAM] Token chunk, length:', chunk.length);

					if (!outputTranslator) {
						if (!emitInlineToken(chunk)) {
							return;
						}
						continue;
					}

					for (const translatedChunk of await outputTranslator.addChunk(chunk)) {
						if (!emitInlineToken(translatedChunk)) {
							return;
						}
					}
				}

				if (outputTranslator) {
					for (const chunk of await outputTranslator.flush()) {
						if (!emitInlineToken(chunk)) {
							return;
						}
					}
				}
				if (!flushInlineThinkingBuffer()) {
					return;
				}
				completeSuccess();
			} catch (error) {
				if (!closed) {
					if (isAbruptUpstreamTermination(error) && fullResponse.trim()) {
						completeSuccess();
						return;
					}
					console.error('[STREAM] Chat stream error', {
						conversationId,
						userId: user.id,
						message: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
						cause:
							error instanceof Error && 'cause' in error
								? (error as Error & { cause?: unknown }).cause
								: undefined
					});
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
