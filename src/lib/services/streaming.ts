import {
	createInlineThinkingState,
	flushInlineThinkingState,
	processInlineThinkingChunk,
} from './stream-protocol';

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
	contextDebug?: import('$lib/types').ContextDebugState | null;
	messageEvidence?: import('$lib/types').MessageEvidenceSummary | null;
}

export interface StreamCallbacks {
	onToken: (chunk: string) => void;
	onThinking: (chunk: string) => void;
	onEnd: (fullText: string, metadata?: StreamMetadata) => void;
	onError: (error: Error) => void;
	onToolCall?: (
		name: string,
		input: Record<string, unknown>,
		status: 'running' | 'done',
		details?: {
			outputSummary?: string | null;
			sourceType?: import('$lib/types').EvidenceSourceType | null;
			candidates?: import('$lib/types').ToolEvidenceCandidate[];
		}
	) => void;
}

export type ModelId = 'model1' | 'model2';

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
	callbacks: StreamCallbacks,
	modelId?: ModelId,
	skipPersistUserMessage?: boolean,
	attachmentIds?: string[]
): StreamHandle {
	const controller = new AbortController();
	let aborted = false;
	let fullText = '';
	const inlineThinkingState = createInlineThinkingState();

	function emitInlineChunk(chunk: string) {
		void processInlineThinkingChunk(inlineThinkingState, chunk, {
			onVisible(visibleChunk) {
				fullText += visibleChunk;
				callbacks.onToken(visibleChunk);
			},
			onThinking(thinkingChunk) {
				callbacks.onThinking(thinkingChunk);
			},
		});
	}

	function flushInlineBufferAtEnd() {
		void flushInlineThinkingState(inlineThinkingState, {
			onVisible(visibleChunk) {
				fullText += visibleChunk;
				callbacks.onToken(visibleChunk);
			},
			onThinking(thinkingChunk) {
				callbacks.onThinking(thinkingChunk);
			},
		});
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
									callbacks.onToolCall?.(parsed.name, parsed.input ?? {}, parsed.status, {
										outputSummary: parsed.outputSummary,
										sourceType: parsed.sourceType,
										candidates: parsed.candidates,
									});
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
										taskState: parsed.taskState,
										contextDebug: parsed.contextDebug,
										messageEvidence: parsed.messageEvidence
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
