# AlfyAI

AlfyAI is a SvelteKit chat application for Langflow-backed AI workflows. It provides streaming chat, a user-scoped knowledge base, optional translation, optional Honcho-backed long-term memory, and SQLite persistence in a single Node deployment.

## Stack At A Glance

- SvelteKit with Svelte 5 and Tailwind CSS 4
- `@sveltejs/adapter-node` for Node server deployment
- SQLite with `better-sqlite3` and Drizzle ORM
- Langflow as the primary orchestration backend
- OpenAI-compatible endpoints for chat, title generation, translation, and optional context summarization
- Optional Hugging Face Text Embeddings Inference endpoints for embeddings and reranking
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
- If you deploy through `scripts/deploy.sh`, you should not need a separate manual DB migration step after pulls. The script always runs the idempotent `db:prepare` step so the DB catches up even if the checkout was already updated before the deploy script started.

For host-managed `adapter-node` deployments, the standard runtime entrypoint is:

```bash
npm start
```

That script runs `node build`. SvelteKit adapter-node uses the `HOST` and `PORT` environment variables for the listen address, so container-reachable host setups should use `HOST=0.0.0.0` instead of `127.0.0.1`.

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
- Landing-page draft reuse is guarded: only empty default-title prepared conversations are reused from session storage, which prevents new sends from silently reusing an older real chat.
- The chat page consumes any pending initial message, supports one queued follow-up turn while a response is streaming, and streams the assistant response over Server-Sent Events.
- Chat-generated files are created through the sandboxed file-generator path only when the executed code writes the final file to `/output`; successful files then appear back in the chat UI for download or manual vault saving. The mirrored Langflow custom node should send the script in `source_code` plus an explicit `language` argument, because `code` collides with Langflow component internals and can cause the node to send its own source instead of the requested script. On a fresh host, the first successful run may also pull the pinned sandbox image before execution starts.
- The app now uses a default-closed working-document workspace instead of separate preview silos. Generated files, chat attachments, knowledge-library documents, and search-opened vault files all reuse the same shared rich previewer: embedded in a right-side pane on desktop and a full-screen layer on mobile.
- The shared preview/workspace path now lazy-loads the heavy rich-preview stack and markdown highlighter on first open, so idle chat and knowledge pages do not pay the full document-preview cost up front.
- The working-document workspace now carries document identity and continuity affordances directly in the shell: version history for document families, source-message jump for generated outputs, compare mode for text-like versions, and a shared historical-status badge when a generated-document family has gone dormant.
- Unsaved generated files now become first-class working documents backed by generated-output artifacts, shared family/version metadata, and Honcho sync. Saving to vault remains a user organization action, not the switch that determines whether the AI remembers document continuity.
- The shared chat-turn pipeline handles request parsing, attachment readiness, Langflow execution, translation, memory/context updates, persistence, and response finalization.
- Outbound Langflow prompt assembly includes a centralized date-before-search guard for freshness-sensitive searches.
- Knowledge-base operations, task-state continuity, and optional Honcho sync sit behind server service boundaries rather than directly in route files.
- Persona-memory clustering now resolves relative time into structured freshness metadata, distinguishes short-term constraints from broader active project context, archives expired temporal memories as historical facts, and prevents stale Honcho overview text from overriding fresher local temporal truth.
- Persona-memory salience repair now also reacts to explicit user corrections. When a newer memory clearly corrects an older persona statement, the older memory stays auditable but becomes less assertive until the user reaffirms it later.
- The memory stack now also persists normalized `memory_events` for important state changes such as deadline updates, preference supersession, project continuity transitions, persona fact replacement, and generated-document supersession. That event log is local supporting history for the existing persona/task/document authorities, not a second parallel memory engine.
- Project continuity now also consumes those task-domain events on the read path. Explicit user pause/resume language can override stale project status immediately, and continuity views prefer the newest project state event over an older still-active row.
- Summary-level diagnostics now stay on the authority boundaries instead of route-local debug spam: working-document selection logs through `[CONTEXT]` in `knowledge/context.ts`, while Knowledge Memory overview source selection logs through `[KNOWLEDGE_MEMORY]` in `memory.ts`.
- TEI embedder and reranker clients now live behind app-owned service boundaries and runtime config. They are intended to power semantic shortlist generation and reranking in later waves, but they do not replace the app's deterministic authority rules for active document focus, temporal truth, or working-document lineage.
- The rerank-shaped evidence-selection paths now use the TEI reranker directly instead of routing reranking through the generic context-summarizer chat model. The control model still owns structured routing, verification, and semantic JSON tasks; TEI now owns top-N evidence/chunk/historical/tool reranking.
- Wave 2 TEI persistence is now in place through one local `semantic_embeddings` table keyed by user, subject type, subject id, and model name. That unified store is the shared substrate for later artifact, persona-cluster, and task-state semantic retrieval waves.
- Wave 3 TEI refresh/backfill is now also in place. Artifact creation, task-state writes, and persona-cluster dreaming queue semantic refreshes asynchronously, while `memory-maintenance.ts` performs the slower user-scoped backfill sweep for missing or stale embeddings without blocking chat turns.
- Wave 5 document retrieval is now semantic as well. `knowledge/store/documents.ts` broadens the user-scoped artifact candidate pool, scores it with stored artifact embeddings, optionally reranks the shortlist through TEI, and then hands those ranked candidates back to the existing document-family and active-focus authority paths.
- Wave 6 persona retrieval is now semantic at prompt time. `persona-memory.ts` still filters archived, historical, expired, superseded, and corrected memories deterministically first, then uses stored persona-cluster embeddings and bounded rerank scores to choose which surviving memories are most relevant to the current query for prompt context.
- Wave 7 task routing is now semantic as well. `task-state.ts` still respects locked-task precedence and deterministic status transitions, but it now uses stored task-state embeddings and bounded rerank scores to better revive or continue the right prior task when lexical overlap alone is weak.
- Wave 8 TEI observability is now in place as well. `knowledge/store/documents.ts`, `persona-memory.ts`, and `task-state.ts` now emit one compact `[TEI] Retrieval summary` line with shortlist/rerank latency, fallback reason, candidate counts, and the winning retrieval mode instead of scattering retrieval diagnostics across unrelated logs.
- Runtime config comes from environment variables first, with selected values optionally overridden later through the admin settings UI and stored in SQLite.

