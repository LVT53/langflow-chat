import type {
  EvidenceSourceType,
  ToolCallEntry,
  ToolEvidenceCandidate,
} from "$lib/types";
import {
  createInlineThinkingState,
  flushInlineThinkingState,
  getPartialTagPrefixLength,
  processInlineThinkingChunk,
} from "$lib/services/stream-protocol";
import type { ChatTurnRequestError } from "./types";

const JSON_HEADERS = { "Content-Type": "application/json" };
const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

const TOOL_CALL_START_RE = /\x02TOOL_START\x1f([^\x03]*)\x03/g;
const TOOL_CALL_END_RE = /\x02TOOL_END\x1f([^\x03]*)\x03/g;
const PRESERVE_TAG_RE = /<\/?preserve>/gi;
const THINKING_BLOCK_RE = /<thinking>[\s\S]*?<\/thinking>|<think>[\s\S]*?<\/think>/gi;
const THINKING_TAG_RE = /<\/?thinking>|<\/?think>/gi;

const FRIENDLY_STREAM_ERRORS = {
  timeout: "The response is taking too long. Please try again.",
  network:
    "We could not reach the chat service. Check your connection and try again.",
  backend_failure:
    "We hit a temporary issue generating a response. Please try again.",
} as const;

export type StreamErrorCode = keyof typeof FRIENDLY_STREAM_ERRORS;

export type StreamToolCallDetails = {
  outputSummary?: string | null;
  sourceType?: EvidenceSourceType | null;
  candidates?: ToolEvidenceCandidate[];
};

type UpstreamEvent = {
  event: string;
  data: unknown;
};

type StreamToolCallPayload = {
  name?: string;
  input?: Record<string, unknown>;
  outputSummary?: string;
  sourceType?: string;
  candidates?: unknown;
};

export type ServerStreamSegment =
  | { type: "text"; content: string }
  | {
      type: "tool_call";
      name: string;
      input: Record<string, unknown>;
      status: "running" | "done";
      outputSummary?: string | null;
      sourceType?: EvidenceSourceType | null;
      candidates?: ToolEvidenceCandidate[];
    };

export const URL_LIST_TOOL_RECOVERY_APPENDIX = [
  "Important retry guard for URL-processing tools:",
  "- If a tool uses a field named `urls`, it must be a JSON array of strings.",
  '- Even for one link, pass `["https://example.com"]`, never a bare string.',
].join("\n");

export function createStreamJsonErrorResponse(
  error: ChatTurnRequestError,
): Response {
  return new Response(JSON.stringify(stripUndefined(error)), {
    status: error.status,
    headers: JSON_HEADERS,
  });
}

export function createEventStreamResponse(stream: ReadableStream): Response {
  return new Response(stream, { headers: SSE_HEADERS });
}

