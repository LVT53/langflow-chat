# Chat-Turn Pipeline

## OVERVIEW

Request parsing through post-turn persistence for chat send/stream endpoints. All turn logic lives here; routes stay thin.

## STRUCTURE

```
```
request.ts → preflight.ts → [non-stream: execute.ts utilities | stream: stream-orchestrator.ts] → finalize.ts
                                 │
                          active-streams.ts (lifecycle)
                                 │
                          retry-cleanup.ts (failure cleanup)
```

## WHERE TO LOOK

| Task | File |
|------|------|
| Parse body, model, attachments | `request.ts` |
| Validate conversation, check attachment readiness | `preflight.ts` |
| Non-stream text normalization, upstream message building | `execute.ts` |
| SSE orchestration, upstream retry, downstream framing | `stream-orchestrator.ts` |
| Post-turn persistence fan-out (messages, honcho, task-state, knowledge) | `finalize.ts` |
| Stream lifecycle, explicit stop handling | `active-streams.ts` |
| Idempotent cleanup on turn failure | `retry-cleanup.ts` |
| Shared types | `types.ts` |

## CONVENTIONS

- `stream-orchestrator.ts` owns all upstream event parsing: Langflow SSE → tokens, thinking tags, tool_calls. Keep SSE framing logic there, not in routes.
- `finalize.ts` is the single fan-out point after any turn (stream or non-stream). Add new post-turn side effects there, not in route files.
- `execute.ts` normalizes non-stream assistant text through the same stream-protocol helpers so `/send` returns the same visible content shape as `/stream`.
- `retry-cleanup.ts` runs idempotent cleanup for evidence links, checkpoints, work capsules, generated outputs, and the assistant message itself on failure.
- Routes import from this pipeline; they do not duplicate turn logic.

## ANTI-PATTERNS

- Do not duplicate SSE parsing, tool-call handling, or thinking extraction between `stream.ts` and route files.
- Do not add post-turn persistence directly in `/api/chat/send` or `/api/chat/stream`; route through `finalize.ts`.
- Do not collapse user-requested stop and passive disconnect into one generic abort. Use `active-streams.ts` for explicit stops; let navigation/unmount detach locally without marking the turn stopped.
- Do not inline new persistence side effects inside `stream.ts` closures that only one endpoint can see.