### Interface And Content Characteristics

- The product is intentionally reading-focused rather than dashboard-like: message content uses a serif text face, while the surrounding UI uses a sans-serif system for clearer navigation and controls.
- Markdown responses are rendered with code highlighting and sanitization, so technical answers can mix prose, code blocks, and inline snippets safely.
- The same app shell supports desktop, tablet, and mobile layouts, with the conversation view remaining the primary surface across breakpoints.
- Sidebar conversations can be organized into project folders through the existing move flow and desktop drag/drop.
- Persistent conversations, AI-generated titles, file-backed knowledge attachments, and optional translation/memory features are designed as additive layers around the core chat flow rather than separate products.
- Working-document planning and rollout details live in [docs/working-documents-architecture.md](./docs/working-documents-architecture.md) and [docs/working-documents-implementation-plan.md](./docs/working-documents-implementation-plan.md). The direction is to consolidate generated files, attachments, and vault files onto one document system built on the existing artifact backbone rather than creating overlapping product concepts.

## Configuration Reference

Notes before the tables:

- Only `LANGFLOW_API_KEY` and `SESSION_SECRET` are hard-required at app boot.
- Some settings can also be overridden later in the admin UI and stored in the database.
- Model and title-generator system prompts default to empty and are intended to be set in the admin UI or explicitly via env vars.
- Legacy built-in prompt keys such as `alfyai-nemotron`, `hermes-thinking`, and `default` are still recognized if you already have them stored.
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
| `ALFYAI_API_KEY` | No | empty | Optional bearer key for `/api/chat/files/generate` when the Langflow file-generator tool calls the app without a browser session | Set it on both AlfyAI and the Langflow node when using sandboxed file generation from Langflow agents | Empty disables bearer auth and leaves session auth as the only path |
| `SESSION_SECRET` | Yes | none | Signs and protects session cookies | Always set to a long random secret in every environment | App boot fails if missing |
| `DATABASE_PATH` | No | `./data/chat.db` | SQLite database location | Set it when the database should live outside the repo root or on a mounted volume | The parent directory must be writable |
| `WEBHOOK_PORT` | No | `8090` | Port used by webhook-related server handling | Set it only if your deployment expects a different port | Must be numeric |
| `REQUEST_TIMEOUT_MS` | No | `120000` | Upstream request timeout for long-running model calls | Lower it for stricter failure windows or raise it for slower models | Affects perceived reliability on slow backends |
| `MAX_MESSAGE_LENGTH` | No | `10000` | Maximum accepted user message length | Lower it for tighter limits or raise it for longer prompts | Can also be overridden in admin config |
| `ATTACHMENT_TRACE_DEBUG` | No | `false` | Enables extra attachment tracing logs | Turn it on while debugging upload/readiness issues | Debug logging only; not a feature flag |
| `MAX_MODEL_CONTEXT` | No | `262144` | Maximum tokens the model context window supports | Raise it for larger context windows or lower it for stricter limits | Can also be overridden in admin config |
| `COMPACTION_UI_THRESHOLD` | No | `209715` | UI warning threshold at 80% of max | Adjust if you want earlier or later compaction warnings | Can also be overridden in admin config |
| `TARGET_CONSTRUCTED_CONTEXT` | No | `157286` | Target context size at 60% of max | Adjust to control how aggressively context is compacted | Can also be overridden in admin config |

