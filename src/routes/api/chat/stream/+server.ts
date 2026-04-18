import type { RequestHandler } from "@sveltejs/kit";
import { requireAuth } from "$lib/server/auth/hooks";
import { touchConversation } from "$lib/server/services/conversations";
import { sendMessage, sendMessageStream } from "$lib/server/services/langflow";
import { getConfig } from "$lib/server/config-store";
import { createMessage } from "$lib/server/services/messages";
import { logAttachmentTrace } from "$lib/server/services/attachment-trace";
import {
  attachContinuityToTaskState,
  getContextDebugState,
  getConversationTaskState,
} from "$lib/server/services/task-state";
import { StreamingHungarianTranslator } from "$lib/server/services/translator";
import {
  buildUpstreamMessage,
  shouldTranslateHungarian,
} from "$lib/server/services/chat-turn/execute";
import {
  persistAssistantEvidence,
  persistAssistantTurnState,
  persistUserTurnAttachments,
  runPostTurnTasks,
} from "$lib/server/services/chat-turn/finalize";
import { preflightChatTurn } from "$lib/server/services/chat-turn/preflight";
import { parseChatTurnRequest } from "$lib/server/services/chat-turn/request";
import {
  checkStreamCapacity,
  registerActiveChatStream,
  unregisterActiveChatStream,
  wasActiveChatStreamStopRequested,
  getStreamBuffer,
  getOrCreateStreamBuffer,
  appendToStreamBuffer,
  clearStreamBuffer,
  requestActiveChatStreamStop,
  subscribeToStream,
  unsubscribeFromStream,
  broadcastStreamChunk,
  getOrphanedStream,
  isStreamActive,
} from '$lib/server/services/chat-turn/active-streams';
import {
  URL_LIST_TOOL_RECOVERY_APPENDIX,
  type StreamErrorCode,
  classifyStreamError,
  createServerChunkRuntime,
  createEventStreamResponse,
  createSseHeartbeatComment,
  createSsePreludeComment,
  createStreamJsonErrorResponse,
  extractAssistantChunk,
  extractErrorMessage,
  getReasoningContent,
  isAbruptUpstreamTermination,
  isUrlListValidationError,
  normalizeVisibleAssistantText,
  parseUpstreamEvents,
  processToolCallMarkers,
  streamErrorEvent,
  toIncrementalChunk,
} from "$lib/server/services/chat-turn/stream";
import type { WorkCapsuleSummary } from "$lib/server/services/chat-turn/types";
import { estimateTokenCount } from "$lib/server/utils/tokens";
import {
  assignGeneratedFilesToAssistantMessage,
  getChatFiles,
  getChatFilesForAssistantMessage,
  syncGeneratedFilesToMemory,
} from "$lib/server/services/chat-files";
import {
  getGenerateFileToolCode,
  getGenerateFileToolFilename,
  getGenerateFileToolLanguage,
} from "$lib/utils/generate-file-tool";

const STREAM_TIMEOUT_MS = 120_000;

function shouldFallbackToNonStreaming(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return (
    error.name === "AbortError" ||
    error.name === "LangflowStreamConnectTimeoutError" ||
    message.includes("abort") ||
    message.includes("timed out") ||
    message.includes("fetch failed") ||
    message.includes("socket") ||
    message.includes("connection") ||
    message.includes("terminated")
  );
}

