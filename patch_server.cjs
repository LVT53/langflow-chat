const fs = require('fs');
const content = fs.readFileSync('src/routes/api/chat/stream/+server.ts', 'utf-8');

// Find where chunkRuntime is created
const chunkRuntimeStart = content.indexOf('      const chunkRuntime = createServerChunkRuntime({ enqueueChunk });');

// Find where emitChunkWithPreserveHandling is defined
const blockEnd = content.indexOf('      const emitChunkWithPreserveHandling =');

const replaceString = `      const chunkRuntime = createServerChunkRuntime({
        enqueueChunk,
        onToken: (chunk) => {
          if (streamId) appendToStreamBuffer(streamId, 'token', { text: chunk });
        },
        onThinking: (reasoning) => {
          if (streamId) appendToStreamBuffer(streamId, 'thinking', { text: reasoning });
        },
        onToolCall: (name, input, status, outputSummary) => {
          if (streamId) {
            appendToStreamBuffer(streamId, 'tool_call', {
              name,
              input,
              status,
              outputSummary,
            });
          }
        }
      });
      const emitThinking = chunkRuntime.emitThinking;
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
        chunkRuntime.emitToolCallEvent(name, input, status, details);
      };
      const emitInlineToken = chunkRuntime.emitInlineToken;
`;

const newContent = content.slice(0, chunkRuntimeStart) + replaceString + content.slice(blockEnd);

fs.writeFileSync('src/routes/api/chat/stream/+server.ts', newContent);
console.log('Patched');