### Primary And Secondary Model Endpoints

| Variable | Required? | Default | What it does | When to set it | Caveats |
|---|---|---:|---|---|---|
| `MODEL_1_BASEURL` | No | `http://localhost:30001/v1` | OpenAI-compatible base URL for the primary model | Set it to your main chat model endpoint | Separate from Langflow |
| `MODEL_1_API_KEY` | No | empty | API key for model 1 | Set it when your model endpoint requires auth | Empty is valid for unauthenticated local servers |
| `MODEL_1_NAME` | No | `model-1` | Model identifier sent to model 1 | Set it to the exact served model name | Must match the upstream endpoint |
| `MODEL_1_DISPLAY_NAME` | No | `Model 1` | Public label shown in the UI | Set it for clearer model names in the product | Cosmetic only |
| `MODEL_1_SYSTEM_PROMPT` | No | empty | System prompt text for model 1 | Set it in admin config or env when model 1 needs a specific system prompt | Legacy built-in keys are still accepted for backwards compatibility |
| `MODEL_1_FLOW_ID` | No | falls back to `LANGFLOW_FLOW_ID` | Model-specific Langflow flow override for model 1 | Set it when model 1 should route to a different flow | Overrides the global flow only for model 1 |
| `MODEL_1_COMPONENT_ID` | No | empty | Langflow component/node ID that receives model 1 runtime tweaks | Set it when the flow requires component-scoped `tweaks` overrides | If unset, the app falls back to the older flat `tweaks` shape |
| `MODEL_2_BASEURL` | No | empty | OpenAI-compatible base URL for the secondary model | Set it only if you want a second selectable model | If unset, model 2 is not useful even if enabled |
| `MODEL_2_API_KEY` | No | empty | API key for model 2 | Set it when model 2 requires auth | Empty is valid for unauthenticated local servers |
| `MODEL_2_NAME` | No | empty | Model identifier sent to model 2 | Set it to the exact served model name | Must match the upstream endpoint |
| `MODEL_2_DISPLAY_NAME` | No | `Model 2` | Public label shown in the UI | Set it for a meaningful secondary model label | Cosmetic only |
| `MODEL_2_SYSTEM_PROMPT` | No | empty | System prompt text for model 2 | Set it in admin config or env when model 2 needs a specific system prompt | Legacy built-in keys are still accepted for backwards compatibility |
| `MODEL_2_FLOW_ID` | No | falls back to `LANGFLOW_FLOW_ID` | Model-specific Langflow flow override for model 2 | Set it when model 2 should route differently | Overrides the global flow only for model 2 |
| `MODEL_2_COMPONENT_ID` | No | empty | Langflow component/node ID that receives model 2 runtime tweaks | Set it when the flow uses component-scoped `tweaks` overrides | If unset, the app falls back to the older flat `tweaks` shape |
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
| `TITLE_GEN_SYSTEM_PROMPT_EN` | No | empty | Base system prompt for English title generation | Set it when English title generation should follow a specific prompt | If empty, English title generation relies on the few-shot examples only |
| `TITLE_GEN_SYSTEM_PROMPT_HU` | No | empty | Base system prompt for Hungarian title generation | Set it when Hungarian title generation should follow a specific prompt | If empty, Hungarian title generation relies on the few-shot examples only |
| `TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_EN` | No | empty | Optional English title-generation lines appended only for code-related chats | Set it when coding conversations should carry extra title guidance | Leave empty to skip code-specific prompt text |
| `TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_HU` | No | empty | Optional Hungarian title-generation lines appended only for code-related chats | Set it when coding conversations should carry extra title guidance | Leave empty to skip code-specific prompt text |
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
| `HONCHO_CONTEXT_WAIT_MS` | No | `3000` | Maximum time the app waits for Honcho session bootstrap, queue settling, and `session.context(...)` before falling back | Raise it if you prefer richer live Honcho session context over faster first-byte time | Can also be overridden in admin config |
| `HONCHO_CONTEXT_POLL_INTERVAL_MS` | No | `250` | Poll interval used while waiting for Honcho queue work to settle | Lower it if you want more responsive queue checks | Can also be overridden in admin config |
| `HONCHO_PERSONA_CONTEXT_WAIT_MS` | No | `1500` | Timeout for auxiliary Honcho persona enrichment on chat turns, especially persona prompt context | Lower it to keep the prompt path responsive while persona clusters refresh in the background | Can also be overridden in admin config |
| `HONCHO_OVERVIEW_WAIT_MS` | No | `10000` | Timeout for the Knowledge Base live Honcho overview refresh path | Raise it if the overview is usually available but slower than chat-path persona enrichment | Can also be overridden in admin config |
| `MEMORY_MAINTENANCE_INTERVAL_MINUTES` | No | `0` | Enables periodic maintenance for memory/task-state cleanup | Set it to a positive number to turn on the scheduler | `0` disables the scheduler entirely |

