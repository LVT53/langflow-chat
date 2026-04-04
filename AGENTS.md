# AGENTS.md

This file is the canonical engineering map for AlfyAI. Read it before changing code. Public setup, deployment, and environment documentation live in [README.md](./README.md). Product and design notes in other docs are supplemental, not the source of truth for code placement.

## Mandatory Docs Check

- Before touching code, check current documentation through Context7 and the Svelte/SvelteKit MCP docs tools for the relevant framework or library surface.
- This is especially required for Svelte, SvelteKit, Tailwind, Vitest, Playwright, Drizzle, and any fast-moving integration used by this app.
- Do not write framework code purely from memory when an MCP-backed docs check can confirm the current API or recommended pattern.
- The goal is to avoid stale code, deprecated patterns, and implementations that drift away from the real versions used in this repo.
- If the Svelte MCP/docs tool is unavailable in the current session, use the best available official docs path before coding and call out that fallback explicitly.

## Svelte 5 Migration Rules

- Prefer Svelte 5 callback props over `createEventDispatcher` for component-to-parent communication.
- Prefer `$props()` and typed `PageProps` / `LayoutProps` in SvelteKit route components.
- Prefer modern event attributes like `onclick` and `onsubmit` over legacy `on:` directives in touched files.
- In rune components, declare `bind:this` refs with `$state(...)` when the ref is later read by effects or handlers.
- Touch event attributes are passive by default in Svelte 5. If a handler truly needs `preventDefault()` (for example custom touch dragging), attach a non-passive listener via an action or explicit `addEventListener`, not legacy event modifiers.
- Prefer `{@render children()}` in layouts over legacy route `<slot />` usage.
- Do not introduce new `afterUpdate` or `beforeUpdate` calls; use a modern effect- or action-based approach instead.
- Do not introduce new legacy `<slot>` usage in app components; prefer explicit props or snippets when composition is needed.
- Legacy syntax that still exists in untouched files is migration debt, not a pattern to copy forward.

## Purpose

- Use the existing boundaries in this file before inventing new ones.
- Optimize for reliability, low duplication, and clear ownership.
- Keep behavior stable at the route, SSE, DB, and component-contract layers unless the change is explicitly intended to alter those contracts.
- Prefer extending an existing subsystem over adding a new top-level service, store, or client helper.

## Core Rules

- Routes are adapters. Durable logic belongs in server services, client API modules, stores, or shared helpers.
- Shared behavior should exist once. Do not copy logic between `send` and `stream`, between multiple stores, or between multiple services.
- Runtime config flows through `src/lib/server/config-store.ts`. Do not bypass it in code that should respect admin overrides.
- `src/lib/server/env.ts` owns environment parsing, including `getDatabasePath()` for DB bootstrap-only access. Do not read `DATABASE_PATH` directly anywhere else.
- `src/lib/server/db/index.ts` is connection/bootstrap only. Do not reintroduce runtime schema mutation there.
- `src/lib/client/conversation-session.ts` owns landing-to-chat handoff state. Do not scatter raw `sessionStorage` keys across pages or components.
- `src/lib/client/api/` owns reusable browser `fetch` logic. Stores should not become ad hoc HTTP clients.
- `src/lib/services/stream-protocol.ts` owns shared client/server stream-tag parsing helpers and completed-response control-tag cleanup. Do not duplicate inline thinking-tag parsing or final visible-text extraction across `streaming.ts`, `chat-turn/execute.ts`, and the chat stream route.
- `src/lib/services/streaming.ts` owns the browser stream transport contract, including the distinction between a user-requested stop and a local detach during navigation/unmount. Do not collapse those paths back into one generic abort that marks background disconnects as explicit stops.
- `src/lib/server/services/messages.ts` owns persisted assistant-message metadata such as evidence summaries and Honcho diagnostics/snapshots. Do not invent route-local shadow storage for those fields.
- `src/lib/server/services/langflow.ts` owns outbound system-prompt assembly, including always-on date-before-search guidance. Do not reintroduce route-local prompt guards for freshness-sensitive search behavior.
- `src/lib/server/services/title-generator.ts` owns language-aware title prompt selection and code-specific title prompt appendices, while the prompt text itself flows through `src/lib/server/config-store.ts` and admin settings.
- `src/lib/server/services/task-state.ts` is the continuity boundary. Do not reintroduce a parallel `project-memory` architecture.
- `src/lib/server/services/honcho.ts` is for Honcho-specific behavior only. Do not let it become a second generic prompt/memory engine.

## App Map

### Request Bootstrap

- [`src/hooks.server.ts`](./src/hooks.server.ts)
  - Validates the session cookie.
  - Attaches the current user to `locals`.
  - Refreshes runtime config overrides.
  - Starts optional maintenance work.
- [`src/routes/(app)/+layout.server.ts`](<./src/routes/(app)/+layout.server.ts>)
  - Preloads conversations, projects, models, and user-facing config.
  - This is the main bridge between server state and the authenticated app shell.
- [`src/routes/(app)/+layout.svelte`](./src/routes/(app)/+layout.svelte)
  - Owns client-side conversation-list refresh on focus/visibility.
  - Missing-current-conversation redirects must verify the conversation detail endpoint before sending the user back to `/`; a brand-new bootstrap chat can exist before the sidebar list includes it.

Do not:

- duplicate session/bootstrap checks inside every child route unless the route truly has extra requirements
- fetch the same layout data again in child pages unless the data is page-specific and cannot come from layout

### Client Shell And Page Boundaries

- [`src/routes/(app)/+page.svelte`](./src/routes/(app)/+page.svelte)
  - Landing page.
  - Prepares a draft conversation and stores the first pending message before navigation.
  - Must validate any stored landing draft conversation before reuse; only empty default-title prepared conversations are eligible for reuse from session state.
  - Owns the landing-to-chat visual handoff: once the first message is sent, the landing composer should transition into a bottom-docked "opening chat" state instead of staying centered like the idle hero surface.
  - First-message sends may use a full document navigation to `/chat/[conversationId]` after storing the pending message so deploy/restart edge cases cannot leave the browser visually stuck on the landing route while the new chat already runs on the server.
