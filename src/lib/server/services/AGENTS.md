# Server Services — Internal Map

Parent: [AGENTS.md](../../../AGENTS.md) lists every service file and its role. This file covers **cross-service dependencies, complexity ordering, and data flow** — what the parent doesn't document.

## Complexity Hotspots (by line count)

| Rank | File | Lines | Why large |
|------|------|-------|-----------|
| 1 | `task-state.ts` | 1,535 | Facade + task routing, evidence selection, checkpointing, steering |
| 2 | `honcho.ts` | 1,460 | Honcho client lifecycle, session bootstrap, context construction |
| 3 | `chat-turn/stream.ts` | 980 | SSE parsing, tool-call markers, thinking extraction, `<preserve>` chunks |
| 4 | `knowledge/store/attachments.ts` | 583 | Upload dedupe, readiness checks, artifact linking |
| 5 | `task-state/continuity.ts` | 683 | Project memory, focus continuity, task-project linking |
| 6 | `knowledge/context.ts` | 432 | Working-set ranking, context status, compaction logic |
| 7 | `knowledge/capsules.ts` | 347 | Workflow summarization, generated-output artifacts |
| 8 | `knowledge/store/core.ts` | 353 | Artifact CRUD, mapping, token-budget constants |
| 9 | `task-state/artifacts.ts` | 358 | Chunking, prompt-snippet selection, historical summarization |
| 10 | `knowledge/store/cleanup.ts` | 302 | Cross-reference-aware deletion, bulk cleanup |
| 11 | `chat-turn/retry-cleanup.ts` | ~190 | Idempotent cleanup of failed turn data (evidence, checkpoints, work capsules, generated outputs) |

## Cross-Service Dependency Graph

```
Routes (api/chat/send, api/chat/stream)
  │
  ▼
chat-turn/request.ts ──► chat-turn/preflight.ts
                              │
                    ┌─────────┼─────────┐
                    ▼         ▼         ▼
              chat-turn/   chat-turn/   translator.ts
              execute.ts   stream.ts
                    │         │
                    └────┬────┘
                         ▼
                  chat-turn/finalize.ts
                    │   │   │   │
                    ▼   ▼   ▼   ▼
               messages  honcho  task-state  knowledge
                   │       │        │            │
                   └───┬───┘        │            │
                       ▼            ▼            ▼
                  persona-memory  utils/*    knowledge/store/*  chat-turn/retry-cleanup.ts
```

**Key insight**: `finalize.ts` is the fan-out point — after a turn completes, it dispatches to persistence, evidence, memory, and Honcho sync.

## Chat-Turn Pipeline Data Flow

```
parseChatTurnRequest()        ← body, model, attachments
        │
preflightChatTurn()           ← conversation exists? attachments ready?
        │
   ┌────┴────┐
   ▼         ▼
execute()  stream.ts          ← diverge here
   │      createServerChunkRuntime()
   │         │
   │    parseUpstreamEvents()  ← Langflow SSE → tokens, thinking, tool_calls
   │    processToolCallMarkers()
   │    normalizeVisibleAssistantText()
   │         │
   └────┬────┘
        ▼
persistAssistantTurnState()   ← message, metadata, evidence
        │
runPostTurnTasks()            ← Honcho sync, memory maintenance trigger
        │
retry-cleanup.ts              ← idempotent cleanup on turn failure (evidence links, checkpoints,
                              generated_output artifacts, work capsules, assistant message)
```

## Knowledge Store Internal Chain

```
knowledge.ts (facade — re-exports from below)
  ├── store.ts (facade — re-exports from store/*)
  │     ├── store/core.ts         ← artifact CRUD, mapping, WORKING_SET_*_BUDGET
  │     ├── store/attachments.ts  ← upload → extract → dedupe → link
  │     ├── store/documents.ts    ← normalized docs, query matching
  │     └── store/cleanup.ts      ← cross-ref-aware deletion
  ├── context.ts                 ← working-set ranking, compaction status
  └── capsules.ts                ← work capsules, generated outputs
```

**Call chain for attachment upload**: `saveUploadedArtifact()` → `document-extraction.ts` → `store/core.ts createArtifact()` → `store/core.ts syncArtifactChunks()` (delegates to `task-state/artifacts.ts`)

**Vault-only upload note**: knowledge-page vault uploads may pass `conversationId = null`; `saveUploadedArtifact()` must skip `attached_to_conversation` link creation in that case, while `/api/knowledge/upload` validates any provided conversation id before insert and keeps Honcho sync conversation-bound.

**Vault search note**: `searchVaultDocuments()` in `knowledge/store/documents.ts` is the shared vault-file search path used by `/api/knowledge/search` and the shell search modal. Keep vault-file search ranking, logical-document mapping, and vault-name decoration there instead of duplicating it in routes or client components.

**Chat-generated files note**: `chat-files.ts` is the single source of truth for generated-file storage, conversation-scoped listings, authenticated user lookups for `/api/chat/files/[id]/download`, and the post-save-to-vault cleanup path. Keep `/api/chat/files/generate` bearer-auth logic thin, reject zero-file sandbox runs there instead of returning silent success, and let `chat-files.ts` own file retrieval semantics.

**Langflow prompt note**: file-generation workflow guidance belongs in `langflow.ts`. Keep its prompt contract aligned with the Langflow file-generator tool: generated code must write files to `/output`, successful files appear in chat, and vault saves remain a separate UI action unless a dedicated save tool is introduced.

**Generated-file debug note**: when debugging missing chat files, the current server-side log prefixes are `[LANGFLOW]` for outbound request/session correlation, `[FILE_GENERATE]` for the sandbox endpoint, `[CHAT_FILES]` for persistence/listing, `[CHAT_STREAM]` for tool-call summaries, `generate_file` tool markers, and stream-end payloads, and `[CONVERSATION_DETAIL]` for reload payloads. The sandbox layer now also logs startup image warmup, missing-image pulls, exec/output synchronization, output-archive entry handling, in-container `/output` inspection, and any in-container readback fallback under `[FILE_GENERATE]`, so extend those prefixes instead of inventing new one-off log tags.

## Task-State Submodule Flow

```
task-state.ts (facade — 1,535 lines)
  │
  ├── control-model.ts    ← context summarizer API client
  ├── continuity.ts       ← project memory, focus items, task-project linking
  ├── artifacts.ts        ← chunk sync, prompt snippets, historical context
  └── mappers.ts          ← row-to-type mappers (shared by above)
```

**Context assembly path**: `task-state.ts selectTaskStateForTurn()` → `artifacts.ts getPromptArtifactSnippets()` → `continuity.ts syncTaskContinuityFromTaskState()` → `honcho.ts buildConstructedContext()`

## Shared Utils Usage

| Util | Used by | Purpose |
|------|---------|---------|
| `utils/prompt-context.ts` | `honcho.ts`, `task-state.ts` | Context section building, compaction, serialization to token budget |
| `utils/json.ts` | `task-state/`, `knowledge/` | Safe JSON parsing for DB-stored arrays/records |
| `utils/text.ts` | `task-state/`, `messages.ts` | Whitespace normalization, text clipping |
| `utils/tokens.ts` | `prompt-context.ts`, `context.ts` | Token estimation for budget checks |

## Legacy Files — Do Not Extend

These exist in `src/lib/server/db/` but are legacy wrappers:
- `conversations.ts`, `projects.ts`, `sessions.ts`, `users.ts`

New persistence goes in the relevant service using `db` + `schema.ts` directly.
