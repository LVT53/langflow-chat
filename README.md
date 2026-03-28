# AlfyAI

AlfyAI is a SvelteKit chat application for Langflow-backed AI workflows. It provides streaming chat, a user-scoped knowledge base, optional translation, optional Honcho-backed long-term memory, and SQLite persistence in a single Node deployment.

## Stack At A Glance

- SvelteKit with Svelte 5 and Tailwind CSS 4
- `@sveltejs/adapter-node` for Node server deployment
- SQLite with `better-sqlite3` and Drizzle ORM
- Langflow as the primary orchestration backend
- OpenAI-compatible endpoints for chat, title generation, translation, and optional context summarization
- Optional Honcho integration for cross-conversation memory

## Quick Deployment With `scripts/deploy.sh`

Prerequisites:

- Node.js 20+
- npm
- git
- a configured `.env`
- a writable `data/` directory
- reachable Langflow and model endpoints from the app server

Quick start:

```bash
cp .env.example .env
# edit .env with your real values

./scripts/deploy.sh
```

The deploy script performs these steps in order:

1. `git pull origin main`
2. `npm install`
3. `npm run build`
4. `npm run db:prepare`

Important caveat:

- `scripts/deploy.sh` does **not** restart PM2, systemd, Docker, or any other running process. It prints `PM2_APP_NAME`, but that value is informational only. Restart your process manager separately after the script completes.

Deploy-script environment variables:

| Variable | Required? | Default | What it does | When to set it | Caveats |
|---|---|---:|---|---|---|
| `APP_DIR` | No | current working directory | Tells `scripts/deploy.sh` which checkout to deploy from | Set it when the script is invoked from outside the app directory | Script-only variable; not read by the app |
| `PM2_APP_NAME` | No | `langflow-chat` | Printed by `scripts/deploy.sh` for operator context | Set it if your PM2 process uses a different name | Currently not used to restart or reload anything |

## Local Development

```bash
npm install
cp .env.example .env
npm run dev
```

Common verification commands:

```bash
npm test
npm run build
```

## User Bootstrap And Ongoing Admin Management

For the first local or freshly deployed instance, create an initial account from the CLI:

```bash
# default bootstrap account: admin@local / admin123
npm run seed

# explicit admin account
npx tsx scripts/seed-admin.ts --email=admin@example.com --password=secret123 --name="Admin User" --admin
```

After you can sign in as an admin, ongoing account management belongs in the app UI:

- `Settings` -> `Administration` -> `Users`
- create users
- promote or demote admin access
- revoke active sessions
- delete users

## Architecture Overview

At a high level, AlfyAI runs as a single SvelteKit application with server routes, client UI, and persistence in the same repository.

- Server hooks validate the session, attach the current user, load runtime config overrides, and start optional maintenance schedulers.
- The app layout preloads conversations, projects, model availability, and user preferences before the main UI renders.
- The landing page prepares a draft conversation, stores any pending first message, and navigates into the chat page once a conversation exists.
- The chat page consumes any pending initial message, supports one queued follow-up turn while a response is streaming, and streams the assistant response over Server-Sent Events.
- The shared chat-turn pipeline handles request parsing, attachment readiness, Langflow execution, translation, memory/context updates, persistence, and response finalization.
- Outbound Langflow prompt assembly includes a centralized date-before-search guard for freshness-sensitive searches.
- Knowledge-base operations, task-state continuity, and optional Honcho sync sit behind server service boundaries rather than directly in route files.
- Runtime config comes from environment variables first, with selected values optionally overridden later through the admin settings UI and stored in SQLite.

### Interface And Content Characteristics

- The product is intentionally reading-focused rather than dashboard-like: message content uses a serif text face, while the surrounding UI uses a sans-serif system for clearer navigation and controls.
- Markdown responses are rendered with code highlighting and sanitization, so technical answers can mix prose, code blocks, and inline snippets safely.
- The same app shell supports desktop, tablet, and mobile layouts, with the conversation view remaining the primary surface across breakpoints.
- Sidebar conversations can be organized into project folders through the existing move flow and desktop drag/drop.
- Persistent conversations, AI-generated titles, file-backed knowledge attachments, and optional translation/memory features are designed as additive layers around the core chat flow rather than separate products.

## Configuration Reference

Notes before the tables:

- Only `LANGFLOW_API_KEY` and `SESSION_SECRET` are hard-required at app boot.
- Some settings can also be overridden later in the admin UI and stored in the database.
- `MODEL_*_SYSTEM_PROMPT` may be a built-in prompt key or full prompt text. Built-in keys are preferred.
- `MODEL_2_ENABLED=false` hides model 2 in the UI and forces model fallback to model 1.
- `BODY_SIZE_LIMIT` is adapter-node/server runtime behavior, not an app-level feature flag.
- The production build patches adapter-node so the default `BODY_SIZE_LIMIT` becomes `50M`.
- Knowledge uploads are currently capped at 50MB in the app, so keep `BODY_SIZE_LIMIT` at or above that limit.

