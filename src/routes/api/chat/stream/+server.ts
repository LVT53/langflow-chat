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
  registerActiveChatStream,
  unregisterActiveChatStream,
  wasActiveChatStreamStopRequested,
} from "$lib/server/services/chat-turn/active-streams";
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
import { getChatFiles } from "$lib/server/services/chat-files";

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

  const parsedRequest = await parseChatTurnRequest(
    event.request,
    runtimeConfig,
    "stream",
  );
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
  const conversationId = turn.conversationId;
  const normalizedMessage = turn.normalizedMessage;
  const streamId = turn.streamId;
  const modelId = turn.modelId;
  const modelDisplayName = turn.modelDisplayName;
  const skipPersistUserMessage = turn.skipPersistUserMessage;
  const safeAttachmentIds = turn.attachmentIds;
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
        if (downstreamClosed) return true;

        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Do NOT abort upstream on client disconnect — let generation complete and persist to DB.
          // The client reloads persisted messages on visibility restore (mobile background fix).
          closeDownstream();
        }

        return true;
      };

      const chunkRuntime = createServerChunkRuntime({ enqueueChunk });
      const emitThinking = chunkRuntime.emitThinking;
      const emitToolCallEvent = chunkRuntime.emitToolCallEvent;
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
          const code = typeof input.code === "string" ? input.code : null;
          console.info("[CHAT_STREAM] File-generation tool event", {
            conversationId,
            streamId,
            status,
            filename:
              typeof input.filename === "string" && input.filename.trim()
                ? input.filename
                : null,
            codeLength: code?.length ?? 0,
            writesToOutput: code?.includes("/output") ?? false,
            outputSummary: details?.outputSummary ?? null,
          });
        }

        emitToolCallEvent(name, input, status, details);
      };
      const emitInlineToken = chunkRuntime.emitInlineToken;
      const emitChunkWithPreserveHandling =
        chunkRuntime.emitChunkWithPreserveHandling;
      const flushPendingThinking = chunkRuntime.flushPendingThinking;
      const flushInlineThinkingBuffer = chunkRuntime.flushInlineThinkingBuffer;
      const flushPreserveBuffer = chunkRuntime.flushPreserveBuffer;
      const heartbeatIntervalId = setInterval(() => {
        enqueueChunk(createSseHeartbeatComment());
      }, 15000);

      enqueueChunk(createSsePreludeComment());

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
        if (ended) return; // Do not check `closed` — client may have disconnected but we still persist to DB
        ended = true;
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

        const userMsgPromise = persistUserMessage
          ? createMessage(conversationId, "user", normalizedMessage).catch(
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
          // Fetch generated files for this conversation
          let generatedFiles: import("$lib/types").ChatGeneratedFile[] = [];
          try {
            generatedFiles = await getChatFiles(conversationId);
            console.info("[CHAT_STREAM] Prepared generated files for end event", {
              conversationId,
              streamId,
              userMessageId: userMsgId ?? null,
              assistantMessageId: assistantMsgId ?? null,
              wasStopped,
              count: generatedFiles.length,
              files: generatedFiles.map((file) => ({
                id: file.id,
                filename: file.filename,
                sizeBytes: file.sizeBytes,
                mimeType: file.mimeType,
              })),
            });
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
              userId: user.id,
              attachmentIds: safeAttachmentIds,
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
              user.id,
              {
                signal: upstreamAbortController.signal,
                attachmentIds: safeAttachmentIds,
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