export function createServerChunkRuntime({
  enqueueChunk,
  thinkingBatchMin = 80,
}: {
  enqueueChunk: (chunk: string) => boolean;
  thinkingBatchMin?: number;
}) {
  let fullResponse = "";
  let thinkingContent = "";
  const inlineThinkingState = createInlineThinkingState();
  let preserveBuffer = "";
  let insidePreserve = false;
  const serverSegments: ServerStreamSegment[] = [];
  const toolCallRecords: ToolCallEntry[] = [];
  let pendingThinkingBuffer = "";

  const flushPendingThinking = (): boolean => {
    if (!pendingThinkingBuffer) return true;
    const chunk = pendingThinkingBuffer;
    pendingThinkingBuffer = "";
    thinkingContent += chunk;
    const lastSegment = serverSegments[serverSegments.length - 1];
    if (lastSegment?.type === "text") {
      lastSegment.content += chunk;
    } else {
      serverSegments.push({ type: "text", content: chunk });
    }
    return enqueueChunk(
      `event: thinking\ndata: ${JSON.stringify({ text: chunk })}\n\n`,
    );
  };

  const emitThinking = (reasoning: string) => {
    if (!reasoning) return true;
    pendingThinkingBuffer += reasoning;
    if (pendingThinkingBuffer.length >= thinkingBatchMin) {
      return flushPendingThinking();
    }
    return true;
  };

  const emitVisibleToken = (chunk: string) => {
    if (!chunk) {
      return true;
    }

    fullResponse += chunk;
    return enqueueChunk(
      `event: token\ndata: ${JSON.stringify({ text: chunk })}\n\n`,
    );
  };

  const emitToolCallEvent = (
    name: string,
    input: Record<string, unknown>,
    status: "running" | "done",
    details?: StreamToolCallDetails,
  ) => {
    flushPendingThinking();
    enqueueChunk(
      `event: tool_call\ndata: ${JSON.stringify({
        name,
        input,
        status,
        outputSummary: details?.outputSummary,
        sourceType: details?.sourceType,
        candidates: details?.candidates,
      })}\n\n`,
    );

    if (status === "running") {
      serverSegments.push({
        type: "tool_call",
        name,
        input,
        status: "running",
      });
      toolCallRecords.push({ name, input, status: "running" });
      return;
    }

    for (let i = serverSegments.length - 1; i >= 0; i--) {
      const segment = serverSegments[i];
      if (
        segment.type === "tool_call" &&
        segment.name === name &&
        segment.status === "running"
      ) {
        segment.status = "done";
        segment.outputSummary = details?.outputSummary ?? null;
        segment.sourceType = details?.sourceType ?? null;
        segment.candidates = details?.candidates;
        break;
      }
    }

    for (let i = toolCallRecords.length - 1; i >= 0; i--) {
      const toolRecord = toolCallRecords[i];
      if (toolRecord.name === name && toolRecord.status === "running") {
        toolCallRecords[i] = {
          ...toolRecord,
          status: "done",
          outputSummary: details?.outputSummary ?? null,
          sourceType: details?.sourceType ?? null,
          candidates: details?.candidates,
        };
        break;
      }
    }
  };

  const emitInlineToken = (chunk: string) => {
    return processInlineThinkingChunk(inlineThinkingState, chunk, {
      onVisible: emitVisibleToken,
      onThinking: emitThinking,
    });
  };

  const flushInlineThinkingBuffer = () => {
    return flushInlineThinkingState(inlineThinkingState, {
      onVisible: emitVisibleToken,
      onThinking: emitThinking,
    });
  };

  const PRESERVE_OPEN_TAG = "<preserve>";
  const PRESERVE_CLOSE_TAG = "</preserve>";

  const emitChunkWithPreserveHandling = (chunk: string): boolean => {
    if (!chunk) {
      return true;
    }

    preserveBuffer += chunk;

    while (preserveBuffer) {
      if (insidePreserve) {
        const closeIndex = preserveBuffer.indexOf(PRESERVE_CLOSE_TAG);
        if (closeIndex !== -1) {
          const content = preserveBuffer.slice(0, closeIndex);
          if (!emitInlineToken(content)) {
            return false;
          }
          preserveBuffer = preserveBuffer.slice(
            closeIndex + PRESERVE_CLOSE_TAG.length,
          );
          insidePreserve = false;
          continue;
        }

        const partialCloseLength = getPartialTagPrefixLength(
          preserveBuffer,
          PRESERVE_CLOSE_TAG,
        );
        if (partialCloseLength > 0) {
          break;
        }
        break;
      }

      const openIndex = preserveBuffer.indexOf(PRESERVE_OPEN_TAG);
      if (openIndex !== -1) {
        const visibleChunk = preserveBuffer.slice(0, openIndex);
        if (visibleChunk && !emitInlineToken(visibleChunk)) {
          return false;
        }
        preserveBuffer = preserveBuffer.slice(
          openIndex + PRESERVE_OPEN_TAG.length,
        );
        insidePreserve = true;
        continue;
      }

      const partialOpenLength = getPartialTagPrefixLength(
        preserveBuffer,
        PRESERVE_OPEN_TAG,
      );
      const flushLength = preserveBuffer.length - partialOpenLength;
      if (flushLength > 0) {
        const visibleChunk = preserveBuffer.slice(0, flushLength);
        if (!emitInlineToken(visibleChunk)) {
          return false;
        }
        preserveBuffer = preserveBuffer.slice(flushLength);
      }
      break;
    }

    return true;
  };

  const flushPreserveBuffer = (): boolean => {
    if (!preserveBuffer) {
      return true;
    }

    const remainder = preserveBuffer;
    preserveBuffer = "";

    if (insidePreserve) {
      insidePreserve = false;
      return emitInlineToken(remainder);
    }

    const isPartialOpenTag = PRESERVE_OPEN_TAG.startsWith(remainder);
    if (isPartialOpenTag) return true;

    return emitInlineToken(remainder);
  };

  return {
    emitChunkWithPreserveHandling,
    emitInlineToken,
    emitThinking,
    emitToolCallEvent,
    flushInlineThinkingBuffer,
    flushPendingThinking,
    flushPreserveBuffer,
    get fullResponse() {
      return fullResponse;
    },
    get thinkingContent() {
      return thinkingContent;
    },
    get serverSegments() {
      return serverSegments;
    },
    get toolCallRecords() {
      return toolCallRecords;
    },
  };
}