### Deployment And Runtime Wrapper Variables

| Variable | Required? | Default | What it does | When to set it | Caveats |
|---|---|---:|---|---|---|
| `BODY_SIZE_LIMIT` | No | patched to `50M` in production builds | Controls the adapter-node request body size limit | Raise it if your deployment needs larger request bodies | Server/runtime setting, not an app feature toggle |
| `HOST` | No | `0.0.0.0` in adapter-node, often overridden in deploy env files | Controls the adapter-node listen address | Set it to `0.0.0.0` when host-managed Docker sidecars such as Langflow must reach the app over the host bridge | If you set `127.0.0.1`, containers on the same host cannot reach the app directly |
| `PORT` | No | `3000` in adapter-node | Controls the adapter-node listen port | Set it to match your reverse proxy or host-managed service expectations | Keep Apache/nginx/other proxy config aligned with the same port |
| `NODE_ENV` | No | environment dependent | Controls framework/runtime production behavior | Set it to `production` in real deployments | Also affects cookie security behavior |
| `APP_DIR` | No | current working directory | Tells `scripts/deploy.sh` where the app checkout lives | Set it when deploying from outside the repo directory | Deploy-script only |
| `PM2_APP_NAME` | No | `langflow-chat` | Printed by `scripts/deploy.sh` for operator context | Set it if you use PM2 with a custom process name | Not currently used for restart or reload logic |

