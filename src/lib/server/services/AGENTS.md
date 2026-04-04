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
- `tei-embedder.ts` and `tei-reranker.ts` are transport adapters only. They may improve shortlist and rerank quality, but they are not allowed to become a second authority for document identity, active focus, or temporal truth.
- `semantic-embeddings.ts` owns the durable embedding substrate for artifacts, persona clusters, and task states. Keep source-text hashing, upsert semantics, and readback there instead of reimplementing per-domain mini stores.
- `semantic-embedding-refresh.ts` owns async refresh/backfill orchestration on top of that store. Artifact/task/persona writers may queue refreshes there, and `memory-maintenance.ts` may run user-scoped backfill there, but do not duplicate those loops in routes or domain-specific services.
- `semantic-ranking.ts` owns generic shortlist math over stored embeddings. Domain retrieval services may consume it, but they should keep authority-specific weighting and suppression rules local instead of pushing those concerns down into the generic helper.
- `persona-memory.ts` may also consume `semantic-ranking.ts` for query-time prompt recall, but it must keep temporal freshness, correction penalties, supersession, and overview composition deterministic on its own side of the boundary.
- `task-state.ts` may also consume `semantic-ranking.ts` for query-time task routing, but it must keep task status transitions, locked-task precedence, and project continuity truth deterministic on its own side of the boundary.

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

**Working-documents note**: the current working-document foundation should continue to build on existing artifacts, especially `generated_output`. Do not create a second persistence or memory path for generated files separate from artifact metadata, working-set retrieval, the shared document resolver, and Honcho sync. Vault save remains a human organization action, not the switch that determines whether the AI remembers a document. Family lifecycle state such as `documentFamilyStatus` belongs on that same metadata contract.

**Resolver note**: `document-resolution.ts` is now the authority for “which generated document/version is current or relevant”. `working-set.ts`, `knowledge/context.ts`, and `task-state.ts` should consume its result instead of reintroducing ad hoc filename, recency, or latest-output heuristics.

**Capsule note**: `knowledge/capsules.ts` still summarizes workflow, but it is no longer the authority for document lineage. Keep document family/version continuity on artifact metadata plus links, not duplicated capsule payloads.

**Langflow prompt note**: file-generation workflow guidance belongs in `langflow.ts`. Keep its prompt contract aligned with the Langflow file-generator tool: generated code must write files to `/output`, successful files appear in chat, vault saves remain a separate UI action unless a dedicated save tool is introduced, and generic code-execution tools such as `run_python_repl` should not be used as a substitute when `generate_file` is available. The current runtime split is `python` for standard-library-friendly text/data exports and `javascript` for `.xlsx` via `exceljs`, `.pdf` via `pdf-lib`, `.pptx` via `pptxgenjs`, `.docx` via `docx`, and `.odt` via `jszip` packaging.

**Generated-file debug note**: when debugging missing chat files, the current server-side log prefixes are `[LANGFLOW]` for outbound request/session correlation, `[FILE_GENERATE]` for the sandbox endpoint and sandbox image warmup/readback warnings, `[CHAT_STREAM]` for tool-call summaries and end-of-stream generated-file handling, `[CHAT_FILES]` for persistence/sync failures, plus `[HONCHO]` and `[MEMORY_MAINTENANCE]` for downstream continuity issues. Extend those prefixes instead of inventing new one-off log tags.
**Selection-debug note**: document and memory observability should stay summary-level. `knowledge/context.ts` now emits `[CONTEXT] Working document selection` with the winning active-state signals and selected artifact ids, while `memory.ts` emits `[KNOWLEDGE_MEMORY] Selected overview source` for Knowledge Memory overview decisions. Extend those summaries instead of reintroducing noisy per-candidate logs.

**Langflow custom-tool note**: for the file generator node, follow Langflow's tool-mode custom-component pattern directly. The agent must see the actual `generate_file` action as the tool; do not expose an intermediate builder method like `build_tool`, or the model may call that method without ever hitting `/api/chat/files/generate`. Keep the source input named `source_code`, not `code`, because Langflow component internals already use `code` and the node can end up posting its own component source instead of the tool argument.

