export interface StreamMetadata {
	tokenCount?: number;
	generationSpeed?: number;
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

function toStreamError(message: string, code?: string): Error {
	const error = new Error(message) as Error & { code?: string };
	if (code) {
		error.code = code;
	}
	return error;
}

export function streamChat(
	message: string,
	conversationId: string,
	callbacks: StreamCallbacks
): StreamHandle {
	const controller = new AbortController();
	let aborted = false;
	let fullText = '';

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
										fullText += chunk;
										callbacks.onToken(chunk);
									}
								} catch {
									/* noop */
								}
							} else if (currentEvent === 'thinking') {
								try {
									const parsed = JSON.parse(rawData);
									const thinkingChunk = parsed.text ?? (typeof parsed === 'string' ? parsed : '');
									console.log('[CLIENT] Received thinking chunk:', thinkingChunk.slice(0, 100));
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
									console.log('[CLIENT] Received end event:', {
										tokenCount: parsed.tokenCount,
										generationSpeed: parsed.generationSpeed,
										hasThinking: !!parsed.thinking,
										wasStopped: parsed.wasStopped
									});
									if (parsed.tokenCount || parsed.generationSpeed || parsed.thinking || parsed.wasStopped) {
										metadata = {
											tokenCount: parsed.tokenCount,
											generationSpeed: parsed.generationSpeed,
											thinking: parsed.thinking,
											wasStopped: parsed.wasStopped
										};
									}
								} catch {
									/* noop */
								}
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
