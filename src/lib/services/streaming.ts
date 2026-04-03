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
	generatedFiles?: import('$lib/types').ChatGeneratedFile[];
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
	stop: () => void;
	detach: () => void;
}

function toStreamError(message: string, code?: string): Error {
	const error = new Error(message) as Error & { code?: string };
	if (code) {
		error.code = code;
	}
	return error;
}

async function requestServerSideStreamStop(streamId: string): Promise<void> {
	try {
		await fetch('/api/chat/stream/stop', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ streamId })
		});
	} catch {
		/* noop */
	}
}

export type StreamChatOptions = {
	modelId?: ModelId;
	skipPersistUserMessage?: boolean;
	attachmentIds?: string[];
	retryAssistantMessageId?: string;
};

export function streamChat(
	message: string,
	conversationId: string,
	callbacks: StreamCallbacks,
	options?: StreamChatOptions
): StreamHandle {
	const {
		modelId,
		skipPersistUserMessage,
		attachmentIds,
		retryAssistantMessageId,
	} = options ?? {};
	const controller = new AbortController();
	const streamId = crypto.randomUUID();
	let stopRequested = false;
	let detached = false;
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
			const url = retryAssistantMessageId
				? '/api/chat/retry'
				: '/api/chat/stream';
			const body = retryAssistantMessageId
				? JSON.stringify({ conversationId, assistantMessageId: retryAssistantMessageId, streamId })
				: JSON.stringify({ message, conversationId, streamId, model: modelId, skipPersistUserMessage, attachmentIds });
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body,
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

			const processLine = (rawLine: string): boolean => {
				const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

				if (line.startsWith('event: token')) {
					currentEvent = 'token';
					return false;
				}
				if (line.startsWith('event: thinking')) {
					currentEvent = 'thinking';
					return false;
				}
				if (line.startsWith('event: tool_call')) {
					currentEvent = 'tool_call';
					return false;
				}
				if (line.startsWith('event: end')) {
					currentEvent = 'end';
					return false;
				}
				if (line.startsWith('event: error')) {
					currentEvent = 'error';
					return false;
				}
				if (line.startsWith('data: ')) {
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
						return false;
					}

					if (currentEvent === 'thinking') {
						try {
							const parsed = JSON.parse(rawData);
							const thinkingChunk = parsed.text ?? (typeof parsed === 'string' ? parsed : '');
							if (thinkingChunk) {
								callbacks.onThinking(thinkingChunk);
							}
						} catch {
							/* noop */
						}
						return false;
					}

					if (currentEvent === 'tool_call') {
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
						return false;
					}

					if (currentEvent === 'end') {
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
								messageEvidence: parsed.messageEvidence,
								generatedFiles: parsed.generatedFiles
							};
							metadata = Object.values(nextMetadata).some((value) => value !== undefined)
								? nextMetadata
								: undefined;
						} catch {
							/* noop */
						}
						flushInlineBufferAtEnd();
						callbacks.onEnd(fullText, metadata);
						return true;
					}

					if (currentEvent === 'error') {
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
						return true;
					}
					return false;
				}

				if (line === '') {
					currentEvent = null;
				}

				return false;
			};

			const drainBuffer = (isFinalChunk = false): boolean => {
				const lines = buffer.split('\n');
				buffer = isFinalChunk ? '' : (lines.pop() ?? '');

				if (isFinalChunk && lines[lines.length - 1] !== '') {
					lines.push('');
				}

				for (const line of lines) {
					if (processLine(line)) {
						return true;
					}
				}

				return false;
			};

			try {
				while (true) {
					const { done, value } = await reader.read();

					if (done) {
						buffer += decoder.decode();
						if (drainBuffer(true)) {
							break;
						}
						flushInlineBufferAtEnd();
						callbacks.onEnd(fullText);
						break;
					}

					buffer += decoder.decode(value, { stream: true });
					if (drainBuffer()) {
						return;
					}
				}
			} finally {
				reader.releaseLock();
			}
		} catch (err) {
			if (detached) {
				return;
			}
			if (stopRequested) {
				callbacks.onEnd(fullText, { wasStopped: true });
			} else if (err instanceof Error) {
				callbacks.onError(err);
			} else {
				callbacks.onError(toStreamError(String(err)));
			}
		}
	})();

	return {
		stop() {
			if (stopRequested || detached) {
				return;
			}
			stopRequested = true;
			void requestServerSideStreamStop(streamId);
			controller.abort();
		},
		detach() {
			if (stopRequested || detached) {
				return;
			}
			detached = true;
			controller.abort();
		},
	};
}