**Persona-memory note**: `persona-memory.ts` now resolves relative-time phrasing such as `in two days` into temporal metadata stored in cluster `metadataJson`, derives `short_term_constraint` and `active_project_context` classes, converts expired temporal memories into historical phrasing on the read path, and performs same-topic temporal supersession before semantic reconcile. Keep those behaviors in the existing cluster pipeline rather than creating a second temporal-memory subsystem.

**Memory-overview note**: `memory.ts` treats Honcho overview text as auxiliary. Local persona clusters remain the authority for temporal freshness, so live/cached Honcho overviews that repeat expired temporal memories must be rejected in favor of the local fallback overview.

**Memory-events note**: Wave 2 now persists explicit `memory_events` rows for deadline changes, preference updates, persona fact replacement, project continuity transitions, and generated-document supersession. Use those rows for state-change history and later contradiction/repair work; do not fork that event history into capsule payloads, message metadata, or Honcho-only summaries.
**Behavior-learning note**: Wave 6 behavior signals should also flow through `memory_events`, not a separate analytics-only table. Focused working-document turns now record `document_refined` events, and retrieval may consume recent counts from those events as a bounded boost. Keep those boosts small and recent-windowed; explicit query/document matches still outrank passive behavior history.
**Working-set behavior note**: if behavior learning influences prompt carryover, route it through `working-set.ts` with the same bounded event-derived scores used by retrieval. Do not add a second prompt-only behavior heuristic that can drift away from `document-resolution.ts`.
**Workspace behavior note**: shared workspace opens may also emit `document_opened` events. Treat reopen counts as a smaller-than-refinement, smaller-than-focus signal and keep them on the same document-resolution/working-set rails instead of inventing a parallel “recent files” authority.
**Historical-family note**: `documentFamilyStatus: historical` is a lifecycle signal, not a hard filter. Retrieval and prompt carryover may downrank historical families when the turn is otherwise weak/generic, but explicit query matches, active focus, and source-jump flows should still be able to surface them.
**Correction-salience note**: persona-memory correction handling should stay in `persona-memory.ts` as deterministic cluster metadata plus repaired salience. If a newer persona memory clearly corrects an older overlapping statement, downrank the older cluster until a later reaffirmation updates `lastSeenAt`; do not create a second correction-ranking cache or a route-local override list.

