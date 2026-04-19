# Routes

Route organization for the SvelteKit app.

## Overview

Routes are thin adapters. Page routes render UI; API routes expose endpoints. Durable logic lives in services, stores, and client API modules.

## Structure

```
(app)/                 # Authenticated app group
  +layout.server.ts    # Preloads conversations, projects, models, user prefs
  +layout.svelte       # App shell with sidebar
  +page.svelte         # Landing page (draft prep, first-message handoff)
  chat/[conversationId]/
    +page.svelte       # Chat detail (stream lifecycle, draft restore)
  knowledge/
    +page.svelte       # Knowledge base (library, memory)
    _components/       # Page-local UI components
    _helpers.ts        # Page-only helpers
  settings/
    +page.svelte       # Settings/admin UI

api/                   # API endpoints
  chat/                # Send, stream, retry, stop, file generation
  conversations/       # CRUD, title, draft, messages, evidence
  knowledge/           # Upload, search, documents, memory
  admin/               # Config, users, sessions, memory-maintenance
  settings/            # Account, profile, password, avatar

login/                 # Login page
logout/                # Logout page
```

## Where to Look

| Route | Purpose |
|-------|---------|
| `(app)/+layout.server.ts` | Auth guard, data preload |
| `(app)/+page.svelte` | Landing draft prep, pending message storage |
| `chat/[conversationId]/+page.svelte` | Stream lifecycle, queued turns, workspace state |
| `api/chat/send/+server.ts` | Non-streaming chat endpoint |
| `api/chat/stream/+server.ts` | SSE streaming endpoint |
| `api/knowledge/upload/+server.ts` | File upload handler |
| `api/admin/config/+server.ts` | Runtime config overrides |

## Conventions

- **Layout loading**: `(app)/+layout.server.ts` preloads all sidebar data; child routes avoid refetching
- **Page-local components**: Use `_components/` and `_helpers.ts` for page-only UI logic
- **API organization**: Group by domain (`chat/`, `knowledge/`, `admin/`, `settings/`)
- **Route params**: Dynamic segments use `[param]`; access via `event.params`
- **Auth**: `hooks.server.ts` attaches user to `locals`; routes use `requireAuth()` or redirect
- **Thin routes**: Parse request, call service, return response; no business logic inline

## Anti-Patterns

- Duplicating turn logic between `send` and `stream` routes
- Adding business logic directly in `+server.ts` files instead of services
- Fetching layout data again in child pages
- Creating new `sessionStorage` keys outside `conversation-session.ts`
- Adding route-local SSE event shapes without updating the browser parser
- Putting raw `fetch` boilerplate in pages instead of `src/lib/client/api/`