- [`src/routes/(app)/chat/[conversationId]/+page.ts`](./src/routes/(app)/chat/[conversationId]/+page.ts)
  - Lightweight page bootstrap for the chat detail route.
- [`src/routes/(app)/chat/[conversationId]/+page.svelte`](./src/routes/(app)/chat/[conversationId]/+page.svelte)
  - Owns live chat page state, stream lifecycle, and draft restore behavior for an existing conversation.
  - Owns the one-slot queued follow-up turn while a response is streaming.
  - Owns route-level working-document workspace state. Which document is open, active, compared, or closed belongs here, not inside file-row or preview components.
  - The chat detail route should stay visually distinct from the landing page: the composer remains bottom-docked and the message surface stays visible even before the first persisted messages arrive.
  - Route-local `_components/` and `*_helpers.ts` files are acceptable for chat render scaffolding and pure page-only transforms, but stream/evidence/draft orchestration should stay in the page.
- [`src/routes/(app)/knowledge/+page.svelte`](./src/routes/(app)/knowledge/+page.svelte)
  - Large page-specific knowledge UI with a single primary content column.
  - Main content: Vault Explorer plus Library and Memory Profile tabs.
  - Vault scope selection, drag/drop uploads, and vault CRUD surface inside the main library panel instead of a separate sidebar rail.
  - Also owns the knowledge-side working-document workspace shell and cross-route workspace handoff from global search.
  - It may contain page-local fetches for page-only actions, but shared browser API logic should still move to `src/lib/client/api/` if reused.
- [`src/routes/(app)/settings/+page.svelte`](./src/routes/(app)/settings/+page.svelte)
  - User settings and admin/runtime config UI surface.
  - The Administration tab is split into `System` and `Users` panes.
  - Route-local `_components/`, `*_helpers.ts`, or `*.svelte.ts` files next to the page are acceptable when splitting page-only UI/controller logic without creating a new shared boundary.

Do not:

- move chat orchestration into shared visual components
- make `MessageInput.svelte` own cross-page navigation or conversation bootstrap decisions
- make `MessageInput.svelte` own queued-turn orchestration; it may emit `onQueue`, but the chat page decides auto-send and restore behavior
- let `MessageInput.svelte` retain a stale internal `conversationId` after the parent clears the prop; landing-page sends and uploads must fall back to the parent-owned prepared-conversation flow instead of silently targeting an old conversation
- turn page files into long-lived business-logic modules when a store/service/helper boundary already exists

### Chat Flow

- Route entrypoints:
  - [`src/routes/api/chat/send/+server.ts`](./src/routes/api/chat/send/+server.ts)
  - [`src/routes/api/chat/stream/+server.ts`](./src/routes/api/chat/stream/+server.ts)
  - [`src/routes/api/chat/stream/stop/+server.ts`](./src/routes/api/chat/stream/stop/+server.ts)
- Shared pipeline:
  - [`src/lib/server/services/chat-turn/request.ts`](./src/lib/server/services/chat-turn/request.ts)
  - [`src/lib/server/services/chat-turn/preflight.ts`](./src/lib/server/services/chat-turn/preflight.ts)
  - [`src/lib/server/services/chat-turn/execute.ts`](./src/lib/server/services/chat-turn/execute.ts)
  - [`src/lib/server/services/chat-turn/stream.ts`](./src/lib/server/services/chat-turn/stream.ts)
  - [`src/lib/server/services/chat-turn/active-streams.ts`](./src/lib/server/services/chat-turn/active-streams.ts)
  - [`src/lib/server/services/chat-turn/finalize.ts`](./src/lib/server/services/chat-turn/finalize.ts)
  - [`src/lib/server/services/chat-turn/types.ts`](./src/lib/server/services/chat-turn/types.ts)
- Upstream integrations:
- [`src/lib/server/services/langflow.ts`](./src/lib/server/services/langflow.ts)
  - Owns model-facing prompt assembly and outbound search/date guidance.
  - [`src/lib/server/services/translator.ts`](./src/lib/server/services/translator.ts)
  - [`src/lib/server/services/title-generator.ts`](./src/lib/server/services/title-generator.ts)
  - [`src/lib/server/services/messages.ts`](./src/lib/server/services/messages.ts)
  - [`src/lib/server/services/message-evidence.ts`](./src/lib/server/services/message-evidence.ts)
  - Owns evidence channel types including 'vault' for vault-sourced artifacts
- Chat-generated files:
  - [`src/routes/api/chat/files/generate/+server.ts`](./src/routes/api/chat/files/generate/+server.ts)
  - [`src/routes/api/chat/files/[id]/download/+server.ts`](./src/routes/api/chat/files/[id]/download/+server.ts)
  - [`src/lib/server/services/chat-files.ts`](./src/lib/server/services/chat-files.ts)
- [`src/routes/api/chat/files/[id]/save-to-vault/+server.ts`](./src/routes/api/chat/files/[id]/save-to-vault/+server.ts)
- [`src/routes/api/chat/files/[id]/preview/+server.ts`](./src/routes/api/chat/files/[id]/preview/+server.ts)
- [`src/lib/components/chat/GeneratedFile.svelte`](./src/lib/components/chat/GeneratedFile.svelte)
- [`src/lib/components/chat/DocumentWorkspace.svelte`](./src/lib/components/chat/DocumentWorkspace.svelte)
- [`src/lib/components/chat/VaultPickerModal.svelte`](./src/lib/components/chat/VaultPickerModal.svelte)
- Generated files refresh:
  - [`src/lib/services/streaming.ts`](./src/lib/services/streaming.ts) — `StreamMetadata.generatedFiles` field
  - Stream end event includes the current `generatedFiles` array fetched via `getChatFiles()`, including an empty array when the conversation no longer has chat-scoped generated files
  - Chat page `onEnd` callback refreshes `generatedFiles` state from metadata and clears any temporary `generate_file` loading placeholders
  - [`src/routes/api/chat/files/generate/+server.ts`](./src/routes/api/chat/files/generate/+server.ts) must reject sandbox runs that finish without writing a file to `/output`; do not silently treat zero generated files as success
  - [`src/lib/server/sandbox/config.ts`](./src/lib/server/sandbox/config.ts) now ensures the sandbox runtime images exist before container creation, warms them in the background at app startup, and supports both the Python runtime (`python:3.11-slim`) and the JavaScript runtime (`node:22-bookworm-slim`)
  - [`src/lib/server/sandbox/config.ts`](./src/lib/server/sandbox/config.ts) must wait for exec inspection to report `Running === false` before the archive reader inspects `/output`; do not treat an early stream close as proof that the sandbox command has finished
  - [`src/lib/server/services/sandbox-execution.ts`](./src/lib/server/services/sandbox-execution.ts) must surface output-archive read failures as explicit execution errors instead of collapsing them into the same empty-file 422 path used for real zero-output runs
  - Generated-file/server tracing now mainly uses `[FILE_GENERATE]`, `[CHAT_STREAM]`, `[CHAT_FILES]`, `[LANGFLOW]`, `[HONCHO]`, and `[MEMORY_MAINTENANCE]`; preserve those prefixes when extending the debugging path so node logs stay grep-friendly

