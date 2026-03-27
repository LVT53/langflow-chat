# AGENTS.md

This file is the canonical engineering map for AlfyAI. Read it before changing code. Public setup, deployment, and environment documentation live in [README.md](./README.md). Product and design notes in other docs are supplemental, not the source of truth for code placement.

## Mandatory Docs Check

- Before touching code, check current documentation through Context7 and the Svelte/SvelteKit MCP docs tools for the relevant framework or library surface.
- This is especially required for Svelte, SvelteKit, Tailwind, Vitest, Playwright, Drizzle, and any fast-moving integration used by this app.
- Do not write framework code purely from memory when an MCP-backed docs check can confirm the current API or recommended pattern.
- The goal is to avoid stale code, deprecated patterns, and implementations that drift away from the real versions used in this repo.
- If the Svelte MCP/docs tool is unavailable in the current session, use the best available official docs path before coding and call out that fallback explicitly.

## Purpose

- Use the existing boundaries in this file before inventing new ones.
- Optimize for reliability, low duplication, and clear ownership.
- Keep behavior stable at the route, SSE, DB, and component-contract layers unless the change is explicitly intended to alter those contracts.
- Prefer extending an existing subsystem over adding a new top-level service, store, or client helper.

## Core Rules

- Routes are adapters. Durable logic belongs in server services, client API modules, stores, or shared helpers.
- Shared behavior should exist once. Do not copy logic between `send` and `stream`, between multiple stores, or between multiple services.
- Runtime config flows through `src/lib/server/config-store.ts`. Do not bypass it in code that should respect admin overrides.
- `src/lib/server/db/index.ts` is connection/bootstrap only. Do not reintroduce runtime schema mutation there.
- `src/lib/client/conversation-session.ts` owns landing-to-chat handoff state. Do not scatter raw `sessionStorage` keys across pages or components.
- `src/lib/client/api/` owns reusable browser `fetch` logic. Stores should not become ad hoc HTTP clients.
- `src/lib/server/services/task-state.ts` is the continuity boundary. Do not reintroduce a parallel `project-memory` architecture.
- `src/lib/server/services/honcho.ts` is for Honcho-specific behavior only. Do not let it become a second generic prompt/memory engine.

## App Map

### Request Bootstrap

- [`src/hooks.server.ts`](./src/hooks.server.ts)
  - Validates the session cookie.
  - Attaches the current user to `locals`.
  - Refreshes runtime config overrides.
  - Starts optional maintenance work.
- [`src/routes/(app)/+layout.server.ts`](./src/routes/(app)/+layout.server.ts)
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
- [`src/routes/(app)/knowledge/+page.svelte`](./src/routes/(app)/knowledge/+page.svelte)
  - Large page-specific knowledge UI.
  - It may contain page-local fetches for page-only actions, but shared browser API logic should still move to `src/lib/client/api/` if reused.
- [`src/routes/(app)/settings/+page.svelte`](./src/routes/(app)/settings/+page.svelte)
  - User settings and admin/runtime config UI surface.

Do not:
- move chat orchestration into shared visual components
- make `MessageInput.svelte` own cross-page navigation or conversation bootstrap decisions
- turn page files into long-lived business-logic modules when a store/service/helper boundary already exists

### Chat Flow

- Route entrypoints:
  - [`src/routes/api/chat/send/+server.ts`](./src/routes/api/chat/send/+server.ts)
  - [`src/routes/api/chat/stream/+server.ts`](./src/routes/api/chat/stream/+server.ts)
- Shared pipeline:
  - [`src/lib/server/services/chat-turn/request.ts`](./src/lib/server/services/chat-turn/request.ts)
  - [`src/lib/server/services/chat-turn/preflight.ts`](./src/lib/server/services/chat-turn/preflight.ts)
  - [`src/lib/server/services/chat-turn/execute.ts`](./src/lib/server/services/chat-turn/execute.ts)
  - [`src/lib/server/services/chat-turn/stream.ts`](./src/lib/server/services/chat-turn/stream.ts)
  - [`src/lib/server/services/chat-turn/finalize.ts`](./src/lib/server/services/chat-turn/finalize.ts)
  - [`src/lib/server/services/chat-turn/types.ts`](./src/lib/server/services/chat-turn/types.ts)