### Core Runtime

| Variable | Required? | Default | What it does | When to set it | Caveats |
|---|---|---:|---|---|---|
| `LANGFLOW_API_URL` | No | `http://localhost:7860` | Base URL for the Langflow service | Set it in every real deployment unless Langflow is running at the default local address | Must be reachable from the app server |
| `LANGFLOW_API_KEY` | Yes | none | Authenticates Langflow API calls | Always set in real deployments | App boot fails if missing |
| `LANGFLOW_FLOW_ID` | No | empty | Default Langflow flow used when a model-specific flow is not configured | Set it when you use one primary Langflow flow for chat | Model-specific flow IDs override it |
| `LANGFLOW_WEBHOOK_SECRET` | No | empty | Shared secret for Langflow sentence webhook verification | Set it when webhook flows are exposed or shared across systems | Leave empty only in trusted/local setups |
| `SESSION_SECRET` | Yes | none | Signs and protects session cookies | Always set to a long random secret in every environment | App boot fails if missing |
| `DATABASE_PATH` | No | `./data/chat.db` | SQLite database location | Set it when the database should live outside the repo root or on a mounted volume | The parent directory must be writable |
| `WEBHOOK_PORT` | No | `8090` | Port used by webhook-related server handling | Set it only if your deployment expects a different port | Must be numeric |
| `REQUEST_TIMEOUT_MS` | No | `120000` | Upstream request timeout for long-running model calls | Lower it for stricter failure windows or raise it for slower models | Affects perceived reliability on slow backends |
| `MAX_MESSAGE_LENGTH` | No | `10000` | Maximum accepted user message length | Lower it for tighter limits or raise it for longer prompts | Can also be overridden in admin config |
| `ATTACHMENT_TRACE_DEBUG` | No | `false` | Enables extra attachment tracing logs | Turn it on while debugging upload/readiness issues | Debug logging only; not a feature flag |

### Primary And Secondary Model Endpoints

| Variable | Required? | Default | What it does | When to set it | Caveats |
|---|---|---:|---|---|---|
| `MODEL_1_BASEURL` | No | `http://localhost:30001/v1` | OpenAI-compatible base URL for the primary model | Set it to your main chat model endpoint | Separate from Langflow |
| `MODEL_1_API_KEY` | No | empty | API key for model 1 | Set it when your model endpoint requires auth | Empty is valid for unauthenticated local servers |
| `MODEL_1_NAME` | No | `model-1` | Model identifier sent to model 1 | Set it to the exact served model name | Must match the upstream endpoint |
| `MODEL_1_DISPLAY_NAME` | No | `Model 1` | Public label shown in the UI | Set it for clearer model names in the product | Cosmetic only |
| `MODEL_1_SYSTEM_PROMPT` | No | `default` | Prompt key or full prompt text for model 1 | Set it when model 1 should use a specific system prompt | Built-in prompt keys are preferred over pasted prompt bodies |
| `MODEL_1_FLOW_ID` | No | falls back to `LANGFLOW_FLOW_ID` | Model-specific Langflow flow override for model 1 | Set it when model 1 should route to a different flow | Overrides the global flow only for model 1 |
| `MODEL_2_BASEURL` | No | empty | OpenAI-compatible base URL for the secondary model | Set it only if you want a second selectable model | If unset, model 2 is not useful even if enabled |
| `MODEL_2_API_KEY` | No | empty | API key for model 2 | Set it when model 2 requires auth | Empty is valid for unauthenticated local servers |
| `MODEL_2_NAME` | No | empty | Model identifier sent to model 2 | Set it to the exact served model name | Must match the upstream endpoint |
| `MODEL_2_DISPLAY_NAME` | No | `Model 2` | Public label shown in the UI | Set it for a meaningful secondary model label | Cosmetic only |
| `MODEL_2_SYSTEM_PROMPT` | No | `default` | Prompt key or full prompt text for model 2 | Set it when model 2 should use a specific system prompt | Built-in prompt keys are preferred |
| `MODEL_2_FLOW_ID` | No | falls back to `LANGFLOW_FLOW_ID` | Model-specific Langflow flow override for model 2 | Set it when model 2 should route differently | Overrides the global flow only for model 2 |
| `MODEL_2_ENABLED` | No | `true` | Enables model 2 as a selectable option | Set it to `false` to hide model 2 and force fallback to model 1 | Can also be overridden in admin config |

### Translation, Title Generation, And Summarization