Do:

- put shared request parsing, attachment preflight, model normalization, stream framing, and finalization in `chat-turn/`
- let `src/lib/server/services/chat-turn/stream.ts` own shared upstream event parsing, tool-call marker handling, downstream token/thinking framing, and `<preserve>` chunk handling
- let `src/lib/server/services/chat-turn/execute.ts` normalize non-stream assistant text through the shared stream-protocol helpers so `/send` returns the same visible content shape that `/stream` would show
- use `src/routes/api/chat/stream/stop/+server.ts` plus `chat-turn/active-streams.ts` for explicit user-requested aborts; do not overload passive disconnect handling for that purpose
- keep route files thin and transport-oriented
- preserve SSE event names and payload expectations unless the parser/UI/tests are intentionally updated together
- treat `<preserve>...</preserve>` as translation-preserved display content, not a signal to wrap prose in fenced code
- use `GeneratedFile.svelte` for rendering AI-generated files in chat
- use `DocumentWorkspace.svelte` plus route-owned state for in-chat document review; do not move active-document selection into generated-file rows or `FilePreview.svelte`
- use `DocumentWorkspace.svelte` as the single shell for generated files, chat attachments, vault/library opens, and search-result opens; do not reintroduce separate modal viewers for those surfaces
- use temporary `generate_file` UI placeholders only in the chat page/message-area flow; do not fake persisted generated-file rows in server payloads or chat-file storage
- use `VaultPickerModal.svelte` for saving generated files to vaults
- keep generated-file downloads on the canonical `/api/chat/files/[id]/download` route; do not invent conversation-scoped download URLs
- `/api/chat/files/generate` may authenticate with either the signed-in session or the optional `ALFYAI_API_KEY` bearer secret used by the Langflow file-generator tool; keep that bearer path conversation-scoped and internal
- keep outbound file-generation guidance in `langflow.ts` aligned with the Langflow file-generator tool contract: write outputs to `/output`, generated files show up in chat, and vault saving is still a separate UI action unless a dedicated tool is added
- keep outbound file-generation guidance explicit: when the user asks for a downloadable file and the tool exists, the model should call the tool rather than merely describing a file in prose
- keep the Langflow custom file-generator component aligned with Langflow tool-mode docs: expose the actual `generate_file` output method as the tool instead of surfacing a builder method like `build_tool`
- keep the Langflow custom file-generator component's source input named `source_code`, not `code`; `code` collides with Langflow component internals and can cause the node to send its own component source to `/api/chat/files/generate`
- keep `generate_file` runtime guidance accurate: use `language: "python"` for standard-library-friendly text/data exports and `language: "javascript"` for `.xlsx` via `exceljs`, `.pdf` via `pdf-lib`, `.pptx` via `pptxgenjs`, `.docx` via `docx`, and `.odt` via `jszip` packaging
- save-to-vault preserves the original chat file and records vault-save state via artifact metadata so the row still appears after refresh
- generated files may offer an authenticated rich preview via `/api/chat/files/[id]/preview`; reuse the shared file viewer component instead of maintaining a second chat-only preview UI
- vault save is an organization action, not the switch that determines whether the AI remembers a generated document. Working-document continuity should continue to build on generated-output artifacts plus Honcho sync.
- working-document continuity should prefer the shared resolver’s “current generated document” signal over generic latest-output heuristics. If a generated document is selected because of active focus or a query match, do not layer a second recency-only boost on top.

Do not:

- duplicate turn logic between `send` and `stream`
- add new SSE event shapes casually; this touches browser parsing and tests
- hide persistence side effects inside route-local closures that only one endpoint can see
- couple Langflow transport details directly into page components
- duplicate stream-tag parsing or inline-thinking extraction between the browser stream consumer and `api/chat/stream/+server.ts`
- scatter freshness-sensitive search guards outside `langflow.ts`

### Knowledge And Context

- Public boundary:
  - [`src/lib/server/services/knowledge.ts`](./src/lib/server/services/knowledge.ts)
- Internal modules:
  - [`src/lib/server/services/knowledge/store.ts`](./src/lib/server/services/knowledge/store.ts)
  - [`src/lib/server/services/knowledge/store/core.ts`](./src/lib/server/services/knowledge/store/core.ts)
  - [`src/lib/server/services/knowledge/store/attachments.ts`](./src/lib/server/services/knowledge/store/attachments.ts)
  - [`src/lib/server/services/knowledge/store/documents.ts`](./src/lib/server/services/knowledge/store/documents.ts)
  - [`src/lib/server/services/knowledge/store/cleanup.ts`](./src/lib/server/services/knowledge/store/cleanup.ts)
  - [`src/lib/server/services/knowledge/context.ts`](./src/lib/server/services/knowledge/context.ts)
  - [`src/lib/server/services/knowledge/capsules.ts`](./src/lib/server/services/knowledge/capsules.ts)
