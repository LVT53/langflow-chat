# Shared Services — Cross-Cutting Utilities

Client/server shared utilities and protocol definitions. These span both environments.

## Structure

```
streaming.ts         - Browser stream transport (SSE parsing, token handling, abort/stop)
stream-protocol.ts   - Shared stream tag parsing (thinking, tool_calls, preserve chunks)
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

## Stream Protocol Tags

| Tag | Purpose |
|-----|---------|
| `<thinking>...</thinking>` | Model thinking content |
| `<tool_calls>...</tool_calls>` | Tool invocation markers |
| `<preserve>...</preserve>` | Translation-preserved display content |
| `[CONTEXT]`, `[MEMORY]`, `[KNOWLEDGE]` | Debug/observability tags |

## Conventions

- **Lazy init for Shiki**: `markdown.ts` init is async; always check `initHighlighter()` before rendering
- **Stream abort vs stop**: `streaming.ts` distinguishes user-requested stop from passive navigation/unmount detach
- **No duplicate parsing**: `stream-protocol.ts` owns tag parsing; do not replicate inline thinking extraction elsewhere
- **Type-safe SSE**: Use `StreamMetadata` type for end-of-stream event payload

## Anti-Patterns

- **Don't inline thinking parsing** in routes or chat components — use `stream-protocol.ts` helpers
- **Don't collapse stop and detach** into one generic abort — they have different server semantics
- **Don't eager-import heavy deps** like Shiki — lazy-load through the markdown pipeline