export interface StreamCallbacks {
	onToken: (chunk: string) => void;
	onEnd: (fullText: string) => void;
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
			let fullText = '';
			let expectTokenData = false;
			let expectErrorData = false;

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
							expectTokenData = true;
							expectErrorData = false;
						} else if (line.startsWith('event: end')) {
							callbacks.onEnd(fullText);
							return;
						} else if (line.startsWith('event: error')) {
							expectErrorData = true;
							expectTokenData = false;
						} else if (line.startsWith('data: ')) {
							const rawData = line.slice('data: '.length);

							if (expectTokenData) {
								expectTokenData = false;
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
							} else if (expectErrorData) {
								expectErrorData = false;
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
							expectTokenData = false;
							expectErrorData = false;
						}
					}
				}
			} finally {
				reader.releaseLock();
			}
		} catch (err) {
			if (!aborted) {
				if (err instanceof Error) {
					callbacks.onError(err);
				} else {
					callbacks.onError(toStreamError(String(err)));
				}
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