- Related services:
  - [`src/lib/server/services/working-set.ts`](./src/lib/server/services/working-set.ts)
  - [`src/lib/server/services/document-resolution.ts`](./src/lib/server/services/document-resolution.ts)
  - [`src/lib/server/services/document-extraction.ts`](./src/lib/server/services/document-extraction.ts)
  - [`src/lib/server/services/evidence-family.ts`](./src/lib/server/services/evidence-family.ts)
  - [`src/lib/server/services/knowledge-labels.ts`](./src/lib/server/services/knowledge-labels.ts)

Responsibility split:

- `store.ts`
  - public facade for store internals
- `store/core.ts`
  - artifact CRUD
  - artifact mapping and shared selection helpers
- `store/attachments.ts`
  - attachment readiness
  - upload to vault (with vaultId parameter)
  - auto-rename on file name conflicts
  - attachment linking and listing
- `store/vaults.ts`
  - vault CRUD operations
  - vault ownership validation
  - cascading delete with file cleanup
- `store/documents.ts`
  - normalized-document creation
  - logical document listing
  - artifact query matching
  - vault-document search result mapping
- generated chat files, uploaded attachments, and vault documents should converge on one working-document model built on the existing artifact backbone; do not create a parallel document persistence subsystem
- `store/cleanup.ts`
  - artifact deletion
  - cross-conversation reference checks
  - bulk cleanup actions
- `context.ts`
  - relevant-artifact lookup
  - working-set and context status operations
  - context-related reads/writes used during chat
- `document-resolution.ts`
  - current/relevant generated-document family selection
  - shared query/focus-aware generated-document ordering
- `capsules.ts`
  - work capsules
  - generated outputs
  - artifact-to-capsule mapping
  - workflow summary only, not document lineage authority

Do not:

- dump new unrelated knowledge behavior back into `knowledge.ts`
- mix file storage concerns with context-ranking heuristics in the same new helper
- place large retrieval heuristics in route files
- add a second parallel artifact service outside the `knowledge` boundary

### Knowledge Vaults

- Vault store:
  - [`src/lib/server/services/knowledge/store/vaults.ts`](./src/lib/server/services/knowledge/store/vaults.ts)
- Vault API:
  - [`src/routes/api/knowledge/vaults/+server.ts`](./src/routes/api/knowledge/vaults/+server.ts)
  - [`src/routes/api/knowledge/vaults/[id]/+server.ts`](./src/routes/api/knowledge/vaults/[id]/+server.ts)
- Vault UI:
  - [`src/routes/(app)/knowledge/_components/CreateVaultModal.svelte`](./src/routes/(app)/knowledge/_components/CreateVaultModal.svelte)
  - [`src/routes/(app)/knowledge/_components/DeleteVaultDialog.svelte`](./src/routes/(app)/knowledge/_components/DeleteVaultDialog.svelte)
  - [`src/routes/(app)/knowledge/_components/VaultFileUpload.svelte`](./src/routes/(app)/knowledge/_components/VaultFileUpload.svelte)
  - [`src/routes/(app)/knowledge/_components/KnowledgeLibraryView.svelte`](./src/routes/(app)/knowledge/_components/KnowledgeLibraryView.svelte) — main-panel vault explorer
- Vault client API:
  - [`src/lib/client/api/knowledge.ts`](./src/lib/client/api/knowledge.ts) — `fetchVaults`, `createVault`, `renameVault`, `deleteVault`, `fetchStorageQuota`, `searchVaultFiles`
- Vault search API:
  - [`src/routes/api/knowledge/search/+server.ts`](./src/routes/api/knowledge/search/+server.ts)
- Import handler:
  - [`src/lib/server/services/knowledge/import.ts`](./src/lib/server/services/knowledge/import.ts)
  - [`src/routes/api/knowledge/import/+server.ts`](./src/routes/api/knowledge/import/+server.ts)
- File preview:
  - [`src/lib/components/knowledge/FilePreview.svelte`](./src/lib/components/knowledge/FilePreview.svelte)
- Storage quota:
  - [`src/routes/api/knowledge/storage-quota/+server.ts`](./src/routes/api/knowledge/storage-quota/+server.ts)

Rules:

- Vaults are single-level folders only - no nested folder support
- Each vault belongs to a single user - no collaboration/sharing
- Direct vault uploads through `/api/knowledge/upload` may omit `conversationId`; when present, the route must validate that the conversation belongs to the user before any artifact insert or link write
- File versioning is NOT supported - single version per file
- Auto-rename on name conflicts (counter suffix) - no overwrite
- Delete vault = delete all files inside (cascading delete)
- Import from Obsidian/Notion flattens hierarchy, stores original path in metadata
- File preview uses client-side libraries (PDF.js, Mammoth.js, SheetJS, PPTXjs) - no external services
- Storage quota is display-only - no enforcement
- Global shell search surfaces vault-file hits through `/api/knowledge/search`, and vault-file clicks should hand off into the knowledge-page working-document workspace instead of opening a separate modal path
- `KnowledgeLibraryView.svelte` is the vault surface: keep vault scope selection, vault CRUD affordances, drag/drop upload targeting, and local vault-file search there instead of reintroducing a separate rail

Do not:

- add nested folder support (parentId on vaults)
- add vault collaboration/sharing features
- add file versioning/history
- add in-app file editing
- allow AI to edit existing vault files (AI generates NEW files only)
- add batch operations in v1
- add file deduplication (allow duplicates with auto-rename)
- use external hosted services for file preview

### Memory, Continuity, And Honcho

- Primary continuity/memory boundary:
  - [`src/lib/server/services/task-state.ts`](./src/lib/server/services/task-state.ts)
- Task-state internal modules:
  - [`src/lib/server/services/task-state/control-model.ts`](./src/lib/server/services/task-state/control-model.ts)
  - [`src/lib/server/services/task-state/continuity.ts`](./src/lib/server/services/task-state/continuity.ts)
  - [`src/lib/server/services/task-state/artifacts.ts`](./src/lib/server/services/task-state/artifacts.ts)
  - [`src/lib/server/services/task-state/mappers.ts`](./src/lib/server/services/task-state/mappers.ts)
- Honcho adapter:
  - [`src/lib/server/services/honcho.ts`](./src/lib/server/services/honcho.ts)