export function normalizeVisibleAssistantText(value: string): string {
  return value
    .replace(THINKING_BLOCK_RE, "")
    .replace(THINKING_TAG_RE, "")
    .replace(PRESERVE_TAG_RE, "")
    .trim();
}

export function processToolCallMarkers(
  chunk: string,
  emit: (
    name: string,
    input: Record<string, unknown>,
    status: "running" | "done",
    details?: StreamToolCallDetails,
  ) => void,
): string {
  if (
    chunk.includes("\x02") ||
    chunk.includes("TOOL_START") ||
    chunk.includes("TOOL_END")
  ) {
    console.log(
      "[TOOL_MARKER] Marker detected in chunk:",
      JSON.stringify(chunk).slice(0, 300),
    );
  }

  let result = chunk;

  result = result.replace(TOOL_CALL_START_RE, (_, payload) => {
    console.log(
      "[TOOL_MARKER] TOOL_START matched, payload:",
      payload.slice(0, 200),
    );
    try {
      const parsed = JSON.parse(payload) as StreamToolCallPayload;
      emit(parsed.name ?? "tool", parsed.input ?? {}, "running");
    } catch {
      emit("tool", {}, "running");
    }
    return "";
  });

  result = result.replace(TOOL_CALL_END_RE, (_, payload) => {
    console.log(
      "[TOOL_MARKER] TOOL_END matched, payload:",
      payload.slice(0, 200),
    );
    try {
      const parsed = JSON.parse(payload) as StreamToolCallPayload;
      emit(parsed.name ?? "tool", {}, "done", {
        outputSummary:
          typeof parsed.outputSummary === "string"
            ? parsed.outputSummary
            : null,
        sourceType:
          parsed.sourceType === "web" ||
          parsed.sourceType === "tool" ||
          parsed.sourceType === "document" ||
          parsed.sourceType === "memory"
            ? parsed.sourceType
            : null,
        candidates: normalizeToolCandidates(parsed.candidates),
      });
    } catch {
      emit("tool", {}, "done");
    }
    return "";
  });

  return result;
}

export function classifyStreamError(rawMessage: string): StreamErrorCode {
  const message = rawMessage.toLowerCase();

  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("abort")
  ) {
    return "timeout";
  }

  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("econn") ||
    message.includes("enotfound") ||
    message.includes("socket") ||
    message.includes("connection")
  ) {
    return "network";
  }

  return "backend_failure";
}

export function isAbruptUpstreamTermination(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const cause =
    "cause" in error ? (error as Error & { cause?: unknown }).cause : undefined;
  const causeCode =
    cause && typeof cause === "object" && "code" in cause
      ? (cause as { code?: unknown }).code
      : undefined;

  return (
    message.includes("terminated") ||
    message.includes("socket") ||
    causeCode === "UND_ERR_SOCKET"
  );
}

export function streamErrorEvent(code: StreamErrorCode): string {
  return `event: error\ndata: ${JSON.stringify({ code, message: FRIENDLY_STREAM_ERRORS[code] })}\n\n`;
}

