# AGENTS.md

This file is the canonical map for where code should go and how to change AlfyAI safely. Public setup and deployment belong in [README.md](./README.md). Product/design detail docs are supplemental.

## Purpose

- Use this file as the first stop before making code changes.
- Prefer existing subsystem boundaries over adding new top-level abstractions.
- Keep route files thin and push reusable behavior into the existing service and client boundaries below.

## Subsystem Ownership

- `src/routes/**`
  - Treat routes as transport adapters, loaders, and request validation layers.
  - Avoid placing durable business logic directly in route handlers.

- `src/lib/server/services/chat-turn/`
  - Shared chat request parsing, preflight checks, execution, streaming, and finalization live here.
  - If both `/api/chat/send` and `/api/chat/stream` need the same behavior, it belongs here.

- `src/lib/server/services/knowledge.ts`
  - Public knowledge boundary.
  - Internal knowledge logic belongs under `src/lib/server/services/knowledge/`.

- `src/lib/server/services/task-state.ts`
  - Public task-state and continuity boundary.
  - Do not reintroduce `project-memory` or split continuity back into a parallel top-level service.

- `src/lib/server/services/honcho.ts`
  - Honcho-specific adapter logic only.
  - Generic prompt/context/token helpers belong in shared utilities or task-state, not here.

- `src/lib/client/api/`
  - Owns browser-side `fetch` wrappers and response parsing.
  - Stores should call these modules instead of issuing raw network requests directly.

- `src/lib/stores/`
  - Owns client state, optimistic updates, and UI-facing state transitions.
  - Do not use stores as ad hoc API clients.

- `src/lib/client/conversation-session.ts`
  - Owns landing/chat draft handoff and `sessionStorage` coordination.
  - Do not scatter draft session keys or pending-message handoff logic across pages.

## Request And Data Flow

1. `src/hooks.server.ts`
   - validates the session
   - attaches the current user
   - refreshes runtime config overrides
   - starts optional maintenance schedulers

2. `src/routes/(app)/+layout.server.ts`
   - preloads conversations, projects, user preferences, and available models

3. `src/routes/(app)/+page.svelte`
   - prepares draft conversations on the landing page
   - stores the first pending message before navigation

4. `src/routes/(app)/chat/[conversationId]/+page.svelte`
   - consumes the pending initial message
   - streams the response
   - updates draft persistence and attached context state

5. `src/routes/api/chat/*` + `src/lib/server/services/chat-turn/*`
   - parse request
   - validate attachments and model selection
   - run Langflow/model work
   - apply translation and memory/context updates
   - persist messages, evidence, and follow-up state

6. Settings/admin flow
   - environment variables provide base config
   - `src/lib/server/config-store.ts` merges database overrides
   - admin settings routes/UI can override selected runtime values later

## Rules For Adding New Code

- Do not add duplicate DB wrapper modules under `src/lib/server/db/`.
- Do not add new top-level service files unless a genuinely new public subsystem boundary is justified.
- Do not put direct `fetch` calls into stores when a client API module should own them.
- Do not scatter draft/session state logic outside `src/lib/client/conversation-session.ts`.
- Do not import env directly in services that should respect runtime config overrides; use `getConfig()`.
- Keep admin override behavior in mind when changing config handling or documenting defaults.
- Prefer extending existing boundaries over inventing sidecar abstractions with overlapping responsibilities.

## Mandatory Verification

- Default checks after meaningful changes:

```bash
npm test
npm run build
```

- Also run targeted Playwright coverage when changing:
  - chat send/stream behavior
  - settings/admin flows
  - landing-to-chat draft/session handoff
  - conversation CRUD behavior

- When changing deployment, config, or docs:
  - verify `npm run db:prepare`
  - verify `GET /api/health`
  - verify `scripts/deploy.sh` still matches the documented behavior

## Doc Map

- [README.md](./README.md)
  - public setup, stack, deployment, configuration, operational caveats

- [AGENTS.md](./AGENTS.md)
  - canonical engineering and code-placement guide

- Supplemental legacy/deeper docs
  - [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)
  - [DESIGN_SYSTEM_LLM_SPEC.md](./DESIGN_SYSTEM_LLM_SPEC.md)
  - [deploy/README.md](./deploy/README.md)
  - [docs/external-deployment.md](./docs/external-deployment.md)

Treat those supplemental docs as supporting references, not the first source of truth for implementation placement.
