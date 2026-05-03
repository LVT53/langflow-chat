# Chat-Turn Pipeline

## OVERVIEW

Request parsing through post-turn persistence for chat send/stream endpoints. All turn logic lives here; routes stay thin.

## STRUCTURE

```
request.ts → preflight.ts → [send route | stream-orchestrator.ts] → finalize.ts
                              │                  │
                              └────────┬─────────┘
                                       ▼
                                normalizer.ts

stream-orchestrator.ts → active-streams.ts (lifecycle)
failures → retry-cleanup.ts
```

## WHERE TO LOOK

| Task | File |
|------|------|
| Parse body, model, attachments | `request.ts` |
| Validate conversation, check attachment readiness | `preflight.ts` |
| Assistant output normalization | `normalizer.ts` |
| SSE orchestration, upstream retry, downstream framing | `stream-orchestrator.ts` |
| Post-turn persistence fan-out (messages, honcho, task-state, knowledge) | `finalize.ts` |
| Stream lifecycle, explicit stop handling | `active-streams.ts` |
| Idempotent cleanup on turn failure | `retry-cleanup.ts` |
| Shared types | `types.ts` |

## CONVENTIONS

- `stream-orchestrator.ts` owns all upstream event parsing: Langflow SSE → tokens, thinking tags, and structured tool-call markers. Keep SSE framing logic there, not in routes.
- `finalize.ts` is the single fan-out point after any turn (stream or non-stream). Add new post-turn side effects there, not in route files.
- `normalizer.ts` normalizes assistant text through the same stream-protocol helpers so `/send`, `/stream`, retry, and title generation return the same visible content shape.
- `retry-cleanup.ts` runs idempotent cleanup for evidence links, checkpoints, work capsules, generated outputs, and the assistant message itself on failure.
- Routes import from this pipeline; they do not duplicate turn logic.

## ANTI-PATTERNS

- Do not duplicate SSE parsing, tool-call handling, or thinking extraction between `stream-orchestrator.ts` / `stream.ts` helpers and route files.
- Do not add post-turn persistence directly in `/api/chat/send` or `/api/chat/stream`; route through `finalize.ts`.
- Do not collapse user-requested stop and passive disconnect into one generic abort. Use `active-streams.ts` for explicit stops; let navigation/unmount detach locally without marking the turn stopped.
- Do not inline new persistence side effects inside `stream.ts` closures that only one endpoint can see.
