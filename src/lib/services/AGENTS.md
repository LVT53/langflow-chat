# Shared Services — Cross-Cutting Utilities

Client/server shared utilities and protocol definitions. These span both environments.

## Structure

```
streaming.ts         - Browser stream transport (SSE parsing, token/thinking/tool_call/end handling, abort/stop)
stream-protocol.ts   - Shared stream text normalization (thinking tags, provider content extraction, leading output/tool diagnostic cleanup)
markdown.ts          - Markdown rendering with Shiki highlighting (lazy init)
table-layout.ts      - Markdown table rendering
```

## WHERE TO LOOK

| Task | File |
|------|------|
| Browser SSE transport | `streaming.ts` |
| Stream tag parsing | `stream-protocol.ts` |
| Markdown with highlighting | `markdown.ts` |
| Markdown table rendering | `table-layout.ts` |

## Stream Text Normalization

| Shape | Purpose |
|-------|---------|
| `<thinking>`, `<think>`, ChatML thinking/analysis, `[THINK]` | Inline model thinking delimiters normalized into thinking vs visible output |
| Provider payload text/content fields | Extract assistant text from OpenAI-style choices, Langflow payloads, content parts, and content blocks |
| Leading `response` markers and leaked web-research diagnostics | Strip provider/tool artifacts from visible assistant output |
| `tool_call` SSE events | Browser-facing structured tool-call updates emitted by `chat-turn/tool-call-markers.ts`; do not introduce textual `<tool_calls>` as a new protocol |
| `[CONTEXT]`, `[MEMORY]`, `[KNOWLEDGE]` | Log prefixes only, not stream payload syntax |

## Conventions

- **Lazy init for Shiki**: `markdown.ts` init is async; always check `initHighlighter()` before rendering
- **Stream abort vs stop**: `streaming.ts` distinguishes user-requested stop from passive navigation/unmount detach
- **No duplicate parsing**: `stream-protocol.ts` owns tag parsing; do not replicate inline thinking extraction elsewhere
- **Type-safe SSE**: Use `StreamMetadata` type for end-of-stream event payload

## Anti-Patterns

- **Don't inline thinking parsing** in routes or chat components — use `stream-protocol.ts` helpers
- **Don't collapse stop and detach** into one generic abort — they have different server semantics
- **Don't eager-import heavy deps** like Shiki — lazy-load through the markdown pipeline