- Persona support:
  - [`src/lib/server/services/persona-memory.ts`](./src/lib/server/services/persona-memory.ts)
- Event log:
  - [`src/lib/server/services/memory-events.ts`](./src/lib/server/services/memory-events.ts)
- Maintenance/orchestration:
  - [`src/lib/server/services/memory.ts`](./src/lib/server/services/memory.ts)
  - [`src/lib/server/services/memory-maintenance.ts`](./src/lib/server/services/memory-maintenance.ts)
- Shared helpers:
  - [`src/lib/server/utils/json.ts`](./src/lib/server/utils/json.ts)
  - [`src/lib/server/utils/text.ts`](./src/lib/server/utils/text.ts)
  - [`src/lib/server/utils/tokens.ts`](./src/lib/server/utils/tokens.ts)
  - [`src/lib/server/utils/prompt-context.ts`](./src/lib/server/utils/prompt-context.ts)

Rules:

- `task-state.ts`
  - public continuity facade
  - task routing, checkpoints, evidence-context assembly, and related summarization entrypoints
- `task-state/control-model.ts`
  - context summarizer and control-model helpers used by task-state internals
- `task-state/continuity.ts`
  - task memory and project continuity internals
- `task-state/artifacts.ts`
  - artifact chunking, prompt snippet selection, and historical-context summarization helpers
- `task-state/mappers.ts`
  - task-state row mappers shared by task-state internals
- `honcho.ts` should stay an integration adapter for Honcho sessions, peers, mirrored messages, and Honcho-specific context.
- Read-side Honcho session memory should prefer Honcho’s canonical `session.queueStatus()` plus `session.context(...)` flow over manual multi-call fanout.
- Per-turn Honcho diagnostics and last-good Honcho snapshots belong in assistant-message metadata via `messages.ts`, not ad hoc route state.
- `buildConstructedContext` must degrade gracefully when Honcho is disabled, unavailable, or slow. Core chat cannot block on Honcho connectivity or empty-session bootstrap, but the chosen Honcho source for each turn must remain measurable and source-attributed.
- `getKnowledgeMemory` and other knowledge-memory reads should use the latest stored persona clusters immediately and treat Honcho overview generation as auxiliary. Do not block the entire Memory Profile on cluster refresh or a live `peer.chat(...)` summary.
- `memory.ts` owns Memory Profile overview source selection, cached Honcho overview reuse, and overview refresh backoff. Prefer a live Honcho overview when available, then a matching cached Honcho overview, then a local durable-persona summary before showing an empty-state message.
- `memory.ts` must apply local temporal truth before trusting Honcho overview text. Expired short-term constraints and other historical temporal memories should not re-enter the Memory Profile just because Honcho returned stale summary prose.
- `memory-events.ts` owns the persisted normalized event log for important state changes such as deadlines, preference updates, persona fact replacement, project continuity transitions, and document supersession. Add new event types there and emit them from the existing state-change boundaries; do not create ad hoc side logs or route-local event tables.
- `task-state/continuity.ts` now also consumes the latest task-domain project events on the read path. If a newer `project_paused` or `project_resumed` event exists, continuity summaries should prefer that signal over an older still-active row.
- User-selected task evidence preferences should stay family-aware for working documents. If a user pins or excludes one version inside a document family, clear contradictory user preference links for sibling versions in that same family instead of letting multiple versions stay preferred at once.
- Active-state inference should keep structured live signals explicit. If the user is clearly correcting or refining a document/version, prefer a dedicated active-state signal over hoping semantic match alone keeps the right working document in context.
- The most recently refined working-document family is now also a first-class active-state signal. On generic follow-up turns, prefer that family over a raw “latest output anywhere” fallback unless explicit workspace focus or a stronger query match says otherwise.
- Explicit move-on / completion phrasing should suppress stale document carryover. If the user clearly says they are done with the previous document/topic, do not let an open workspace tab or generic latest-output recency keep that document active by accident.
- Prompt-time working-set selection must also respect current-turn active-state. Do not trust persisted working-set reason codes like `current_generated_document`, `active_document_focus`, or `matched_current_turn` as if they were still current on the next turn; recompute live document carryover for the new turn instead.
- Shared live-signal assembly belongs in `src/lib/server/services/active-state.ts`. Do not rederive active workspace focus, current generated document, recently refined document-family state, correction/refinement signals, or move-on/reset signals separately inside `knowledge/context.ts`, `working-set.ts`, `task-state.ts`, or `honcho.ts` once the shared helper can provide them.
- Retrieval ordering should follow the same active-state contract. A preferred/recently refined document family may stay first on generic refinement turns, but `knowledge/context.ts` should not also pull in unrelated generated-document families unless the current query explicitly matches them, and reset/move-on phrasing should suppress that carryover there too.
- Preserve the active workspace document id through every chat transport boundary (`streaming.ts`, `/api/chat/stream`, `/api/chat/retry`, and `langflow.ts`). Iterative refinement depends on that signal surviving browser request serialization and route-level forwarding, not just the final Honcho/task-state assembly.
- `memory-maintenance.ts` owns per-user maintenance scheduling. Chat-triggered maintenance must stay serialized and debounced there; do not trigger full cluster recomputation directly from routes or UI code.
- Generated-output duplicate repair should also run through `memory-maintenance.ts`, not as a separate ad hoc sweep. Reuse `evidence-family.ts` retrieval-class repair so low-value near-duplicate drafts stay compressed out of broad retrieval while document history still remains available through the working-document system.
- Generated-document lifecycle state should stay on the existing working-document metadata contract. If a generated-document family becomes dormant, let `memory-maintenance.ts` and `evidence-family.ts` mark the latest family representative as `historical`; do not create a second document-lifecycle table or route-local stale-document cache for that purpose.
- `persona-memory.ts` cluster writes should remain idempotent under overlap. If maintenance or repair paths touch cluster persistence, keep conflict guards in place instead of assuming single-flight inserts.
- `buildPersonaPromptContext` should read the latest stored persona clusters immediately and only trigger cluster refresh in the background. Do not put synchronous cluster regeneration back on the chat request path.
- Keep Honcho latency knobs split by responsibility: `HONCHO_CONTEXT_WAIT_MS` is for live session bootstrap/queue/context reads, `HONCHO_PERSONA_CONTEXT_WAIT_MS` is for auxiliary chat-path persona enrichment, and `HONCHO_OVERVIEW_WAIT_MS` is for the Knowledge Base live overview refresh path.
- `persona-memory.ts` owns automatic persona-memory class and decay heuristics. Perishable facts should age out quickly and stay out of durable-profile summaries, while stable preferences should not auto-archive from age alone unless superseded.
- `persona-memory.ts` also owns deterministic stable-preference slot extraction and same-slot supersession. Prefer explicit replacement of older durable preferences over age-based archival, and keep the metadata in existing cluster JSON rather than adding a parallel preference store.
- `persona-memory.ts` also owns relative-time resolution, temporal freshness, same-topic deadline supersession, historical phrasing for expired temporal memories, and topic lifecycle metadata. Reuse cluster `metadataJson`; do not add a second temporal-memory store.
- `persona-memory.ts` now also owns deterministic high-confidence fact-slot supersession for persona/situational memories such as current location or current role. Keep those replacements explicit with `supersessionReason` metadata and `memory_events`, not broad route-local heuristics.
- Wave-2 memory evolution now persists normalized events for deadline changes, preference updates, persona fact replacement, project continuity transitions, and generated-document supersession. Treat the event log as supporting state-change history for local memory authorities, not as a second persona/task/document storage stack.
- Project continuity contradiction handling should stay in the existing continuity boundary: explicit pause/resume language may record task-domain events and update continuity state immediately, but the authoritative current status still belongs to `task-state/continuity.ts`, not Honcho or a route-local heuristic.
- `persona-memory.ts` may own persona-specific behavior, but low-level parsing/text/token helpers belong in shared utils.
- Treat Honcho conclusion `createdAt` values as storage/observation timestamps, not proof of the real-world date of the remembered event. Persona-memory canonicalization must not invent "today/now" timing for undated events.

