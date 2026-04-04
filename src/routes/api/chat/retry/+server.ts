import type { RequestHandler } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth/hooks';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { messages, conversations } from '$lib/server/db/schema';
import { getConversation } from '$lib/server/services/conversations';
import { touchConversation } from '$lib/server/services/conversations';
import { createMessage } from '$lib/server/services/messages';
import { getConfig } from '$lib/server/config-store';
import { sendMessage, sendMessageStream } from '$lib/server/services/langflow';
import { logAttachmentTrace } from '$lib/server/services/attachment-trace';
import {
	attachContinuityToTaskState,
	getContextDebugState,
	getConversationTaskState,
} from '$lib/server/services/task-state';
import { StreamingHungarianTranslator } from '$lib/server/services/translator';
import {
	buildUpstreamMessage,
	shouldTranslateHungarian,
} from '$lib/server/services/chat-turn/execute';
import {
	persistAssistantEvidence,
	persistAssistantTurnState,
	runPostTurnTasks,
} from '$lib/server/services/chat-turn/finalize';
import { preflightChatTurn } from '$lib/server/services/chat-turn/preflight';
import { parseChatTurnRequest } from '$lib/server/services/chat-turn/request';
import {
	registerActiveChatStream,
	unregisterActiveChatStream,
	wasActiveChatStreamStopRequested,
} from '$lib/server/services/chat-turn/active-streams';
import { cleanupFailedTurn } from '$lib/server/services/chat-turn/retry-cleanup';
import {
	createServerChunkRuntime,
	createEventStreamResponse,
	createSseHeartbeatComment,
	createSsePreludeComment,
	createStreamJsonErrorResponse,
	extractAssistantChunk,
	extractErrorMessage,
	getReasoningContent,
	isAbruptUpstreamTermination,
	normalizeVisibleAssistantText,
	parseUpstreamEvents,
	processToolCallMarkers,
	classifyStreamError,
	streamErrorEvent,
	toIncrementalChunk,
	URL_LIST_TOOL_RECOVERY_APPENDIX,
	type StreamErrorCode,
} from '$lib/server/services/chat-turn/stream';
import type { WorkCapsuleSummary } from '$lib/server/services/chat-turn/types';
import { estimateTokenCount } from '$lib/server/utils/tokens';

const STREAM_TIMEOUT_MS = 120_000;