export const POST: RequestHandler = async (event) => {
  requireAuth(event);
  const user = event.locals.user!;

  const requestStartTime = Date.now();
  const runtimeConfig = getConfig();

  // Parse request first to detect if this is a reconnect to an orphaned stream
  const parsedRequest = await parseChatTurnRequest(
    event.request,
    runtimeConfig,
    'stream',
  );
  if (!parsedRequest.ok) {
    return createStreamJsonErrorResponse(parsedRequest.error);
  }

  // Check if this is a reconnect attempt (streamId provided in request)
  const isReconnect =
    typeof parsedRequest.value.streamId === 'string' && parsedRequest.value.streamId.length > 0;

  // For reconnects, skip capacity check - the orphan stream will be replaced
  // when we register the new stream (registerActiveChatStream handles this)
  if (!isReconnect) {
    const capacity = checkStreamCapacity(user.id);
    if (!capacity.allowed) {
      console.warn('[CHAT_STREAM] Rejected due to capacity', {
        userId: user.id,
        reason: capacity.reason,
        retryAfterSeconds: capacity.retryAfterSeconds,
        currentGlobalCount: capacity.currentGlobalCount,
        currentUserCount: capacity.currentUserCount,
      });

      return new Response(
        JSON.stringify({
          error: 'Server at capacity. Please try again later.',
          code: 'CAPACITY_EXCEEDED',
          reason: capacity.reason,
          retryAfter: capacity.retryAfterSeconds,
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(capacity.retryAfterSeconds ?? 10),
            'Cache-Control': 'no-store',
          },
        },
      );
    }
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
  const conversationId = turn.conversationId;
  const normalizedMessage = turn.normalizedMessage;
  const streamId = turn.streamId;
  const modelId = turn.modelId;
  const modelDisplayName = turn.modelDisplayName;
  const skipPersistUserMessage = turn.skipPersistUserMessage;
  const safeAttachmentIds = turn.attachmentIds;
  const activeDocumentArtifactId = turn.activeDocumentArtifactId;
  const attachmentTraceId = turn.attachmentTraceId;
  const sourceLanguage = turn.sourceLanguage;
  const isTranslationEnabled = turn.translationEnabled;
  const personaMemorySnapshotPromise = turn.personaMemorySnapshotPromise;

  let upstreamMessage = normalizedMessage;
  try {
    upstreamMessage = await buildUpstreamMessage(turn);
  } catch (error) {
    console.error("Input translation error:", error);
    return createStreamJsonErrorResponse({
      status: 502,
      error: "Failed to prepare the translated prompt.",
    });
  }

  const encoder = new TextEncoder();
  const downstreamAbortSignal = event.request.signal;
  let cancelStream = () => undefined;

  const stream = new ReadableStream({
    async start(controller) {
      if (streamId) {
        console.info('[CHAT_STREAM] start called', {
          streamId,
          abortAlreadySignaled: downstreamAbortSignal.aborted,
        });
      }
      const upstreamAbortController = new AbortController();
      let isMainStream = false;

      const doReconnect = (targetStreamId: string) => {
        try {
          enqueueChunk(createSsePreludeComment());
          enqueueChunk(createSseHeartbeatComment());
          const buffer = getStreamBuffer(targetStreamId);
          if (buffer) {
            const hasContent = buffer.tokens.length > 0 || buffer.thinking.length > 0 || buffer.toolCalls.length > 0;
            console.info('[CHAT_STREAM] Replaying buffer for stream', targetStreamId, {
              hasContent,
              tokens: buffer.tokens.length,
              thinking: buffer.thinking.length,
            });
            if (hasContent) {
              enqueueChunk(`event: replay_start\ndata: ${JSON.stringify({
                tokenCount: buffer.tokens.length,
                thinkingCount: buffer.thinking.length,
                toolCallCount: buffer.toolCalls.length,
                userMessage: buffer.userMessage,
              })}\n\n`);
              for (const token of buffer.tokens) {
                enqueueChunk(`event: token\ndata: ${JSON.stringify({ text: token })}\n\n`);
              }
              for (const thinking of buffer.thinking) {
                enqueueChunk(`event: thinking\ndata: ${JSON.stringify({ text: thinking })}\n\n`);
              }
              for (const toolCall of buffer.toolCalls) {
                enqueueChunk(`event: tool_call\ndata: ${JSON.stringify({
                  name: toolCall.name,
                  input: toolCall.input,
                  status: toolCall.status,
                  outputSummary: toolCall.outputSummary,
                })}\n\n`);
              }
              enqueueChunk('event: replay_end\ndata: {}\n\n');
            }
          }

          let reconnectHeartbeatId: ReturnType<typeof setInterval>;
          const liveListener = (chunk: string) => {
            enqueueChunk(chunk);
            if (chunk.startsWith('event: end\n') || chunk.startsWith('event: error\n')) {
              unsubscribeFromStream(targetStreamId, liveListener);
              clearInterval(reconnectHeartbeatId);
              closeDownstream();
            }
          };
          subscribeToStream(targetStreamId, liveListener);

          downstreamAbortSignal.addEventListener('abort', () => {
            unsubscribeFromStream(targetStreamId, liveListener);
            clearInterval(reconnectHeartbeatId);
            closeDownstream();
          }, { once: true });

          reconnectHeartbeatId = setInterval(() => {
            enqueueChunk(createSseHeartbeatComment());
          }, 10000);

          console.info('[CHAT_STREAM] Reconnect done, subscribed to stream', targetStreamId);
        } catch (err) {
          console.error('[CHAT_STREAM] doReconnect threw', { targetStreamId, err });
          closeDownstream();
        }
      };

      if (streamId) {
        let existingStreamId: string | null;
        try {
          existingStreamId = getOrphanedStream(conversationId);
        } catch (err) {
          console.error('[CHAT_STREAM] getOrphanedStream threw', { conversationId, streamId, err });
          closeDownstream();
          return;
        }

        if (existingStreamId === streamId) {
          console.info('[CHAT_STREAM] Reconnect to same stream', streamId);
          doReconnect(streamId);
          return;
        } else if (existingStreamId) {
          const clientStreamActive = isStreamActive(streamId);
          const orphanStreamActive = isStreamActive(existingStreamId);

          if (clientStreamActive) {
            console.info('[CHAT_STREAM] Reconnect to client stream (concurrent active)', streamId);
            doReconnect(streamId);
            return;
          } else if (orphanStreamActive) {
            console.info('[CHAT_STREAM] Reconnect to orphan stream (client streamId stale)', {
              clientStreamId: streamId,
              activeOrphanStreamId: existingStreamId,
            });
            doReconnect(existingStreamId);
            return;
          } else {
            console.info('[CHAT_STREAM] No active streams - cleaning up and starting new', {
              clientStreamId: streamId,
              orphanedStreamId: existingStreamId,
            });
            clearStreamBuffer(existingStreamId);
          }
        }

        registerActiveChatStream({
          streamId,
          userId: user.id,
          controller: upstreamAbortController,
          conversationId,
        });

        getOrCreateStreamBuffer(streamId, normalizedMessage);
        isMainStream = true;
      }
      const outputTranslator = shouldTranslateHungarian(turn)
        ? new StreamingHungarianTranslator()
        : null;
      let downstreamClosed = false;
      let ended = false;
      let lastAssistantSnapshot = "";
      let emittedAssistantText = "";

      const closeDownstream = () => {
        if (downstreamClosed) return;
        downstreamClosed = true;
        downstreamAbortSignal.removeEventListener("abort", closeDownstream);
        // Do NOT abort upstream on client disconnect — let generation complete and persist to DB.
        // The client reloads persisted messages on visibility restore (mobile background fix).
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
        downstreamAbortSignal.addEventListener("abort", closeDownstream, {
          once: true,
        });
      }

      const enqueueChunk = (chunk: string): boolean => {
        if (isMainStream && streamId) {
          broadcastStreamChunk(streamId, chunk);
        }
        if (downstreamClosed) return true;

        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closeDownstream();
        }

        return true;
      };

      const chunkRuntime = createServerChunkRuntime({ enqueueChunk });
      const rawEmitThinking = chunkRuntime.emitThinking;
      const emitThinking = (reasoning: string) => {
        if (streamId) {
          appendToStreamBuffer(streamId, 'thinking', { text: reasoning });
        }
        return rawEmitThinking(reasoning);
      };
      const rawEmitToolCallEvent = chunkRuntime.emitToolCallEvent;
      const emitToolCallEvent = (
        name: string,
        input: Record<string, unknown>,
        status: 'running' | 'done',
        details?: {
          outputSummary?: string | null;
          sourceType?: import('$lib/types').EvidenceSourceType | null;
          candidates?: import('$lib/types').ToolEvidenceCandidate[];
        },
      ) => {
        if (streamId) {
          appendToStreamBuffer(streamId, 'tool_call', {
            name,
            input,
            status,
            outputSummary: details?.outputSummary,
          });
        }
        return rawEmitToolCallEvent(name, input, status, details);
      };
      const emitToolCallEventWithDebug = (
        name: string,
        input: Record<string, unknown>,
        status: "running" | "done",
        details?: {
          outputSummary?: string | null;
          sourceType?: import("$lib/types").EvidenceSourceType | null;
          candidates?: import("$lib/types").ToolEvidenceCandidate[];
        },
      ) => {
        if (name === "generate_file") {
          const code = getGenerateFileToolCode(input);
          console.info("[CHAT_STREAM] File-generation tool event", {
            conversationId,
            streamId,
            status,
            language: getGenerateFileToolLanguage(input),
            filename: getGenerateFileToolFilename(input),
            codeLength: code?.length ?? 0,
            writesToOutput: code?.includes("/output") ?? false,
            outputSummary: details?.outputSummary ?? null,
          });
        }

        emitToolCallEvent(name, input, status, details);
      };
      const rawEmitInlineToken = chunkRuntime.emitInlineToken;
      const emitInlineToken = (chunk: string) => {
        if (streamId) {
          appendToStreamBuffer(streamId, 'token', { text: chunk });
        }
        return rawEmitInlineToken(chunk);
      };
      const emitChunkWithPreserveHandling =
        chunkRuntime.emitChunkWithPreserveHandling;
      const flushPendingThinking = chunkRuntime.flushPendingThinking;
      const flushInlineThinkingBuffer = chunkRuntime.flushInlineThinkingBuffer;
      const flushPreserveBuffer = chunkRuntime.flushPreserveBuffer;
      const heartbeatIntervalId = setInterval(() => {
        enqueueChunk(createSseHeartbeatComment());
      }, 15000);

      enqueueChunk(createSsePreludeComment());

      let generatedFileIdsAtStart = new Set<string>();
      try {
        generatedFileIdsAtStart = new Set(
          (await getChatFiles(conversationId)).map((file) => file.id),
        );
      } catch (error) {
        console.warn("[CHAT_STREAM] Failed to snapshot generated files at stream start", {
          conversationId,
          streamId,
          error,
        });
      }

      const emitError = (code: StreamErrorCode) =>
        enqueueChunk(streamErrorEvent(code));
      const emitResolvedAssistantText = async (text: string): Promise<boolean> => {
        if (!text) {
          return true;
        }

        if (!outputTranslator) {
          return emitChunkWithPreserveHandling(text);
        }

        for (const translatedChunk of await outputTranslator.addChunk(text)) {
          if (!emitInlineToken(translatedChunk)) {
            return false;
          }
        }

        return true;
      };
      let latestContextStatus:
        | import("$lib/types").ConversationContextStatus
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
      let latestTaskState: import("$lib/types").TaskState | null | undefined;
      let latestContextDebug:
        | import("$lib/types").ContextDebugState
        | null
        | undefined;
      let latestHonchoContext:
        | import("$lib/types").HonchoContextInfo
        | null
        | undefined;
      let latestHonchoSnapshot:
        | import("$lib/types").HonchoContextSnapshot
        | null
        | undefined;
      let initialContextStatus:
        | import("$lib/types").ConversationContextStatus
        | undefined;
      let initialTaskState: import("$lib/types").TaskState | null | undefined;
      let initialContextDebug:
        | import("$lib/types").ContextDebugState
        | null
        | undefined;
      const completeSuccess = (wasStopped = false) => {
        if (ended) return;
        ended = true;
        if (streamId) {
          clearStreamBuffer(streamId);
        }
        const thinkingTokenCount = estimateTokenCount(
          chunkRuntime.thinkingContent,
        );
        const responseTokenCount = estimateTokenCount(
          chunkRuntime.fullResponse,
        );
        const totalTokenCount = thinkingTokenCount + responseTokenCount;
        const genTimeMs = Date.now() - requestStartTime;
        const analyticsModel = modelId ?? "model1";
        const persistUserMessage = !skipPersistUserMessage;
        const toolCallSummary = chunkRuntime.toolCallRecords.map((record) => ({
          name: record.name,
          status: record.status,
        }));
        const hadGenerateFileToolCall = toolCallSummary.some(
          (record) => record.name === "generate_file" || record.name === "export_document",
        );

        console.info("[CHAT_STREAM] Tool-call summary", {
          conversationId,
          streamId,
          wasStopped,
          toolCallCount: toolCallSummary.length,
          generateFileCallCount: toolCallSummary.filter(
            (record) => record.name === "generate_file",
          ).length,
          toolCalls: toolCallSummary,
        });

let userMessageToPersist = normalizedMessage;
        if (isReconnect && streamId) {
          const buffer = getStreamBuffer(streamId);
          if (buffer?.userMessage) {
            userMessageToPersist = buffer.userMessage;
          }
        }
        const userMsgPromise = persistUserMessage
          ? createMessage(conversationId, 'user', userMessageToPersist).catch(
              () => undefined,
            )
          : Promise.resolve(undefined);
        const assistantMsgPromise = chunkRuntime.fullResponse.trim()
          ? createMessage(
              conversationId,
              "assistant",
              chunkRuntime.fullResponse,
              chunkRuntime.thinkingContent || undefined,
              chunkRuntime.serverSegments.length > 0
                ? chunkRuntime.serverSegments
                : undefined,
              { evidenceStatus: "pending" },
            ).catch(() => undefined)
          : Promise.resolve(undefined);

        const sendEndAndClose = async (
          userMsgId?: string,
          assistantMsgId?: string,
        ) => {
          let generatedFiles: import("$lib/types").ChatGeneratedFile[] = [];
          try {
            if (assistantMsgId && hadGenerateFileToolCall) {
              const allGeneratedFiles = await getChatFiles(conversationId);
              const newGeneratedFileIds = allGeneratedFiles
                .filter((file) => !generatedFileIdsAtStart.has(file.id))
                .map((file) => file.id);

              if (newGeneratedFileIds.length > 0) {
                await assignGeneratedFilesToAssistantMessage(
                  conversationId,
                  assistantMsgId,
                  newGeneratedFileIds,
                );

                void syncGeneratedFilesToMemory({
                  userId: user.id,
                  conversationId,
                  assistantMessageId: assistantMsgId,
                  fileIds: newGeneratedFileIds,
                  assistantResponse: chunkRuntime.fullResponse,
                }).catch((error) => {
                  console.error(
                    "[CHAT_STREAM] Background generated-file memory sync failed",
                    {
                      conversationId,
                      streamId,
                      assistantMessageId: assistantMsgId,
                      fileIds: newGeneratedFileIds,
                      error,
                    },
                  );
                });
              }

              generatedFiles = await getChatFilesForAssistantMessage(
                conversationId,
                assistantMsgId,
              );
            }
          } catch (error) {
            console.error("[CHAT_STREAM] Failed to load generated files for end event", {
              conversationId,
              streamId,
              error,
            });
          }

          enqueueChunk(
            `event: end\ndata: ${JSON.stringify({
              thinkingTokenCount,
              responseTokenCount,
              totalTokenCount,
              thinking: chunkRuntime.thinkingContent || undefined,
              wasStopped,
              userMessageId: userMsgId,
              assistantMessageId: assistantMsgId,
              modelDisplayName,
              contextStatus: latestContextStatus,
              activeWorkingSet: latestActiveWorkingSet,
              taskState: latestTaskState,
              contextDebug: latestContextDebug,
              generatedFiles,
            })}\n\n`,
          );
          touchConversation(user.id, conversationId).catch(() => undefined);
          closeDownstream();
        };

        Promise.all([userMsgPromise, assistantMsgPromise])
          .then(([userMsg, assistantMsg]) => {
            const postPersistTasks: Promise<unknown>[] = [];
            let uiStateTask: Promise<unknown> = Promise.resolve();
            if (persistUserMessage && userMsg && safeAttachmentIds.length > 0) {
              postPersistTasks.push(
                persistUserTurnAttachments({
                  userId: user.id,
                  conversationId,
                  messageId: userMsg.id,
                  normalizedMessage,
                  attachmentIds: safeAttachmentIds,
                }).then((workingSet) => {
                  latestActiveWorkingSet = workingSet ?? latestActiveWorkingSet;
                }),
              );
            }

            let latestWorkCapsule: WorkCapsuleSummary;
            if (assistantMsg) {
              uiStateTask = persistAssistantTurnState({
                userId: user.id,
                conversationId,
                normalizedMessage,
                assistantResponse: chunkRuntime.fullResponse,
                attachmentIds: safeAttachmentIds,
                activeDocumentArtifactId,
                contextStatus: latestContextStatus,
                initialTaskState,
                initialContextDebug,
                userMessageId: userMsg?.id ?? null,
                assistantMessageId: assistantMsg.id,
                analytics: {
                  model: analyticsModel,
                  completionTokens: responseTokenCount,
                  reasoningTokens: thinkingTokenCount,
                  generationTimeMs: genTimeMs,
                },
                continuitySource: "stream",
                honchoContext: latestHonchoContext,
                honchoSnapshot: latestHonchoSnapshot,
              }).then((turnState) => {
                latestActiveWorkingSet = turnState.activeWorkingSet;
                latestTaskState = turnState.taskState;
                latestContextDebug = turnState.contextDebug;
                latestWorkCapsule = turnState.workCapsule;
              });
              postPersistTasks.push(uiStateTask);

              postPersistTasks.push(
                (async () => {
                  await uiStateTask.catch(() => undefined);
                  await persistAssistantEvidence({
                    logPrefix: "[STREAM]",
                    userId: user.id,
                    conversationId,
                    assistantMessageId: assistantMsg.id,
                    normalizedMessage,
                    attachmentIds: safeAttachmentIds,
                    taskState: latestTaskState,
                    contextStatus:
                      latestContextStatus ?? initialContextStatus ?? null,
                    contextDebug: latestContextDebug,
                    initialTaskState,
                    initialContextDebug,
                    toolCalls: chunkRuntime.toolCallRecords,
                  });
                })(),
              );
            }

            void uiStateTask.finally(() => {
              void sendEndAndClose(userMsg?.id, assistantMsg?.id);
            });
            Promise.allSettled(postPersistTasks).finally(() => {
              void runPostTurnTasks({
                logPrefix: "[STREAM]",
                userId: user.id,
                conversationId,
                upstreamMessage,
                assistantMirrorContent: chunkRuntime.fullResponse,
                workCapsule: latestWorkCapsule,
                personaMemorySnapshotPromise,
                maintenanceReason: "chat_stream",
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
        if (streamId) {
          clearStreamBuffer(streamId);
        }
        emitError(code);
        closeDownstream();
      };

      const timeoutId = setTimeout(() => {
        failStream("timeout");
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
              activeDocumentArtifactId,
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
              "[STREAM] Falling back to non-stream Langflow run after stream connect failure",
              {
                conversationId,
                attempt,
                errorName: error instanceof Error ? error.name : undefined,
                errorMessage:
                  error instanceof Error ? error.message : String(error),
              },
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
                activeDocumentArtifactId,
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

            if (!(await emitResolvedAssistantText(fallbackResponse.text))) {
              return null;
            }

            if (outputTranslator) {
              for (const chunk of await outputTranslator.flush()) {
                if (!emitInlineToken(chunk)) {
                  return null;
                }
              }
            }
            flushPendingThinking();
            if (!flushInlineThinkingBuffer()) {
              return null;
            }
            if (!flushPreserveBuffer()) {
              return null;
            }
            completeSuccess();
            return null;
          });
          if (!langflowResponse) {
            return;
          }
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

            if (!(await emitResolvedAssistantText(langflowResponse.text ?? ""))) {
              return;
            }

            if (outputTranslator) {
              for (const chunk of await outputTranslator.flush()) {
                if (!emitInlineToken(chunk)) {
                  return;
                }
              }
            }
            flushPendingThinking();
            if (!flushInlineThinkingBuffer()) {
              return;
            }
            if (!flushPreserveBuffer()) {
              return;
            }
            completeSuccess();
            return;
          }
          const langflowStream =
            langflowResponse.stream;
          latestContextStatus =
            langflowResponse.contextStatus;
          initialContextStatus = latestContextStatus;
          latestTaskState =
            langflowResponse.taskState ??
            (await getConversationTaskState(user.id, conversationId).catch(
              () => null,
            ));
          latestTaskState = await attachContinuityToTaskState(
            user.id,
            latestTaskState ?? null,
          ).catch(() => latestTaskState ?? null);
          initialTaskState = latestTaskState;
          latestContextDebug =
            langflowResponse.contextDebug ??
            (await getContextDebugState(user.id, conversationId).catch(
              () => null,
            ));
          initialContextDebug = latestContextDebug;
          latestHonchoContext = langflowResponse.honchoContext ?? null;
          latestHonchoSnapshot = langflowResponse.honchoSnapshot ?? null;
          let upstreamEventCount = 0;

          for await (const upstreamEvent of parseUpstreamEvents(
            langflowStream,
          )) {
            const { event: eventType, data } = upstreamEvent;
            upstreamEventCount += 1;
            if (data === "[DONE]" || eventType === "end") {
              if (outputTranslator) {
                for (const chunk of await outputTranslator.flush()) {
                  if (!emitInlineToken(chunk)) {
                    return;
                  }
                }
              }
              flushPendingThinking();
              if (!flushInlineThinkingBuffer()) {
                return;
              }
              if (!flushPreserveBuffer()) {
                return;
              }
              completeSuccess();
              return;
            }

            if (eventType === "error") {
              const errorMessage = extractErrorMessage(data);
              console.error("[STREAM] Upstream error event payload", {
                conversationId,
                attempt,
                errorMessage,
                data:
                  typeof data === "string"
                    ? data
                    : JSON.stringify(data).slice(0, 2000),
              });
              const canRetryUrlListValidation =
                !usedUrlListRecovery &&
                isUrlListValidationError(errorMessage) &&
                !chunkRuntime.fullResponse.trim() &&
                !chunkRuntime.thinkingContent.trim() &&
                chunkRuntime.toolCallRecords.length === 0 &&
                !emittedAssistantText.trim();
              if (canRetryUrlListValidation) {
                usedUrlListRecovery = true;
                lastAssistantSnapshot = "";
                emittedAssistantText = "";
                console.warn(
                  "[STREAM] Retrying upstream after URL list validation error",
                  {
                    conversationId,
                    attempt,
                    errorMessage,
                  },
                );
                continue upstreamAttempt;
              }
              failStream(classifyStreamError(errorMessage));
              return;
            }

            const rawChunk = extractAssistantChunk(eventType, data);
            const reasoningChunk = getReasoningContent(data);
            if (reasoningChunk) {
              if (!emitThinking(`${reasoningChunk}\n`)) {
                return;
              }
            }
            if (!rawChunk) {
              continue;
            }

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

            // Suppress duplicate visible text from Langflow's final summary event.
            // Nemotron streams tokens as "<thinking>...</thinking>visible" so
            // emittedAssistantText includes thinking tags, but the final non-token
            // 'message' event has only visible text (tags stripped by Langflow).
            // toIncrementalChunk can't match them, so we guard here using fullResponse
            // with trimmed comparison to handle trailing newline/space differences.
            if (eventType !== "token" && previousEmittedAssistantText) {
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

            // Strip tool call markers, emitting structured tool_call SSE events
            const cleanedChunk = processToolCallMarkers(
              chunk,
              emitToolCallEventWithDebug,
            );

            if (!cleanedChunk) continue;

            if (!outputTranslator) {
              if (!emitChunkWithPreserveHandling(cleanedChunk)) {
                return;
              }
              continue;
            }

            for (const translatedChunk of await outputTranslator.addChunk(
              cleanedChunk,
            )) {
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
          flushPendingThinking();
          if (!flushInlineThinkingBuffer()) {
            return;
          }
          if (!flushPreserveBuffer()) {
            return;
          }
          completeSuccess();
          return;
        }
      } catch (error) {
        if (
          wasActiveChatStreamStopRequested(streamId) &&
          error instanceof Error &&
          (error.name === "AbortError" ||
            error.message.toLowerCase().includes("abort"))
        ) {
          completeSuccess(true);
          return;
        }
        if (
          isAbruptUpstreamTermination(error) &&
          chunkRuntime.fullResponse.trim()
        ) {
          completeSuccess();
          return;
        }
        console.error("[STREAM] Chat stream error", {
          conversationId,
          userId: user.id,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          cause:
            error instanceof Error && "cause" in error
              ? (error as Error & { cause?: unknown }).cause
              : undefined,
        });
        if (attachmentTraceId) {
          logAttachmentTrace("stream_failure", {
            traceId: attachmentTraceId,
            conversationId,
            attachmentIds: safeAttachmentIds,
            errorMessage:
              error instanceof Error ? error.message : String(error),
          });
        }
        failStream(
          classifyStreamError(
            error instanceof Error ? error.message : String(error),
          ),
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