Do not:

- create a new top-level continuity service when `task-state.ts` can own the behavior
- copy `clip`, token estimation, JSON parsing, or prompt-compaction helpers into another service
- move generic prompt-section rendering into `honcho.ts`
- import or extend `project-memory.ts`; if it still exists on disk, treat it as legacy and non-authoritative

### Config And Environment

- Environment parsing:
  - [`src/lib/server/env.ts`](./src/lib/server/env.ts)
- Runtime merge and normalization:
  - [`src/lib/server/config-store.ts`](./src/lib/server/config-store.ts)
- Admin config route:
  - [`src/routes/api/admin/config/+server.ts`](./src/routes/api/admin/config/+server.ts)
- Admin user-management routes:
  - [`src/routes/api/admin/users/+server.ts`](./src/routes/api/admin/users/+server.ts)
  - [`src/routes/api/admin/users/[id]/+server.ts`](./src/routes/api/admin/users/[id]/+server.ts)
  - [`src/routes/api/admin/users/[id]/sessions/+server.ts`](./src/routes/api/admin/users/[id]/sessions/+server.ts)
- Settings loaders:
  - [`src/routes/(app)/settings/+page.server.ts`](<./src/routes/(app)/settings/+page.server.ts>)
  - [`src/routes/api/settings/+server.ts`](./src/routes/api/settings/+server.ts)

Notes:

- `env.ts` also owns `getDatabasePath()` for bootstrap-only DB path access.
- Title-generator prompt variants flow through `env.ts`, `config-store.ts`, and the admin system settings UI. Keep English/Hungarian base prompts and code-only appendices aligned across those layers.
- `config-store.ts` remains the override-aware runtime config boundary. `getDatabasePath()` is for early DB/bootstrap code, not for general runtime settings reads.
- Context token limits are admin-configurable via `config-store.ts`:
  - `MAX_MODEL_CONTEXT` (default: 262144) - Maximum tokens the model context window supports
  - `COMPACTION_UI_THRESHOLD` (default: 209715) - UI warning threshold at 80% of max
  - `TARGET_CONSTRUCTED_CONTEXT` (default: 157286) - Target context size at 60% of max
  - Use getter functions in `config-store.ts` (e.g., `getMaxModelContext()`, `getCompactionUIThreshold()`, `getTargetConstructedContext()`) to read these values with admin overrides applied.

If you add a new runtime-configurable setting:

1. add env parsing/default handling in `env.ts` if it is environment-backed
2. add runtime normalization and override support in `config-store.ts`
3. expose it to the relevant settings/admin loaders and routes
4. update [README.md](./README.md) and [`.env.example`](./.env.example)

Do not:

- read directly from `process.env` or `env.ts` inside services that should respect admin overrides
- read `process.env.DATABASE_PATH` directly outside `env.ts`
- import override-aware runtime config into bootstrap code that only needs the DB file path
- document a config variable publicly without confirming it exists in real code paths
- add admin-configurable behavior in the UI without threading it through `config-store.ts`

### Sandbox Execution (AI File Generation)

- Sandbox configuration:
  - [`src/lib/server/sandbox/config.ts`](./src/lib/server/sandbox/config.ts)
- Sandbox execution service:
  - [`src/lib/server/services/sandbox-execution.ts`](./src/lib/server/services/sandbox-execution.ts)
- File generation API:
  - [`src/routes/api/chat/files/generate/+server.ts`](./src/routes/api/chat/files/generate/+server.ts)
- Chat-linked file storage:
  - [`src/lib/server/services/chat-files.ts`](./src/lib/server/services/chat-files.ts)

Security model:

