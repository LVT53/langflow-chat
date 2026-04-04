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

## Memory Authority Snapshot

- `persona-memory.ts` owns persona clustering, relative-time resolution, temporal freshness, and preference-slot supersession.
- `task-state/continuity.ts` owns project continuity buckets and active-status transitions.
- `chat-files.ts` plus artifact metadata own generated-document lineage.
- `memory-events.ts` owns the normalized persisted event log for cross-domain state changes. Add new event types there instead of introducing side logs inside routes or unrelated services.
- `honcho.ts` mirrors and enriches memory, but it is not the authority for local temporal truth, document lineage, or event history.

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

**Chat-generated files note**: `chat-files.ts` is the single source of truth for generated-file storage, conversation-scoped listings, authenticated user lookups for `/api/chat/files/[id]/download`, and vault-save status lookups derived from artifact metadata. Keep `/api/chat/files/generate` bearer-auth logic thin, reject zero-file sandbox runs there instead of returning silent success, and let `chat-files.ts` own file retrieval semantics. The preview route `/api/chat/files/[id]/preview` should stay a binary file endpoint that plugs into the shared rich viewer rather than a separate chat-only text-preview system.

**Working-documents note**: the current working-document foundation should continue to build on existing artifacts, especially `generated_output`. Do not create a second persistence or memory path for generated files separate from artifact metadata, working-set retrieval, the shared document resolver, and Honcho sync. Vault save remains a human organization action, not the switch that determines whether the AI remembers a document.

**Resolver note**: `document-resolution.ts` is now the authority for “which generated document/version is current or relevant”. `working-set.ts`, `knowledge/context.ts`, and `task-state.ts` should consume its result instead of reintroducing ad hoc filename, recency, or latest-output heuristics.

**Capsule note**: `knowledge/capsules.ts` still summarizes workflow, but it is no longer the authority for document lineage. Keep document family/version continuity on artifact metadata plus links, not duplicated capsule payloads.

**Langflow prompt note**: file-generation workflow guidance belongs in `langflow.ts`. Keep its prompt contract aligned with the Langflow file-generator tool: generated code must write files to `/output`, successful files appear in chat, vault saves remain a separate UI action unless a dedicated save tool is introduced, and generic code-execution tools such as `run_python_repl` should not be used as a substitute when `generate_file` is available. The current runtime split is `python` for standard-library-friendly text/data exports and `javascript` for `.xlsx` via `exceljs`, `.pdf` via `pdf-lib`, `.pptx` via `pptxgenjs`, `.docx` via `docx`, and `.odt` via `jszip` packaging.

**Generated-file debug note**: when debugging missing chat files, the current server-side log prefixes are `[LANGFLOW]` for outbound request/session correlation, `[FILE_GENERATE]` for the sandbox endpoint and sandbox image warmup/readback warnings, `[CHAT_STREAM]` for tool-call summaries and end-of-stream generated-file handling, `[CHAT_FILES]` for persistence/sync failures, plus `[HONCHO]` and `[MEMORY_MAINTENANCE]` for downstream continuity issues. Extend those prefixes instead of inventing new one-off log tags.

**Langflow custom-tool note**: for the file generator node, follow Langflow's tool-mode custom-component pattern directly. The agent must see the actual `generate_file` action as the tool; do not expose an intermediate builder method like `build_tool`, or the model may call that method without ever hitting `/api/chat/files/generate`. Keep the source input named `source_code`, not `code`, because Langflow component internals already use `code` and the node can end up posting its own component source instead of the tool argument.

**Persona-memory note**: `persona-memory.ts` now resolves relative-time phrasing such as `in two days` into temporal metadata stored in cluster `metadataJson`, derives `short_term_constraint` and `active_project_context` classes, converts expired temporal memories into historical phrasing on the read path, and performs same-topic temporal supersession before semantic reconcile. Keep those behaviors in the existing cluster pipeline rather than creating a second temporal-memory subsystem.

**Memory-overview note**: `memory.ts` treats Honcho overview text as auxiliary. Local persona clusters remain the authority for temporal freshness, so live/cached Honcho overviews that repeat expired temporal memories must be rejected in favor of the local fallback overview.

**Memory-events note**: Wave 2 now persists explicit `memory_events` rows for deadline changes, preference updates, persona fact replacement, project continuity transitions, and generated-document supersession. Use those rows for state-change history and later contradiction/repair work; do not fork that event history into capsule payloads, message metadata, or Honcho-only summaries.

**Project-continuity note**: `task-state/continuity.ts` now interprets the newest `project_started` / `project_paused` / `project_resumed` event when resolving current continuity state. Explicit pause/resume phrasing from the user may write those events during turn finalization, and continuity reads should trust them before an older still-active row.
**Persona-contradiction note**: `persona-memory.ts` now treats high-confidence fact slots such as current location or current role as deterministic contradiction candidates. Use slot metadata plus `supersessionReason`/`memory_events` there instead of broad “latest phrasing wins” heuristics.
**Document-preference note**: task-state evidence preference writes should stay document-family aware. If a user pins or excludes one artifact version inside a working-document family, clear sibling user preference links for that same family so one version remains current for the task.
**Active-state note**: structured live signals such as active workspace focus, explicit user correction phrasing, the most recently refined document family, and explicit move-on/reset phrasing should stay first-class in working-set/prompt selection. Prefer those signals over ad hoc semantic-only rescoring when the user is clearly revising or explicitly leaving a current document.
**Active-state assembly note**: use `active-state.ts` as the shared source for live document focus/correction/current-output/recently-refined-family/reset signals. Avoid rebuilding that logic independently inside `knowledge/context.ts`, `task-state.ts`, or `honcho.ts`, because drift there will make prompt selection and evidence selection disagree about the “current” document.
**Prompt-selection note**: `selectWorkingSetArtifactsForPrompt(...)` must rederive turn-scoped document reason codes from the current active-state before calling generated-document prompt eligibility. Persisted DB reason codes describe the last turn, not the current one.
**Retrieval note**: generated-document retrieval in `knowledge/context.ts` should also follow the shared active-state contract. Keep a preferred/recently refined family active on generic refinement turns, but do not drag in unrelated generated-document families unless the query explicitly matches them, and let reset/move-on phrasing suppress that carryover.
**Transport note**: preserve `activeDocumentArtifactId` end-to-end through `streaming.ts`, `/api/chat/stream`, `/api/chat/retry`, and `langflow.ts`. The server-side active-state and retrieval helpers cannot recover a workspace-focused document if the browser/request layer drops that id.

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
