export interface StreamMetadata {
	thinkingTokenCount?: number;
	responseTokenCount?: number;
	totalTokenCount?: number;
	thinking?: string;
	wasStopped?: boolean;
	userMessageId?: string;
	assistantMessageId?: string;
	modelDisplayName?: string;
	contextStatus?: import('$lib/types').ConversationContextStatus;
	activeWorkingSet?: import('$lib/types').ArtifactSummary[];
	taskState?: import('$lib/types').TaskState | null;
}

export interface StreamCallbacks {
	onToken: (chunk: string) => void;
	onThinking: (chunk: string) => void;
	onEnd: (fullText: string, metadata?: StreamMetadata) => void;
	onError: (error: Error) => void;
	onToolCall?: (name: string, input: Record<string, unknown>, status: 'running' | 'done') => void;
}

export type ModelId = 'model1' | 'model2';

export interface StreamHandle {
	abort: () => void;
}

// Nemotron-style thinking tags
const THINKING_OPEN_TAG = '<thinking>';
const THINKING_CLOSE_TAG = '</thinking>';

// Hermes 4-style thinking tags
const HERMES_THINKING_OPEN_TAG = '<think>';
const HERMES_THINKING_CLOSE_TAG = '</think>';

function toStreamError(message: string, code?: string): Error {
	const error = new Error(message) as Error & { code?: string };
	if (code) {
		error.code = code;
	}
	return error;
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

export function streamChat(
	message: string,
	conversationId: string,
	callbacks: StreamCallbacks,
	modelId?: ModelId,
	skipPersistUserMessage?: boolean,
	attachmentIds?: string[]
): StreamHandle {
	const controller = new AbortController();
	let aborted = false;
	let fullText = '';
	let inlineThinkingBuffer = '';
	let insideInlineThinking = false;

	function emitInlineChunk(chunk: string) {
		if (!chunk) {
			return;
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
					if (thinkingChunk) {
						callbacks.onThinking(thinkingChunk);
					}
					inlineThinkingBuffer = inlineThinkingBuffer.slice(closeIndex + closeTagLength);
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
					callbacks.onThinking(inlineThinkingBuffer.slice(0, flushLength));
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
				if (visibleChunk) {
					fullText += visibleChunk;
					callbacks.onToken(visibleChunk);
				}
				inlineThinkingBuffer = inlineThinkingBuffer.slice(openIndex + openTagLength);
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
				fullText += visibleChunk;
				callbacks.onToken(visibleChunk);
				inlineThinkingBuffer = inlineThinkingBuffer.slice(flushLength);
			}
			break;
		}
	}

	function flushInlineBufferAtEnd() {
		if (!inlineThinkingBuffer) {
			return;
		}

		if (insideInlineThinking) {
			callbacks.onThinking(inlineThinkingBuffer);
		} else {
			// A partial open tag buffered at flush time (e.g. "<thinking" with no ">" yet)
			// must be discarded rather than leaked as visible text. This mirrors the same
			// guard in the backend's flushInlineThinkingBuffer.
			const isPartialOpenTag =
				THINKING_OPEN_TAG.startsWith(inlineThinkingBuffer) ||
				HERMES_THINKING_OPEN_TAG.startsWith(inlineThinkingBuffer);
			if (!isPartialOpenTag) {
				fullText += inlineThinkingBuffer;
				callbacks.onToken(inlineThinkingBuffer);
			}
		}

		inlineThinkingBuffer = '';
	}

	(async () => {
		try {
			const res = await fetch('/api/chat/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					message,
					conversationId,
					model: modelId,
					skipPersistUserMessage,
					attachmentIds
				}),
				signal: controller.signal
			});

			if (!res.ok) {
				let errorMessage = `HTTP ${res.status}`;
				let errorCode: string | undefined;
				try {
					const json = await res.json();
					errorMessage = json.error ?? errorMessage;
					errorCode = json.code;
				} catch {
					/* noop */
				}
				callbacks.onError(toStreamError(errorMessage, errorCode));
				return;
			}

			if (!res.body) {
				callbacks.onError(toStreamError('Response has no body'));
				return;
			}

			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let currentEvent: 'token' | 'thinking' | 'end' | 'error' | 'tool_call' | null = null;

			try {
				while (true) {
					const { done, value } = await reader.read();

					if (done) {
						flushInlineBufferAtEnd();
						callbacks.onEnd(fullText);
						break;
					}

					buffer += decoder.decode(value, { stream: true });

					const lines = buffer.split('\n');
					buffer = lines.pop() ?? '';

					for (const line of lines) {
						if (line.startsWith('event: token')) {
							currentEvent = 'token';
						} else if (line.startsWith('event: thinking')) {
							currentEvent = 'thinking';
						} else if (line.startsWith('event: tool_call')) {
							currentEvent = 'tool_call';
						} else if (line.startsWith('event: end')) {
							currentEvent = 'end';
						} else if (line.startsWith('event: error')) {
							currentEvent = 'error';
						} else if (line.startsWith('data: ')) {
							const rawData = line.slice('data: '.length);

							if (currentEvent === 'token') {
								try {
									const parsed = JSON.parse(rawData);
									const chunk = parsed.text ?? (typeof parsed === 'string' ? parsed : '');
									if (chunk) {
										emitInlineChunk(chunk);
									}
								} catch {
									/* noop */
								}
							} else if (currentEvent === 'thinking') {
								try {
									const parsed = JSON.parse(rawData);
									const thinkingChunk = parsed.text ?? (typeof parsed === 'string' ? parsed : '');
									if (thinkingChunk) {
										callbacks.onThinking(thinkingChunk);
									}
								} catch {
									/* noop */
								}
							} else if (currentEvent === 'tool_call') {
								try {
									const parsed = JSON.parse(rawData);
									callbacks.onToolCall?.(parsed.name, parsed.input ?? {}, parsed.status);
								} catch {
									/* noop */
								}
							} else if (currentEvent === 'end') {
								let metadata: StreamMetadata | undefined;
								try {
									const parsed = JSON.parse(rawData);
									const nextMetadata: StreamMetadata = {
										thinkingTokenCount: parsed.thinkingTokenCount,
										responseTokenCount: parsed.responseTokenCount,
										totalTokenCount: parsed.totalTokenCount,
										thinking: parsed.thinking,
										wasStopped: parsed.wasStopped,
										userMessageId: parsed.userMessageId,
										assistantMessageId: parsed.assistantMessageId,
										modelDisplayName: parsed.modelDisplayName,
										contextStatus: parsed.contextStatus,
										activeWorkingSet: parsed.activeWorkingSet,
										taskState: parsed.taskState
									};
									metadata = Object.values(nextMetadata).some((value) => value !== undefined)
										? nextMetadata
										: undefined;
								} catch {
									/* noop */
								}
								flushInlineBufferAtEnd();
								callbacks.onEnd(fullText, metadata);
								return;
							} else if (currentEvent === 'error') {
								let errorMessage = 'Stream error';
								let errorCode: string | undefined;
								try {
									const parsed = JSON.parse(rawData);
									errorMessage = parsed.message ?? parsed.error ?? errorMessage;
									errorCode = parsed.code;
								} catch {
									errorMessage = rawData || errorMessage;
								}
								callbacks.onError(toStreamError(errorMessage, errorCode));
								return;
							}
						} else if (line === '') {
							currentEvent = null;
						}
					}
				}
			} finally {
				reader.releaseLock();
			}
		} catch (err) {
			if (aborted) {
				callbacks.onEnd(fullText, { wasStopped: true });
			} else if (err instanceof Error) {
				callbacks.onError(err);
			} else {
				callbacks.onError(toStreamError(String(err)));
			}
		}
	})();

	return {
		abort() {
			aborted = true;
			controller.abort();
		}
	};
}