export async function* parseUpstreamEvents(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<UpstreamEvent, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        const finalBlock = buffer.trim();
        if (finalBlock) {
          const event = parseEventBlock(finalBlock);
          if (event) {
            yield event;
            return;
          }
        }
        throw error;
      }

      const { done, value } = chunk;
      if (done) break;
      if (!value) continue;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      if (buffer.includes("event:") || buffer.includes("data:")) {
        let separatorIndex = buffer.indexOf("\n\n");
        while (separatorIndex !== -1) {
          const block = buffer.slice(0, separatorIndex).trim();
          buffer = buffer.slice(separatorIndex + 2);

          if (block) {
            const event = parseEventBlock(block);
            if (event) {
              yield event;
            }
          }

          separatorIndex = buffer.indexOf("\n\n");
        }
        continue;
      }

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line) {
          const event = parseJsonBlock(line);
          if (event) {
            yield event;
          } else {
            buffer = `${line}\n${buffer}`;
            break;
          }
        }

        newlineIndex = buffer.indexOf("\n");
      }
    }

    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    const finalBlock = buffer.trim();
    if (finalBlock) {
      const event = parseEventBlock(finalBlock);
      if (event) {
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function getReasoningContent(value: unknown): string | null {
  const payload = getNestedObject(value);
  if (!payload) return null;

  const choice = getFirstChoice(payload);
  if (choice) {
    for (const key of ["delta", "message"]) {
      if (key in choice) {
        const nestedReasoning = getReasoningContent(choice[key]);
        if (nestedReasoning) {
          return nestedReasoning;
        }
      }
    }
  }

  if (typeof payload.reasoning === "string" && payload.reasoning.trim()) {
    return payload.reasoning.trim();
  }

  if (
    typeof payload.reasoning_content === "string" &&
    payload.reasoning_content.trim()
  ) {
    return payload.reasoning_content.trim();
  }

  if (typeof payload.thinking === "string" && payload.thinking.trim()) {
    return payload.thinking.trim();
  }

  if ("data" in payload) {
    return getReasoningContent(payload.data);
  }

  return null;
}

export function extractAssistantChunk(
  eventType: string,
  rawData: unknown,
): string {
  const data = parseMaybeJson(rawData);
  const sender = getSender(data);
  const normalizedSender = sender ? normalizeSender(sender) : null;

  if (normalizedSender && ["user", "human"].includes(normalizedSender)) {
    return "";
  }

  if (
    normalizedSender &&
    ![
      "assistant",
      "ai",
      "machine",
      "model",
      "language model",
      "agent",
      "bot",
    ].includes(normalizedSender) &&
    eventType !== "token"
  ) {
    return "";
  }

  return getTextContent(data);
}

export function toIncrementalChunk(
  eventType: string,
  chunk: string,
  lastSnapshot: string,
  emittedText: string,
): {
  chunk: string;
  lastSnapshot: string;
  emittedText: string;
} {
  if (eventType === "token") {
    return {
      chunk,
      lastSnapshot,
      emittedText: emittedText + chunk,
    };
  }

  if (!chunk) {
    return {
      chunk: "",
      lastSnapshot,
      emittedText,
    };
  }

  if (emittedText) {
    if (chunk === emittedText) {
      return {
        chunk: "",
        lastSnapshot: chunk,
        emittedText,
      };
    }

    if (chunk.startsWith(emittedText)) {
      const delta = chunk.slice(emittedText.length);
      return {
        chunk: delta,
        lastSnapshot: chunk,
        emittedText: emittedText + delta,
      };
    }

    if (emittedText.startsWith(chunk)) {
      return {
        chunk: "",
        lastSnapshot: chunk,
        emittedText,
      };
    }
  }

  if (!lastSnapshot) {
    return {
      chunk,
      lastSnapshot: chunk,
      emittedText: emittedText + chunk,
    };
  }

  if (chunk === lastSnapshot) {
    return {
      chunk: "",
      lastSnapshot,
      emittedText,
    };
  }

  if (chunk.startsWith(lastSnapshot)) {
    const delta = chunk.slice(lastSnapshot.length);
    return {
      chunk: delta,
      lastSnapshot: chunk,
      emittedText: emittedText + delta,
    };
  }

  if (lastSnapshot.startsWith(chunk)) {
    return {
      chunk: "",
      lastSnapshot,
      emittedText,
    };
  }

  return {
    chunk,
    lastSnapshot: chunk,
    emittedText: emittedText + chunk,
  };
}

export function extractErrorMessage(rawData: unknown): string {
  const data = parseMaybeJson(rawData);

  if (typeof data === "string") return data;

  const payload = getNestedObject(data);
  if (!payload) return "Streaming failed";

  if (typeof payload.message === "string") return payload.message;
  if (typeof payload.error === "string") return payload.error;
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.detail === "string") return payload.detail;
  if (typeof payload.reason === "string") return payload.reason;
  if ("data" in payload) return extractErrorMessage(payload.data);

  return "Streaming failed";
}

export function isUrlListValidationError(rawMessage: string): boolean {
  const message = rawMessage.toLowerCase();
  return (
    message.includes("validation error") &&
    message.includes("urls") &&
    (message.includes("valid list") || message.includes("type=list_type"))
  );
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

function normalizeToolCandidates(value: unknown): ToolEvidenceCandidate[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((candidate, index) => {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        Array.isArray(candidate)
      )
        return null;
      const record = candidate as Record<string, unknown>;
      const id =
        typeof record.id === "string" && record.id.trim()
          ? record.id
          : `candidate-${index}`;
      const title =
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim()
          : typeof record.url === "string"
            ? record.url
            : null;
      if (!title) return null;
      return {
        id,
        title,
        url: typeof record.url === "string" ? record.url : null,
        snippet: typeof record.snippet === "string" ? record.snippet : null,
        sourceType:
          record.sourceType === "web" ||
          record.sourceType === "tool" ||
          record.sourceType === "document" ||
          record.sourceType === "memory"
            ? record.sourceType
            : "tool",
      } as ToolEvidenceCandidate;
    })
    .filter((candidate): candidate is ToolEvidenceCandidate =>
      Boolean(candidate),
    );
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseSseBlock(block: string): UpstreamEvent | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const rawLine of block.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) continue;

    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim() || "message";
      continue;
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0 && event === "message") {
    return null;
  }

  return {
    event,
    data: parseMaybeJson(dataLines.join("\n")),
  };
}

