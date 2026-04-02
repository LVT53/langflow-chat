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

Do not:

- duplicate session/bootstrap checks inside every child route unless the route truly has extra requirements
- fetch the same layout data again in child pages unless the data is page-specific and cannot come from layout

### Client Shell And Page Boundaries

- [`src/routes/(app)/+page.svelte`](./src/routes/(app)/+page.svelte)
  - Landing page.
  - Prepares a draft conversation and stores the first pending message before navigation.
- [`src/routes/(app)/chat/[conversationId]/+page.ts`](./src/routes/(app)/chat/[conversationId]/+page.ts)
  - Lightweight page bootstrap for the chat detail route.
- [`src/routes/(app)/chat/[conversationId]/+page.svelte`](./src/routes/(app)/chat/[conversationId]/+page.svelte)
  - Owns live chat page state, stream lifecycle, and draft restore behavior for an existing conversation.
  - Owns the one-slot queued follow-up turn while a response is streaming.
  - Route-local `_components/` and `*_helpers.ts` files are acceptable for chat render scaffolding and pure page-only transforms, but stream/evidence/draft orchestration should stay in the page.
- [`src/routes/(app)/knowledge/+page.svelte`](./src/routes/(app)/knowledge/+page.svelte)
  - Large page-specific knowledge UI with two-column layout.
  - Left sidebar (224px): VaultSidebar for vault management.
  - Main content: Library and Memory Profile tabs.
  - It may contain page-local fetches for page-only actions, but shared browser API logic should still move to `src/lib/client/api/` if reused.
- [`src/routes/(app)/settings/+page.svelte`](./src/routes/(app)/settings/+page.svelte)
  - User settings and admin/runtime config UI surface.
  - The Administration tab is split into `System` and `Users` panes.
  - Route-local `_components/`, `*_helpers.ts`, or `*.svelte.ts` files next to the page are acceptable when splitting page-only UI/controller logic without creating a new shared boundary.

Do not:

- move chat orchestration into shared visual components
- make `MessageInput.svelte` own cross-page navigation or conversation bootstrap decisions
- make `MessageInput.svelte` own queued-turn orchestration; it may emit `onQueue`, but the chat page decides auto-send and restore behavior
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
  - [`src/lib/server/services/chat-files.ts`](./src/lib/server/services/chat-files.ts)
  - [`src/routes/api/chat/files/[id]/save-to-vault/+server.ts`](./src/routes/api/chat/files/[id]/save-to-vault/+server.ts)
  - [`src/lib/components/chat/GeneratedFile.svelte`](./src/lib/components/chat/GeneratedFile.svelte)
  - [`src/lib/components/chat/VaultPickerModal.svelte`](./src/lib/components/chat/VaultPickerModal.svelte)
- Generated files refresh:
  - [`src/lib/services/streaming.ts`](./src/lib/services/streaming.ts) — `StreamMetadata.generatedFiles` field
  - Stream end event includes `generatedFiles` fetched via `getChatFiles()`
  - Chat page `onEnd` callback refreshes `generatedFiles` state from metadata

Do:

- put shared request parsing, attachment preflight, model normalization, stream framing, and finalization in `chat-turn/`
- let `src/lib/server/services/chat-turn/stream.ts` own shared upstream event parsing, tool-call marker handling, downstream token/thinking framing, and `<preserve>` chunk handling
- let `src/lib/server/services/chat-turn/execute.ts` normalize non-stream assistant text through the shared stream-protocol helpers so `/send` returns the same visible content shape that `/stream` would show
- use `src/routes/api/chat/stream/stop/+server.ts` plus `chat-turn/active-streams.ts` for explicit user-requested aborts; do not overload passive disconnect handling for that purpose
- keep route files thin and transport-oriented
- preserve SSE event names and payload expectations unless the parser/UI/tests are intentionally updated together
- treat `<preserve>...</preserve>` as translation-preserved display content, not a signal to wrap prose in fenced code
- use `GeneratedFile.svelte` for rendering AI-generated files in chat
- use `VaultPickerModal.svelte` for saving generated files to vaults
- save-to-vault endpoint deletes source file after successful copy

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
- `store/cleanup.ts`
  - artifact deletion
  - cross-conversation reference checks
  - bulk cleanup actions
- `context.ts`
  - relevant-artifact lookup
  - working-set and context status operations
  - context-related reads/writes used during chat
- `capsules.ts`
  - work capsules
  - generated outputs
  - artifact-to-capsule mapping

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
  - [`src/routes/(app)/knowledge/_components/VaultSidebar.svelte`](./src/routes/(app)/knowledge/_components/VaultSidebar.svelte)
  - [`src/routes/(app)/knowledge/_components/CreateVaultModal.svelte`](./src/routes/(app)/knowledge/_components/CreateVaultModal.svelte)
  - [`src/routes/(app)/knowledge/_components/DeleteVaultDialog.svelte`](./src/routes/(app)/knowledge/_components/DeleteVaultDialog.svelte)
  - [`src/routes/(app)/knowledge/_components/VaultFileUpload.svelte`](./src/routes/(app)/knowledge/_components/VaultFileUpload.svelte)
- Vault client API:
  - [`src/lib/client/api/knowledge.ts`](./src/lib/client/api/knowledge.ts) — `fetchVaults`, `createVault`, `renameVault`, `deleteVault`, `fetchStorageQuota`
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
- `VaultSidebar.svelte` owns OS file drag/drop targeting for vault uploads, and its drag overlay must stay visual-only so hovered vault rows or the sidebar fallback can receive `dragover`/`drop`

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
- `memory-maintenance.ts` owns per-user maintenance scheduling. Chat-triggered maintenance must stay serialized and debounced there; do not trigger full cluster recomputation directly from routes or UI code.
- `persona-memory.ts` cluster writes should remain idempotent under overlap. If maintenance or repair paths touch cluster persistence, keep conflict guards in place instead of assuming single-flight inserts.
- `buildPersonaPromptContext` should read the latest stored persona clusters immediately and only trigger cluster refresh in the background. Do not put synchronous cluster regeneration back on the chat request path.
- Keep Honcho latency knobs split by responsibility: `HONCHO_CONTEXT_WAIT_MS` is for live session bootstrap/queue/context reads, `HONCHO_PERSONA_CONTEXT_WAIT_MS` is for auxiliary chat-path persona enrichment, and `HONCHO_OVERVIEW_WAIT_MS` is for the Knowledge Base live overview refresh path.
- `persona-memory.ts` owns automatic persona-memory class and decay heuristics. Perishable facts should age out quickly and stay out of durable-profile summaries, while stable preferences should not auto-archive from age alone unless superseded.
- `persona-memory.ts` also owns deterministic stable-preference slot extraction and same-slot supersession. Prefer explicit replacement of older durable preferences over age-based archival, and keep the metadata in existing cluster JSON rather than adding a parallel preference store.
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
- **In-memory extraction**: Tar archives parsed in-memory, never written to host disk
- **Path traversal protection**: Rejects `..`, absolute paths, null bytes, symlinks, devices
- **Aggregate limits**: Max 20 output files, 50MB total output

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
- `src/lib/client/api/knowledge.ts` provides `fetchVaults`, `createVault`, `renameVault`, `deleteVault`, `fetchStorageQuota` for vault management.
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