**Project-continuity note**: `task-state/continuity.ts` now interprets the newest `project_started` / `project_paused` / `project_resumed` event when resolving current continuity state. Explicit pause/resume phrasing from the user may write those events during turn finalization, and continuity reads should trust them before an older still-active row.
**Persona-contradiction note**: `persona-memory.ts` now treats high-confidence fact slots such as current location or current role as deterministic contradiction candidates. Use slot metadata plus `supersessionReason`/`memory_events` there instead of broad “latest phrasing wins” heuristics.
**Document-preference note**: task-state evidence preference writes should stay document-family aware. If a user pins or excludes one artifact version inside a working-document family, clear sibling user preference links for that same family so one version remains current for the task.
**Active-state note**: structured live signals such as active workspace focus, explicit user correction phrasing, the most recently refined document family, and explicit move-on/reset phrasing should stay first-class in working-set/prompt selection. Prefer those signals over ad hoc semantic-only rescoring when the user is clearly revising or explicitly leaving a current document.
**Active-state assembly note**: use `active-state.ts` as the shared source for live document focus/correction/current-output/recently-refined-family/reset signals. Avoid rebuilding that logic independently inside `knowledge/context.ts`, `task-state.ts`, or `honcho.ts`, because drift there will make prompt selection and evidence selection disagree about the “current” document.
**Prompt-selection note**: `selectWorkingSetArtifactsForPrompt(...)` must rederive turn-scoped document reason codes from the current active-state before calling generated-document prompt eligibility. Persisted DB reason codes describe the last turn, not the current one.
**Retrieval note**: generated-document retrieval in `knowledge/context.ts` should also follow the shared active-state contract. Keep a preferred/recently refined family active on generic refinement turns, but do not drag in unrelated generated-document families unless the query explicitly matches them, and let reset/move-on phrasing suppress that carryover.
**TEI note**: semantic retrieval work should layer on top of those same contracts. Use `tei-embedder.ts` for shortlist generation and `tei-reranker.ts` for top-N refinement, but keep deterministic filters, document-family authority, active-state resets, and historical-family penalties above the TEI scores.
**Reranker cutover note**: current evidence rerank in `task-state.ts`, chunk rerank in `task-state/artifacts.ts`, historical section rerank in `prompt-context.ts`/`honcho.ts`, and tool/web evidence rerank in `message-evidence.ts` should all stay on the shared TEI reranker path. Do not route those back through the generic control-model chat-completions client.
**Embedding-store note**: keep embedding persistence unified in `semantic-embeddings.ts` + `semantic_embeddings`. Artifact, persona, and task semantic retrieval waves may project different subject types onto that table, but they should not create separate embedding tables unless there is a measured operational reason.
**Embedding-refresh note**: live write paths should queue semantic refreshes asynchronously through `semantic-embedding-refresh.ts`, while slower user-wide backfill belongs in `memory-maintenance.ts`. Do not make artifact creation, task checkpointing, or persona dreaming wait on TEI round-trips.
**Document semantic note**: `knowledge/store/documents.ts` is now the artifact-level semantic retrieval path for Wave 5. Let it compose lexical candidate fetch, stored-embedding shortlist, and TEI rerank, then keep generated-family identity/focus/history enforcement in `document-resolution.ts` and `knowledge/context.ts`.
**Persona semantic note**: `persona-memory.ts` may use stored persona-cluster embeddings and bounded rerank scores when selecting prompt-time persona context for a query, but do not turn the Knowledge Memory overview into a second semantic-search surface. Overview composition should still start from the deterministic classified persona items already filtered for freshness and supersession.
**Task semantic note**: `task-state.ts` may use stored task-state embeddings and bounded rerank scores when deciding whether to continue, revive, or create a task for the current turn, but do not let those scores bypass deterministic status rules, locked-task precedence, or project continuity event truth in `task-state/continuity.ts`.
**Preview-performance note**: keep heavy preview dependencies off the idle shell path. `DocumentWorkspace.svelte`, `GeneratedFile.svelte`, and `knowledge/FilePreview.svelte` now lazy-load the rich preview component, markdown renderer, and PDF worker URL; do not revert those paths back to eager imports unless you re-measure the client bundle cost.
**Transport note**: preserve `activeDocumentArtifactId` end-to-end through `streaming.ts`, `/api/chat/stream`, `/api/chat/retry`, and `langflow.ts`. The server-side active-state and retrieval helpers cannot recover a workspace-focused document if the browser/request layer drops that id.
**Repair-loop note**: Wave 5 repair work should reuse the existing generated-output duplicate classifier in `evidence-family.ts` and run it from `memory-maintenance.ts`. Do not invent a parallel “document cleanup” service when retrieval-class repair already compresses low-value duplicate drafts deterministically. The same repair surface now also owns dormant generated-document family downgrades to shared `documentFamilyStatus: "historical"` metadata.
**Salience-repair note**: low-confidence or weakly supported persona memories should lose prominence through the existing `persona-memory.ts` cluster refresh path. Recompute repaired `salienceScore` from stored cluster metadata/support counts there; do not add a separate maintenance-only salience cache or a second persona-ranking subsystem.

## Task-State Submodule Flow

```
task-state.ts (facade — 1,535 lines)
  │
  ├── control-model.ts    ← context summarizer API client for routing/verification/JSON tasks
  ├── tei-reranker.ts     ← retrieval/evidence reranker client
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