function parseJsonBlock(block: string): UpstreamEvent | null {
  try {
    const parsed = JSON.parse(block) as { event?: unknown; data?: unknown };
    return {
      event: typeof parsed.event === "string" ? parsed.event : "message",
      data: parsed.data,
    };
  } catch {
    return null;
  }
}

function parseEventBlock(block: string): UpstreamEvent | null {
  return block.includes("event:") || block.includes("data:")
    ? parseSseBlock(block)
    : parseJsonBlock(block);
}

function getNestedObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function getFirstChoice(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  if (
    !payload ||
    !Array.isArray(payload.choices) ||
    payload.choices.length === 0
  ) {
    return null;
  }

  const [firstChoice] = payload.choices;
  return getNestedObject(firstChoice);
}

function getSender(value: unknown): string | null {
  const payload = getNestedObject(value);
  if (!payload) return null;

  const sender =
    typeof payload.sender === "string"
      ? payload.sender
      : typeof payload.sender_name === "string"
        ? payload.sender_name
        : null;
  if (sender) {
    return sender.toLowerCase();
  }

  if ("data" in payload) {
    return getSender(payload.data);
  }

  return null;
}

function normalizeSender(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, " ").trim();
}

function getTextFromContentBlocks(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  const prioritized: Array<{ text: string; priority: number }> = [];

  for (const block of value) {
    const blockRecord = getNestedObject(block);
    if (!blockRecord || !Array.isArray(blockRecord.contents)) {
      continue;
    }

    for (const content of blockRecord.contents) {
      const contentRecord = getNestedObject(content);
      if (!contentRecord) {
        continue;
      }

      const text =
        typeof contentRecord.text === "string" ? contentRecord.text.trim() : "";
      if (!text) {
        continue;
      }

      const header = getNestedObject(contentRecord.header);
      const headerTitle =
        typeof header?.title === "string"
          ? header.title.toLowerCase().trim()
          : "";

      if (headerTitle.includes("input")) {
        continue;
      }

      const priority =
        headerTitle.includes("output") ||
        headerTitle.includes("answer") ||
        headerTitle.includes("response")
          ? 2
          : 1;

      prioritized.push({ text, priority });
    }
  }

  if (prioritized.length === 0) {
    return "";
  }

  const highestPriority = prioritized.reduce(
    (best, entry) => Math.max(best, entry.priority),
    0,
  );

  return prioritized
    .filter((entry) => entry.priority === highestPriority)
    .map((entry) => entry.text)
    .join("\n")
    .trim();
}

function getTextContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  const payload = getNestedObject(value);
  if (!payload) return "";

  const choice = getFirstChoice(payload);
  if (choice) {
    for (const key of ["delta", "message"]) {
      if (key in choice) {
        const nestedContent = getTextContent(choice[key]);
        if (nestedContent) {
          return nestedContent;
        }
      }
    }
  }

  for (const key of ["text", "chunk", "content"]) {
    const candidate = payload[key];
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  if ("content_blocks" in payload) {
    const contentBlocksText = getTextFromContentBlocks(payload.content_blocks);
    if (contentBlocksText) {
      return contentBlocksText;
    }
  }

  if ("data" in payload) {
    return getTextContent(payload.data);
  }

  return "";
}
