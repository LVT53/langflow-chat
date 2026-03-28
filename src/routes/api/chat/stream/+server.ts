import type { RequestHandler } from "@sveltejs/kit";
import { requireAuth } from "$lib/server/auth/hooks";
import { touchConversation } from "$lib/server/services/conversations";
import { sendMessageStream } from "$lib/server/services/langflow";
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
  URL_LIST_TOOL_RECOVERY_APPENDIX,
  type StreamErrorCode,
  classifyStreamError,
  createServerChunkRuntime,
  createEventStreamResponse,
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

const STREAM_TIMEOUT_MS = 120_000;

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
      const outputTranslator = shouldTranslateHungarian(turn)
        ? new StreamingHungarianTranslator()
        : null;
      let closed = false;
      let ended = false;
      let lastAssistantSnapshot = "";
      let emittedAssistantText = "";

      const closeStream = () => {
        if (closed) return;
        closed = true;
        downstreamAbortSignal.removeEventListener("abort", closeStream);
        // Do NOT abort upstream on client disconnect — let generation complete and persist to DB.
        // The client reloads persisted messages on visibility restore (mobile background fix).
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

      downstreamAbortSignal.addEventListener("abort", closeStream, {
        once: true,
      });

      const enqueueChunk = (chunk: string): boolean => {
        if (closed) return false;

        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          closed = true;
          // Do NOT abort upstream on client disconnect — let generation complete and persist to DB.
          // The client reloads persisted messages on visibility restore (mobile background fix).
          return false;
        }
      };

      const chunkRuntime = createServerChunkRuntime({ enqueueChunk });
      const emitThinking = chunkRuntime.emitThinking;
      const emitToolCallEvent = chunkRuntime.emitToolCallEvent;
      const emitInlineToken = chunkRuntime.emitInlineToken;
      const emitChunkWithPreserveHandling =
        chunkRuntime.emitChunkWithPreserveHandling;
      const flushPendingThinking = chunkRuntime.flushPendingThinking;
      const flushInlineThinkingBuffer = chunkRuntime.flushInlineThinkingBuffer;
      const flushPreserveBuffer = chunkRuntime.flushPreserveBuffer;

      const emitError = (code: StreamErrorCode) =>
        enqueueChunk(streamErrorEvent(code));
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
        console.log(
          "[STREAM] End - thinkingTokenCount:",
          thinkingTokenCount,
          "responseTokenCount:",
          responseTokenCount,
          "totalTokenCount:",
          totalTokenCount,
          "thinkingLength:",
          chunkRuntime.thinkingContent.length,
          "wasStopped:",
          wasStopped,
        );
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
            })}\n\n`,
          );
          touchConversation(user.id, conversationId).catch(() => undefined);
          closeStream();
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
        if (ended || closed) return;
        ended = true;
        emitError(code);
        closeStream();
      };

      const timeoutId = setTimeout(() => {
        failStream("timeout");
      }, STREAM_TIMEOUT_MS);

      try {
        let usedUrlListRecovery = false;

        upstreamAttempt: for (let attempt = 1; attempt <= 2; attempt += 1) {
          console.log("[STREAM] Starting upstream request", {
            userId: user.id,
            conversationId,
            sourceLanguage,
            normalizedMessageLength: normalizedMessage.length,
            upstreamMessageLength: upstreamMessage.length,
            modelId,
            attempt,
            urlListRecovery: usedUrlListRecovery,
          });
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
          );
          const langflowStream =
            langflowResponse instanceof ReadableStream
              ? langflowResponse
              : langflowResponse.stream;
          latestContextStatus =
            langflowResponse instanceof ReadableStream
              ? undefined
              : langflowResponse.contextStatus;
          initialContextStatus = latestContextStatus;
          latestTaskState =
            langflowResponse instanceof ReadableStream
              ? await getConversationTaskState(user.id, conversationId).catch(
                  () => null,
                )
              : (langflowResponse.taskState ??
                (await getConversationTaskState(user.id, conversationId).catch(
                  () => null,
                )));
          latestTaskState = await attachContinuityToTaskState(
            user.id,
            latestTaskState ?? null,
          ).catch(() => latestTaskState ?? null);
          initialTaskState = latestTaskState;
          latestContextDebug =
            langflowResponse instanceof ReadableStream
              ? await getContextDebugState(user.id, conversationId).catch(
                  () => null,
                )
              : (langflowResponse.contextDebug ??
                (await getContextDebugState(user.id, conversationId).catch(
                  () => null,
                )));
          initialContextDebug = latestContextDebug;
          console.log("[STREAM] Upstream stream connected", { conversationId });
          if (closed) return;
          let upstreamEventCount = 0;

          for await (const upstreamEvent of parseUpstreamEvents(
            langflowStream,
          )) {
            if (closed) break;

            const { event: eventType, data } = upstreamEvent;
            upstreamEventCount += 1;
            if (upstreamEventCount <= 20 || eventType === "error") {
              const dataPreview =
                typeof data === "string"
                  ? data.slice(0, 500)
                  : JSON.stringify(data).slice(0, 500);
              console.log("[STREAM] Upstream event", {
                index: upstreamEventCount,
                eventType,
                dataPreview,
              });
            }
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
              console.log(
                "[STREAM] Thinking chunk extracted:",
                reasoningChunk.slice(0, 100),
              );
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
                console.log("[STREAM] Suppressing duplicate final chunk", {
                  chunkLength: chunk.length,
                });
                continue;
              }
            }

            // Strip tool call markers, emitting structured tool_call SSE events
            const cleanedChunk = processToolCallMarkers(
              chunk,
              emitToolCallEvent,
            );

            console.log("[STREAM] Token chunk, length:", cleanedChunk.length);

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
        if (!closed) {
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
        }
      } finally {
        clearTimeout(timeoutId);
        cancelStream = () => undefined;
      }
    },
    cancel() {
      cancelStream();
    },
  });

  return createEventStreamResponse(stream);
};