- **Container isolation**: Docker containers with no network access (`NetworkMode: 'none'`)
- **Non-root execution**: Containers run as UID 1000:1000, not root
- **Capability dropping**: All Linux capabilities dropped (`CapDrop: ['ALL']`, `Privileged: false`)
- **Resource limits**: 60s timeout, 1GB memory, 50MB max file size, 100 process limit
- **Readonly rootfs**: Container filesystem is readonly; writable tmpfs for `/output` and `/tmp`
- **In-memory extraction**: Generated files are collected in-memory only. Prefer the Docker archive path first, but keep the in-container `/output` inspection and controlled readback fallback available when archive reads miss tmpfs-backed outputs. Never write sandbox contents to host disk.
- **Path traversal protection**: Rejects `..`, absolute paths, null bytes, symlinks, devices
- **Aggregate limits**: Max 20 output files, 50MB total output
- **Image bootstrap**: The sandbox config auto-pulls the pinned base image on first use if it is missing, but the app process still needs working Docker daemon access and image-pull permission on the host

Do not:

- add network access to sandbox containers
- run containers as root
- write tar contents to host filesystem
- bypass timeout/resource limits
- add new languages without security review

### Database And Persistence

- DB bootstrap and Drizzle binding:
  - [`src/lib/server/db/index.ts`](./src/lib/server/db/index.ts)
- Schema:
  - [`src/lib/server/db/schema.ts`](./src/lib/server/db/schema.ts)
- Explicit DB prep:
  - [`scripts/prepare-db.ts`](./scripts/prepare-db.ts)

Legacy/avoidance notes:

- `src/lib/server/db/conversations.ts`
- `src/lib/server/db/projects.ts`
- `src/lib/server/db/sessions.ts`
- `src/lib/server/db/users.ts`

Treat those `src/lib/server/db/*.ts` wrappers as legacy compatibility leftovers unless you verify a real active need. New persistence logic should normally live in the relevant service and use `db` plus `schema.ts` directly.

Do not:

- put schema mutation back into `db/index.ts`
- create new mini repository layers for each table without a strong reason
- spread one feature's persistence logic across route handlers, DB wrapper modules, and service files at the same time

### Browser API, Stores, And Session Handoff

- Shared browser API:
  - [`src/lib/client/api/auth.ts`](./src/lib/client/api/auth.ts)
  - [`src/lib/client/api/http.ts`](./src/lib/client/api/http.ts)
  - [`src/lib/client/api/conversations.ts`](./src/lib/client/api/conversations.ts)
  - [`src/lib/client/api/knowledge.ts`](./src/lib/client/api/knowledge.ts)
  - [`src/lib/client/api/models.ts`](./src/lib/client/api/models.ts)
  - [`src/lib/client/api/projects.ts`](./src/lib/client/api/projects.ts)
  - [`src/lib/client/api/settings.ts`](./src/lib/client/api/settings.ts)
- Stores:
  - [`src/lib/stores/conversations.ts`](./src/lib/stores/conversations.ts)
  - [`src/lib/stores/projects.ts`](./src/lib/stores/projects.ts)
  - [`src/lib/stores/settings.ts`](./src/lib/stores/settings.ts)
  - [`src/lib/stores/avatar.ts`](./src/lib/stores/avatar.ts)
  - [`src/lib/stores/theme.ts`](./src/lib/stores/theme.ts)
  - [`src/lib/stores/ui.ts`](./src/lib/stores/ui.ts)
- Session handoff:
  - [`src/lib/client/conversation-session.ts`](./src/lib/client/conversation-session.ts)

Rules:

- `client/api/` owns reusable request/response parsing and shared HTTP behavior.
- `src/lib/client/api/auth.ts` owns reusable browser auth calls such as login and logout.
- `src/lib/client/api/conversations.ts` owns reusable browser conversation-detail, evidence, title, and steering calls.
- `src/lib/client/api/conversations.ts` also owns browser-side draft persistence and prepared-conversation deletion transport used by `conversation-session.ts`.
- `src/lib/client/api/knowledge.ts` owns reusable knowledge upload, library, memory, and vault browser calls.
- `src/lib/client/api/knowledge.ts` provides `fetchVaults`, `createVault`, `renameVault`, `deleteVault`, `fetchStorageQuota`, `searchVaultFiles` for vault management and search.
- `src/lib/client/api/models.ts` owns reusable model-list browser calls.
- `src/lib/client/api/settings.ts` owns reusable settings/account/avatar/admin/analytics browser calls.
- `src/lib/client/api/settings.ts` also owns admin-side user list/create/promote/demote/delete/revoke-session browser calls.
- stores own browser state, optimistic updates, and UI-facing transitions.
- `conversation-session.ts` owns landing draft IDs, pending first-message replay, previous-conversation markers, and draft cleanup rules.

Do not:

- put raw `fetch` + `res.ok` + JSON parsing boilerplate into stores
- open-code reusable browser auth, model, conversation-detail, evidence, title, steering, or knowledge fetches in pages/components when they can live in `src/lib/client/api/`
- open-code settings/admin/analytics browser fetches in `settings/+page.svelte` when they can live in `src/lib/client/api/settings.ts`
- invent new `sessionStorage` keys in components or pages when the conversation-session helper should own them
- make stores mutate unrelated domains because it feels convenient
- move reusable HTTP error handling into page files

### Components

- Chat rendering components live under [`src/lib/components/chat/`](./src/lib/components/chat/).
- Layout/navigation components live under [`src/lib/components/layout/`](./src/lib/components/layout/).
- Sidebar-specific pieces live under [`src/lib/components/sidebar/`](./src/lib/components/sidebar/).

Important component boundaries:

- [`src/lib/components/chat/MessageInput.svelte`](./src/lib/components/chat/MessageInput.svelte)
  - composer UI, attachments, local draft emission
  - not cross-page orchestration
- [`src/lib/components/chat/MessageArea.svelte`](./src/lib/components/chat/MessageArea.svelte)
  - message list rendering and viewport behavior
  - generated-file reveal behavior at the bottom of the conversation scroll surface
- [`src/lib/components/layout/Sidebar.svelte`](./src/lib/components/layout/Sidebar.svelte)
  - navigation shell and store-driven sidebar state
- [`src/lib/components/layout/Header.svelte`](./src/lib/components/layout/Header.svelte)
  - top-level app shell interactions
- [`src/lib/components/sidebar/ConversationList.svelte`](./src/lib/components/sidebar/ConversationList.svelte)
  - owns sidebar drag/drop state and project-drop move orchestration through the existing conversations store path