| Variable | Required? | Default | What it does | When to set it | Caveats |
|---|---|---:|---|---|---|
| `TRANSLATOR_URL` | No | `http://localhost:30002/v1` | OpenAI-compatible translation endpoint | Set it when you want automatic translation support | Must be reachable from the app server |
| `TRANSLATOR_API_KEY` | No | empty | API key for the translation endpoint | Set it if the translator requires auth | Empty is valid for local/private servers |
| `TRANSLATOR_MODEL` | No | `translategemma` | Model name sent to the translation endpoint | Set it to the served translation model name | Can also be overridden in admin config |
| `TRANSLATION_MAX_TOKENS` | No | `256` | Max output tokens per translation request | Raise it if translated outputs are getting clipped | Higher values may cost more or take longer |
| `TRANSLATION_TEMPERATURE` | No | `0.1` | Sampling temperature for translation | Keep it low for deterministic translation | Can also be overridden in admin config |
| `TITLE_GEN_URL` | No | `http://localhost:30001/v1` | OpenAI-compatible endpoint used for conversation title generation | Set it if titles should be generated by a dedicated model service | Auxiliary service; core chat can still work if it fails |
| `TITLE_GEN_API_KEY` | No | empty | API key for the title generation endpoint | Set it if the title endpoint requires auth | Empty is valid for local/private servers |
| `TITLE_GEN_MODEL` | No | `nemotron-nano` | Model name used for title generation | Set it to the exact served model name | Can also be overridden in admin config |
| `CONTEXT_SUMMARIZER_URL` | No | falls back to `TITLE_GEN_URL` | Optional dedicated endpoint for context summarization | Set it when summarization should use a separate service | If unset, the title generation URL is reused |
| `CONTEXT_SUMMARIZER_API_KEY` | No | falls back to `TITLE_GEN_API_KEY` | API key for the context summarizer | Set it when the summarizer has separate auth | If unset, the title generation key is reused |
| `CONTEXT_SUMMARIZER_MODEL` | No | empty | Model name used for context summarization | Set it if summarization is enabled and uses a dedicated model | Empty means no dedicated summarizer model is configured |

### Optional Long-Term Memory

| Variable | Required? | Default | What it does | When to set it | Caveats |
|---|---|---:|---|---|---|
| `HONCHO_ENABLED` | No | `false` | Enables Honcho-backed long-term memory features | Set it to `true` only when Honcho is reachable and intended for use | Can also be overridden in admin config |
| `HONCHO_API_KEY` | No | empty | API key for the Honcho service | Set it if your Honcho deployment requires auth | Empty is valid for unauthenticated local deployments |
| `HONCHO_BASE_URL` | No | `http://localhost:8000` | Base URL for the Honcho service | Set it when Honcho runs on another host or port | Must be reachable from the app server |
| `HONCHO_WORKSPACE` | No | `alfyai-prod` | Workspace namespace used inside Honcho | Set it per environment or tenant | Keep production and test workspaces separate |
| `MEMORY_MAINTENANCE_INTERVAL_MINUTES` | No | `0` | Enables periodic maintenance for memory/task-state cleanup | Set it to a positive number to turn on the scheduler | `0` disables the scheduler entirely |

### Deployment And Runtime Wrapper Variables

| Variable | Required? | Default | What it does | When to set it | Caveats |
|---|---|---:|---|---|---|
| `BODY_SIZE_LIMIT` | No | patched to `50M` in production builds | Controls the adapter-node request body size limit | Raise it if your deployment needs larger request bodies | Server/runtime setting, not an app feature toggle |
| `NODE_ENV` | No | environment dependent | Controls framework/runtime production behavior | Set it to `production` in real deployments | Also affects cookie security behavior |
| `APP_DIR` | No | current working directory | Tells `scripts/deploy.sh` where the app checkout lives | Set it when deploying from outside the repo directory | Deploy-script only |
| `PM2_APP_NAME` | No | `langflow-chat` | Printed by `scripts/deploy.sh` for operator context | Set it if you use PM2 with a custom process name | Not currently used for restart or reload logic |

## Operational Caveats

- If you bypass `scripts/deploy.sh`, run `npm run db:prepare` before starting the production server.
- Persist the `data/` directory across deploys so chats, drafts, uploads, and SQLite data survive restarts.
- On Linux, document extraction quality improves if `poppler-utils`, `unzip`, and `binutils` are installed.
- `GET /api/health` exists and returns `{"status":"OK"}`.
- Auxiliary services such as title generation, translation, and summarization can fail independently without necessarily blocking core chat.
- Admin configuration can override selected runtime values after boot; the environment remains the base layer, not always the final one.

## Testing And Verification

For a basic verification pass:

```bash
npm test
npm run build
```

Playwright coverage is also available for critical browser flows such as login, chat streaming, conversations, and admin settings, but the root README intentionally keeps the testing section short.

Playwright runs set `PLAYWRIGHT_TEST=1`, and the conversation-title endpoint returns `null` in that mode so browser tests do not depend on an external title-generation service.

## API Note

AlfyAI ships with internal API families such as:

- `/api/chat`
- `/api/conversations`
- `/api/knowledge`
- `/api/settings`
- `/api/admin`

These routes power the application itself. They are not presented as a stable public integration API, and route details may evolve with the product.

## Further Documentation

- Advanced deployment notes: [deploy/README.md](./deploy/README.md)
- External runtime caveats for knowledge uploads and Honcho: [docs/external-deployment.md](./docs/external-deployment.md)
- Agent-facing codebase guide: [AGENTS.md](./AGENTS.md)