function shouldFallbackToNonStreaming(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const message = error.message.toLowerCase();
	return (
		error.name === 'AbortError' ||
		error.name === 'LangflowStreamConnectTimeoutError' ||
		message.includes('abort') ||
		message.includes('timed out') ||
		message.includes('fetch failed') ||
		message.includes('socket') ||
		message.includes('connection') ||
		message.includes('terminated')
	);
}

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const runtimeConfig = getConfig();

	let body: {
		conversationId?: unknown;
		assistantMessageId?: unknown;
		activeDocumentArtifactId?: unknown;
	};
	try {
		body = await event.request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const { conversationId, assistantMessageId, activeDocumentArtifactId } = body;
	if (typeof conversationId !== 'string' || !conversationId.trim()) {
		return new Response(JSON.stringify({ error: 'conversationId is required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}
	if (typeof assistantMessageId !== 'string' || !assistantMessageId.trim()) {
		return new Response(JSON.stringify({ error: 'assistantMessageId is required' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const conversation = await getConversation(user.id, conversationId);
	if (!conversation) {
		return new Response(JSON.stringify({ error: 'Conversation not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const [assistantMsg] = await db
		.select({ role: messages.role })
		.from(messages)
		.where(
			and(
				eq(messages.id, assistantMessageId),
				eq(messages.conversationId, conversationId),
			),
		)
		.limit(1);

	if (!assistantMsg || assistantMsg.role !== 'assistant') {
		return new Response(JSON.stringify({ error: 'Assistant message not found' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	let cleanupResult;
	try {
		cleanupResult = await cleanupFailedTurn({
			userId: user.id,
			conversationId,
			assistantMessageId,
		});
	} catch (error) {
		console.error('[RETRY] Cleanup failed:', error);
		return new Response(
			JSON.stringify({
				error: 'Retry cleanup failed',
				details: error instanceof Error ? error.message : String(error),
			}),
			{
				status: 500,
				headers: { 'Content-Type': 'application/json' },
			},
		);
	}

	if (cleanupResult.warnings.length > 0) {
		console.warn('[RETRY] Cleanup warnings:', cleanupResult.warnings);
	}

	const [userMsg] = await db
		.select({ content: messages.content })
		.from(messages)
		.where(
			and(
				eq(messages.conversationId, conversationId),
				eq(messages.role, 'user'),
			),
		)
		.orderBy(desc(messages.createdAt))
		.limit(1);

	if (!userMsg || !userMsg.content.trim()) {
		return new Response(JSON.stringify({ error: 'No user message found to retry' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	const syntheticBody = new Request('https://internal', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			message: userMsg.content,
			conversationId,
			activeDocumentArtifactId:
				typeof activeDocumentArtifactId === 'string' && activeDocumentArtifactId.trim()
					? activeDocumentArtifactId.trim()
					: undefined,
		}),
	});

	const parsedRequest = await parseChatTurnRequest(syntheticBody, runtimeConfig, 'stream');
	if (!parsedRequest.ok) {
		return createStreamJsonErrorResponse(parsedRequest.error);
	}

	const preflight = await preflightChatTurn({
		userId: user.id,
		translationEnabled: user.translationEnabled,
		request: parsedRequest.value,
	});
	if (!preflight.ok) {
		return createStreamJsonErrorResponse(preflight.error);
	}

	const turn = preflight.value;
	const normalizedMessage = turn.normalizedMessage;
	const streamId = turn.streamId;
	const modelId = turn.modelId;
	const modelDisplayName = turn.modelDisplayName;
	const safeAttachmentIds = turn.attachmentIds;
	const activeDocumentFocusId = turn.activeDocumentArtifactId;
	const attachmentTraceId = turn.attachmentTraceId;
	const sourceLanguage = turn.sourceLanguage;
	const isTranslationEnabled = turn.translationEnabled;
	const personaMemorySnapshotPromise = turn.personaMemorySnapshotPromise;

	let upstreamMessage = normalizedMessage;
	try {
		upstreamMessage = await buildUpstreamMessage(turn);
	} catch (error) {
		console.error('[RETRY] Input translation error:', error);
		return createStreamJsonErrorResponse({
			status: 502,
			error: 'Failed to prepare the translated prompt.',
		});
	}

	const requestStartTime = Date.now();
	const encoder = new TextEncoder();
	const downstreamAbortSignal = event.request.signal;
	let cancelStream = () => undefined;

	const stream = new ReadableStream({
		async start(controller) {
			const upstreamAbortController = new AbortController();
			if (streamId) {
				registerActiveChatStream({
					streamId,
					userId: user.id,
					controller: upstreamAbortController,
				});
			}
			const outputTranslator = shouldTranslateHungarian(turn)
				? new StreamingHungarianTranslator()
				: null;
			let downstreamClosed = false;
			let ended = false;
			let lastAssistantSnapshot = '';
			let emittedAssistantText = '';

			const closeDownstream = () => {
				if (downstreamClosed) return;
				downstreamClosed = true;
				downstreamAbortSignal.removeEventListener('abort', closeDownstream);
				try {
					controller.close();
				} catch {
					return;
				}
			};

			cancelStream = closeDownstream;

			if (downstreamAbortSignal.aborted) {
				closeDownstream();
			} else {
				downstreamAbortSignal.addEventListener('abort', closeDownstream, { once: true });
			}

			const enqueueChunk = (chunk: string): boolean => {
				if (downstreamClosed) return true;
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					closeDownstream();
				}
				return true;
			};

			const chunkRuntime = createServerChunkRuntime({ enqueueChunk });
			const emitThinking = chunkRuntime.emitThinking;
			const emitToolCallEvent = chunkRuntime.emitToolCallEvent;
			const emitInlineToken = chunkRuntime.emitInlineToken;
			const emitChunkWithPreserveHandling = chunkRuntime.emitChunkWithPreserveHandling;
			const flushPendingThinking = chunkRuntime.flushPendingThinking;
			const flushInlineThinkingBuffer = chunkRuntime.flushInlineThinkingBuffer;
			const flushPreserveBuffer = chunkRuntime.flushPreserveBuffer;
			const heartbeatIntervalId = setInterval(() => {
				enqueueChunk(createSseHeartbeatComment());
			}, 15000);

			enqueueChunk(createSsePreludeComment());

			const emitError = (code: StreamErrorCode) => enqueueChunk(streamErrorEvent(code));
			const emitResolvedAssistantText = async (text: string): Promise<boolean> => {
				if (!text) return true;
				if (!outputTranslator) return emitChunkWithPreserveHandling(text);
				for (const translatedChunk of await outputTranslator.addChunk(text)) {
					if (!emitInlineToken(translatedChunk)) return false;
				}
				return true;
			};
			let latestContextStatus:
				| import('$lib/types').ConversationContextStatus
				| undefined;
			let latestActiveWorkingSet:
				| Array<{
						id: string;
						type: string;
						name: string;
						mimeType: string | null;
						sizeBytes: number | null;
						conversationId: string | null;
						summary: string | null;
						createdAt: number;
						updatedAt: number;
				  }>
				| undefined;
			let latestTaskState: import('$lib/types').TaskState | null | undefined;
			let latestContextDebug:
				| import('$lib/types').ContextDebugState
				| null
				| undefined;
			let latestHonchoContext:
				| import('$lib/types').HonchoContextInfo
				| null
				| undefined;
			let latestHonchoSnapshot:
				| import('$lib/types').HonchoContextSnapshot
				| null
				| undefined;
			let initialContextStatus:
				| import('$lib/types').ConversationContextStatus
				| undefined;
			let initialTaskState: import('$lib/types').TaskState | null | undefined;
			let initialContextDebug:
				| import('$lib/types').ContextDebugState
				| null
				| undefined;

			const completeSuccess = (wasStopped = false) => {
				if (ended) return;
				ended = true;
				const thinkingTokenCount = estimateTokenCount(chunkRuntime.thinkingContent);
				const responseTokenCount = estimateTokenCount(chunkRuntime.fullResponse);
		const totalTokenCount = thinkingTokenCount + responseTokenCount;
				const genTimeMs = Date.now() - requestStartTime;
				const analyticsModel = modelId ?? 'model1';

				const assistantMsgPromise = chunkRuntime.fullResponse.trim()
					? createMessage(
							conversationId,
							'assistant',
							chunkRuntime.fullResponse,
							chunkRuntime.thinkingContent || undefined,
							chunkRuntime.serverSegments.length > 0
								? chunkRuntime.serverSegments
								: undefined,
							{ evidenceStatus: 'pending' },
						).catch(() => undefined)
					: Promise.resolve(undefined);

				const sendEndAndClose = async (assistantMsgId?: string) => {
					enqueueChunk(
						`event: end\ndata: ${JSON.stringify({
							thinkingTokenCount,
							responseTokenCount,
							totalTokenCount,
							thinking: chunkRuntime.thinkingContent || undefined,
							wasStopped,
							assistantMessageId: assistantMsgId,
							modelDisplayName,
							contextStatus: latestContextStatus,
							activeWorkingSet: latestActiveWorkingSet,
							taskState: latestTaskState,
							contextDebug: latestContextDebug,
						})}\n\n`,
					);
					touchConversation(user.id, conversationId).catch(() => undefined);
					closeDownstream();
				};

				assistantMsgPromise
					.then((assistantMsg) => {
						const postPersistTasks: Promise<unknown>[] = [];
						let uiStateTask: Promise<unknown> = Promise.resolve();

						if (assistantMsg) {
							uiStateTask = persistAssistantTurnState({
								userId: user.id,
								conversationId,
								normalizedMessage,
								assistantResponse: chunkRuntime.fullResponse,
								attachmentIds: safeAttachmentIds,
								activeDocumentArtifactId: activeDocumentFocusId,
								contextStatus: latestContextStatus,
								initialTaskState,
								initialContextDebug,
								assistantMessageId: assistantMsg.id,
								analytics: {
									model: analyticsModel,
									completionTokens: responseTokenCount,
									reasoningTokens: thinkingTokenCount,
									generationTimeMs: genTimeMs,
								},
								continuitySource: 'stream',
								honchoContext: latestHonchoContext,
								honchoSnapshot: latestHonchoSnapshot,
							}).then((turnState) => {
								latestActiveWorkingSet = turnState.activeWorkingSet;
								latestTaskState = turnState.taskState;
								latestContextDebug = turnState.contextDebug;
								return turnState.workCapsule;
							});
							postPersistTasks.push(uiStateTask);

							postPersistTasks.push(
								(async () => {
									await uiStateTask.catch(() => undefined);
									await persistAssistantEvidence({
									logPrefix: '[STREAM]' as const,
									userId: user.id,
									conversationId,
									assistantMessageId: assistantMsg.id,
									normalizedMessage,
									attachmentIds: safeAttachmentIds,
									taskState: latestTaskState,
									contextStatus: latestContextStatus ?? initialContextStatus ?? null,
									contextDebug: latestContextDebug,
									initialTaskState,
									initialContextDebug,
									toolCalls: chunkRuntime.toolCallRecords,
									});
								})(),
							);
						}

						void uiStateTask.finally(() => {
							void sendEndAndClose(assistantMsg?.id);
						});
						Promise.allSettled(postPersistTasks).finally(() => {
							void runPostTurnTasks({
							logPrefix: '[STREAM]' as const,
							userId: user.id,
								conversationId,
								upstreamMessage,
								assistantMirrorContent: chunkRuntime.fullResponse,
								personaMemorySnapshotPromise,
								maintenanceReason: 'chat_stream',
							});
						});
					})
					.catch(() => {
						void sendEndAndClose();
					});
			};

			const failStream = (code: StreamErrorCode) => {
				if (ended) return;
				ended = true;
				emitError(code);
				closeDownstream();
			};

			const timeoutId = setTimeout(() => {
				failStream('timeout');
			}, STREAM_TIMEOUT_MS);

			try {
				let usedUrlListRecovery = false;

			upstreamAttempt: for (let attempt = 1; attempt <= 2; attempt += 1) {
				const langflowResponse = await sendMessageStream(
						upstreamMessage,
						conversationId,
						modelId,
						{
							signal: upstreamAbortController.signal,
							user: {
								id: user.id,
								displayName: user.displayName,
								email: user.email,
							},
							attachmentIds: safeAttachmentIds,
							activeDocumentArtifactId: activeDocumentFocusId,
							attachmentTraceId,
							systemPromptAppendix: usedUrlListRecovery
								? URL_LIST_TOOL_RECOVERY_APPENDIX
								: undefined,
						},
					).catch(async (error) => {
						if (
							wasActiveChatStreamStopRequested(streamId) ||
							!shouldFallbackToNonStreaming(error) ||
							chunkRuntime.fullResponse.trim() ||
							chunkRuntime.thinkingContent.trim() ||
							chunkRuntime.toolCallRecords.length > 0 ||
							emittedAssistantText.trim()
						) {
							throw error;
						}

						console.warn(
							'[RETRY-STREAM] Falling back to non-stream after connect failure',
							{ conversationId, attempt },
						);

						const fallbackResponse = await sendMessage(
							upstreamMessage,
							conversationId,
							modelId,
							{
								id: user.id,
								displayName: user.displayName,
								email: user.email,
							},
							{
								signal: upstreamAbortController.signal,
								attachmentIds: safeAttachmentIds,
								activeDocumentArtifactId: activeDocumentFocusId,
								attachmentTraceId,
								systemPromptAppendix: usedUrlListRecovery
									? URL_LIST_TOOL_RECOVERY_APPENDIX
									: undefined,
							},
						);

						latestContextStatus = fallbackResponse.contextStatus;
						initialContextStatus = latestContextStatus;
						latestTaskState = await attachContinuityToTaskState(
							user.id,
							fallbackResponse.taskState ?? null,
						).catch(() => fallbackResponse.taskState ?? null);
						initialTaskState = latestTaskState;
						latestContextDebug = fallbackResponse.contextDebug ?? null;
						initialContextDebug = latestContextDebug;
						latestHonchoContext = fallbackResponse.honchoContext ?? null;
						latestHonchoSnapshot = fallbackResponse.honchoSnapshot ?? null;

						if (!(await emitResolvedAssistantText(fallbackResponse.text ?? ''))) {
							return null;
						}

						if (outputTranslator) {
							for (const chunk of await outputTranslator.flush()) {
								if (!emitInlineToken(chunk)) return null;
							}
						}
						flushPendingThinking();
						if (!flushInlineThinkingBuffer()) return null;
						if (!flushPreserveBuffer()) return null;
						completeSuccess();
						return null;
					});
					if (!langflowResponse) return;
					if (!langflowResponse.stream) {
						latestContextStatus = langflowResponse.contextStatus;
						initialContextStatus = latestContextStatus;
						latestTaskState = await attachContinuityToTaskState(
							user.id,
							langflowResponse.taskState ?? null,
						).catch(() => langflowResponse.taskState ?? null);
						initialTaskState = latestTaskState;
						latestContextDebug = langflowResponse.contextDebug ?? null;
						initialContextDebug = latestContextDebug;
						latestHonchoContext = langflowResponse.honchoContext ?? null;
						latestHonchoSnapshot = langflowResponse.honchoSnapshot ?? null;

						if (!(await emitResolvedAssistantText(langflowResponse.text ?? ''))) return;

						if (outputTranslator) {
							for (const chunk of await outputTranslator.flush()) {
								if (!emitInlineToken(chunk)) return;
							}
						}
						flushPendingThinking();
						if (!flushInlineThinkingBuffer()) return;
						if (!flushPreserveBuffer()) return;
						completeSuccess();
						return;
					}

					const langflowStream = langflowResponse.stream;
					latestContextStatus = langflowResponse.contextStatus;
					initialContextStatus = latestContextStatus;
					latestTaskState = langflowResponse.taskState
						? await attachContinuityToTaskState(
								user.id,
								langflowResponse.taskState,
							).catch(() => langflowResponse.taskState)
						: await getConversationTaskState(user.id, conversationId).catch(
								() => null,
							);
					initialTaskState = latestTaskState;
					latestContextDebug =
						langflowResponse.contextDebug ??
						(await getContextDebugState(user.id, conversationId).catch(() => null));
					initialContextDebug = latestContextDebug;
					latestHonchoContext = langflowResponse.honchoContext ?? null;
					latestHonchoSnapshot = langflowResponse.honchoSnapshot ?? null;

					for await (const upstreamEvent of parseUpstreamEvents(langflowStream)) {
						const { event: eventType, data } = upstreamEvent;

						if (data === '[DONE]' || eventType === 'end') {
							if (outputTranslator) {
								for (const chunk of await outputTranslator.flush()) {
									if (!emitInlineToken(chunk)) return;
								}
							}
							flushPendingThinking();
							if (!flushInlineThinkingBuffer()) return;
							if (!flushPreserveBuffer()) return;
							completeSuccess();
							return;
						}

						if (eventType === 'error') {
							const errorMessage = extractErrorMessage(data);
							const canRetryUrlListValidation =
								!usedUrlListRecovery &&
								typeof errorMessage === 'string' &&
								errorMessage.includes('URL list validation') &&
								!chunkRuntime.fullResponse.trim() &&
								!chunkRuntime.thinkingContent.trim() &&
								chunkRuntime.toolCallRecords.length === 0 &&
								!emittedAssistantText.trim();
							if (canRetryUrlListValidation) {
								usedUrlListRecovery = true;
								lastAssistantSnapshot = '';
								emittedAssistantText = '';
								continue upstreamAttempt;
							}
							failStream(classifyStreamError(errorMessage));
							return;
						}

						const rawChunk = extractAssistantChunk(eventType, data);
						const reasoningChunk = getReasoningContent(data);
						if (reasoningChunk) {
							if (!emitThinking(`${reasoningChunk}\n`)) return;
						}
						if (!rawChunk) continue;

						const previousEmittedAssistantText = emittedAssistantText;
						const incremental = toIncrementalChunk(
							eventType,
							rawChunk,
							lastAssistantSnapshot,
							emittedAssistantText,
						);
						lastAssistantSnapshot = incremental.lastSnapshot;
						emittedAssistantText = incremental.emittedText;
						const chunk = incremental.chunk;
						if (!chunk) continue;

						if (eventType !== 'token' && previousEmittedAssistantText) {
							const normalizedEmittedText = normalizeVisibleAssistantText(
								previousEmittedAssistantText,
							);
							const normalizedChunk = normalizeVisibleAssistantText(chunk);
							if (
								normalizedChunk &&
								(normalizedChunk === normalizedEmittedText ||
									normalizedEmittedText.endsWith(normalizedChunk) ||
									normalizedChunk.endsWith(normalizedEmittedText))
							) {
								continue;
							}
						}

						const cleanedChunk = processToolCallMarkers(chunk, emitToolCallEvent);
						if (!cleanedChunk) continue;

						if (!outputTranslator) {
							if (!emitChunkWithPreserveHandling(cleanedChunk)) return;
							continue;
						}

						for (const translatedChunk of await outputTranslator.addChunk(cleanedChunk)) {
							if (!emitInlineToken(translatedChunk)) return;
						}
					}

					if (outputTranslator) {
						for (const chunk of await outputTranslator.flush()) {
							if (!emitInlineToken(chunk)) return;
						}
					}
					flushPendingThinking();
					if (!flushInlineThinkingBuffer()) return;
					if (!flushPreserveBuffer()) return;
					completeSuccess();
					return;
				}
			} catch (error) {
				if (
					wasActiveChatStreamStopRequested(streamId) &&
					error instanceof Error &&
					(error.name === 'AbortError' || error.message.toLowerCase().includes('abort'))
				) {
					completeSuccess(true);
					return;
				}
				if (isAbruptUpstreamTermination(error) && chunkRuntime.fullResponse.trim()) {
					completeSuccess();
					return;
				}
				console.error('[RETRY-STREAM] Error', {
					conversationId,
					userId: user.id,
					message: error instanceof Error ? error.message : String(error),
				});
				failStream(
					classifyStreamError(error instanceof Error ? error.message : String(error)),
				);
			} finally {
				clearInterval(heartbeatIntervalId);
				clearTimeout(timeoutId);
				if (streamId) {
					unregisterActiveChatStream(streamId, upstreamAbortController);
				}
				cancelStream = () => undefined;
			}
		},
		cancel() {
			cancelStream();
		},
	});

	return createEventStreamResponse(stream);
};