## Operational Caveats

- If you bypass `scripts/deploy.sh`, run `npm run db:prepare` before starting the production server.
- Persist the `data/` directory across deploys so chats, drafts, uploads, and SQLite data survive restarts.
- On Linux, document extraction quality improves if `poppler-utils`, `unzip`, and `binutils` are installed.
- `GET /api/health` exists and returns `{"status":"OK"}`.
- Auxiliary services such as title generation, translation, and summarization can fail independently without necessarily blocking core chat.
- A sandboxed file-generation run that does not actually write a file to `/output` now returns an explicit error instead of a silent empty success response.
- The file-generation sandbox now warms `python:3.11-slim` in the background at app startup and auto-pulls it on first use if it is still missing locally, so the app process needs both Docker socket access and permission to pull images.
- Sandbox output collection now inspects `/output` from inside the container as well as the Docker archive path. If Docker's archive API misses tmpfs-backed output files, the server falls back to an in-container readback path and logs that under `[FILE_GENERATE]` instead of returning the same misleading empty-output response.
- The sandbox waits for Docker exec inspection to report completion before reading `/output`, so file extraction no longer races an early-closed exec stream.
- Sandbox cleanup now kills the throwaway container immediately instead of waiting through the idle process stop timeout, which removes the extra ~10 second delay after a file run completes.
- Generated files can be moved into a vault from the chat UI, but the current AI/file-generator contract does not directly perform that vault-save step on the model's behalf.
- Vault save is only an organization action. Unsaved generated documents are still mirrored into artifact-backed document continuity and Honcho memory so the AI can recall and refine them across chats without requiring a manual vault save first.
- While a `generate_file` tool call is running, the chat UI now shows a temporary shimmer-state file card until the final generated-file list arrives from the stream end event.
- Current-document selection now prefers explicit workspace focus and query/document-family matches over a generic recency fallback, which keeps refinement turns anchored to the right document version more reliably.
- Langflow request/session correlation now logs under `[LANGFLOW]`, and chat-stream tool usage logs under `[CHAT_STREAM]`, so missing generated files can be traced by conversation id without needing live Langflow container logs.
- Chat route teardown now detaches the local stream without calling the explicit stop endpoint; only the Stop button should mark a stream as intentionally stopped on the server.
- Honcho session context is queue-aware and time-bounded. When Honcho stays slow beyond the configured live-session wait budget, chat falls back to the last stored Honcho snapshot or persisted conversation turns rather than hanging.
- Persona-memory prompt context is read from the latest stored clusters immediately and refreshed in the background, so slow persona clustering no longer blocks chat turns or Knowledge Base memory loads.
- Time-sensitive persona memory is freshness-aware: relative constraints such as `in two days` are resolved against the original observation time, expired items become historical context instead of active truth, and the Knowledge Base overview rejects stale Honcho summaries that still present expired constraints as current.
- Memory evolution planning continues in waves. The current wave adds persisted state-change events on top of the existing local authorities; follow-up plans for contradiction handling, repair loops, and behavior-driven retrieval live in [docs/memory-evolution-roadmap.md](./docs/memory-evolution-roadmap.md).
- TEI retrieval planning now lives in [docs/tei-retrieval-roadmap.md](./docs/tei-retrieval-roadmap.md). Follow that document for future tuning, but keep deterministic context, memory, and document authority above any TEI-powered ranking path.
- The TEI rollout is now complete through Wave 8 for the app-owned retrieval stack: documents, persona prompt recall, task routing, and the older rerank-shaped evidence paths all run on TEI-backed shortlist/rerank helpers while preserving deterministic authority above them.
- Current contradiction handling now extends beyond temporal facts: project continuity can be paused or resumed from explicit user language during turn finalization, continuity summaries/read paths use the latest recorded project state event before trusting an older stored status, high-confidence persona facts such as location or current role now supersede older contradictory facts with explicit `persona_fact_updated` history, and task-state artifact preferences now collapse contradictory pinned/excluded versions within the same working-document family.
- Wave 4 active-state inference now uses structured live document signals instead of relying only on semantic similarity. Explicit user-correction phrasing (`actually`, `instead`, `use the previous version`, etc.) keeps the focused document live even when the turn text is generic, and the most recently refined working-document family now stays active across follow-up turns such as `make it shorter`.
- Explicit move-on / completion language now suppresses stale working-document carryover. Turns like `we're done with that` or `let's talk about something else` stop reusing the old active/generated document unless the user provides a stronger fresh focus signal.
- Prompt-time working-set selection now recomputes those live document reason codes for the current turn instead of trusting stale reason codes persisted from the previous turn. That prevents old `current generated document` or `active document focus` flags from leaking into a new topic just because the working-set DB rows have not been refreshed yet.
- The live document-state signals are assembled through one shared server helper instead of being recomputed separately in working-set refresh, prompt-time working-set selection, task evidence selection, and Honcho prompt assembly. Active workspace focus, current generated-output selection, recent document-family refinement, correction phrasing, and move-on/reset phrasing should now stay in sync across those paths.
- Generated-document retrieval now consumes that same active-state path too. A recently refined family can stay active on generic follow-up turns, but retrieval no longer drags in unrelated generated-document families unless the query explicitly matches them, and move-on/reset phrasing suppresses generic generated carryover there as well.
- The active workspace document signal is also preserved through the browser stream/retry transport and the chat stream route, so iterative refinement turns keep the focused document id intact all the way to Langflow context assembly.
- Wave 5 repair work now includes generated-output retrieval-class repair inside scheduled memory maintenance. Repeated maintenance runs reapply the existing duplicate-family compression logic so stale near-duplicate drafts stay out of general retrieval without creating a second repair subsystem.
- The same maintenance pass now also marks dormant generated-document families as historical through the shared working-document metadata contract. That status flows through logical document mapping, the chat/knowledge workspace shell, and Knowledge Base library labels without adding a second document-lifecycle store.
- Persona-memory refresh now also reapplies deterministic salience repair from the stored cluster metadata itself. Weakly supported dormant memories and low-confidence preferences lose prominence over time without being deleted or moved into a separate maintenance-only ranking system.
- Wave 6 has started with a deterministic behavior signal instead of opaque analytics: focused working-document turns now record `document_refined` memory events keyed by document family when possible, and generated-document retrieval uses recent refinement counts only as a small bounded boost. Explicit query and document-identity matches still outrank passive behavior history.
- Working-set ranking now consumes the same recent refinement counts as a smaller prompt-side boost, so retrieval ordering and prompt carryover learn from one shared event-derived behavior signal instead of diverging into separate heuristics.
- Workspace document opens now also emit bounded `document_opened` behavior events through the shared workspace path, and retrieval/working-set ranking consume those reopen counts as a smaller signal than refinement so frequently revisited document families stay easier to recover without outranking explicit focus or query matches.
- Maintenance-marked `historical` document families now also receive a soft ranking penalty in retrieval and prompt carryover. They remain available for explicit matches and source jumps, but weak generic follow-ups no longer keep stale ignored families ahead of active working documents.
- Wave 6 now also learns from explicit memory corrections on the persona side. When a newer persona memory clearly corrects an older one, the older cluster receives a bounded salience penalty until later reaffirmation, so stale corrected memories stop reading like active truth without being deleted from history.
- The Knowledge Base no longer prefetches the Memory Profile on initial page mount; it loads that endpoint only when the Memory tab or related management modals are opened.
- If you self-host Honcho and point its deriver/summary models at your own GPU-backed LLM stack, start with `DERIVER_WORKERS=2` on the Honcho deployment and scale upward only while queue backlog drops without saturating your inference server.
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