- Upstream integrations:
  - [`src/lib/server/services/langflow.ts`](./src/lib/server/services/langflow.ts)
  - [`src/lib/server/services/translator.ts`](./src/lib/server/services/translator.ts)
  - [`src/lib/server/services/title-generator.ts`](./src/lib/server/services/title-generator.ts)
  - [`src/lib/server/services/messages.ts`](./src/lib/server/services/messages.ts)
  - [`src/lib/server/services/message-evidence.ts`](./src/lib/server/services/message-evidence.ts)

Do:
- put shared request parsing, attachment preflight, model normalization, stream framing, and finalization in `chat-turn/`
- keep route files thin and transport-oriented
- preserve SSE event names and payload expectations unless the parser/UI/tests are intentionally updated together

Do not:
- duplicate turn logic between `send` and `stream`
- add new SSE event shapes casually; this touches browser parsing and tests
- hide persistence side effects inside route-local closures that only one endpoint can see
- couple Langflow transport details directly into page components

### Knowledge And Context

- Public boundary:
  - [`src/lib/server/services/knowledge.ts`](./src/lib/server/services/knowledge.ts)
- Internal modules:
  - [`src/lib/server/services/knowledge/store.ts`](./src/lib/server/services/knowledge/store.ts)
  - [`src/lib/server/services/knowledge/context.ts`](./src/lib/server/services/knowledge/context.ts)
  - [`src/lib/server/services/knowledge/capsules.ts`](./src/lib/server/services/knowledge/capsules.ts)
- Related services:
  - [`src/lib/server/services/working-set.ts`](./src/lib/server/services/working-set.ts)
  - [`src/lib/server/services/document-extraction.ts`](./src/lib/server/services/document-extraction.ts)
  - [`src/lib/server/services/evidence-family.ts`](./src/lib/server/services/evidence-family.ts)
  - [`src/lib/server/services/knowledge-labels.ts`](./src/lib/server/services/knowledge-labels.ts)

Responsibility split:
- `store.ts`
  - artifact CRUD
  - file storage and deletion
  - attachment linking and listing
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

### Memory, Continuity, And Honcho

- Primary continuity/memory boundary:
  - [`src/lib/server/services/task-state.ts`](./src/lib/server/services/task-state.ts)
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
- `task-state.ts` owns task continuity, checkpoints, evidence-context assembly, and related summarization logic.
- `honcho.ts` should stay an integration adapter for Honcho sessions, peers, mirrored messages, and Honcho-specific context.
- `persona-memory.ts` may own persona-specific behavior, but low-level parsing/text/token helpers belong in shared utils.

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
- Settings loaders:
  - [`src/routes/(app)/settings/+page.server.ts`](./src/routes/(app)/settings/+page.server.ts)
  - [`src/routes/api/settings/+server.ts`](./src/routes/api/settings/+server.ts)

If you add a new runtime-configurable setting:
1. add env parsing/default handling in `env.ts` if it is environment-backed
2. add runtime normalization and override support in `config-store.ts`
3. expose it to the relevant settings/admin loaders and routes
4. update [README.md](./README.md) and [`.env.example`](./.env.example)

Do not:
- read directly from `process.env` or `env.ts` inside services that should respect admin overrides
- document a config variable publicly without confirming it exists in real code paths
- add admin-configurable behavior in the UI without threading it through `config-store.ts`

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
  - [`src/lib/client/api/http.ts`](./src/lib/client/api/http.ts)
  - [`src/lib/client/api/conversations.ts`](./src/lib/client/api/conversations.ts)
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
- stores own browser state, optimistic updates, and UI-facing transitions.
- `conversation-session.ts` owns landing draft IDs, pending first-message replay, previous-conversation markers, and draft cleanup rules.

Do not:
- put raw `fetch` + `res.ok` + JSON parsing boilerplate into stores
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

Do not:
- bury durable business logic inside a presentational component because it is "already open"
- duplicate chat state transitions in both page files and chat components
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
- New knowledge artifact or context behavior:
  - `src/lib/server/services/knowledge/`
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

## Doc Map

- [README.md](./README.md)
  - public setup, deployment, stack, env vars, operational caveats
- [AGENTS.md](./AGENTS.md)
  - canonical engineering boundaries and placement rules
- Supplemental references
  - [deploy/README.md](./deploy/README.md)
  - [docs/external-deployment.md](./docs/external-deployment.md)

If a supplemental doc conflicts with this file or the README, update the supplemental doc rather than copying the stale pattern back into the codebase.