Do not:

- bury durable business logic inside a presentational component because it is "already open"
- duplicate chat state transitions in both page files and chat components
- move project-folder drag/drop persistence into `ConversationItem.svelte` or `ProjectItem.svelte`; those components stay event emitters
- use unused legacy-looking components as templates without checking whether they are actually live

### Visual System And Layout Guardrails

- Design tokens live in:
  - [`src/app.css`](./src/app.css)
  - [`tailwind.config.ts`](./tailwind.config.ts)
- Token categories already defined:
  - semantic surface, text, icon, border, status, radius, spacing, duration, and shadow variables
- Font ownership:
  - UI chrome uses `Nimbus Sans L`
  - long-form message content uses `Libre Baskerville`
  - code uses the mono stack defined in `tailwind.config.ts`

Rules:

- prefer semantic CSS custom properties over hardcoded hex values when a token already exists
- keep spacing on the existing 4px-derived scale exposed through the spacing tokens
- preserve the reading-first visual direction: quiet UI chrome, generous spacing, and message content as the focal surface
- if you change color, spacing, radius, or typography primitives, update both `src/app.css` and the Tailwind mapping when needed

Scroll ownership contract:

- `body` should not become the scrolling surface
- the authenticated app shell contains layout overflow
- the sidebar list owns sidebar scrolling
- [`src/lib/components/chat/MessageArea.svelte`](./src/lib/components/chat/MessageArea.svelte) owns conversation scrolling

Do not:

- reintroduce body scrolling to solve a local layout bug
- hardcode one-off colors in components when the token system can express the change
- change typography choices in chat surfaces casually; those are part of the product identity
- move scroll responsibility between body, page, and message list without testing desktop and mobile behavior together

## Known Traps

- If you touch chat send/stream behavior, you are changing a multi-file contract:
  - server route
  - `chat-turn/*`
  - browser stream consumer
  - related tests
- Admin settings can override env-backed defaults. A change that looks correct in `.env` may still be superseded at runtime.
- Auxiliary services such as translation, title generation, context summarization, and Honcho should degrade gracefully. Do not make them hard dependencies of the core chat path unless that behavior change is intentional.
- `project-memory.ts` and the DB wrapper files exist on disk but are not the intended architectural direction. Do not revive them as active boundaries.

## Change Placement Guide

- New chat request/shared turn logic:
  - `src/lib/server/services/chat-turn/`
- New Langflow transport behavior:
  - `src/lib/server/services/langflow.ts`
- New admin-managed user account behavior:
  - `src/lib/server/services/user-admin.ts`
- New knowledge artifact or context behavior:
  - `src/lib/server/services/knowledge/`
- New vault behavior:
  - `src/lib/server/services/knowledge/store/vaults.ts`
- New chat-generated file behavior:
  - `src/lib/server/services/chat-files.ts`
  - `src/lib/server/services/sandbox-execution.ts`
- New continuity or evidence-context logic:
  - `src/lib/server/services/task-state.ts`
- New Honcho-specific behavior:
  - `src/lib/server/services/honcho.ts`
- New reusable browser API call:
  - `src/lib/client/api/`
- New client state transition:
  - `src/lib/stores/`
- New landing/chat handoff behavior:
  - `src/lib/client/conversation-session.ts`
- New environment-backed runtime setting:
  - `src/lib/server/env.ts` and `src/lib/server/config-store.ts`

## Mandatory Verification

Default verification after meaningful changes:

```bash
npm test
npm run build
```

Run targeted Playwright coverage when changing:

- chat send/stream behavior
  - `npx playwright test tests/e2e/chat.spec.ts tests/e2e/streaming.spec.ts tests/e2e/conversation.spec.ts`
- landing/chat draft handoff or composer behavior
  - `npx playwright test tests/e2e/chat.spec.ts tests/e2e/conversation.spec.ts`
- settings/admin/config behavior
  - `npx playwright test tests/e2e/settings-admin.spec.ts tests/e2e/login.test.ts`
- login/search/shell regressions
  - `npx playwright test tests/e2e/login.test.ts tests/e2e/search-modal.spec.ts`

Playwright note:
- E2E runs set `PLAYWRIGHT_TEST=1`.
- In that mode, [`src/routes/api/conversations/[id]/title/+server.ts`](./src/routes/api/conversations/[id]/title/+server.ts) short-circuits and returns `title: null` so browser tests do not depend on a live title-generator service.

Run these too when relevant:

- deployment/config/docs changes:
  - `npm run db:prepare`
  - keep `scripts/deploy.sh` aligned with the current DB migration story; deploys through that script should always run the idempotent `db:prepare` step so schema changes are applied even when the checkout was updated before the script started
  - verify [`src/routes/api/health/+server.ts`](./src/routes/api/health/+server.ts) still matches docs and deploy expectations
- knowledge upload or extraction changes:
  - verify upload size expectations remain aligned with [README.md](./README.md) and deployment docs

## What Not To Reintroduce

- No new top-level `src/lib/server/services/*.ts` public boundary just because one file is getting large.
- No parallel memory subsystem beside `task-state.ts`, `honcho.ts`, and `persona-memory.ts`.
- No duplicated route-specific chat execution logic.
- No new raw `sessionStorage` protocol outside `conversation-session.ts`.
- No direct env reads in override-aware runtime services.
- No runtime migrations in app bootstrap.
- No duplicate DB repository wrappers.
- No stores that also become API clients.
- No monolithic catch-all service file that mixes unrelated concerns again.
- No revival of deleted legacy files just because they reappear as untracked leftovers after merges or agentic runs; verify git history before restoring anything outside the tracked graph.

## Doc Map

- [README.md](./README.md)
  - public setup, deployment, stack, env vars, operational caveats
- [AGENTS.md](./AGENTS.md)
  - canonical engineering boundaries and placement rules
- Supplemental references
  - [deploy/README.md](./deploy/README.md)
  - [docs/external-deployment.md](./docs/external-deployment.md)

If a supplemental doc conflicts with this file or the README, update the supplemental doc rather than copying the stale pattern back into the codebase.
