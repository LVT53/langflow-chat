export interface StreamMetadata {
	thinkingTokenCount?: number;
	responseTokenCount?: number;
	totalTokenCount?: number;
	thinking?: string;
	wasStopped?: boolean;
}

export interface StreamCallbacks {
	onToken: (chunk: string) => void;
	onThinking: (chunk: string) => void;
	onEnd: (fullText: string, metadata?: StreamMetadata) => void;
	onError: (error: Error) => void;
}

export interface StreamHandle {
	abort: () => void;
}

const THINKING_OPEN_TAG = '<thinking>';
const THINKING_CLOSE_TAG = '</thinking>';

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
	callbacks: StreamCallbacks
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
				const closeIndex = inlineThinkingBuffer.indexOf(THINKING_CLOSE_TAG);
				if (closeIndex !== -1) {
					const thinkingChunk = inlineThinkingBuffer.slice(0, closeIndex);
					if (thinkingChunk) {
						callbacks.onThinking(thinkingChunk);
					}
					inlineThinkingBuffer = inlineThinkingBuffer.slice(closeIndex + THINKING_CLOSE_TAG.length);
					insideInlineThinking = false;
					continue;
				}

				const partialCloseLength = getPartialTagPrefixLength(
					inlineThinkingBuffer,
					THINKING_CLOSE_TAG
				);
				const flushLength = inlineThinkingBuffer.length - partialCloseLength;
				if (flushLength > 0) {
					callbacks.onThinking(inlineThinkingBuffer.slice(0, flushLength));
					inlineThinkingBuffer = inlineThinkingBuffer.slice(flushLength);
				}
				break;
			}

			const openIndex = inlineThinkingBuffer.indexOf(THINKING_OPEN_TAG);
			if (openIndex !== -1) {
				const visibleChunk = inlineThinkingBuffer.slice(0, openIndex);
				if (visibleChunk) {
					fullText += visibleChunk;
					callbacks.onToken(visibleChunk);
				}
				inlineThinkingBuffer = inlineThinkingBuffer.slice(openIndex + THINKING_OPEN_TAG.length);
				insideInlineThinking = true;
				continue;
			}

			const partialOpenLength = getPartialTagPrefixLength(
				inlineThinkingBuffer,
				THINKING_OPEN_TAG
			);
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
			fullText += inlineThinkingBuffer;
			callbacks.onToken(inlineThinkingBuffer);
		}

		inlineThinkingBuffer = '';
	}

	(async () => {
		try {
			const res = await fetch('/api/chat/stream', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message, conversationId }),
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
			let currentEvent: 'token' | 'thinking' | 'end' | 'error' | null = null;

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
							} else if (currentEvent === 'end') {
								let metadata: StreamMetadata | undefined;
								try {
									const parsed = JSON.parse(rawData);
									if (
										parsed.thinkingTokenCount ||
										parsed.responseTokenCount ||
										parsed.totalTokenCount ||
										parsed.thinking ||
										parsed.wasStopped
									) {
										metadata = {
											thinkingTokenCount: parsed.thinkingTokenCount,
											responseTokenCount: parsed.responseTokenCount,
											totalTokenCount: parsed.totalTokenCount,
											thinking: parsed.thinking,
											wasStopped: parsed.wasStopped
										};
									}
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
