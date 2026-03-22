# Multilingual Agent Platform — Chat UI Build Plan

## TL;DR

> **Quick Summary**: Build a multi-user SvelteKit chat UI that talks to Langflow's REST API, supporting bilingual (Hungarian/English) conversation with two streaming paths (SSE for English, webhook sidecar for Hungarian), auto-generated titles via nemotron-nano, and deploy behind Apache reverse proxy.
> 
> **Deliverables**:
> - Complete SvelteKit application with TypeScript, Tailwind CSS, dark/light mode
> - SQLite-backed auth system (bcrypt + httpOnly session cookies)
> - Conversation sidebar with auto-generated titles
> - Markdown rendering with Shiki syntax highlighting and code copy buttons
> - English SSE streaming via Langflow's native `?stream=true`
> - Hungarian webhook streaming (sentences POST'd by Langflow, forwarded to browser via SSE)
> - Non-streaming fallback for Hungarian (full response wait)
> - Apache VirtualHost config, systemd service file, deployment docs
> - File upload placeholder button (disabled, "coming soon")
> - Translation pipeline toggle button (enable/disable translation, localStorage persistence)
> - Model selection dropdown (2 models configurable via .env, localStorage persistence)
> 
> **Estimated Effort**: Large (17 atomic commits, ~45 tasks)
> **Parallel Execution**: YES — 9 waves + Final Verification
> **Critical Path**: Task 1 → Task 3 → Task 6 → Task 12 → Task 18 → Task 22 → Task 28 → Task 35 → Task 36 → Task 37 → Task 38 → Task 39 → Task 40 → Final

---

## Context

### Original Request
Build a complete web-based chat UI for a multilingual AI assistant platform running entirely on local infrastructure. The platform uses Langflow to orchestrate a pipeline that translates Hungarian↔English transparently, runs an AI agent (nemotron-120b) with web search and tools, and delivers responses back to the user. The UI must handle authentication, conversation management, real-time streaming (two different transport mechanisms), and deploy behind Apache reverse proxy on Linux.

### Interview Summary
**Key Discussions**:
- All requirements sourced from `UI_HANDOFF.md` — comprehensive handoff document covering architecture, API contracts, streaming paths, and configuration
- No ambiguity in requirements — the document specifies exact endpoints, ports, response formats, and behavioral expectations

**Research Findings**:
- **Framework**: SvelteKit + Node adapter is the best fit — Open WebUI (most successful open-source chat UI) uses the same stack, proves viability for chat at scale
- **Langflow API**: Response at `outputs[0].outputs[0].results["message"]`, auth via `x-api-key` header, SSE with `add_message` events ending in `[DONE]`
- **SSE parsing**: Open WebUI uses `eventsource-parser/stream` library with `EventSourceParserStream` — proven pattern
- **Apache SSE**: Requires `SetEnv proxy-sendchunked`, `SetEnv no-gzip`, `ProxyPass flushpackets=on` to prevent buffering
- **Auth pattern**: SvelteKit `hooks.server.ts` → `event.locals.user` is the established pattern for session-based auth
- **Data model**: Inspired by Open WebUI — `Chat` table with `id, user_id, title, created_at, updated_at` (metadata only, no message content)

### Metis Review
**Identified Gaps** (addressed):
- **Webhook sidecar risk (R1)**: The Hungarian streaming webhook is an extension that may not be built on the Langflow side yet → Plan builds non-streaming Hungarian first, webhook streaming as separate Phase 4 task that can be skipped
- **Streaming markdown fragility (R2)**: Token-by-token SSE produces incomplete Markdown → Plan includes buffered rendering with fault-tolerant parsing
- **Apache timeout chain (R3)**: 120s timeout must be configured at every layer → Explicit timeout config in Apache, SvelteKit, and browser-side AbortController
- **SSE through Apache (R4)**: Apache mod_proxy buffers by default → Dedicated Apache config deliverable with anti-buffering directives
- **better-sqlite3 native module (R6)**: Must compile on target → Plan includes `npm install` on target server
- **No message persistence in UI (R7)**: Langflow stores messages but UI can't retrieve them → Documented limitation, conversation shows empty until new message sent
- **Session cookie security (R9)**: SvelteKit default CSRF protection sufficient for same-origin requests → Documented

---

## Work Objectives

### Core Objective
Build a production-ready, multi-user chat web application using SvelteKit that integrates with an existing Langflow AI pipeline, supporting bilingual (Hungarian/English) conversation with real-time streaming, and deployable on local Linux infrastructure behind Apache reverse proxy.

### Concrete Deliverables
- SvelteKit application at `src/` with TypeScript, Tailwind CSS
- SQLite database at `data/chat.db` with Drizzle ORM schema + migrations
- User seed script at `scripts/seed-user.ts`
- Apache VirtualHost config at `deploy/apache-site.conf`
- systemd service file at `deploy/langflow-chat.service`
- Environment template at `.env.example`
- Mock Langflow server at `tests/mocks/langflow-server.ts`
- Playwright E2E tests at `tests/e2e/`
- Vitest unit/integration tests at `src/**/*.test.ts`

### Definition of Done
- [ ] `npm run build` produces working production build
- [ ] `npm test` passes all unit and integration tests
- [ ] `npx playwright test` passes all E2E tests
- [ ] Login → Send message → Receive response → See in sidebar → Switch conversation → Delete conversation (full user journey works)
- [ ] English streaming shows tokens arriving incrementally
- [ ] Hungarian path shows response after full pipeline completes (non-streaming fallback)
- [ ] Dark/light mode toggle works with code syntax highlighting adapting
- [ ] Apache config passes `apachectl configtest`
- [ ] systemd service starts and serves the app

### Must Have
- User authentication with bcrypt + httpOnly session cookies
- Conversation CRUD with user isolation (each user sees only their own)
- Message sending via Langflow API with 120s timeout
- Markdown rendering with fenced code block syntax highlighting (Shiki)
- Copy button on code blocks + copy message button
- English SSE streaming via Langflow `?stream=true`
- Auto-generated conversation titles via nemotron-nano
- Animated loading indicator during pipeline execution (40-90s)
- Dark/light mode with system preference detection
- File upload button placeholder (disabled, "coming soon" tooltip)
- Responsive layout (desktop-first, sidebar collapses on narrow viewports)
- Error handling: network errors, timeouts, Langflow errors → user-friendly messages with retry
- Apache VirtualHost config with SSE anti-buffering
- systemd service file with auto-restart
- `.env.example` with all configuration documented
- Translation pipeline toggle button in message input (enable/disable, localStorage persistence)
- Model selection dropdown with 2 configurable models (via .env, localStorage persistence)

### Must NOT Have (Guardrails)
- NO message content stored in SQLite — only conversation metadata (id, title, user_id, timestamps)
- NO modification to Langflow flows, components, or translation logic
- NO user self-registration — admin seeds users via script
- NO file upload processing — only the disabled UI button
- NO conversation export (PDF, Markdown) — deferred entirely
- NO WebSocket connections — SSE only for all browser streaming
- NO admin dashboard or settings UI
- NO i18n/l10n for UI chrome — the UI is English, the AI handles Hungarian
- NO OAuth, Auth.js, Lucia, or external auth libraries — custom bcrypt + cookies only
- NO more than 3 Shiki themes (one light, one dark, one high-contrast)
- NO typing indicators, presence, or real-time user awareness features
- NO conversation sharing or public links
- NO keyboard shortcuts beyond Enter-to-send and Shift+Enter-for-newline

---

## Verification Strategy

> **STATIC CHECKS BY AGENTS** — Agents run build/lint/typecheck only.
> **RUNTIME TESTS WRITTEN BUT NOT EXECUTED** — Vitest and Playwright tests are written for manual execution on deployment machine.

### Test Decision
- **Infrastructure exists**: NO (greenfield project — must set up)
- **Automated tests**: YES (write tests, execute manually later)
- **Framework**: Vitest for unit/integration, Playwright for E2E
- **Setup task**: Task 1 includes vitest + Playwright configuration
- **Agent execution**: `npm run build`, `npx tsc --noEmit`, `npm run lint` ONLY
- **Manual execution** (on deployment machine): `npm test`, `npx playwright test`

### QA Policy
Every task includes QA scenarios. Agents verify:
1. **Static checks pass**: TypeScript compiles, linter passes, build succeeds
2. **Test files exist**: Vitest/Playwright test files are created with proper structure
3. **Test syntax valid**: Test files compile without TypeScript errors

Agents do NOT execute runtime tests — those run on deployment machine.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **Frontend/UI**: Verify component files exist, TypeScript compiles, no lint errors
- **API endpoints**: Verify route files exist, types correct, test file written
- **Backend services**: Verify service files exist, exports typed, unit tests written
- **Deployment configs**: Validate syntax with `apachectl -t`, check systemd syntax

### Mock Strategy (for manual test execution)
- **Langflow mock** (`tests/mocks/langflow-server.ts`): Express server simulating `/api/v1/run/{flow_id}` with configurable delay (0ms, 5s, 60s, timeout), response format, SSE streaming, and error responses
- **nemotron-nano mock**: Same mock server on separate port, simulates `/v1/chat/completions` for title generation
- **Webhook mock** (`tests/mocks/webhook-sender.ts`): Utility that POSTs sentences to SvelteKit webhook endpoint with configurable timing
- All mocks configurable via env vars for integration testing against real services
- **Note**: Mocks are for user's manual test execution on deployment machine

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — scaffolding + foundation):
├── Task 1: Project scaffolding (SvelteKit + TS + Tailwind + Vitest + Playwright) [quick]
├── Task 2: Environment configuration + .env template [quick]
├── Task 3: SQLite schema with Drizzle ORM (users, sessions, conversations tables) [quick]
├── Task 4: Shared TypeScript types and interfaces [quick]
├── Task 5: Mock Langflow server + mock nemotron-nano server [unspecified-high]

Wave 2 (After Wave 1 — auth + layout + Langflow client):
├── Task 6: User seed script (scripts/seed-user.ts) [quick]
├── Task 7: Authentication API routes (login/logout) [deep]
├── Task 8: Auth hooks.server.ts + route guards [deep]
├── Task 9: Login page UI [visual-engineering]
├── Task 10: App shell layout (sidebar + chat area + header) [visual-engineering]
├── Task 11: Dark/light mode toggle with persistence [visual-engineering]
├── Task 12: Langflow API client service ($lib/server/services/langflow.ts) [deep]

Wave 3 (After Wave 2 — core chat functionality):
├── Task 13: Conversation CRUD service + API routes [deep]
├── Task 14: Conversation sidebar component [visual-engineering]
├── Task 15: Message input component (multi-line, Enter/Shift+Enter, char limit) [visual-engineering]
├── Task 16: Markdown rendering engine (marked + DOMPurify + Shiki) [deep]
├── Task 17: Message display component (with copy buttons) [visual-engineering]
├── Task 18: Non-streaming chat flow (send → wait → display response) [deep]
├── Task 19: Loading/status indicator component [visual-engineering]

Wave 4 (After Wave 3 — streaming + titles + polish):
├── Task 20: English SSE streaming — server proxy endpoint [deep]
├── Task 21: English SSE streaming — client-side consumer + display [deep]
├── Task 22: Streaming markdown renderer (incremental token display) [deep]
├── Task 23: Title generation service (nemotron-nano) [unspecified-high]
├── Task 24: Title generation integration (fire-and-forget after first response) [quick]
├── Task 25: Hungarian non-streaming path (full response wait) [quick]
├── Task 26: File upload placeholder button [quick]
├── Task 27: Responsive layout (sidebar collapse, tablet support) [visual-engineering]

Wave 5 (After Wave 4 — webhook streaming + error handling + deploy):
├── Task 28: Hungarian webhook receiver endpoint [deep]
├── Task 29: Hungarian webhook → browser SSE bridge [deep]
├── Task 30: Unified streaming abstraction (SSE + webhook → same display) [deep]
├── Task 31: Error handling (timeouts, retries, network errors, translation-unavailable) [deep]
├── Task 32: Conversation delete + rename UI [visual-engineering]
├── Task 33: Apache VirtualHost config + SSE anti-buffering [unspecified-high]
├── Task 34: systemd service file + deployment docs [quick]
├── Task 35: Playwright E2E test suite (full user journey) [deep]

Wave 6 (After Wave 5 — mobile design polish):
├── Task 36: Mobile Design Polish — second design pass per DESIGN_SPEC.md [visual-engineering]

Wave 7 (After Wave 6 — design reinspection, HIGH PRIORITY):
├── Task 37: Comprehensive Design Reinspection — visual fidelity audit + fixes per DESIGN_SPEC.md [visual-engineering]

Wave 8 (After Wave 7 — comprehensive codebase testing):
├── Task 38: Comprehensive Codebase Testing — full syntax + runtime verification against plan [deep]

Wave 9 (After Wave 8 — new features: translation toggle + model selection):
├── Task 39: Translation Pipeline Toggle Button [visual-engineering]
├── Task 40: Model Selection Feature (2 fixed models via .env) [visual-engineering]

Wave FINAL (After ALL tasks — independent review):
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Code quality review (tsc, lint, vitest) [unspecified-high]
├── Task F3: Full QA — Playwright end-to-end verification [unspecified-high]
├── Task F4: Scope fidelity check (no over/under-build) [deep]

Critical Path: Task 1 → Task 3 → Task 7 → Task 12 → Task 18 → Task 20 → Task 28 → Task 35 → Task 36 → Task 37 → Task 38 → Task 39 → Task 40 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 7 (Waves 2 & 3) — Wave 9 adds 2 parallel tasks
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|-----------|--------|
| 1 | — | 2-5 |
| 2 | 1 | 5, 6, 7, 12 |
| 3 | 1 | 6, 7, 8, 13 |
| 4 | 1 | 7, 12, 13, 16, 20 |
| 5 | 1, 2 | 18, 20, 23, 35 |
| 6 | 3 | 7, 35 |
| 7 | 3, 4, 6 | 8, 9 |
| 8 | 7 | 9, 10, 13 |
| 9 | 7, 8 | 35 |
| 10 | 8 | 14, 15, 17, 19, 27 |
| 11 | 10 | 16, 27 |
| 12 | 2, 4 | 18, 20, 25 |
| 13 | 3, 4, 8 | 14, 18, 24 |
| 14 | 10, 13 | 24, 32 |
| 15 | 10 | 18, 26 |
| 16 | 4, 11 | 17, 22 |
| 17 | 10, 16 | 18, 22 |
| 18 | 5, 12, 13, 15, 17 | 19, 20, 23, 25 |
| 19 | 10, 18 | 25, 31 |
| 20 | 4, 5, 12, 18 | 21, 30 |
| 21 | 20, 22 | 30 |
| 22 | 16, 17 | 21, 29 |
| 23 | 2, 5 | 24 |
| 24 | 13, 14, 23 | — |
| 25 | 12, 18, 19 | 28 |
| 26 | 15 | — |
| 27 | 10, 11 | — |
| 28 | 4, 25 | 29 |
| 29 | 22, 28 | 30 |
| 30 | 20, 21, 29 | 31 |
| 31 | 19, 30 | 35 |
| 32 | 14 | — |
| 33 | 1 | 34 |
| 34 | 33 | — |
| 35 | 5, 9, 18, 31 | 36 |
| 36 | 27, 32, 35 | 37 |
| 37 | 36 | 38 |
| 38 | 37 | F1-F4 |
| F1-F4 | 38 | — |

| 39 | 15 | 40 |
| 40 | 15 | — |
| F1-F4 | 39, 40 | — |

### Agent Dispatch Summary

- **Wave 1**: **5 tasks** — T1-T4 → `quick`, T5 → `unspecified-high`
- **Wave 2**: **7 tasks** — T6 → `quick`, T7-T8 → `deep`, T9-T11 → `visual-engineering`, T12 → `deep`
- **Wave 3**: **7 tasks** — T13,T16,T18 → `deep`, T14-T15,T17,T19 → `visual-engineering`
- **Wave 4**: **8 tasks** — T20-T22 → `deep`, T23 → `unspecified-high`, T24-T26 → `quick`, T27 → `visual-engineering`
- **Wave 5**: **8 tasks** — T28-T31,T35 → `deep`, T32 → `visual-engineering`, T33 → `unspecified-high`, T34 → `quick`
- **Wave 6**: **1 task** — T36 → `visual-engineering` (mobile design polish per DESIGN_SPEC.md)
- **Wave 7**: **1 task** — T37 → `visual-engineering` (comprehensive design reinspection — HIGH PRIORITY)
- **Wave 8**: **1 task** — T38 → `deep` (comprehensive codebase testing with Playwright + Vitest)
- **Wave 9**: **2 tasks** — T39-T40 → `visual-engineering` (translation toggle + model selection)
- **FINAL**: **4 tasks** — F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + Parallelization info + QA Scenarios.
> **A task WITHOUT QA Scenarios is INCOMPLETE. No exceptions.**

- [x] 1. Project Scaffolding — SvelteKit + TypeScript + Tailwind + Vitest + Playwright

  **What to do**:
  - Run `npm create svelte@latest . -- --template skeleton --types typescript`
  - Install adapter-node: `npm i -D @sveltejs/adapter-node` and configure `svelte.config.js` with `adapter: adapter()` and `alias: { '$lib': 'src/lib' }`
  - Install and configure Tailwind CSS: `npm i -D tailwindcss @tailwindcss/typography postcss autoprefixer`, create `tailwind.config.ts` with `darkMode: 'class'`, `content: ['./src/**/*.{html,js,svelte,ts}']`, add `@tailwindcss/typography` plugin. Create `postcss.config.js`. Add Tailwind directives to `src/app.css`
  - Create `src/app.html` with `<html lang="en" class="%sveltekit.theme%">` and `<body data-sveltekit-preload-data="hover">` — include `%sveltekit.head%` and `%sveltekit.body%` placeholders
  - Install Vitest: `npm i -D vitest @testing-library/svelte jsdom`. Create `vitest.config.ts` with `environment: 'jsdom'`, `include: ['src/**/*.test.ts']`, resolve alias for `$lib`
  - Install Playwright: `npx playwright install --with-deps chromium`. Create `playwright.config.ts` with `baseURL: 'http://localhost:4173'`, `webServer: { command: 'npm run preview', port: 4173 }`, `testDir: 'tests/e2e'`, single project (Chromium only)
  - Add npm scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:e2e": "playwright test"`, `"test:unit": "vitest run"`
  - Create `.env.example` with all documented env vars (placeholder values):
    ```
    LANGFLOW_API_URL=http://localhost:7860
    LANGFLOW_API_KEY=your-api-key-here
    LANGFLOW_FLOW_ID=your-flow-id-here
    NEMOTRON_URL=http://192.168.1.96:30001/v1
    NEMOTRON_MODEL=nemotron-nano
    WEBHOOK_PORT=8090
    REQUEST_TIMEOUT_MS=120000
    MAX_MESSAGE_LENGTH=10000
    SESSION_SECRET=change-me-to-random-64-char-string
    DATABASE_PATH=./data/chat.db
    ```
  - Create `src/routes/+page.svelte` as a placeholder home page with "Hello World" text
  - Verify: `npm run build` succeeds, `npm test` runs (0 tests, no errors), `npx playwright test` runs (0 tests, no errors)

  **Must NOT do**:
  - Do NOT install any auth libraries (no Auth.js, Lucia, etc.)
  - Do NOT install any database libraries yet (Task 3 handles that)
  - Do NOT create any route structures beyond the root `+page.svelte`
  - Do NOT add any UI components yet

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Scaffolding is well-defined, procedural, and low-ambiguity
  - **Skills**: []
    - No special skills needed — standard npm/cli operations
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — just installing, not running browser tests
    - `frontend-ui-ux`: Not needed — no UI work in this task

  **Parallelization**:
  - **Can Run In Parallel**: NO — this is the foundation task
  - **Parallel Group**: Wave 1 (starts first, blocks everything)
  - **Blocks**: Tasks 2, 3, 4, 5
  - **Blocked By**: None (can start immediately)

  **References**:

  **Pattern References**:
  - None — greenfield project

  **API/Type References**:
  - None yet

  **External References**:
  - SvelteKit docs: `https://kit.svelte.dev/docs/creating-a-project` — project creation and adapter-node setup
  - Tailwind SvelteKit guide: `https://tailwindcss.com/docs/installation/framework-guides` — framework-specific installation
  - Vitest docs: `https://vitest.dev/guide/` — configuration with SvelteKit

  **Acceptance Criteria**:
  - [ ] `npm run build` completes with exit code 0
  - [ ] `npm test` completes with exit code 0 (0 test suites)
  - [ ] `npx playwright test` completes (0 test files, no errors)
  - [ ] `.env.example` exists with all 10 environment variables documented
  - [ ] `svelte.config.js` uses `adapter-node`
  - [ ] `tailwind.config.ts` has `darkMode: 'class'` and `@tailwindcss/typography` plugin

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Build succeeds and serves
    Tool: Bash
    Preconditions: Fresh scaffolded project, npm install completed
    Steps:
      1. Run `npm run build`
      2. Assert exit code 0 and `build/` directory exists
      3. Run `node build/index.js &` (background)
      4. Wait 2s, then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/`
      5. Assert HTTP 200
      6. Kill the background process
    Expected Result: Build produces output in `build/`, server starts and responds 200
    Failure Indicators: Build exits non-zero, no `build/` dir, curl returns non-200
    Evidence: .sisyphus/evidence/task-1-build-and-serve.txt

  Scenario: Vitest runs without errors
    Tool: Bash
    Preconditions: Project scaffolded with vitest configured
    Steps:
      1. Run `npm test 2>&1`
      2. Assert exit code 0
      3. Assert output contains "no test files found" or "0 tests" (not an error)
    Expected Result: Vitest exits cleanly with no test files
    Failure Indicators: Non-zero exit, "Error" in output
    Evidence: .sisyphus/evidence/task-1-vitest-runs.txt

  Scenario: .env.example has all required vars
    Tool: Bash
    Preconditions: .env.example created
    Steps:
      1. Run `grep -c "=" .env.example`
      2. Assert count >= 10
      3. Run `grep "LANGFLOW_API_URL" .env.example` — assert match
      4. Run `grep "SESSION_SECRET" .env.example` — assert match
      5. Run `grep "DATABASE_PATH" .env.example` — assert match
    Expected Result: All 10 env vars present
    Failure Indicators: grep returns no match for any required var
    Evidence: .sisyphus/evidence/task-1-env-example.txt
  ```

  **Commit**: YES (group: commit 1)
  - Message: `init: scaffold SvelteKit project with TypeScript, Tailwind, adapter-node`
  - Files: `package.json, svelte.config.js, tailwind.config.ts, tsconfig.json, postcss.config.js, .env.example, src/app.html, src/app.css, src/routes/+page.svelte, vitest.config.ts, playwright.config.ts`
  - Pre-commit: `npm run build`

---

- [x] 2. Environment Configuration Module

  **What to do**:
  - Create `src/lib/server/env.ts` — a centralized env config module that reads and validates all environment variables at startup
  - Use `$env/static/private` or `process.env` with explicit validation: throw descriptive errors if required vars are missing
  - Export a typed `config` object:
    ```typescript
    export const config = {
      langflow: {
        apiUrl: string,      // LANGFLOW_API_URL
        apiKey: string,      // LANGFLOW_API_KEY
        flowId: string,      // LANGFLOW_FLOW_ID
      },
      nemotron: {
        url: string,         // NEMOTRON_URL
        model: string,       // NEMOTRON_MODEL (default: 'nemotron-nano')
      },
      webhook: {
        port: number,        // WEBHOOK_PORT (default: 8090)
      },
      app: {
        requestTimeoutMs: number,  // REQUEST_TIMEOUT_MS (default: 120000)
        maxMessageLength: number,  // MAX_MESSAGE_LENGTH (default: 10000)
        sessionSecret: string,     // SESSION_SECRET
        databasePath: string,      // DATABASE_PATH (default: './data/chat.db')
      }
    }
    ```
  - Write unit test `src/lib/server/env.test.ts`:
    - Test: missing required vars (LANGFLOW_API_KEY, SESSION_SECRET) → throws descriptive error
    - Test: defaults applied when optional vars missing (WEBHOOK_PORT defaults to 8090)
    - Test: valid config object returned when all vars present
  - Create `.env` file (gitignored) by copying `.env.example` with test values for local dev

  **Must NOT do**:
  - Do NOT use any external config libraries (dotenv is fine if SvelteKit doesn't auto-load .env)
  - Do NOT export any secrets to client-side code — this module is `$lib/server/` only
  - Do NOT add runtime env reloading

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single file + single test file, straightforward validation logic
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not relevant — server-side config module

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 3, 4 after Task 1 completes)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 5, 6, 7, 12
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `.env.example` created in Task 1 — lists all variable names and defaults

  **External References**:
  - SvelteKit env docs: `https://kit.svelte.dev/docs/modules#$env-static-private` — how SvelteKit exposes env vars

  **WHY Each Reference Matters**:
  - `.env.example` is the source of truth for variable names and default values — config module must match 1:1

  **Acceptance Criteria**:
  - [ ] `src/lib/server/env.ts` exports typed `config` object
  - [ ] Missing `LANGFLOW_API_KEY` throws: `"Missing required environment variable: LANGFLOW_API_KEY"`
  - [ ] Missing `SESSION_SECRET` throws similar descriptive error
  - [ ] `WEBHOOK_PORT` defaults to `8090` when not set
  - [ ] `npm test -- env` → all tests pass (3+ tests)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Config loads with valid env
    Tool: Bash (vitest)
    Preconditions: .env file exists with all required vars set
    Steps:
      1. Run `npm test -- src/lib/server/env.test.ts`
      2. Assert exit code 0
      3. Assert output shows 3+ passing tests
    Expected Result: All env config tests pass
    Failure Indicators: Test failures, import errors
    Evidence: .sisyphus/evidence/task-2-env-config-tests.txt

  Scenario: Missing required var throws clear error
    Tool: Bash (vitest)
    Preconditions: Test mocks env without LANGFLOW_API_KEY
    Steps:
      1. The test file should include a test case that unsets LANGFLOW_API_KEY
      2. Assert the config module throws with message containing "LANGFLOW_API_KEY"
    Expected Result: Descriptive error thrown for missing required vars
    Failure Indicators: No error thrown, or generic error without variable name
    Evidence: .sisyphus/evidence/task-2-env-missing-var.txt
  ```

  **Commit**: YES (group: commit 1)
  - Message: `init: scaffold SvelteKit project with TypeScript, Tailwind, adapter-node`
  - Files: `src/lib/server/env.ts, src/lib/server/env.test.ts, .env`
  - Pre-commit: `npm test -- env`

---

- [x] 3. SQLite Schema with Drizzle ORM

  **What to do**:
  - Install: `npm i drizzle-orm better-sqlite3` and `npm i -D drizzle-kit @types/better-sqlite3`
  - Create `drizzle.config.ts` at project root:
    ```typescript
    export default {
      schema: './src/lib/server/db/schema.ts',
      out: './drizzle',
      dialect: 'sqlite',
      dbCredentials: { url: './data/chat.db' }
    }
    ```
  - Create `src/lib/server/db/schema.ts` with three tables:
    ```
    users:
      id: text (primary key, UUID)
      email: text (unique, not null)
      passwordHash: text (not null)
      displayName: text (not null)
      createdAt: integer (Unix timestamp, default now)

    sessions:
      id: text (primary key, random token)
      userId: text (foreign key → users.id, not null)
      expiresAt: integer (Unix timestamp, not null)
      createdAt: integer (Unix timestamp, default now)

    conversations:
      id: text (primary key, UUID — this IS the Langflow session_id)
      userId: text (foreign key → users.id, not null)
      title: text (default 'New conversation')
      createdAt: integer (Unix timestamp, default now)
      updatedAt: integer (Unix timestamp, default now)
    ```
  - Create `src/lib/server/db/index.ts` — exports `db` instance:
    ```typescript
    import Database from 'better-sqlite3';
    import { drizzle } from 'drizzle-orm/better-sqlite3';
    import * as schema from './schema';
    import { config } from '../env';

    const sqlite = new Database(config.app.databasePath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    export const db = drizzle(sqlite, { schema });
    ```
  - Create `data/` directory with `.gitkeep`
  - Run `npx drizzle-kit generate` to create initial migration in `drizzle/`
  - Run `npx drizzle-kit push` to apply schema to local dev database
  - Write test `src/lib/server/db/schema.test.ts`:
    - Test: create a user, query it back, verify all fields
    - Test: create a conversation with userId, query filtering by userId
    - Test: create a session, verify foreign key to users
    - Test: conversations table does NOT have a `content` or `messages` column
    - Use in-memory SQLite (`:memory:`) for tests

  **Must NOT do**:
  - Do NOT add a `content`, `messages`, or `chat` column to conversations — ONLY metadata
  - Do NOT use any ORM besides Drizzle
  - Do NOT use postgres, mysql, or any other database

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Schema definition + config is well-specified, 3 tables with clear columns
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not relevant — pure backend/database task

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 4 after Task 1 completes)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 6, 7, 8, 13
  - **Blocked By**: Task 1

  **References**:

  **External References**:
  - Drizzle ORM SQLite docs: `https://orm.drizzle.team/docs/get-started-sqlite` — setup and schema syntax
  - better-sqlite3 pragmas: `https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md` — WAL mode, foreign keys

  **WHY Each Reference Matters**:
  - Drizzle SQLite syntax differs from Drizzle PostgreSQL — must use `sqliteTable`, `text()`, `integer()` constructors specifically
  - WAL mode and foreign keys pragmas are critical for concurrent reads and data integrity

  **Acceptance Criteria**:
  - [ ] `src/lib/server/db/schema.ts` defines `users`, `sessions`, `conversations` tables
  - [ ] `conversations` table has NO `content` or `messages` column
  - [ ] `conversations.id` is the Langflow `session_id` (UUID, text primary key)
  - [ ] `drizzle/` contains generated migration SQL
  - [ ] `npm test -- schema` → all tests pass (4+ tests)
  - [ ] In-memory test creates user → creates conversation → queries by userId → gets only that user's conversations

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Schema tests pass with in-memory DB
    Tool: Bash (vitest)
    Preconditions: Schema and test file created
    Steps:
      1. Run `npm test -- src/lib/server/db/schema.test.ts`
      2. Assert exit code 0
      3. Assert 4+ tests pass
    Expected Result: All schema CRUD tests pass
    Failure Indicators: Test failures, SQLite errors, foreign key violations
    Evidence: .sisyphus/evidence/task-3-schema-tests.txt

  Scenario: No message content column exists
    Tool: Bash
    Preconditions: Schema file created
    Steps:
      1. Run `grep -i "content\|messages\|chat" src/lib/server/db/schema.ts`
      2. Assert NO matches in the conversations table definition (matches in comments are OK)
    Expected Result: Conversations table stores only metadata
    Failure Indicators: grep finds a content/messages/chat column definition
    Evidence: .sisyphus/evidence/task-3-no-content-column.txt

  Scenario: Migration generates successfully
    Tool: Bash
    Preconditions: Schema defined, drizzle-kit installed
    Steps:
      1. Run `npx drizzle-kit generate 2>&1`
      2. Assert exit code 0
      3. Assert `ls drizzle/*.sql` returns at least one migration file
    Expected Result: Drizzle generates valid SQL migration
    Failure Indicators: drizzle-kit errors, no SQL files generated
    Evidence: .sisyphus/evidence/task-3-migration-gen.txt
  ```

  **Commit**: YES (group: commit 2)
  - Message: `feat(db): add SQLite schema with Drizzle ORM and seed script`
  - Files: `src/lib/server/db/schema.ts, src/lib/server/db/index.ts, drizzle.config.ts, drizzle/*.sql, data/.gitkeep, src/lib/server/db/schema.test.ts`
  - Pre-commit: `npm test -- schema`

---

- [x] 4. Shared TypeScript Types and Interfaces

  **What to do**:
  - Create `src/lib/types.ts` — shared types used across client and server:
    ```typescript
    // === User & Auth ===
    export interface User {
      id: string;
      email: string;
      displayName: string;
    }

    // Session user attached to event.locals
    export interface SessionUser {
      id: string;
      email: string;
      displayName: string;
    }

    // === Conversations ===
    export interface Conversation {
      id: string;           // Also the Langflow session_id
      title: string;
      createdAt: number;    // Unix timestamp
      updatedAt: number;    // Unix timestamp
    }

    export interface ConversationListItem {
      id: string;
      title: string;
      updatedAt: number;
    }

    // === Messages (client-side only, not persisted) ===
    export type MessageRole = 'user' | 'assistant';

    export interface ChatMessage {
      id: string;           // Client-generated UUID
      role: MessageRole;
      content: string;      // Raw text/markdown
      timestamp: number;    // Unix timestamp
      isStreaming?: boolean; // True while tokens are arriving
    }

    // === Langflow API ===
    export interface LangflowRunRequest {
      input_value: string;
      input_type: 'chat';
      output_type: 'chat';
      session_id: string;
    }

    export interface LangflowMessage {
      text: string;
      sender: string;
      sender_name: string;
      session_id: string;
      timestamp: string;
      files?: string[];
    }

    export interface LangflowResultData {
      results: Record<string, LangflowMessage>;
      outputs: Record<string, { message: LangflowMessage; type: string }>;
      messages: LangflowMessage[];
    }

    export interface LangflowRunOutputs {
      inputs: Record<string, unknown>;
      outputs: LangflowResultData[];
    }

    export interface LangflowRunResponse {
      outputs: LangflowRunOutputs[];
      session_id: string;
    }

    // === SSE Streaming ===
    export interface StreamEvent {
      event: 'token' | 'end' | 'error' | 'metadata';
      data: string;        // For 'token': the text chunk. For 'end': empty or "[DONE]"
    }

    // === Webhook (Hungarian streaming) ===
    export interface WebhookSentencePayload {
      session_id: string;
      sentence: string;
      index: number;        // Sentence position (0-based)
      is_final: boolean;    // True for the last sentence
    }

    // === Title Generation ===
    export interface TitleGenerationRequest {
      userMessage: string;
      assistantResponse: string;  // First 200 chars
    }

    // === API Error Response ===
    export interface ApiError {
      error: string;
      message: string;
      status: number;
    }

    // === Theme ===
    export type Theme = 'light' | 'dark' | 'system';
    ```
  - Create `src/app.d.ts` — SvelteKit type declarations:
    ```typescript
    declare global {
      namespace App {
        interface Locals {
          user: import('$lib/types').SessionUser | null;
        }
      }
    }
    export {};
    ```
  - Write test `src/lib/types.test.ts`:
    - Test: import all types — no TypeScript errors
    - Test: create sample objects conforming to each interface — verify structure
    - Test: LangflowRunResponse matches the documented API response shape

  **Must NOT do**:
  - Do NOT include any persistence-related message types (messages are NOT stored)
  - Do NOT add types for features explicitly excluded (export, admin, OAuth)
  - Do NOT use `any` anywhere in the type definitions

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Pure type definitions — no logic, just interfaces matching known API contracts
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not relevant — type definitions only

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 3 after Task 1 completes)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 7, 12, 13, 16, 20
  - **Blocked By**: Task 1

  **References**:

  **API/Type References**:
  - Langflow source `langflow-ai/langflow` → `src/backend/base/langflow/api/v1/schemas.py` — `RunResponse` has `outputs: list[RunOutputs]` and `session_id: str`
  - Langflow source → `src/lfx/src/lfx/graph/schema.py` — `RunOutputs` has `inputs: dict` and `outputs: list[ResultData]`
  - UI_HANDOFF.md lines 84-99 — exact API request/response structure
  - UI_HANDOFF.md lines 213-228 — webhook sentence payload and SSE event structure
  - UI_HANDOFF.md lines 158-174 — title generation prompt and nemotron-nano contract

  **WHY Each Reference Matters**:
  - The `LangflowRunResponse` type MUST match Langflow's actual response shape — extraction path `outputs[0].outputs[0].results["message"]` depends on correct nesting
  - The `WebhookSentencePayload` type defines the contract between Langflow's Response Translator and the SvelteKit webhook endpoint
  - The `StreamEvent` type must match Langflow's SSE event format (`add_message` events with `data: [DONE]` terminator)

  **Acceptance Criteria**:
  - [ ] `src/lib/types.ts` compiles without errors (`npx tsc --noEmit`)
  - [ ] `src/app.d.ts` declares `App.Locals.user` as `SessionUser | null`
  - [ ] No `any` type used anywhere in the file
  - [ ] `npm test -- types` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Types compile without errors
    Tool: Bash
    Preconditions: Types file and app.d.ts created
    Steps:
      1. Run `npx tsc --noEmit 2>&1`
      2. Assert exit code 0
      3. Assert no "error TS" in output
    Expected Result: Zero TypeScript errors
    Failure Indicators: Any TS compiler error
    Evidence: .sisyphus/evidence/task-4-tsc-noEmit.txt

  Scenario: Type tests pass
    Tool: Bash (vitest)
    Preconditions: types.test.ts written
    Steps:
      1. Run `npm test -- src/lib/types.test.ts`
      2. Assert exit code 0
    Expected Result: All type conformance tests pass
    Failure Indicators: Type errors or test failures
    Evidence: .sisyphus/evidence/task-4-type-tests.txt
  ```

  **Commit**: YES (group: commit 1)
  - Message: `init: scaffold SvelteKit project with TypeScript, Tailwind, adapter-node`
  - Files: `src/lib/types.ts, src/app.d.ts, src/lib/types.test.ts`
  - Pre-commit: `npx tsc --noEmit`

---

- [x] 5. Mock Langflow Server + Mock nemotron-nano Server

  **What to do**:
  - Create `tests/mocks/langflow-server.ts` — an Express server that simulates Langflow's `/api/v1/run/{flow_id}` endpoint:
    - Install: `npm i -D express @types/express`
    - **Non-streaming**: Return a JSON response matching `LangflowRunResponse` shape:
      ```json
      {
        "outputs": [{
          "inputs": {},
          "outputs": [{
            "results": {
              "message": {
                "text": "This is a mock response from the AI assistant.",
                "sender": "Machine",
                "sender_name": "AI",
                "session_id": "<from request>",
                "timestamp": "<now ISO>"
              }
            },
            "outputs": {},
            "messages": []
          }]
        }],
        "session_id": "<from request>"
      }
      ```
    - **Streaming** (when `?stream=true`): Return `text/event-stream` with:
      - Multiple `event: add_message\ndata: {"chunk": "word "}\n\n` events
      - Ends with `data: [DONE]\n\n`
      - Configurable delay between chunks (env `MOCK_CHUNK_DELAY_MS`, default 50ms)
    - **Configurable behaviors** via env vars:
      - `MOCK_RESPONSE_DELAY_MS` (default: 100) — simulates pipeline latency
      - `MOCK_CHUNK_DELAY_MS` (default: 50) — delay between SSE chunks
      - `MOCK_ERROR_MODE` (none/500/timeout) — simulate error conditions
      - `MOCK_RESPONSE_TEXT` — custom response text
    - Validate `x-api-key` header — reject without it (401)
    - Log all requests to stdout for debugging
  - Create `tests/mocks/nemotron-server.ts` — simulates `/v1/chat/completions`:
    - Accept OpenAI-compatible chat completion request
    - Return: `{"choices": [{"message": {"content": "Mock Title For Conversation"}}]}`
    - Configurable delay via `MOCK_TITLE_DELAY_MS` (default: 50)
  - Create `tests/mocks/webhook-sender.ts` — utility that simulates Langflow's Response Translator POSTing sentences:
    - Function `sendWebhookSentences(targetUrl: string, sessionId: string, sentences: string[])`:
      - POSTs each sentence as `WebhookSentencePayload` to the target URL
      - Configurable delay between sentences
      - Final sentence has `is_final: true`
  - Create `tests/mocks/start-mocks.ts` — script to start both servers:
    - Langflow mock on port `MOCK_LANGFLOW_PORT` (default: 7860)
    - nemotron mock on port `MOCK_NEMOTRON_PORT` (default: 30001)
    - Exits cleanly on SIGTERM
  - Write test `tests/mocks/langflow-server.test.ts`:
    - Test: non-streaming request returns valid LangflowRunResponse JSON
    - Test: streaming request returns SSE events ending with [DONE]
    - Test: missing API key returns 401
    - Test: error mode returns 500

  **Must NOT do**:
  - Do NOT make the mock server complex — it simulates, not replicates
  - Do NOT add WebSocket support — SSE only
  - Do NOT add any real Langflow logic or translation

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Multiple files, Express servers, SSE streaming logic — moderate complexity
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `playwright`: Not needed — these are server mocks, not browser tests

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 2, 3, 4 after Task 1 completes)
  - **Parallel Group**: Wave 1
  - **Blocks**: Tasks 18, 20, 23, 35
  - **Blocked By**: Tasks 1, 2 (needs env config for port numbers)

  **References**:

  **API/Type References**:
  - `src/lib/types.ts:LangflowRunResponse` (Task 4) — exact shape the mock must return
  - `src/lib/types.ts:WebhookSentencePayload` (Task 4) — shape for webhook sender
  - `src/lib/types.ts:StreamEvent` (Task 4) — SSE event format
  - UI_HANDOFF.md lines 84-99 — Langflow API request/response contract
  - UI_HANDOFF.md lines 109-124 — SSE streaming format and webhook sidecar description

  **External References**:
  - Langflow SSE format: events use `add_message` event type, chunks contain partial text, stream terminates with `data: [DONE]`

  **WHY Each Reference Matters**:
  - Mock MUST return exactly the shape that the real Langflow API returns — the Langflow client (Task 12) will be developed against this mock
  - SSE format must match so the streaming consumer (Task 20-21) works with both mock and real Langflow

  **Acceptance Criteria**:
  - [ ] `ts-node tests/mocks/start-mocks.ts` starts both servers (Langflow on 7860, nemotron on 30001)
  - [ ] `curl -X POST http://localhost:7860/api/v1/run/test-flow -H "x-api-key: test" -H "Content-Type: application/json" -d '{"input_value":"hello","input_type":"chat","output_type":"chat","session_id":"s1"}'` returns valid JSON matching LangflowRunResponse
  - [ ] Same request with `?stream=true` returns `text/event-stream` with events
  - [ ] Request without `x-api-key` returns 401
  - [ ] `npm test -- tests/mocks/langflow-server.test.ts` → all 4+ tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Mock Langflow returns valid non-streaming response
    Tool: Bash (curl)
    Preconditions: Mock server started on port 7860
    Steps:
      1. Start mock: `npx tsx tests/mocks/start-mocks.ts &`
      2. Wait 2s
      3. Run: `curl -s -X POST http://localhost:7860/api/v1/run/test-flow -H "x-api-key: test-key" -H "Content-Type: application/json" -d '{"input_value":"hello","input_type":"chat","output_type":"chat","session_id":"test-session"}'`
      4. Parse JSON response
      5. Assert `outputs[0].outputs[0].results.message.text` is a non-empty string
      6. Assert `session_id` field equals "test-session"
      7. Kill mock server
    Expected Result: Valid LangflowRunResponse JSON with correct session_id
    Failure Indicators: Non-JSON response, missing outputs nesting, wrong session_id
    Evidence: .sisyphus/evidence/task-5-mock-non-streaming.txt

  Scenario: Mock Langflow returns SSE stream
    Tool: Bash (curl)
    Preconditions: Mock server started on port 7860
    Steps:
      1. Start mock: `npx tsx tests/mocks/start-mocks.ts &`
      2. Wait 2s
      3. Run: `curl -s -N -X POST "http://localhost:7860/api/v1/run/test-flow?stream=true" -H "x-api-key: test-key" -H "Content-Type: application/json" -d '{"input_value":"hello","input_type":"chat","output_type":"chat","session_id":"s1"}' --max-time 10`
      4. Assert output contains `event: add_message` lines
      5. Assert output ends with `data: [DONE]`
      6. Kill mock server
    Expected Result: SSE event stream with add_message events and [DONE] terminator
    Failure Indicators: No SSE headers, missing events, no [DONE] at end
    Evidence: .sisyphus/evidence/task-5-mock-sse-stream.txt

  Scenario: Missing API key returns 401
    Tool: Bash (curl)
    Preconditions: Mock server running
    Steps:
      1. Run: `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:7860/api/v1/run/test-flow -H "Content-Type: application/json" -d '{"input_value":"hello"}'`
      2. Assert HTTP status is 401
    Expected Result: 401 Unauthorized
    Failure Indicators: 200 or any non-401 status
    Evidence: .sisyphus/evidence/task-5-mock-auth-reject.txt
  ```

  **Commit**: YES (group: commit 2)
  - Message: `feat(db): add SQLite schema with Drizzle ORM and seed script`
  - Files: `tests/mocks/langflow-server.ts, tests/mocks/nemotron-server.ts, tests/mocks/webhook-sender.ts, tests/mocks/start-mocks.ts, tests/mocks/langflow-server.test.ts`
  - Pre-commit: `npm test -- tests/mocks`

---

- [x] 6. User Seed Script

  **What to do**:
  - Install: `npm i bcryptjs` and `npm i -D @types/bcryptjs`
  - Create `scripts/seed-user.ts`:
    - Reads CLI args or defaults: `--email admin@local --password admin123 --name "Admin User"`
    - Generates UUID for user id
    - Hashes password with bcrypt (salt rounds: 10)
    - Inserts into `users` table using Drizzle
    - Handles duplicate email gracefully (prints "User already exists" and exits 0)
    - Prints confirmation: `User created: admin@local (id: <uuid>)`
  - Apply any pending database migrations before seeding (call `npx drizzle-kit push`)
  - Add npm script: `"seed": "npx tsx scripts/seed-user.ts"`
  - Write test `scripts/seed-user.test.ts`:
    - Test: seed creates a user that can be queried from DB
    - Test: running seed twice with same email doesn't crash
    - Test: password is hashed (not plaintext in DB)

  **Must NOT do**:
  - Do NOT create a self-registration endpoint or UI — admin seeds users via CLI only
  - Do NOT use any auth library besides bcryptjs for hashing
  - Do NOT store plaintext passwords

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single script, straightforward CLI + DB insert logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7, 8 in Wave 2 — but depends on Task 3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 7, 35
  - **Blocked By**: Task 3 (needs schema)

  **References**:

  **Pattern References**:
  - `src/lib/server/db/schema.ts` (Task 3) — `users` table schema: id (text UUID), email (unique), passwordHash (text), displayName (text), createdAt (integer)
  - `src/lib/server/db/index.ts` (Task 3) — db instance import pattern

  **External References**:
  - bcryptjs docs: `https://github.com/dcodeIO/bcrypt.js` — `hashSync(password, 10)` for hashing

  **WHY Each Reference Matters**:
  - Must use exact column names from schema (e.g., `passwordHash`, not `password_hash`) — Drizzle enforces this at compile time

  **Acceptance Criteria**:
  - [ ] `npx tsx scripts/seed-user.ts` creates a user in the database
  - [ ] `npx tsx scripts/seed-user.ts --email test@local --password pass123 --name "Test"` creates user with those values
  - [ ] Running seed twice with same email prints "already exists" and exits 0
  - [ ] Password stored in DB is bcrypt hash (starts with `$2a$` or `$2b$`), not plaintext
  - [ ] `npm test -- scripts/seed-user` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Seed creates user successfully
    Tool: Bash
    Preconditions: Empty database, schema migrated
    Steps:
      1. Run `npx tsx scripts/seed-user.ts --email test@local --password test123 --name "Test User"`
      2. Assert exit code 0
      3. Assert stdout contains "User created" and "test@local"
    Expected Result: User inserted, confirmation printed
    Failure Indicators: Non-zero exit, error message, no confirmation
    Evidence: .sisyphus/evidence/task-6-seed-user.txt

  Scenario: Duplicate email handled gracefully
    Tool: Bash
    Preconditions: User test@local already seeded
    Steps:
      1. Run `npx tsx scripts/seed-user.ts --email test@local --password test123 --name "Test User"` (again)
      2. Assert exit code 0
      3. Assert stdout contains "already exists"
    Expected Result: No crash, friendly message
    Failure Indicators: Non-zero exit, SQL constraint error
    Evidence: .sisyphus/evidence/task-6-seed-duplicate.txt
  ```

  **Commit**: YES (group: commit 2)
  - Message: `feat(db): add SQLite schema with Drizzle ORM and seed script`
  - Files: `scripts/seed-user.ts, scripts/seed-user.test.ts`
  - Pre-commit: `npm test -- scripts/seed-user`

---

- [x] 7. Authentication API Routes (Login / Logout)

  **What to do**:
  - Create `src/lib/server/services/auth.ts` — authentication service:
    ```typescript
    // Functions:
    async function verifyPassword(plaintext: string, hash: string): Promise<boolean>
    // Uses bcryptjs.compare

    async function createSession(userId: string): Promise<{ token: string; expiresAt: number }>
    // Generates 64-char crypto.randomBytes hex token
    // Inserts into sessions table (id=token, userId, expiresAt=now+7days)
    // Returns token and expiresAt

    async function validateSession(token: string): Promise<SessionUser | null>
    // Looks up session by token, checks not expired
    // Joins with users table to get user info
    // Returns SessionUser or null if invalid/expired

    async function deleteSession(token: string): Promise<void>
    // Deletes session from DB

    function setSessionCookie(cookies: Cookies, token: string, expiresAt: number): void
    // Sets httpOnly, secure, sameSite='lax', path='/', maxAge from expiresAt

    function clearSessionCookie(cookies: Cookies): void
    // Clears the session cookie
    ```
  - Create `src/routes/api/auth/login/+server.ts`:
    - POST handler: accepts `{ email: string, password: string }`
    - Validates input (email non-empty, password non-empty)
    - Looks up user by email in DB
    - Verifies password with bcrypt
    - Creates session, sets cookie
    - Returns `{ user: { id, email, displayName } }` on success
    - Returns `401 { error: "Invalid email or password" }` on failure (same message for both wrong email and wrong password — no information leakage)
  - Create `src/routes/api/auth/logout/+server.ts`:
    - POST handler: reads session cookie, deletes session from DB, clears cookie
    - Returns `{ success: true }`
    - Returns 200 even if no session (idempotent)
  - Write tests `src/lib/server/services/auth.test.ts`:
    - Test: verifyPassword returns true for correct password
    - Test: verifyPassword returns false for wrong password
    - Test: createSession inserts into DB and returns token
    - Test: validateSession returns user for valid token
    - Test: validateSession returns null for expired token
    - Test: deleteSession removes session from DB
  - Write API test `src/routes/api/auth/login/login.test.ts`:
    - Test: valid login returns 200 + user object + Set-Cookie header
    - Test: wrong password returns 401
    - Test: non-existent email returns 401

  **Must NOT do**:
  - Do NOT use Auth.js, Lucia, Passport, or any auth library — custom only
  - Do NOT return different error messages for "wrong email" vs "wrong password"
  - Do NOT add rate limiting (nice-to-have, not in scope)
  - Do NOT add password complexity requirements
  - Do NOT add "remember me" functionality

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Security-sensitive code, multiple files, session management, cookie handling — requires careful implementation
  - **Skills**: []
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not relevant — server-side auth logic

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10, 11, 12 in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 8, 9
  - **Blocked By**: Tasks 3, 4, 6 (needs schema, types, seeded user)

  **References**:

  **Pattern References**:
  - `src/lib/server/db/schema.ts` (Task 3) — `users` and `sessions` table definitions
  - `src/lib/server/db/index.ts` (Task 3) — `db` import
  - `src/lib/types.ts:SessionUser` (Task 4) — return type for validateSession

  **External References**:
  - SvelteKit cookies API: `https://kit.svelte.dev/docs/types#public-types-cookies` — `cookies.set()` and `cookies.delete()` usage
  - SvelteKit +server.ts docs: `https://kit.svelte.dev/docs/routing#server` — how to create API routes with RequestHandler

  **WHY Each Reference Matters**:
  - Schema determines column names for session queries (e.g., `sessions.expiresAt`, `users.passwordHash`)
  - SvelteKit's Cookies API has specific params (httpOnly, secure, sameSite, path) that must be set correctly for security
  - SessionUser type must match exactly what the hook (Task 8) will attach to `event.locals.user`

  **Acceptance Criteria**:
  - [ ] POST `/api/auth/login` with valid creds → 200 + `Set-Cookie` header with httpOnly session cookie
  - [ ] POST `/api/auth/login` with wrong password → 401 + `"Invalid email or password"`
  - [ ] POST `/api/auth/logout` → clears cookie and deletes session
  - [ ] Session cookie is httpOnly, sameSite=lax, path=/
  - [ ] Session expires after 7 days
  - [ ] `npm test -- auth` → all tests pass (9+ tests)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Login with valid credentials returns session cookie
    Tool: Bash (curl)
    Preconditions: User seeded (admin@local / admin123), server running on port 5173
    Steps:
      1. Run: `curl -s -D - -X POST http://localhost:5173/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@local","password":"admin123"}'`
      2. Assert HTTP 200
      3. Assert response body has `user.id` and `user.email`
      4. Assert response headers contain `set-cookie` with `httponly` flag
    Expected Result: 200 with user object and httpOnly session cookie
    Failure Indicators: Non-200 status, no Set-Cookie, missing httpOnly
    Evidence: .sisyphus/evidence/task-7-login-success.txt

  Scenario: Login with wrong password returns 401
    Tool: Bash (curl)
    Preconditions: User seeded, server running
    Steps:
      1. Run: `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5173/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@local","password":"wrongpass"}'`
      2. Assert HTTP 401
    Expected Result: 401 Unauthorized with generic error message
    Failure Indicators: 200 (login succeeded with wrong password) or 500
    Evidence: .sisyphus/evidence/task-7-login-wrong-password.txt

  Scenario: Logout clears session
    Tool: Bash (curl)
    Preconditions: Valid session cookie obtained from login
    Steps:
      1. Login first to get cookie: `COOKIE=$(curl -s -D - -X POST http://localhost:5173/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@local","password":"admin123"}' | grep -i set-cookie | cut -d' ' -f2)`
      2. Logout: `curl -s -X POST http://localhost:5173/api/auth/logout -H "Cookie: $COOKIE"`
      3. Try accessing protected route with same cookie
      4. Assert redirect to login (302 or 401)
    Expected Result: Session invalidated, subsequent requests rejected
    Failure Indicators: Session still valid after logout
    Evidence: .sisyphus/evidence/task-7-logout.txt
  ```

  **Commit**: YES (group: commit 3)
  - Message: `feat(auth): add login/logout with session cookies and route guards`
  - Files: `src/lib/server/services/auth.ts, src/routes/api/auth/login/+server.ts, src/routes/api/auth/logout/+server.ts, src/lib/server/services/auth.test.ts, src/routes/api/auth/login/login.test.ts`
  - Pre-commit: `npm test -- auth`

---

- [x] 8. Auth Hooks + Route Guards

  **What to do**:
  - Create `src/hooks.server.ts`:
    ```typescript
    import type { Handle } from '@sveltejs/kit';
    import { redirect } from '@sveltejs/kit';
    import { validateSession } from '$lib/server/services/auth';

    const PUBLIC_PATHS = ['/login', '/api/auth/login'];

    export const handle: Handle = async ({ event, resolve }) => {
      // 1. Read session cookie
      const sessionToken = event.cookies.get('session');

      // 2. Validate session if cookie exists
      if (sessionToken) {
        event.locals.user = await validateSession(sessionToken);
      } else {
        event.locals.user = null;
      }

      // 3. Protect non-public routes
      const isPublicPath = PUBLIC_PATHS.some(p => event.url.pathname.startsWith(p));
      if (!isPublicPath && !event.locals.user) {
        throw redirect(303, '/login');
      }

      // 4. Redirect logged-in users away from login page
      if (event.url.pathname === '/login' && event.locals.user) {
        throw redirect(303, '/');
      }

      return resolve(event);
    };
    ```
  - Create `src/routes/(app)/+layout.server.ts`:
    - Load function returns `{ user: event.locals.user }` — makes user available to all protected pages
  - Create route group `src/routes/(app)/` — this is the protected area
    - Move the existing `+page.svelte` from `src/routes/` into `src/routes/(app)/+page.svelte`
    - The root `src/routes/+page.svelte` should redirect to `/(app)/` or `src/routes/(app)/+page.svelte` becomes the main page
  - Write test `src/hooks.server.test.ts`:
    - Test: request to `/login` without session → resolves normally (no redirect)
    - Test: request to `/(app)/` without session → redirects to `/login`
    - Test: request to `/(app)/` with valid session → resolves normally, `event.locals.user` populated
    - Test: request to `/login` with valid session → redirects to `/`

  **Must NOT do**:
  - Do NOT use middleware libraries — SvelteKit hooks are sufficient
  - Do NOT add CSRF protection beyond SvelteKit's built-in (which is enabled by default)
  - Do NOT add role-based access control — all authenticated users have the same permissions

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Hooks are a core SvelteKit pattern, route protection logic must be correct for all auth flows
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10, 11, 12 in Wave 2 — but needs Task 7 done)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 9, 10, 13
  - **Blocked By**: Task 7 (needs auth service with validateSession)

  **References**:

  **Pattern References**:
  - `src/lib/server/services/auth.ts:validateSession` (Task 7) — function to call in hook
  - `src/lib/types.ts:SessionUser` (Task 4) — type for `event.locals.user`
  - `src/app.d.ts` (Task 4) — declares `App.Locals.user` type

  **External References**:
  - SvelteKit hooks docs: `https://kit.svelte.dev/docs/hooks#server-hooks-handle` — the handle function signature and event object
  - SvelteKit route groups: `https://kit.svelte.dev/docs/advanced-routing#advanced-layouts-group` — `(app)` group syntax

  **WHY Each Reference Matters**:
  - `validateSession` returns `SessionUser | null` — hook must handle both cases correctly
  - SvelteKit's route groups `(app)` create a layout boundary without affecting URL — all protected routes go here
  - `App.Locals` declaration (from Task 4) must match what the hook assigns

  **Acceptance Criteria**:
  - [ ] Unauthenticated request to `/` → redirects to `/login` (303)
  - [ ] Authenticated request to `/` → serves page with `user` data available
  - [ ] Authenticated request to `/login` → redirects to `/` (303)
  - [ ] API routes under `/api/auth/login` are accessible without auth
  - [ ] `event.locals.user` is populated for authenticated requests
  - [ ] `npm test -- hooks` → all tests pass (4+ tests)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Unauthenticated user redirected to login
    Tool: Bash (curl)
    Preconditions: Server running, no session cookie
    Steps:
      1. Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/`
      2. Assert HTTP 303 (redirect)
      3. Run: `curl -s -D - http://localhost:5173/ | grep -i location`
      4. Assert Location header contains "/login"
    Expected Result: 303 redirect to /login
    Failure Indicators: 200 (page served without auth), 500, or redirect to wrong page
    Evidence: .sisyphus/evidence/task-8-redirect-unauth.txt

  Scenario: Authenticated user can access protected routes
    Tool: Bash (curl)
    Preconditions: User seeded, server running
    Steps:
      1. Login: `COOKIE=$(curl -s -c - -X POST http://localhost:5173/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@local","password":"admin123"}' | grep session | awk '{print $NF}')`
      2. Access protected route: `curl -s -o /dev/null -w "%{http_code}" -b "session=$COOKIE" http://localhost:5173/`
      3. Assert HTTP 200
    Expected Result: 200 — page served with auth
    Failure Indicators: 303 redirect to login, 401, or 500
    Evidence: .sisyphus/evidence/task-8-auth-access.txt
  ```

  **Commit**: YES (group: commit 3)
  - Message: `feat(auth): add login/logout with session cookies and route guards`
  - Files: `src/hooks.server.ts, src/routes/(app)/+layout.server.ts, src/hooks.server.test.ts`
  - Pre-commit: `npm test -- hooks`

---

- [x] 9. Login Page UI

  **What to do**:
  - Create `src/routes/login/+page.svelte`:
    - Centered login card on a neutral background
    - Email input field (type="email", required, autocomplete="email")
    - Password input field (type="password", required, autocomplete="current-password")
    - "Sign In" submit button
    - Error message display area (hidden by default, shown on invalid credentials)
    - On submit: POST to `/api/auth/login` with `{ email, password }` as JSON
    - On success (200): redirect to `/` using `goto('/')`
    - On failure (401): show "Invalid email or password" error
    - On network error: show "Connection failed. Please try again."
    - Loading state: disable button and show spinner during request
    - The form should work without JavaScript (progressive enhancement): `<form method="POST" action="/api/auth/login">`
  - Style with Tailwind:
    - Responsive: centered card, max-width ~400px
    - Dark mode support (card background, input borders, text colors adapt)
    - Subtle branding: app name "Alfy AI" at the top of the card (or whatever the user's brand is — use a simple text logo, not an image)
    - Clean, modern appearance — no over-decoration
  - Write Playwright test `tests/e2e/login.test.ts`:
    - Test: page loads with email and password fields
    - Test: submitting valid credentials redirects to main app
    - Test: submitting invalid credentials shows error message
    - Test: error message disappears when user starts typing again

  **Must NOT do**:
  - Do NOT add "Forgot password" link — no password reset flow
  - Do NOT add "Register" link — no self-registration
  - Do NOT add OAuth buttons (Google, GitHub, etc.)
  - Do NOT add remember me checkbox

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Login page is primarily UI work — form layout, styling, error states, responsive design
  - **Skills**: [`playwright`]
    - `playwright`: Needed for E2E test execution

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 10, 11 in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 35
  - **Blocked By**: Tasks 7, 8 (needs login API + route guard)

  **References**:

  **Pattern References**:
  - `src/routes/api/auth/login/+server.ts` (Task 7) — POST endpoint this form submits to: `{ email, password }` → `{ user }` or 401
  - `src/hooks.server.ts` (Task 8) — `/login` is in `PUBLIC_PATHS` (no auth required to access)

  **External References**:
  - SvelteKit form actions: `https://kit.svelte.dev/docs/form-actions` — progressive enhancement pattern

  **WHY Each Reference Matters**:
  - Login API response shape determines what the client receives after form submit — must handle 200 + 401 cases
  - Hook defines `/login` as public — if this changes, login page breaks

  **Acceptance Criteria**:
  - [ ] `/login` renders a form with email and password inputs
  - [ ] Valid credentials → redirect to `/`
  - [ ] Invalid credentials → "Invalid email or password" visible on page
  - [ ] Button disabled during request (loading state)
  - [ ] Dark mode styling works (toggle in browser DevTools: `document.documentElement.classList.add('dark')`)
  - [ ] `npx playwright test tests/e2e/login.test.ts` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Login page loads with form elements
    Tool: Playwright
    Preconditions: Server running on localhost:5173, user seeded
    Steps:
      1. Navigate to http://localhost:5173/login
      2. Assert page has input[type="email"] (selector: `input[type="email"]`)
      3. Assert page has input[type="password"]
      4. Assert page has button with text "Sign In" (selector: `button[type="submit"]`)
      5. Screenshot
    Expected Result: Login form visible with all elements
    Failure Indicators: Missing inputs, 500 error, redirect loop
    Evidence: .sisyphus/evidence/task-9-login-page-load.png

  Scenario: Successful login redirects to app
    Tool: Playwright
    Preconditions: Server running, admin@local user seeded
    Steps:
      1. Navigate to /login
      2. Fill input[type="email"] with "admin@local"
      3. Fill input[type="password"] with "admin123"
      4. Click button[type="submit"]
      5. Wait for navigation
      6. Assert URL is "/" (or "/chat" or whatever the main app route is)
      7. Screenshot
    Expected Result: Redirected to main app after login
    Failure Indicators: Stays on /login, error message appears, 500
    Evidence: .sisyphus/evidence/task-9-login-success.png

  Scenario: Wrong password shows error
    Tool: Playwright
    Preconditions: Server running, user seeded
    Steps:
      1. Navigate to /login
      2. Fill email with "admin@local"
      3. Fill password with "wrongpassword"
      4. Click submit
      5. Wait for error message to appear (selector: `[data-testid="login-error"]` or `.text-red-500`)
      6. Assert error text contains "Invalid email or password"
      7. Screenshot
    Expected Result: Error message displayed, still on /login
    Failure Indicators: No error shown, redirect to app, 500 page
    Evidence: .sisyphus/evidence/task-9-login-error.png
  ```

  **Commit**: YES (group: commit 3)
  - Message: `feat(auth): add login/logout with session cookies and route guards`
  - Files: `src/routes/login/+page.svelte, tests/e2e/login.test.ts`
  - Pre-commit: `npx playwright test tests/e2e/login.test.ts`

---

- [x] 10. App Shell Layout (Sidebar + Chat Area + Header)

  **What to do**:
  - Create `src/routes/(app)/+layout.svelte` — the main app layout:
    - Three-region layout: collapsible sidebar (left), main chat area (center), header bar (top)
    - **Header**: App name "Alfy AI", user display name (from page data), theme toggle button placeholder (Task 11), logout button
    - **Sidebar**: Fixed width (~280px), scrollable conversation list area (populated in Task 14), "New Conversation" button at top
    - **Main area**: Fills remaining width, vertically split: messages display area (scrollable, flex-grow) + message input area (fixed at bottom)
    - Sidebar toggle button (hamburger icon) in header for mobile/narrow viewports
    - Use Tailwind flex/grid layout — sidebar is `flex-shrink-0 w-72`, main is `flex-grow`
  - Create `src/lib/components/layout/Header.svelte`:
    - App logo/name on the left
    - User display name
    - Theme toggle placeholder (empty div with `id="theme-toggle"` — Task 11 fills this)
    - Logout button: `on:click` → POST to `/api/auth/logout` → redirect to `/login`
    - Sidebar toggle button (visible on mobile only via `lg:hidden`)
  - Create `src/lib/components/layout/Sidebar.svelte`:
    - "New Conversation" button at top (dispatches event, no logic yet)
    - Scrollable area for conversation list (slot or placeholder div for Task 14)
    - Visual styling: dark sidebar background in dark mode, light in light mode
    - Receives `open: boolean` prop — controls visibility on mobile (slide-in overlay)
  - Create `src/lib/components/layout/ChatArea.svelte`:
    - Scrollable message display container (slot for message components from Task 17)
    - Fixed-bottom input area container (slot for message input from Task 15)
    - Empty state: centered message "Start a new conversation" when no conversation selected
  - Create Svelte store `src/lib/stores/ui.ts`:
    - `sidebarOpen: writable<boolean>(true)` — tracks sidebar visibility
    - `currentConversationId: writable<string | null>(null)` — active conversation

  **Must NOT do**:
  - Do NOT implement actual conversation list — just the container (Task 14)
  - Do NOT implement message display — just the scrollable container (Task 17)
  - Do NOT implement message input — just the container area (Task 15)
  - Do NOT implement dark/light mode logic — just the visual structure that supports it (Task 11)
  - Do NOT add animations beyond basic sidebar slide-in

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Pure layout/UI work — flexbox, responsive breakpoints, component structure
  - **Skills**: [`playwright`]
    - `playwright`: For verifying layout renders correctly

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 11 in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 14, 15, 17, 19, 27
  - **Blocked By**: Task 8 (needs auth hooks + layout.server.ts for user data)

  **References**:

  **Pattern References**:
  - `src/routes/(app)/+layout.server.ts` (Task 8) — provides `{ user }` data to layout
  - Open WebUI layout pattern: sidebar + main area + header is the standard chat UI layout

  **External References**:
  - Tailwind flexbox: `https://tailwindcss.com/docs/flex` — flex layout utilities
  - SvelteKit layouts: `https://kit.svelte.dev/docs/routing#layout` — nested layout pattern

  **WHY Each Reference Matters**:
  - Layout.server.ts exports user data — layout needs to receive and display `data.user.displayName`
  - The layout structure defines slots/containers that Tasks 14, 15, 17 fill in — must provide correct mounting points

  **Acceptance Criteria**:
  - [ ] `/(app)/` renders three-region layout: sidebar, header, chat area
  - [ ] Header shows app name, user's displayName, logout button
  - [ ] Sidebar shows "New Conversation" button and empty list area
  - [ ] Chat area shows "Start a new conversation" empty state
  - [ ] Logout button works: clicking it redirects to `/login`
  - [ ] On narrow viewport (<1024px): sidebar is hidden, hamburger toggle shows it as overlay
  - [ ] `npm run build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: App shell renders with all regions
    Tool: Playwright
    Preconditions: Logged in, on main app page
    Steps:
      1. Navigate to / (with valid session cookie)
      2. Assert sidebar container visible (selector: `[data-testid="sidebar"]` or `aside`)
      3. Assert header visible with app name "Alfy AI"
      4. Assert main chat area visible
      5. Assert "New Conversation" button in sidebar
      6. Assert user display name visible in header
      7. Screenshot at 1280x800
    Expected Result: Three-region layout fully rendered
    Failure Indicators: Missing regions, broken flexbox, overflow issues
    Evidence: .sisyphus/evidence/task-10-app-shell.png

  Scenario: Sidebar collapses on mobile viewport
    Tool: Playwright
    Preconditions: Logged in
    Steps:
      1. Set viewport to 375x812 (iPhone)
      2. Navigate to /
      3. Assert sidebar is NOT visible
      4. Assert hamburger button IS visible (selector: `[data-testid="sidebar-toggle"]`)
      5. Click hamburger button
      6. Assert sidebar slides in as overlay
      7. Screenshot
    Expected Result: Sidebar hidden by default on mobile, toggleable via hamburger
    Failure Indicators: Sidebar always visible on mobile, no toggle button, overlay doesn't work
    Evidence: .sisyphus/evidence/task-10-mobile-sidebar.png

  Scenario: Logout redirects to login
    Tool: Playwright
    Preconditions: Logged in
    Steps:
      1. Navigate to /
      2. Click logout button (selector: `[data-testid="logout-btn"]` or button with text "Logout")
      3. Wait for navigation
      4. Assert URL contains "/login"
    Expected Result: User logged out and redirected
    Failure Indicators: Stays on app page, 500 error
    Evidence: .sisyphus/evidence/task-10-logout.png
  ```

  **Commit**: YES (group: commit 4)
  - Message: `feat(layout): add app shell with sidebar, chat area, and dark mode`
  - Files: `src/routes/(app)/+layout.svelte, src/lib/components/layout/Header.svelte, src/lib/components/layout/Sidebar.svelte, src/lib/components/layout/ChatArea.svelte, src/lib/stores/ui.ts`
  - Pre-commit: `npm run build`

---

- [x] 11. Dark/Light Mode Toggle with Persistence

  **What to do**:
  - Create `src/lib/stores/theme.ts`:
    ```typescript
    // Svelte store for theme management
    type Theme = 'light' | 'dark' | 'system';

    // On init: read from localStorage, fallback to 'system'
    // 'system' uses window.matchMedia('(prefers-color-scheme: dark)')
    // Apply theme by adding/removing 'dark' class on document.documentElement

    export const theme: Writable<Theme>  // reactive store
    export function initTheme(): void     // call on mount, reads localStorage
    export function setTheme(t: Theme): void  // updates store, localStorage, DOM class
    ```
  - Create `src/lib/components/layout/ThemeToggle.svelte`:
    - Button with sun/moon icon (use simple inline SVG or Unicode: ☀️/🌙)
    - Cycles: system → light → dark → system
    - Tooltip showing current mode ("System", "Light", "Dark")
    - Smooth icon transition (CSS transition on opacity/transform)
  - Integrate into Header.svelte (Task 10):
    - Replace the theme toggle placeholder with `<ThemeToggle />` component
  - Add theme initialization in `src/routes/(app)/+layout.svelte`:
    - Call `initTheme()` in `onMount`
    - Subscribe to theme store, apply `dark` class to `<html>` element
  - Prevent flash of wrong theme (FOSC):
    - Add inline `<script>` in `src/app.html` that reads localStorage and applies `dark` class BEFORE Svelte hydrates:
    ```html
    <script>
      (function() {
        const stored = localStorage.getItem('theme');
        if (stored === 'dark' || (!stored && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.documentElement.classList.add('dark');
        }
      })();
    </script>
    ```
  - Write test `src/lib/stores/theme.test.ts`:
    - Test: default theme is 'system'
    - Test: setTheme('dark') adds 'dark' class
    - Test: setTheme('light') removes 'dark' class
    - Test: theme persists to localStorage

  **Must NOT do**:
  - Do NOT add more than 3 total themes (light, dark, system)
  - Do NOT add per-component theme overrides
  - Do NOT use CSS variables for theming — Tailwind's `dark:` variant is sufficient

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Theme management is a UI concern — DOM manipulation, CSS, localStorage
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 9, 10 in Wave 2 — but needs Task 10's header)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 16, 27
  - **Blocked By**: Task 10 (needs Header component to place toggle)

  **References**:

  **Pattern References**:
  - `src/lib/components/layout/Header.svelte` (Task 10) — placeholder div where toggle goes
  - `tailwind.config.ts` (Task 1) — `darkMode: 'class'` must be configured

  **External References**:
  - Tailwind dark mode docs: `https://tailwindcss.com/docs/dark-mode` — class-based dark mode strategy

  **WHY Each Reference Matters**:
  - Tailwind's `dark:` prefix only works when `<html class="dark">` is set — the theme store must control this class
  - Header.svelte provides the mounting point for the toggle button

  **Acceptance Criteria**:
  - [ ] Theme toggle button visible in header
  - [ ] Clicking toggle cycles through: system → light → dark → system
  - [ ] Dark mode: background dark, text light, all components adapt
  - [ ] Light mode: background light, text dark
  - [ ] Theme persists across page refresh (localStorage)
  - [ ] No flash of wrong theme on initial load
  - [ ] `npm test -- theme` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Theme toggle cycles modes
    Tool: Playwright
    Preconditions: Logged in, on main page
    Steps:
      1. Navigate to /
      2. Assert theme toggle button visible (selector: `[data-testid="theme-toggle"]`)
      3. Get initial state of `<html>` class
      4. Click toggle once → check class changed
      5. Click toggle again → check class changed again
      6. Click toggle third time → back to system mode
      7. Screenshot in each mode
    Expected Result: Toggle cycles through system → light → dark → system
    Failure Indicators: Class doesn't change, toggle doesn't respond, visual glitch
    Evidence: .sisyphus/evidence/task-11-theme-toggle-light.png, task-11-theme-toggle-dark.png

  Scenario: Theme persists after refresh
    Tool: Playwright
    Preconditions: Logged in
    Steps:
      1. Set theme to "dark" by clicking toggle
      2. Assert `<html>` has class "dark"
      3. Reload page
      4. Assert `<html>` still has class "dark" (no flash)
      5. Assert localStorage has theme=dark
    Expected Result: Dark mode persists across refresh
    Failure Indicators: Theme resets to system/light after refresh, flash of white
    Evidence: .sisyphus/evidence/task-11-theme-persist.png
  ```

  **Commit**: YES (group: commit 4)
  - Message: `feat(layout): add app shell with sidebar, chat area, and dark mode`
  - Files: `src/lib/stores/theme.ts, src/lib/components/layout/ThemeToggle.svelte, src/lib/stores/theme.test.ts`
  - Pre-commit: `npm test -- theme`

---

- [x] 12. Langflow API Client Service

  **What to do**:
  - Create `src/lib/server/services/langflow.ts`:
    ```typescript
    import { config } from '../env';
    import type { LangflowRunRequest, LangflowRunResponse, LangflowMessage } from '$lib/types';

    /**
     * Send a message to Langflow and get the full response (non-streaming).
     * Used for: all languages when streaming is not active.
     */
    export async function sendMessage(
      message: string,
      sessionId: string
    ): Promise<{ text: string; rawResponse: LangflowRunResponse }> {
      const url = `${config.langflow.apiUrl}/api/v1/run/${config.langflow.flowId}`;
      const body: LangflowRunRequest = {
        input_value: message,
        input_type: 'chat',
        output_type: 'chat',
        session_id: sessionId,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.app.requestTimeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': config.langflow.apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Langflow error: ${response.status} ${response.statusText}`);
        }

        const data: LangflowRunResponse = await response.json();
        const text = extractMessageText(data);
        return { text, rawResponse: data };
      } finally {
        clearTimeout(timeout);
      }
    }

    /**
     * Extract the assistant's response text from the Langflow RunResponse.
     * Path: outputs[0].outputs[0].results.message.text
     */
    export function extractMessageText(response: LangflowRunResponse): string {
      // Navigate the nested structure safely
      const outputs = response.outputs?.[0]?.outputs?.[0];
      const message = outputs?.results?.message;
      if (!message?.text) {
        throw new Error('Could not extract message text from Langflow response');
      }
      return message.text;
    }

    /**
     * Start a streaming request to Langflow. Returns a ReadableStream of SSE events.
     * Used for: English path streaming.
     */
    export async function sendMessageStream(
      message: string,
      sessionId: string
    ): Promise<ReadableStream<Uint8Array>> {
      const url = `${config.langflow.apiUrl}/api/v1/run/${config.langflow.flowId}?stream=true`;
      const body: LangflowRunRequest = {
        input_value: message,
        input_type: 'chat',
        output_type: 'chat',
        session_id: sessionId,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.app.requestTimeoutMs);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.langflow.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        clearTimeout(timeout);
        throw new Error(`Langflow streaming error: ${response.status}`);
      }

      if (!response.body) {
        clearTimeout(timeout);
        throw new Error('No response body for streaming');
      }

      // The caller is responsible for consuming and closing the stream
      // Timeout cleanup happens when stream completes or errors
      return response.body;
    }
    ```
  - Write test `src/lib/server/services/langflow.test.ts`:
    - Test: `sendMessage` calls correct URL with correct headers and body
    - Test: `extractMessageText` extracts text from valid response
    - Test: `extractMessageText` throws for malformed response (missing outputs, missing message)
    - Test: `sendMessage` throws on non-200 response
    - Test: `sendMessage` throws on timeout (use short timeout + delayed mock)
    - Test: `sendMessageStream` returns a ReadableStream
    - Use mock Langflow server (from Task 5) for integration tests

  **Must NOT do**:
  - Do NOT add retry logic here — that's in Task 31
  - Do NOT parse SSE events in this module — streaming consumer (Task 20) handles that
  - Do NOT add response caching
  - Do NOT modify the Langflow request format (no tweaks, no extra fields)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: API client with streaming, AbortController, timeout handling — must be robust
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 7-11 in Wave 2)
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 18, 20, 25
  - **Blocked By**: Tasks 2, 4 (needs env config + types)

  **References**:

  **Pattern References**:
  - `src/lib/server/env.ts:config` (Task 2) — `config.langflow.apiUrl`, `config.langflow.apiKey`, `config.langflow.flowId`, `config.app.requestTimeoutMs`
  - `src/lib/types.ts:LangflowRunRequest` (Task 4) — request body shape
  - `src/lib/types.ts:LangflowRunResponse` (Task 4) — response shape

  **API/Type References**:
  - Langflow API contract from UI_HANDOFF.md lines 84-99:
    ```
    POST /api/v1/run/{flow_id}
    Headers: x-api-key, Content-Type: application/json
    Body: { input_value, input_type: "chat", output_type: "chat", session_id }
    Response: { outputs: [{ outputs: [{ results: { message: { text } } }] }], session_id }
    ```
  - Langflow SSE: `?stream=true` returns `text/event-stream`, events with `add_message` type, terminates with `data: [DONE]`

  **WHY Each Reference Matters**:
  - The extraction path `outputs[0].outputs[0].results.message.text` is the critical path — if wrong, no messages display
  - env config provides the base URL, API key, flow ID, and timeout — all must be read from config, not hardcoded
  - Types ensure the request/response shapes are correct at compile time

  **Acceptance Criteria**:
  - [ ] `sendMessage('hello', 'session-1')` returns `{ text: string, rawResponse: LangflowRunResponse }`
  - [ ] `extractMessageText` correctly navigates `outputs[0].outputs[0].results.message.text`
  - [ ] Request includes `x-api-key` header from config
  - [ ] Request times out after `config.app.requestTimeoutMs` (AbortController)
  - [ ] `sendMessageStream` returns a ReadableStream for SSE consumption
  - [ ] `npm test -- langflow` → all tests pass (6+ tests)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Non-streaming message round-trip with mock
    Tool: Bash (vitest)
    Preconditions: Mock Langflow server running on port 7860
    Steps:
      1. Start mock: `MOCK_LANGFLOW_PORT=7860 npx tsx tests/mocks/start-mocks.ts &`
      2. Wait 2s
      3. Run: `npm test -- src/lib/server/services/langflow.test.ts`
      4. Assert all tests pass
      5. Kill mock
    Expected Result: sendMessage returns extracted text from mock response
    Failure Indicators: Connection refused, wrong extraction path, timeout
    Evidence: .sisyphus/evidence/task-12-langflow-client-tests.txt

  Scenario: Timeout triggers correctly
    Tool: Bash (vitest)
    Preconditions: Test configured with 500ms timeout, mock with 2000ms delay
    Steps:
      1. Test case sets REQUEST_TIMEOUT_MS=500 and MOCK_RESPONSE_DELAY_MS=2000
      2. Call sendMessage
      3. Assert it throws an AbortError or timeout error within ~500ms
    Expected Result: Request aborted after timeout
    Failure Indicators: Request hangs, no error thrown, error not AbortError
    Evidence: .sisyphus/evidence/task-12-langflow-timeout.txt
  ```

  **Commit**: YES (group: commit 6)
  - Message: `feat(chat): add non-streaming message send/receive via Langflow`
  - Files: `src/lib/server/services/langflow.ts, src/lib/server/services/langflow.test.ts`
  - Pre-commit: `npm test -- langflow`

---

- [x] 13. Conversation CRUD Service + API Routes

  **What to do**:
  - Create `src/lib/server/services/conversations.ts`:
    ```typescript
    import { db } from '../db';
    import { conversations } from '../db/schema';
    import { eq, and, desc } from 'drizzle-orm';
    import { v4 as uuidv4 } from 'uuid';
    // Install: npm i uuid && npm i -D @types/uuid

    /**
     * Create a new conversation for a user.
     * The conversation ID doubles as the Langflow session_id.
     */
    export function createConversation(userId: string, title?: string): Conversation {
      const id = uuidv4();
      const now = Math.floor(Date.now() / 1000);
      db.insert(conversations).values({
        id,
        userId,
        title: title ?? 'New conversation',
        createdAt: now,
        updatedAt: now,
      }).run();
      return { id, title: title ?? 'New conversation', createdAt: now, updatedAt: now };
    }

    /** List all conversations for a user, newest first */
    export function listConversations(userId: string): ConversationListItem[] { ... }

    /** Get a single conversation (with ownership check) */
    export function getConversation(userId: string, conversationId: string): Conversation | null { ... }

    /** Update conversation title */
    export function updateConversationTitle(userId: string, conversationId: string, title: string): void { ... }

    /** Delete a conversation (with ownership check) */
    export function deleteConversation(userId: string, conversationId: string): boolean { ... }

    /** Touch updatedAt timestamp */
    export function touchConversation(userId: string, conversationId: string): void { ... }
    ```
  - Create API routes:
    - `src/routes/api/conversations/+server.ts`:
      - GET: `listConversations(locals.user.id)` → `{ conversations: ConversationListItem[] }`
      - POST: `createConversation(locals.user.id)` → `{ conversation: Conversation }`
    - `src/routes/api/conversations/[id]/+server.ts`:
      - GET: `getConversation(locals.user.id, params.id)` → `{ conversation }` or 404
      - PATCH: `updateConversationTitle(locals.user.id, params.id, body.title)` → `{ conversation }`
      - DELETE: `deleteConversation(locals.user.id, params.id)` → `{ success: true }` or 404
  - All routes check `event.locals.user` — return 401 if not authenticated
  - All queries filter by userId — a user cannot see/modify another user's conversations
  - Write tests `src/lib/server/services/conversations.test.ts`:
    - Test: create → list → returns the created conversation
    - Test: list only returns the calling user's conversations (create for user A, query as user B → empty)
    - Test: delete → list → conversation gone
    - Test: update title → get → title changed, updatedAt changed
    - Test: get non-existent → null
    - Test: delete another user's conversation → returns false

  **Must NOT do**:
  - Do NOT store message content in the conversation — only metadata
  - Do NOT add pagination (not needed with sidebar — all conversations load)
  - Do NOT add conversation search/filter
  - Do NOT add conversation archiving or pinning

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: CRUD service + API routes + user isolation logic + multiple test cases
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 14-19 in Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 14, 18, 24
  - **Blocked By**: Tasks 3, 4, 8 (needs schema, types, auth hooks)

  **References**:

  **Pattern References**:
  - `src/lib/server/db/schema.ts:conversations` (Task 3) — table columns: id, userId, title, createdAt, updatedAt
  - `src/lib/server/db/index.ts:db` (Task 3) — Drizzle db instance
  - `src/lib/types.ts:Conversation, ConversationListItem` (Task 4) — return types
  - `src/hooks.server.ts` (Task 8) — `event.locals.user` provides authenticated user

  **External References**:
  - Drizzle ORM queries: `https://orm.drizzle.team/docs/rqb` — select, insert, update, delete with where clauses
  - SvelteKit +server.ts: `https://kit.svelte.dev/docs/routing#server` — GET/POST/PATCH/DELETE handlers

  **WHY Each Reference Matters**:
  - Schema column names must match exactly in Drizzle queries (TypeScript enforces this)
  - `event.locals.user.id` is how we get the authenticated user's ID for filtering — this is set by the auth hook

  **Acceptance Criteria**:
  - [ ] `POST /api/conversations` creates a new conversation with UUID id
  - [ ] `GET /api/conversations` returns only the authenticated user's conversations, newest first
  - [ ] `DELETE /api/conversations/[id]` removes conversation (only if user owns it)
  - [ ] `PATCH /api/conversations/[id]` updates title
  - [ ] User A cannot see/modify User B's conversations
  - [ ] `npm test -- conversations` → all tests pass (6+ tests)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: CRUD lifecycle
    Tool: Bash (curl)
    Preconditions: Logged in, session cookie available
    Steps:
      1. Create: `curl -s -b "session=$COOKIE" -X POST http://localhost:5173/api/conversations`
      2. Parse response, get conversation.id
      3. List: `curl -s -b "session=$COOKIE" http://localhost:5173/api/conversations`
      4. Assert the created conversation appears in the list
      5. Rename: `curl -s -b "session=$COOKIE" -X PATCH http://localhost:5173/api/conversations/$ID -H "Content-Type: application/json" -d '{"title":"Renamed"}'`
      6. Get: `curl -s -b "session=$COOKIE" http://localhost:5173/api/conversations/$ID`
      7. Assert title is "Renamed"
      8. Delete: `curl -s -b "session=$COOKIE" -X DELETE http://localhost:5173/api/conversations/$ID`
      9. List again: assert conversation is gone
    Expected Result: Full CRUD lifecycle works
    Failure Indicators: Any step returns non-200, conversation not found after create, still visible after delete
    Evidence: .sisyphus/evidence/task-13-crud-lifecycle.txt

  Scenario: User isolation — can't see other user's conversations
    Tool: Bash (vitest)
    Preconditions: Two users seeded in test DB
    Steps:
      1. Create conversation as User A
      2. List conversations as User B
      3. Assert empty list
      4. Delete conversation as User B using User A's conversation ID
      5. Assert returns false / 404
    Expected Result: Complete user isolation
    Failure Indicators: User B sees User A's data, or can delete it
    Evidence: .sisyphus/evidence/task-13-user-isolation.txt
  ```

  **Commit**: YES (group: commit 5)
  - Message: `feat(conversations): add conversation CRUD and sidebar list`
  - Files: `src/lib/server/services/conversations.ts, src/routes/api/conversations/+server.ts, src/routes/api/conversations/[id]/+server.ts, src/lib/server/services/conversations.test.ts`
  - Pre-commit: `npm test -- conversations`

---

- [x] 14. Conversation Sidebar Component

  **What to do**:
  - Create `src/lib/components/sidebar/ConversationList.svelte`:
    - Fetches conversation list from `GET /api/conversations` on mount
    - Renders each conversation as a clickable item showing: title (truncated to ~30 chars) and relative timestamp ("2 min ago", "Yesterday", "Mar 12")
    - Active conversation highlighted with a different background color
    - On click: sets `currentConversationId` in the ui store, navigates to load that conversation
    - Each item has a context menu (right-click or three-dot button) with: "Rename" and "Delete" options
    - Delete shows a brief confirmation ("Delete this conversation?" with Yes/No)
  - Create `src/lib/components/sidebar/ConversationItem.svelte`:
    - Single conversation row component
    - Props: `conversation: ConversationListItem`, `active: boolean`
    - Dispatches events: `select`, `rename`, `delete`
    - Inline rename: clicking "Rename" makes the title editable (contenteditable or input field), pressing Enter saves via PATCH
    - Delete: dispatches delete event, parent handles API call
  - Create `src/lib/utils/time.ts`:
    - `formatRelativeTime(unixTimestamp: number): string` — returns "just now", "2 min ago", "1 hour ago", "Yesterday", "Mar 12", etc.
  - Integrate into `Sidebar.svelte` (Task 10):
    - Replace the placeholder slot/div with `<ConversationList />`
    - Wire "New Conversation" button: POST `/api/conversations` → add to list → set as active
  - Create Svelte store `src/lib/stores/conversations.ts`:
    ```typescript
    export const conversations = writable<ConversationListItem[]>([]);
    export async function loadConversations(): Promise<void> { ... }
    export async function createNewConversation(): Promise<string> { ... }  // returns new id
    export async function deleteConversationById(id: string): Promise<void> { ... }
    export async function renameConversation(id: string, title: string): Promise<void> { ... }
    ```
  - Write test `src/lib/utils/time.test.ts`:
    - Test: timestamp from 30 seconds ago → "just now"
    - Test: timestamp from 5 minutes ago → "5 min ago"
    - Test: timestamp from yesterday → "Yesterday"
    - Test: timestamp from last week → date string ("Mar 12")

  **Must NOT do**:
  - Do NOT add conversation search/filter
  - Do NOT add drag-to-reorder
  - Do NOT add folders or categories
  - Do NOT add conversation pinning or archiving
  - Do NOT store messages in the sidebar — only metadata

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Interactive sidebar with click handlers, inline editing, context menus — UI-heavy
  - **Skills**: [`playwright`]
    - `playwright`: For verifying sidebar interactions

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 15, 16, 17, 18 in Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 24, 32
  - **Blocked By**: Tasks 10, 13 (needs sidebar container + conversation API)

  **References**:

  **Pattern References**:
  - `src/lib/components/layout/Sidebar.svelte` (Task 10) — parent container where ConversationList mounts
  - `src/routes/api/conversations/+server.ts` (Task 13) — GET returns `{ conversations: ConversationListItem[] }`, POST creates new
  - `src/routes/api/conversations/[id]/+server.ts` (Task 13) — PATCH renames, DELETE removes
  - `src/lib/stores/ui.ts:currentConversationId` (Task 10) — store tracking active conversation
  - `src/lib/types.ts:ConversationListItem` (Task 4) — `{ id, title, updatedAt }`

  **Design Spec References**:
  - `DESIGN_SPEC.md:314-327` — Sidebar specification: 260px width, `--bg-secondary`, conversation item styling, 44px minimum touch height, active state with `--accent` left border
  - `DESIGN_SPEC.md:101-103` — Spacing tokens for sidebar items: `--space-sm` vertical, `--space-md` horizontal
  - `DESIGN_SPEC.md:266-268` — Timestamp formatting: `--text-secondary`, 12px, sans-serif, relative time on desktop

  **WHY Each Reference Matters**:
  - Sidebar.svelte provides the mount point — ConversationList must be a child component that fits its layout
  - API routes define the contract for CRUD operations — fetch calls must match these endpoints exactly
  - `currentConversationId` store is the source of truth for which conversation is active
  - DESIGN_SPEC.md defines exact visual tokens — sidebar must use `--bg-secondary`, items must be 44px touch targets

  **Acceptance Criteria**:
  - [ ] Sidebar shows list of conversations fetched from API
  - [ ] Clicking a conversation highlights it and updates `currentConversationId`
  - [ ] "New Conversation" creates a new entry at the top of the list
  - [ ] Right-click or ⋮ menu shows Rename and Delete options
  - [ ] Inline rename saves to backend on Enter
  - [ ] Delete removes conversation from list after confirmation
  - [ ] Timestamps show relative time ("2 min ago", "Yesterday")

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Sidebar shows conversations and supports selection
    Tool: Playwright
    Preconditions: Logged in, 3 conversations already created via API
    Steps:
      1. Navigate to /
      2. Assert sidebar shows 3 conversation items
      3. Click the second conversation
      4. Assert it gets highlighted (has active/selected CSS class)
      5. Screenshot
    Expected Result: Conversations listed, selection works
    Failure Indicators: Empty sidebar, click doesn't highlight, items missing
    Evidence: .sisyphus/evidence/task-14-sidebar-list.png

  Scenario: New conversation appears at top
    Tool: Playwright
    Preconditions: Logged in, at least 1 existing conversation
    Steps:
      1. Click "New Conversation" button
      2. Assert a new item appears at the top of the list with title "New conversation"
      3. Assert it is the active/selected item
    Expected Result: New conversation created and selected
    Failure Indicators: No new item, item at bottom, not selected
    Evidence: .sisyphus/evidence/task-14-new-conversation.png

  Scenario: Delete conversation removes it
    Tool: Playwright
    Preconditions: Logged in, 2+ conversations
    Steps:
      1. Right-click (or click ⋮) on a conversation
      2. Click "Delete"
      3. Confirm deletion
      4. Assert conversation removed from list
      5. Assert count decreased by 1
    Expected Result: Conversation deleted from sidebar
    Failure Indicators: Still visible, error dialog, count unchanged
    Evidence: .sisyphus/evidence/task-14-delete-conversation.png
  ```

  **Commit**: YES (group: commit 5)
  - Message: `feat(conversations): add conversation CRUD and sidebar list`
  - Files: `src/lib/components/sidebar/ConversationList.svelte, src/lib/components/sidebar/ConversationItem.svelte, src/lib/utils/time.ts, src/lib/stores/conversations.ts, src/lib/utils/time.test.ts`
  - Pre-commit: `npm test -- time`

---

- [x] 15. Message Input Component

  **What to do**:
  - Create `src/lib/components/chat/MessageInput.svelte`:
    - `<textarea>` that auto-grows (up to ~200px max height, then scrollable)
    - **Enter** to send, **Shift+Enter** for new line
    - Send button (arrow icon) on the right side of the input
    - Send button disabled when: textarea is empty (whitespace-only counts as empty) OR message is currently being sent (loading state)
    - Character count indicator: shows `{current}/{max}` when user has typed >80% of max length (from config: 10000 chars). Red text when at limit.
    - Input validation: trim whitespace, reject empty, reject over max length
    - Dispatches `send` event with `{ message: string }` payload
    - Props: `disabled: boolean` (for when waiting for response), `maxLength: number` (default 10000)
    - Clear textarea after successful send
    - Focus textarea on mount and when conversation changes
    - File attachment button placeholder (left of textarea): grayed out paperclip icon with "Coming soon" tooltip (Task 26 completes this, but the visual placeholder should exist)
  - Write test `src/lib/components/chat/MessageInput.test.ts`:
    - Test: Enter key triggers send event with message content
    - Test: Shift+Enter inserts newline (does NOT send)
    - Test: Empty input does not trigger send
    - Test: Input clears after send
    - Test: Character count appears when >80% of max length

  **Must NOT do**:
  - Do NOT implement actual message sending (that's Task 18) — only dispatch the event
  - Do NOT add rich text editing (bold, italic buttons, etc.)
  - Do NOT add emoji picker
  - Do NOT add voice input
  - Do NOT add the actual file upload logic (Task 26 handles the placeholder visuals)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Interactive textarea with keyboard handling, auto-grow, character count — UI component work
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13, 14, 16, 17 in Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 18, 26
  - **Blocked By**: Task 10 (needs ChatArea container)

  **References**:

  **Pattern References**:
  - `src/lib/components/layout/ChatArea.svelte` (Task 10) — bottom slot where input mounts
  - UI_HANDOFF.md lines 139-142 — input requirements: multi-line, Enter to send, Shift+Enter for newline
  - UI_HANDOFF.md line 297 — max message length: 10000 chars

  **Design Spec References**:
  - `DESIGN_SPEC.md:296-312` — Message input area: `--bg-primary` background, `--border` border, `--border-focus` on focus, `--radius-md`, `--shadow-md`, textarea grows to max 200px (desktop) / 120px (mobile), serif font, placeholder text
  - `DESIGN_SPEC.md:307-309` — Send button: circle/rounded rectangle, `--accent` background, white arrow, disabled state uses `--bg-hover`
  - `DESIGN_SPEC.md:310-312` — File attachment button: paperclip icon, `--text-secondary`, disabled/grayed
  - `DESIGN_SPEC.md:241-243` — Touch targets: all tappable elements must be at least 44×44px

  **WHY Each Reference Matters**:
  - ChatArea provides the fixed-bottom container — MessageInput must fit within it
  - Enter/Shift+Enter behavior is explicitly specified in requirements and must be exact
  - DESIGN_SPEC.md defines exact input styling — must use design tokens, not hardcoded values

  **Acceptance Criteria**:
  - [ ] Textarea renders in chat area, auto-grows with content
  - [ ] Enter sends, Shift+Enter adds newline
  - [ ] Empty messages blocked (send button disabled)
  - [ ] Character count shows when >80% of 10000 chars
  - [ ] Textarea clears after send
  - [ ] `npm test -- MessageInput` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Enter sends message, Shift+Enter adds line
    Tool: Playwright
    Preconditions: Logged in, on a conversation page
    Steps:
      1. Click textarea to focus it
      2. Type "Hello world"
      3. Press Shift+Enter
      4. Type "Second line"
      5. Assert textarea value contains newline
      6. Press Enter
      7. Assert textarea is now empty (message sent)
    Expected Result: Shift+Enter adds line, Enter sends and clears
    Failure Indicators: Enter adds newline instead of sending, Shift+Enter sends, textarea not cleared
    Evidence: .sisyphus/evidence/task-15-input-keyboard.png

  Scenario: Character count appears near limit
    Tool: Playwright
    Preconditions: Logged in, on conversation
    Steps:
      1. Type a string of 8500 characters (>80% of 10000)
      2. Assert character count indicator appears (selector: `[data-testid="char-count"]`)
      3. Assert it shows format like "8500/10000"
    Expected Result: Character count visible near limit
    Failure Indicators: No count shown, count appears too early or too late
    Evidence: .sisyphus/evidence/task-15-char-count.png
  ```

  **Commit**: YES (group: commit 6)
  - Message: `feat(chat): add non-streaming message send/receive via Langflow`
  - Files: `src/lib/components/chat/MessageInput.svelte, src/lib/components/chat/MessageInput.test.ts`
  - Pre-commit: `npm test -- MessageInput`

---

- [x] 16. Markdown Rendering Engine (marked + DOMPurify + Shiki)

  **What to do**:
  - Install: `npm i marked dompurify shiki` and `npm i -D @types/dompurify`
  - Create `src/lib/services/markdown.ts`:
    ```typescript
    import { marked } from 'marked';
    import DOMPurify from 'dompurify';
    import { createHighlighter, type Highlighter } from 'shiki';

    let highlighter: Highlighter | null = null;

    /**
     * Initialize Shiki highlighter. Call once on app start.
     * Loads 2 themes (light + dark) and common languages.
     */
    export async function initHighlighter(): Promise<void> {
      highlighter = await createHighlighter({
        themes: ['github-light', 'github-dark'],
        langs: ['python', 'javascript', 'typescript', 'json', 'bash', 'sql', 'html', 'css', 'yaml', 'markdown', 'plaintext'],
      });
    }

    /**
     * Render Markdown string to sanitized HTML with syntax highlighting.
     * @param content - Raw Markdown text
     * @param isDark - Whether dark mode is active (selects Shiki theme)
     * @returns Sanitized HTML string
     */
    export function renderMarkdown(content: string, isDark: boolean): string {
      // Configure marked with custom renderer for code blocks
      const renderer = new marked.Renderer();

      renderer.code = ({ text, lang }) => {
        // Use Shiki for syntax highlighting
        if (highlighter && lang) {
          const theme = isDark ? 'github-dark' : 'github-light';
          try {
            return highlighter.codeToHtml(text, { lang, theme });
          } catch {
            // Unknown language — fallback to plaintext
            return highlighter.codeToHtml(text, { lang: 'plaintext', theme });
          }
        }
        // Fallback without Shiki
        return `<pre><code class="language-${lang || 'plaintext'}">${text}</code></pre>`;
      };

      // Render markdown
      const html = marked(content, { renderer, breaks: true });

      // Sanitize HTML — allow Shiki's style attributes
      return DOMPurify.sanitize(html, {
        ADD_ATTR: ['style'],
        ADD_TAGS: ['span'],
      });
    }
    ```
  - Create `src/lib/components/chat/MarkdownRenderer.svelte`:
    - Props: `content: string`, `isDark: boolean`
    - Uses `renderMarkdown()` to produce HTML
    - Renders with `{@html sanitizedHtml}` wrapped in `<div class="prose dark:prose-invert">`
    - Uses `@tailwindcss/typography` prose classes for baseline markdown styling
    - Applies custom CSS for:
      - Code blocks: rounded corners, slight background, horizontal scroll (`overflow-x: auto`)
      - Inline code: monospace font, subtle background, slight padding
      - Links: colored, underlined, `target="_blank" rel="noopener"`
      - Tables: bordered, alternating row colors
  - Write test `src/lib/services/markdown.test.ts`:
    - Test: plain text renders as paragraph
    - Test: `**bold**` renders as `<strong>`
    - Test: fenced code block with language tag gets Shiki highlighting (contains `<pre>` with inline styles)
    - Test: code block without language tag falls back to plaintext
    - Test: XSS attempt (`<script>alert('xss')</script>`) is sanitized
    - Test: URLs rendered as clickable `<a>` tags
    - Test: inline code `\`code\`` renders as `<code>`

  **Must NOT do**:
  - Do NOT load more than 12 languages in Shiki (keep bundle small)
  - Do NOT add more than 2 Shiki themes (github-light, github-dark)
  - Do NOT implement streaming markdown yet (Task 22 handles incremental rendering)
  - Do NOT add LaTeX/math rendering
  - Do NOT add Mermaid diagram rendering

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Library integration (marked + DOMPurify + Shiki), custom renderer, security-sensitive (XSS prevention)
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13-15, 17-19 in Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 17, 22
  - **Blocked By**: Tasks 4, 11 (needs types for theme, dark mode toggle)

  **References**:

  **Pattern References**:
  - `src/lib/stores/theme.ts` (Task 11) — provides `isDark` state for selecting Shiki theme
  - `tailwind.config.ts` (Task 1) — `@tailwindcss/typography` plugin provides `prose` classes

  **External References**:
  - marked docs: `https://marked.js.org/` — renderer customization, code block hooks
  - Shiki docs: `https://shiki.style/guide/install` — createHighlighter, themes, languages
  - DOMPurify: `https://github.com/cure53/DOMPurify` — sanitization config with ADD_ATTR for Shiki styles

  **WHY Each Reference Matters**:
  - Shiki injects inline `style` attributes — DOMPurify must be configured with `ADD_ATTR: ['style']` or highlighting is stripped
  - The prose class from typography plugin provides baseline styling (headings, lists, blockquotes) — saves custom CSS work
  - Theme store determines which Shiki theme to use — must subscribe reactively

  **Acceptance Criteria**:
  - [ ] `renderMarkdown('**bold**', false)` returns HTML containing `<strong>bold</strong>`
  - [ ] Python code block gets Shiki syntax highlighting (colored spans)
  - [ ] `<script>` tags are stripped by DOMPurify
  - [ ] Code blocks have horizontal scroll on overflow
  - [ ] Dark mode uses `github-dark` theme, light uses `github-light`
  - [ ] `npm test -- markdown` → all tests pass (7+ tests)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Markdown renders with syntax highlighting
    Tool: Playwright
    Preconditions: Logged in, message with code block displayed
    Steps:
      1. Send a message that will return a response containing a Python code block (or use mock)
      2. Assert the response area contains a `<pre>` element with Shiki's highlighted HTML
      3. Assert the code block has colored syntax (check for `<span style="color:` in innerHTML)
      4. Toggle dark mode
      5. Assert code block colors changed (different Shiki theme applied)
      6. Screenshot in both modes
    Expected Result: Syntax-highlighted code blocks in both themes
    Failure Indicators: Plain text code, no colors, same colors in both themes
    Evidence: .sisyphus/evidence/task-16-markdown-highlight-light.png, task-16-markdown-highlight-dark.png

  Scenario: XSS is prevented
    Tool: Bash (vitest)
    Preconditions: markdown.ts module importable
    Steps:
      1. Call renderMarkdown('<script>alert("xss")</script>', false)
      2. Assert output does NOT contain `<script>`
      3. Call renderMarkdown('<img src=x onerror=alert(1)>', false)
      4. Assert output does NOT contain `onerror`
    Expected Result: All XSS vectors sanitized
    Failure Indicators: Script tags or event handlers present in output
    Evidence: .sisyphus/evidence/task-16-xss-prevention.txt
  ```

  **Commit**: YES (group: commit 7)
  - Message: `feat(markdown): add Markdown rendering with Shiki syntax highlighting`
  - Files: `src/lib/services/markdown.ts, src/lib/components/chat/MarkdownRenderer.svelte, src/lib/services/markdown.test.ts`
  - Pre-commit: `npm test -- markdown`

---

- [x] 17. Message Display Component (with Copy Buttons)

  **What to do**:
  - Create `src/lib/components/chat/MessageBubble.svelte`:
    - Props: `message: ChatMessage` (from types.ts: id, role, content, timestamp, isStreaming)
    - Layout: user messages right-aligned with colored background, assistant messages left-aligned
    - User messages: plain text display (no markdown rendering)
    - Assistant messages: rendered via `<MarkdownRenderer content={message.content} isDark={$isDark} />`
    - Timestamp shown below each message (formatted via `formatRelativeTime`)
    - "Copy message" button: appears on hover, copies raw markdown content to clipboard
    - Streaming indicator: if `message.isStreaming`, show a blinking cursor at the end of content
  - Create `src/lib/components/chat/CodeBlock.svelte`:
    - Wrapper around Shiki-rendered code blocks
    - Adds a "Copy" button in the top-right corner of each code block
    - Shows language label (e.g., "python") in the top-left
    - Copy button: uses `navigator.clipboard.writeText(rawCode)`, shows "Copied!" for 2 seconds
    - Must work with the Markdown renderer's output — use a Svelte action or MutationObserver to inject copy buttons into `<pre>` elements after rendering
  - Create `src/lib/components/chat/MessageList.svelte`:
    - Props: `messages: ChatMessage[]`
    - Renders `<MessageBubble />` for each message
    - Auto-scrolls to bottom when new messages are added or content grows
    - Uses `$effect` or `afterUpdate` to trigger scroll
    - Empty state: shows nothing (parent ChatArea handles empty state message)
  - Integrate CodeBlock copy buttons with MarkdownRenderer (Task 16):
    - After MarkdownRenderer produces HTML with Shiki code blocks, CodeBlock component enhances them with copy buttons
    - Approach: use a Svelte `use:action` on the rendered HTML container that finds all `<pre>` elements and injects copy button HTML + click handlers
  - Write test `src/lib/components/chat/MessageBubble.test.ts`:
    - Test: user message displays plain text (no markdown rendering)
    - Test: assistant message renders markdown
    - Test: copy button copies to clipboard

  **Must NOT do**:
  - Do NOT add message editing
  - Do NOT add message deletion
  - Do NOT add reactions/emoji
  - Do NOT add message threading
  - Do NOT persist messages to database

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with hover interactions, clipboard API, auto-scroll, styling
  - **Skills**: [`playwright`]

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 13-16, 18 in Wave 3)
  - **Parallel Group**: Wave 3
  - **Blocks**: Tasks 18, 22
  - **Blocked By**: Tasks 10, 16 (needs ChatArea container + MarkdownRenderer)

  **References**:

  **Pattern References**:
  - `src/lib/components/chat/MarkdownRenderer.svelte` (Task 16) — renders assistant message content
  - `src/lib/components/layout/ChatArea.svelte` (Task 10) — scrollable container where messages mount
  - `src/lib/types.ts:ChatMessage` (Task 4) — message data shape
  - `src/lib/utils/time.ts:formatRelativeTime` (Task 14) — timestamp formatting

  **Design Spec References**:
  - `DESIGN_SPEC.md:257-268` — Message bubbles: user right-aligned with `--bg-message-user`, `--radius-md`, max-width 85% (mobile) / 80% (desktop); assistant left-aligned on `--bg-primary`, full width up to 720px
  - `DESIGN_SPEC.md:270-286` — Code blocks: `--bg-code`, `--border`, `--radius-md`, monospace 14px, horizontal scroll, copy button top-right, language label top-left
  - `DESIGN_SPEC.md:288-294` — Inline code: `--bg-code`, `--radius-sm`, 2px 6px padding, no border
  - `DESIGN_SPEC.md:278-280` — Copy button: appears on hover (desktop) or always visible (mobile), `--text-secondary`, shows "Copied!" for 2s

  **WHY Each Reference Matters**:
  - MarkdownRenderer produces the HTML that CodeBlock must enhance — the code block injection strategy depends on MarkdownRenderer's output structure
  - ChatMessage.isStreaming controls whether to show blinking cursor — streaming tasks (20-21) set this flag
  - DESIGN_SPEC.md defines exact bubble styling, code block appearance, and copy button behavior

  **Acceptance Criteria**:
  - [ ] User messages appear right-aligned, assistant messages left-aligned
  - [ ] Assistant messages have markdown rendered with syntax highlighting
  - [ ] "Copy" button on code blocks copies raw code
  - [ ] "Copy message" button copies full markdown content
  - [ ] Auto-scroll to bottom on new messages
  - [ ] `npm test -- MessageBubble` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Messages display with correct alignment and markdown
    Tool: Playwright
    Preconditions: Logged in, conversation with user + assistant messages
    Steps:
      1. Assert user message is right-aligned (check CSS class or computed style)
      2. Assert assistant message is left-aligned
      3. Assert assistant message contains rendered HTML (not raw markdown)
      4. Assert code block has syntax highlighting (colored spans)
      5. Screenshot
    Expected Result: Proper alignment and rendering
    Failure Indicators: Wrong alignment, raw markdown visible, no highlighting
    Evidence: .sisyphus/evidence/task-17-message-display.png

  Scenario: Code copy button works
    Tool: Playwright
    Preconditions: Assistant message with a Python code block displayed
    Steps:
      1. Hover over the code block
      2. Assert "Copy" button visible (selector: `[data-testid="code-copy-btn"]` or `.copy-button`)
      3. Click the copy button
      4. Assert button text changes to "Copied!" temporarily
      5. Read clipboard content and assert it matches the code block text
    Expected Result: Code copied to clipboard, visual feedback shown
    Failure Indicators: No copy button, clipboard empty, no feedback
    Evidence: .sisyphus/evidence/task-17-code-copy.png
  ```

  **Commit**: YES (group: commit 6)
  - Message: `feat(chat): add non-streaming message send/receive via Langflow`
  - Files: `src/lib/components/chat/MessageBubble.svelte, src/lib/components/chat/CodeBlock.svelte, src/lib/components/chat/MessageList.svelte, src/lib/components/chat/MessageBubble.test.ts`
  - Pre-commit: `npm test -- MessageBubble`

---

- [x] 18. Non-Streaming Chat Flow (Send → Wait → Display Response)

  **What to do**:
  - Create `src/routes/(app)/chat/[conversationId]/+page.svelte`:
    - Loads conversation metadata from API on mount
    - Maintains `messages: ChatMessage[]` in a local Svelte store for this page
    - On mount: messages array starts empty (Langflow stores history, not us)
    - Renders `<MessageList messages={$messages} />` and `<MessageInput on:send={handleSend} />`
  - Create `src/routes/api/chat/send/+server.ts`:
    - POST handler: accepts `{ message: string, conversationId: string }`
    - Validates: message not empty, not over max length, conversationId exists and belongs to user
    - Calls `sendMessage(message, conversationId)` from Langflow client (Task 12)
    - Returns `{ response: { text: string }, conversationId: string }`
    - On error: returns `{ error: string }` with appropriate status code
  - Wire the flow in `+page.svelte`:
    1. User types message → `MessageInput` dispatches `send` event
    2. Add user message to `messages` array immediately (optimistic)
    3. Add placeholder assistant message with `isStreaming: true` and empty content
    4. POST to `/api/chat/send` with `{ message, conversationId }`
    5. On success: update assistant message with response text, set `isStreaming: false`
    6. On error: remove placeholder, show error (Task 31 adds retry UI)
    7. Touch conversation updatedAt via API (so sidebar shows recency)
  - Create `src/routes/(app)/chat/[conversationId]/+page.ts` (client-side load):
    - Loads conversation metadata from `GET /api/conversations/[id]`
    - Returns 404 if conversation doesn't exist or doesn't belong to user
  - Handle navigation: when `currentConversationId` changes (sidebar click), navigate to `/chat/[id]`
  - Create `src/routes/(app)/+page.svelte` — the landing page when no conversation is selected:
    - Shows "Select a conversation or create a new one" centered message
    - "New Conversation" button that creates one and navigates to it
  - Write test `src/routes/api/chat/send/send.test.ts`:
    - Test: valid request with mock Langflow → returns response text
    - Test: empty message → 400 error
    - Test: message over max length → 400 error
    - Test: non-existent conversation → 404

  **Must NOT do**:
  - Do NOT implement streaming yet — this is the non-streaming path (Tasks 20-21 add streaming)
  - Do NOT persist messages to the database — only in-memory for the current page session
  - Do NOT add retry logic here — Task 31 handles that
  - Do NOT add file upload handling

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core chat flow connecting multiple systems (input → API → Langflow → display), page routing, state management
  - **Skills**: [`playwright`]
    - `playwright`: For E2E verification of the full send → receive flow

  **Parallelization**:
  - **Can Run In Parallel**: NO — this is the integration point for Wave 3
  - **Parallel Group**: Wave 3 (last task, after 13-17 complete)
  - **Blocks**: Tasks 19, 20, 23, 25
  - **Blocked By**: Tasks 5, 12, 13, 15, 17 (needs mock, Langflow client, conversations, input, display)

  **References**:

  **Pattern References**:
  - `src/lib/server/services/langflow.ts:sendMessage` (Task 12) — calls Langflow API, returns text
  - `src/lib/components/chat/MessageInput.svelte` (Task 15) — dispatches `send` event with `{ message }`
  - `src/lib/components/chat/MessageList.svelte` (Task 17) — renders messages array
  - `src/lib/server/services/conversations.ts:getConversation, touchConversation` (Task 13) — verify ownership, update timestamp
  - `src/lib/stores/ui.ts:currentConversationId` (Task 10) — active conversation tracking
  - `src/lib/types.ts:ChatMessage` (Task 4) — message structure with isStreaming flag

  **WHY Each Reference Matters**:
  - `sendMessage` returns `{ text, rawResponse }` — the page must extract `text` and display it
  - MessageInput dispatches `send` — page must listen for this event and handle the flow
  - The `isStreaming` flag on ChatMessage controls the blinking cursor in MessageBubble — set to true during request, false when response arrives

  **Acceptance Criteria**:
  - [ ] Type message → press Enter → message appears in chat (user bubble)
  - [ ] Loading state shows during Langflow response (assistant placeholder with cursor)
  - [ ] Response appears as assistant message with markdown rendered
  - [ ] Empty/too-long messages are rejected with appropriate error
  - [ ] Conversation updatedAt is touched after each message
  - [ ] `npm test -- send` → all tests pass
  - [ ] Full E2E: login → create conversation → send message → see response

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full message round-trip (non-streaming)
    Tool: Playwright
    Preconditions: Logged in, mock Langflow running, new conversation created
    Steps:
      1. Navigate to conversation page
      2. Type "What is 2+2?" in the message input
      3. Press Enter
      4. Assert user message "What is 2+2?" appears right-aligned
      5. Assert loading indicator visible (blinking cursor or spinner)
      6. Wait for response (max 10s with mock)
      7. Assert assistant response appears left-aligned
      8. Assert response contains markdown-rendered text (not empty)
      9. Assert loading indicator gone
      10. Screenshot
    Expected Result: Complete send → loading → receive → display cycle
    Failure Indicators: Message not sent, no loading indicator, no response, response raw (not rendered)
    Evidence: .sisyphus/evidence/task-18-message-roundtrip.png

  Scenario: Error on empty message
    Tool: Playwright
    Preconditions: On conversation page
    Steps:
      1. Clear textarea
      2. Press Enter
      3. Assert no message sent (no user bubble added)
      4. Assert send button is disabled
    Expected Result: Empty message blocked
    Failure Indicators: Empty message sent, API call made
    Evidence: .sisyphus/evidence/task-18-empty-message-blocked.png
  ```

  **Commit**: YES (group: commit 6)
  - Message: `feat(chat): add non-streaming message send/receive via Langflow`
  - Files: `src/routes/(app)/chat/[conversationId]/+page.svelte, src/routes/(app)/chat/[conversationId]/+page.ts, src/routes/api/chat/send/+server.ts, src/routes/(app)/+page.svelte, src/routes/api/chat/send/send.test.ts`
  - Pre-commit: `npm test -- send`

---

- [x] 19. Loading/Status Indicator Component

  **What to do**:
  - Create `src/lib/components/chat/LoadingIndicator.svelte`:
    - Animated typing indicator that shows while waiting for AI response (40-90 seconds)
    - Three bouncing dots animation (the classic "AI is typing..." pattern)
    - Shows status text: "Thinking..." as the default label
    - Props: `status: string` (default "Thinking..."), `visible: boolean`
    - Smooth fade-in/fade-out transitions (Svelte `transition:fade`)
    - Positioned in the chat area as the last "message" (left-aligned like assistant messages)
    - Subtle, non-intrusive design — should not dominate the viewport during 60s+ waits
  - Create `src/lib/components/chat/StatusBar.svelte` (optional enhancement):
    - Thin bar at the top or bottom of chat area showing: elapsed time since message sent
    - Format: "Waiting... 15s" → "Waiting... 45s" → shows elapsed seconds
    - Only visible during active request
    - Props: `active: boolean`, `startTime: number`
  - Integrate into chat flow (`+page.svelte` from Task 18):
    - Show `<LoadingIndicator />` when waiting for response
    - Hide when response arrives or error occurs
    - The loading indicator replaces the placeholder assistant message's blinking cursor (from Task 17) — or is shown alongside it
  - CSS animation: pure CSS (no animation libraries), smooth and lightweight
  - Write test `src/lib/components/chat/LoadingIndicator.test.ts`:
    - Test: component renders when visible=true
    - Test: component hidden when visible=false
    - Test: custom status text displayed

  **Must NOT do**:
  - Do NOT add phase-specific status messages (like "Translating...") — that's nice-to-have for v1
  - Do NOT add a progress bar (we don't know the progress)
  - Do NOT use heavy animation libraries (Framer Motion, GSAP, etc.)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Animation, CSS, visual component — primarily styling work
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Wave 3 tasks after Task 10 + 18)
  - **Parallel Group**: Wave 3 (can start after Task 10, integrates with Task 18)
  - **Blocks**: Tasks 25, 31
  - **Blocked By**: Tasks 10, 18 (needs ChatArea + chat flow to integrate)

  **References**:

  **Pattern References**:
  - `src/routes/(app)/chat/[conversationId]/+page.svelte` (Task 18) — integration point, shows/hides indicator
  - `src/lib/components/chat/MessageBubble.svelte` (Task 17) — indicator should be styled like assistant messages (left-aligned)

  **Design Spec References**:
  - `DESIGN_SPEC.md:329-337` — Loading/status indicator: positioned where next assistant message would appear (left-aligned), three animated dots using `--accent` color, status text in `--text-secondary` 14px sans-serif, gentle pulsing/bouncing motion (not spinner), scrolls into view on mobile
  - `DESIGN_SPEC.md:367-368` — Typing indicator dots animation: staggered opacity pulse, 600ms cycle per dot, 100ms stagger between dots
  - `DESIGN_SPEC.md:384-385` — Reduced motion: respect `prefers-reduced-motion`, disable animations when set, indicator still visible but static

  **WHY Each Reference Matters**:
  - The indicator must match the visual style of assistant messages (same alignment, same padding area)
  - Task 18's page controls visibility — the component is passive, receives props
  - DESIGN_SPEC.md defines exact animation timing, dot behavior, and accessibility requirements

  **Acceptance Criteria**:
  - [ ] Three bouncing dots animation visible during request
  - [ ] "Thinking..." text displayed next to dots
  - [ ] Smooth fade-in when request starts, fade-out when response arrives
  - [ ] Indicator left-aligned like assistant messages
  - [ ] `npm test -- LoadingIndicator` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Loading indicator shows during request
    Tool: Playwright
    Preconditions: Logged in, on conversation, mock Langflow with 3s delay
    Steps:
      1. Send a message
      2. Within 500ms, assert loading indicator visible (selector: `[data-testid="loading-indicator"]`)
      3. Assert "Thinking..." text visible
      4. Assert bouncing dots animation running (check for CSS animation class)
      5. Wait for response
      6. Assert loading indicator no longer visible
      7. Screenshot during loading state
    Expected Result: Indicator visible during wait, hidden after response
    Failure Indicators: No indicator shown, indicator persists after response, no animation
    Evidence: .sisyphus/evidence/task-19-loading-indicator.png

  Scenario: Indicator hidden when no active request
    Tool: Playwright
    Preconditions: Logged in, on conversation, no pending request
    Steps:
      1. Assert loading indicator is NOT visible
      2. Assert no "Thinking..." text on page
    Expected Result: No indicator when idle
    Failure Indicators: Indicator visible without active request
    Evidence: .sisyphus/evidence/task-19-no-loading.txt
  ```

  **Commit**: YES (group: commit 11)
  - Message: `feat(ux): add error handling, retry, loading indicators, responsive layout`
  - Files: `src/lib/components/chat/LoadingIndicator.svelte, src/lib/components/chat/StatusBar.svelte, src/lib/components/chat/LoadingIndicator.test.ts`
  - Pre-commit: `npm test -- LoadingIndicator`

---

- [x] 20. English SSE Streaming — Server Proxy Endpoint

  **What to do**:
  - Create `src/routes/api/chat/stream/+server.ts`:
    - POST handler: accepts `{ message: string, conversationId: string }`
    - Validates: message non-empty, within max length, conversationId exists and belongs to user
    - Calls `sendMessageStream(message, conversationId)` from Langflow client (Task 12) — gets `ReadableStream<Uint8Array>` back
    - Returns a `Response` with:
      - `Content-Type: text/event-stream`
      - `Cache-Control: no-cache`
      - `Connection: keep-alive`
    - Proxies the Langflow SSE stream to the browser, transforming events:
      - Read Langflow's raw SSE stream using `eventsource-parser/stream` (install: `npm i eventsource-parser`)
      - For each `add_message` event: extract the text chunk and re-emit as: `event: token\ndata: {"text": "<chunk>"}\n\n`
      - When `[DONE]` received: emit `event: end\ndata: {}\n\n` and close the stream
      - On error: emit `event: error\ndata: {"message": "<error>"}\n\n` and close
    - Uses `ReadableStream` + `TextEncoder` to construct the SSE response
    - AbortController with timeout (120s) — if Langflow takes too long, emit error event and close
    - Touch conversation updatedAt after stream completes
  - Install: `npm i eventsource-parser`
  - Write test `src/routes/api/chat/stream/stream.test.ts`:
    - Test: valid request with streaming mock → returns text/event-stream content-type
    - Test: stream contains token events with text chunks
    - Test: stream ends with end event after [DONE]
    - Test: unauthenticated request → 401
    - Test: invalid conversationId → 404

  **Must NOT do**:
  - Do NOT add the client-side SSE consumer here (Task 21 handles that)
  - Do NOT handle Hungarian streaming here (Task 28-29 handles webhook path)
  - Do NOT buffer the entire response before streaming — must be real-time pass-through
  - Do NOT add WebSocket support — SSE only

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: SSE proxy with stream parsing, ReadableStream construction, timeout handling — requires careful async/streaming code
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 21-24 in Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: Tasks 21, 30
  - **Blocked By**: Tasks 4, 5, 12, 18 (needs types, mock, Langflow client, non-streaming flow working)

  **References**:

  **Pattern References**:
  - `src/lib/server/services/langflow.ts:sendMessageStream` (Task 12) — returns `ReadableStream<Uint8Array>` from Langflow's `?stream=true` endpoint
  - `src/routes/api/chat/send/+server.ts` (Task 18) — non-streaming endpoint pattern (same validation logic)
  - `src/lib/types.ts:StreamEvent` (Task 4) — `{ event: 'token' | 'end' | 'error', data: string }`

  **External References**:
  - eventsource-parser: `https://github.com/rexxars/eventsource-parser` — `EventSourceParserStream` for parsing SSE in Node
  - Open WebUI streaming pattern: `open-webui/open-webui/src/lib/apis/streaming/index.ts` — uses `EventSourceParserStream` to parse Langflow SSE
  - SvelteKit streaming response: `https://kit.svelte.dev/docs/routing#server` — return `new Response(readableStream, { headers })` from +server.ts

  **WHY Each Reference Matters**:
  - `sendMessageStream` returns Langflow's raw byte stream — must parse SSE events from it before re-emitting to browser
  - The eventsource-parser library handles SSE parsing edge cases (multi-line data, reconnection IDs) — don't hand-roll this
  - Open WebUI's implementation is a proven reference for this exact Langflow streaming pattern

  **Acceptance Criteria**:
  - [ ] POST `/api/chat/stream` returns `Content-Type: text/event-stream`
  - [ ] Stream contains `event: token` events with text chunks
  - [ ] Stream ends with `event: end` after Langflow sends `[DONE]`
  - [ ] Error conditions emit `event: error` and close stream
  - [ ] 120s timeout triggers error event
  - [ ] `npm test -- stream` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: SSE stream proxies Langflow tokens
    Tool: Bash (curl)
    Preconditions: Logged in (cookie), mock Langflow running with streaming enabled
    Steps:
      1. Run: `curl -s -N -X POST http://localhost:5173/api/chat/stream -H "Content-Type: application/json" -H "Cookie: session=$COOKIE" -d '{"message":"Hello","conversationId":"$CONV_ID"}' --max-time 15`
      2. Assert response headers contain `content-type: text/event-stream`
      3. Assert output contains multiple `event: token` lines
      4. Assert output contains `event: end` as the final event
      5. Collect all token data payloads and concatenate — assert non-empty text
    Expected Result: Streaming SSE events with text tokens ending in end event
    Failure Indicators: Non-SSE response, no token events, no end event, empty tokens
    Evidence: .sisyphus/evidence/task-20-sse-stream-proxy.txt

  Scenario: Unauthenticated stream request rejected
    Tool: Bash (curl)
    Preconditions: Mock running, no session cookie
    Steps:
      1. Run: `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5173/api/chat/stream -H "Content-Type: application/json" -d '{"message":"Hello","conversationId":"test"}'`
      2. Assert HTTP 401
    Expected Result: 401 without session
    Failure Indicators: 200 or streaming response without auth
    Evidence: .sisyphus/evidence/task-20-sse-unauth.txt
  ```

  **Commit**: YES (group: commit 8)
  - Message: `feat(streaming-en): add English SSE streaming via Langflow`
  - Files: `src/routes/api/chat/stream/+server.ts, src/routes/api/chat/stream/stream.test.ts`
  - Pre-commit: `npm test -- stream`

---

- [x] 21. English SSE Streaming — Client-Side Consumer + Display

  **What to do**:
  - Create `src/lib/services/streaming.ts` — client-side SSE consumer:
    ```typescript
    /**
     * Initiate a streaming chat request and call onToken for each chunk.
     * Returns an object with abort() method.
     */
    export function streamChat(
      message: string,
      conversationId: string,
      callbacks: {
        onToken: (text: string) => void;       // Called for each text chunk
        onEnd: (fullText: string) => void;      // Called when stream complete
        onError: (error: string) => void;       // Called on error
      }
    ): { abort: () => void } {
      const controller = new AbortController();

      (async () => {
        try {
          const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, conversationId }),
            signal: controller.signal,
          });

          if (!response.ok) {
            callbacks.onError(`Request failed: ${response.status}`);
            return;
          }

          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let fullText = '';
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Parse SSE events from buffer
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.startsWith('event: token')) {
                // Next data line contains the token
              } else if (line.startsWith('data: ')) {
                const data = line.slice(6);
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.text) {
                    fullText += parsed.text;
                    callbacks.onToken(parsed.text);
                  }
                } catch { /* skip non-JSON lines */ }
              } else if (line.startsWith('event: end')) {
                callbacks.onEnd(fullText);
                return;
              } else if (line.startsWith('event: error')) {
                // Error data follows
              }
            }
          }

          // If stream ended without explicit end event
          if (fullText) callbacks.onEnd(fullText);
        } catch (err) {
          if (controller.signal.aborted) return; // User cancelled
          callbacks.onError(err instanceof Error ? err.message : 'Stream failed');
        }
      })();

      return { abort: () => controller.abort() };
    }
    ```
  - Integrate into chat page (`src/routes/(app)/chat/[conversationId]/+page.svelte` from Task 18):
    - Add a `streamingMode` check: use streaming if available (for now, default to streaming for all requests — Hungarian path will override in Task 25)
    - When streaming:
      1. Add user message to messages array
      2. Add assistant placeholder with `isStreaming: true`, empty content
      3. Call `streamChat(message, conversationId, { onToken, onEnd, onError })`
      4. `onToken`: append chunk to assistant message's content (reactive update)
      5. `onEnd`: set `isStreaming: false`, trigger title generation if first message
      6. `onError`: set error state, remove placeholder
    - When NOT streaming (fallback): use existing non-streaming flow from Task 18
  - Handle user navigation away during stream: abort the stream (use `onDestroy` lifecycle)
  - Write test `src/lib/services/streaming.test.ts`:
    - Test: streamChat calls onToken for each chunk
    - Test: streamChat calls onEnd with full concatenated text
    - Test: streamChat calls onError on network failure
    - Test: abort() stops the stream

  **Must NOT do**:
  - Do NOT implement Hungarian webhook streaming consumer — only English SSE path
  - Do NOT add any language detection — streaming is used for all messages at this point
  - Do NOT buffer tokens before calling onToken — deliver immediately for responsive feel

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Client-side streaming with ReadableStream, SSE parsing, reactive state updates, abort handling
  - **Skills**: [`playwright`]
    - `playwright`: For E2E testing of streaming display

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 22-27 in Wave 4, but needs Task 20)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 30
  - **Blocked By**: Tasks 20, 22 (needs server SSE proxy + streaming markdown renderer)

  **References**:

  **Pattern References**:
  - `src/routes/api/chat/stream/+server.ts` (Task 20) — emits `event: token\ndata: {"text": "chunk"}\n\n`
  - `src/routes/(app)/chat/[conversationId]/+page.svelte` (Task 18) — existing non-streaming flow to extend
  - `src/lib/types.ts:ChatMessage` (Task 4) — `isStreaming` flag controls blinking cursor display
  - `src/lib/components/chat/MessageBubble.svelte` (Task 17) — renders content that gets reactively updated

  **WHY Each Reference Matters**:
  - The SSE event format (`event: token\ndata: {"text": "..."}`) must be parsed correctly — mismatch means no tokens displayed
  - The page's messages array must be mutated reactively so Svelte re-renders as tokens arrive — use Svelte's `$state` or writable store correctly
  - The `isStreaming` flag on the assistant message controls the blinking cursor — must be set/cleared at right moments

  **Acceptance Criteria**:
  - [ ] Tokens appear incrementally in the assistant message bubble as they arrive
  - [ ] Full response visible after stream ends (same as non-streaming result)
  - [ ] Navigating away during stream aborts cleanly (no console errors)
  - [ ] Network error during stream shows error message
  - [ ] `npm test -- streaming` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Streaming tokens appear incrementally
    Tool: Playwright
    Preconditions: Logged in, mock Langflow streaming with 100ms between chunks
    Steps:
      1. Navigate to conversation
      2. Send message "Tell me a story"
      3. Wait 200ms
      4. Assert assistant message bubble exists with SOME text (not empty, not full)
      5. Wait another 500ms
      6. Assert assistant message has MORE text than before
      7. Wait for stream to complete (end event)
      8. Assert assistant message is complete, isStreaming indicator gone
      9. Screenshot during streaming and after completion
    Expected Result: Text grows incrementally, then completes
    Failure Indicators: All text appears at once (not streaming), text disappears, no blinking cursor during stream
    Evidence: .sisyphus/evidence/task-21-streaming-incremental.png, task-21-streaming-complete.png

  Scenario: Stream abort on navigation
    Tool: Playwright
    Preconditions: Logged in, streaming mock with 5s total stream time
    Steps:
      1. Send message to start streaming
      2. Wait 1s (stream in progress)
      3. Click "New Conversation" in sidebar (navigate away)
      4. Assert no console errors
      5. Assert new conversation page loads cleanly
    Expected Result: Stream aborted cleanly on navigation
    Failure Indicators: Console errors about unhandled aborts, memory leaks
    Evidence: .sisyphus/evidence/task-21-stream-abort.txt
  ```

  **Commit**: YES (group: commit 8)
  - Message: `feat(streaming-en): add English SSE streaming via Langflow`
  - Files: `src/lib/services/streaming.ts, src/lib/services/streaming.test.ts`
  - Pre-commit: `npm test -- streaming`

---

- [x] 22. Streaming Markdown Renderer (Incremental Token Display)

  **What to do**:
  - Enhance `src/lib/components/chat/MarkdownRenderer.svelte` (from Task 16) to support incremental content updates during streaming:
    - **Problem**: When tokens arrive one at a time, the raw markdown is incomplete. Rendering `"## Hello w"` mid-stream might produce broken HTML. We need fault-tolerant rendering.
    - **Solution**: Buffered rendering approach:
      1. During streaming (`isStreaming: true`): accumulate tokens in the `content` prop
      2. On each content update: attempt `renderMarkdown(content, isDark)`
      3. If markdown rendering produces broken HTML (unclosed tags): render up to the last complete block + show remaining as plaintext
      4. Track open fences: if content ends mid-code-block (odd number of ` ``` `), don't try to highlight — show as `<pre>` plaintext until fence closes
    - **Implement**: `src/lib/services/streaming-markdown.ts`:
      ```typescript
      /**
       * Render markdown content that may be incomplete (mid-stream).
       * Handles: unclosed code fences, incomplete bold/italic, truncated lists.
       */
      export function renderStreamingMarkdown(
        content: string,
        isDark: boolean
      ): { html: string; isComplete: boolean } {
        // Count code fences
        const fenceCount = (content.match(/```/g) || []).length;
        const inCodeBlock = fenceCount % 2 !== 0;

        if (inCodeBlock) {
          // Close the code block temporarily for rendering
          const tempContent = content + '\n```';
          const html = renderMarkdown(tempContent, isDark);
          // Remove the closing pre/code tags so cursor appears inside
          return { html: html.replace(/<\/code><\/pre>$/, ''), isComplete: false };
        }

        return { html: renderMarkdown(content, isDark), isComplete: true };
      }
      ```
    - Update `MarkdownRenderer.svelte`:
      - New prop: `isStreaming: boolean` (default: false)
      - When `isStreaming`: use `renderStreamingMarkdown` instead of `renderMarkdown`
      - Add blinking cursor `<span class="streaming-cursor">▌</span>` at the end when streaming
      - CSS for cursor: `@keyframes blink { 0%, 50% { opacity: 1 } 51%, 100% { opacity: 0 } }`
  - Write test `src/lib/services/streaming-markdown.test.ts`:
    - Test: complete markdown renders normally
    - Test: content ending mid-code-block renders code block (temporarily closed) + not marked as complete
    - Test: content ending mid-bold (`**word`) renders gracefully (no broken HTML)
    - Test: progressive content ("He", "Hello", "Hello wor", "Hello world") → all render without error

  **Must NOT do**:
  - Do NOT re-initialize Shiki on every render — reuse the singleton highlighter from Task 16
  - Do NOT throttle/debounce rendering — Svelte handles reactive updates efficiently
  - Do NOT add a separate streaming markdown library
  - Do NOT cache previous renders (Svelte reactivity handles diffing)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Fault-tolerant markdown parsing during streaming, edge case handling for incomplete content
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 20, 23-27 in Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: Tasks 21, 29
  - **Blocked By**: Tasks 16, 17 (needs MarkdownRenderer + MessageBubble)

  **References**:

  **Pattern References**:
  - `src/lib/services/markdown.ts:renderMarkdown` (Task 16) — base rendering function to build upon
  - `src/lib/components/chat/MarkdownRenderer.svelte` (Task 16) — component to enhance
  - `src/lib/components/chat/MessageBubble.svelte` (Task 17) — passes `isStreaming` prop

  **WHY Each Reference Matters**:
  - `renderMarkdown` is the foundation — streaming renderer wraps it with incomplete-content handling
  - MarkdownRenderer must be enhanced (not replaced) — existing non-streaming usage must still work
  - MessageBubble passes `isStreaming` based on `ChatMessage.isStreaming` flag — this drives the rendering mode

  **Acceptance Criteria**:
  - [ ] Incomplete markdown (mid-code-block, mid-bold) renders without errors
  - [ ] Code blocks appear progressively as tokens arrive
  - [ ] Blinking cursor shows at end of streaming content
  - [ ] When streaming completes, final render matches non-streaming render of same content
  - [ ] `npm test -- streaming-markdown` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Code block renders progressively during streaming
    Tool: Playwright
    Preconditions: Logged in, mock streams a response containing a Python code block
    Steps:
      1. Send message that triggers code block response
      2. During streaming, observe the assistant message area
      3. Assert code block appears (even partially) before stream ends
      4. Assert blinking cursor visible at end of content
      5. After stream ends: assert code block has full syntax highlighting
      6. Assert blinking cursor is gone
      7. Screenshot during streaming code block + after completion
    Expected Result: Code block appears progressively with highlighting, cursor blinks during stream
    Failure Indicators: Broken HTML visible, code block doesn't appear until end, cursor persists after stream
    Evidence: .sisyphus/evidence/task-22-streaming-code-block.png, task-22-streaming-complete.png

  Scenario: Incomplete bold/italic doesn't break rendering
    Tool: Bash (vitest)
    Preconditions: streaming-markdown module importable
    Steps:
      1. Call renderStreamingMarkdown("This is **bold", false)
      2. Assert result.html is valid HTML (no unclosed tags visible)
      3. Assert no error thrown
      4. Call renderStreamingMarkdown("This is **bold**", false)
      5. Assert result.html contains <strong>bold</strong>
    Expected Result: Graceful degradation for incomplete markdown
    Failure Indicators: Error thrown, broken HTML tags visible as text
    Evidence: .sisyphus/evidence/task-22-incomplete-markdown.txt
  ```

  **Commit**: YES (group: commit 8)
  - Message: `feat(streaming-en): add English SSE streaming via Langflow`
  - Files: `src/lib/services/streaming-markdown.ts, src/lib/services/streaming-markdown.test.ts`
  - Pre-commit: `npm test -- streaming-markdown`

---

- [x] 23. Title Generation Service (nemotron-nano)

  **What to do**:
  - Create `src/lib/server/services/title-generator.ts`:
    ```typescript
    import { config } from '../env';

    /**
     * Generate a short conversation title using nemotron-nano.
     * This is an OpenAI-compatible chat completions call.
     * Fire-and-forget — caller doesn't wait for this.
     */
    export async function generateTitle(
      userMessage: string,
      assistantResponse: string
    ): Promise<string> {
      const truncatedResponse = assistantResponse.slice(0, 200);

      const response = await fetch(`${config.nemotron.url}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.nemotron.model,
          messages: [
            {
              role: 'user',
              content: `Summarize this conversation in 5-8 words as a title. Output only the title, nothing else.\n\nUser: ${userMessage}\nAssistant: ${truncatedResponse}`
            }
          ],
          max_tokens: 30,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`Title generation failed: ${response.status}`);
      }

      const data = await response.json();
      // OpenAI-compatible response: data.choices[0].message.content
      const title = data.choices?.[0]?.message?.content?.trim();

      if (!title) {
        throw new Error('Empty title generated');
      }

      // Clean up: remove quotes if the model wraps the title in them
      return title.replace(/^["']|["']$/g, '');
    }
    ```
  - Create API endpoint `src/routes/api/conversations/[id]/title/+server.ts`:
    - POST handler: accepts `{ userMessage: string, assistantResponse: string }`
    - Calls `generateTitle(userMessage, assistantResponse)`
    - Updates conversation title in DB via `updateConversationTitle`
    - Returns `{ title: string }`
    - On error: returns `{ title: null }` (non-fatal — title generation failure shouldn't break the app)
  - Write test `src/lib/server/services/title-generator.test.ts`:
    - Test: generates title from user message + assistant response (using nemotron mock from Task 5)
    - Test: truncates assistant response to 200 chars
    - Test: removes surrounding quotes from generated title
    - Test: handles nemotron-nano being unreachable (throws, doesn't crash)

  **Must NOT do**:
  - Do NOT call title generation through Langflow — it's a direct call to nemotron-nano
  - Do NOT block the chat flow waiting for title — it's fire-and-forget
  - Do NOT generate titles for every message — only the first response in a conversation
  - Do NOT cache titles in memory — store in DB immediately

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: OpenAI-compatible API call + error handling + quote cleanup — moderate complexity
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 20-22, 24-27 in Wave 4)
  - **Parallel Group**: Wave 4
  - **Blocks**: Task 24
  - **Blocked By**: Tasks 2, 5 (needs env config + nemotron mock)

  **References**:

  **Pattern References**:
  - `src/lib/server/env.ts:config.nemotron` (Task 2) — `{ url: string, model: string }`
  - `tests/mocks/nemotron-server.ts` (Task 5) — mock that simulates `/v1/chat/completions`
  - `src/lib/server/services/conversations.ts:updateConversationTitle` (Task 13) — updates title in DB

  **API/Type References**:
  - UI_HANDOFF.md lines 158-174: exact prompt template, nemotron-nano endpoint `http://192.168.1.96:30001/v1`, model name `nemotron-nano`, 200-char truncation
  - OpenAI chat completions format: `{ model, messages: [{ role, content }], max_tokens, temperature }`

  **WHY Each Reference Matters**:
  - The prompt must exactly match the specification: "Summarize this conversation in 5-8 words as a title..."
  - nemotron-nano is OpenAI-compatible — the response format is `{ choices: [{ message: { content } }] }`
  - Title is written to DB immediately — sidebar update happens when client refetches conversation list

  **Acceptance Criteria**:
  - [ ] `generateTitle("Hello", "Hi there! How can I help?")` returns a 5-8 word string
  - [ ] Assistant response truncated to 200 chars before sending to model
  - [ ] Surrounding quotes removed from generated title
  - [ ] Non-fatal: failure returns error without crashing the app
  - [ ] `npm test -- title` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Title generated from first exchange
    Tool: Bash (curl)
    Preconditions: Logged in, nemotron mock running on port 30001, conversation exists
    Steps:
      1. POST /api/conversations/$CONV_ID/title with:
         { "userMessage": "How do I sort a list in Python?", "assistantResponse": "You can use the sorted() function or the list.sort() method..." }
      2. Assert 200 response
      3. Assert response body has `title` field with non-empty string
      4. GET /api/conversations/$CONV_ID
      5. Assert conversation title matches the generated title
    Expected Result: Title generated and stored
    Failure Indicators: Empty title, title not updated in DB, nemotron mock not reached
    Evidence: .sisyphus/evidence/task-23-title-generation.txt

  Scenario: Title generation failure is non-fatal
    Tool: Bash (vitest)
    Preconditions: nemotron mock stopped/unreachable
    Steps:
      1. Call generateTitle("test", "test response") with nemotron down
      2. Assert throws an error (doesn't crash process)
      3. Assert the calling code (API route) catches it and returns { title: null }
    Expected Result: Graceful failure
    Failure Indicators: Unhandled exception, process crash
    Evidence: .sisyphus/evidence/task-23-title-failure.txt
  ```

  **Commit**: YES (group: commit 9)
  - Message: `feat(titles): add auto-generated conversation titles via nemotron-nano`
  - Files: `src/lib/server/services/title-generator.ts, src/routes/api/conversations/[id]/title/+server.ts, src/lib/server/services/title-generator.test.ts`
  - Pre-commit: `npm test -- title`

---

- [x] 24. Title Generation Integration (Fire-and-Forget After First Response)

  **What to do**:
  - Modify `src/routes/(app)/chat/[conversationId]/+page.svelte` (from Task 18/21):
    - After the FIRST assistant response in a NEW conversation (title is still "New conversation"):
      1. Fire-and-forget: `fetch('/api/conversations/${conversationId}/title', { method: 'POST', body: { userMessage, assistantResponse } })`
      2. Do NOT await this — it runs in the background
      3. When response comes back, update the sidebar conversation title reactively
    - Track whether title generation has already been triggered for this conversation (local flag)
    - Do NOT trigger title generation for subsequent messages
  - Update `src/lib/stores/conversations.ts` (from Task 14):
    - Add function: `updateConversationTitleLocal(id: string, title: string): void` — updates the title in the local store (for immediate sidebar update without refetching)
  - Wire the flow:
    1. User sends first message → receives response (streaming or non-streaming)
    2. After response complete → check if conversation title is "New conversation"
    3. If yes → POST to title API (fire-and-forget)
    4. When title API responds → call `updateConversationTitleLocal(id, newTitle)` → sidebar updates
  - Handle edge cases:
    - Title generation fails silently — title stays as "New conversation"
    - User switches away from conversation before title arrives — store update still works
    - Multiple rapid messages before first response — only trigger title once

  **Must NOT do**:
  - Do NOT block the chat flow waiting for title
  - Do NOT trigger title generation for every message
  - Do NOT trigger title generation if conversation already has a non-default title
  - Do NOT generate titles client-side (it's a server-side API call)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Integration glue — wiring existing components together, small code changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — integrates multiple prior tasks
  - **Parallel Group**: Wave 4 (after Tasks 13, 14, 23)
  - **Blocks**: None
  - **Blocked By**: Tasks 13, 14, 23 (needs conversation CRUD, sidebar, title service)

  **References**:

  **Pattern References**:
  - `src/routes/(app)/chat/[conversationId]/+page.svelte` (Task 18/21) — chat page to modify
  - `src/routes/api/conversations/[id]/title/+server.ts` (Task 23) — title API endpoint
  - `src/lib/stores/conversations.ts` (Task 14) — conversation store with list and update functions

  **WHY Each Reference Matters**:
  - Chat page is the integration point — it knows when first response arrives
  - Title API does the actual generation — chat page just fires the request
  - Conversation store provides reactive sidebar update — calling `updateConversationTitleLocal` triggers Svelte reactivity

  **Acceptance Criteria**:
  - [ ] After first response in a new conversation: title changes from "New conversation" to generated title
  - [ ] Title appears in sidebar without page refresh
  - [ ] Title generation doesn't block the chat flow (non-blocking)
  - [ ] Second message doesn't trigger another title generation
  - [ ] Title generation failure: title stays as "New conversation" (no error shown)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Title auto-generates after first response
    Tool: Playwright
    Preconditions: Logged in, nemotron mock running, new conversation created
    Steps:
      1. Navigate to new conversation
      2. Assert sidebar shows "New conversation" for this item
      3. Send a message and wait for response
      4. Wait up to 5s for sidebar title to update
      5. Assert sidebar title is no longer "New conversation"
      6. Assert sidebar title is a short phrase (5-8 words)
      7. Screenshot showing updated title
    Expected Result: Title auto-generated and updated in sidebar
    Failure Indicators: Title stays "New conversation", multiple title requests, error messages
    Evidence: .sisyphus/evidence/task-24-auto-title.png

  Scenario: Second message doesn't re-trigger title generation
    Tool: Playwright
    Preconditions: Logged in, first message already sent, title already generated
    Steps:
      1. Note current title in sidebar
      2. Send a second message
      3. Wait for response
      4. Assert title in sidebar unchanged
    Expected Result: Title stable after initial generation
    Failure Indicators: Title changes after second message
    Evidence: .sisyphus/evidence/task-24-title-stable.txt
  ```

  **Commit**: YES (group: commit 9)
  - Message: `feat(titles): add auto-generated conversation titles via nemotron-nano`
  - Files: `src/routes/(app)/chat/[conversationId]/+page.svelte (modified), src/lib/stores/conversations.ts (modified)`
  - Pre-commit: `npm run build`

---

- [x] 25. Hungarian Non-Streaming Path (Full Response Wait)

  **What to do**:
  - Modify `src/routes/(app)/chat/[conversationId]/+page.svelte` (from Task 18/21) to handle Hungarian responses:
    - **Key insight**: The UI does NOT detect language. Langflow handles translation internally. The UI simply receives text (in Hungarian or English) based on what the user typed.
    - **Non-streaming path**: For now (before webhook streaming is implemented), ALL requests use the non-streaming flow from Task 18. This already works for both languages.
    - **This task focuses on**: Ensuring the UI gracefully handles the longer wait times (40-90s) typical of Hungarian responses (due to translation overhead).
  - Enhance loading state handling:
    - The `LoadingIndicator` (Task 19) already handles long waits. Verify it works correctly for 90+ second responses.
    - Add a "still working..." message that appears after 30s of waiting (reassures user the request is processing)
    - After 60s, update to "almost there..." or similar progressive indicator
  - Modify `src/lib/components/chat/LoadingIndicator.svelte`:
    ```svelte
    <script lang="ts">
      import { onMount } from 'svelte';
      
      let elapsed = 0;
      let interval: ReturnType<typeof setInterval>;
      
      onMount(() => {
        interval = setInterval(() => { elapsed += 1; }, 1000);
        return () => clearInterval(interval);
      });
      
      $: message = elapsed < 30 
        ? 'Thinking...'
        : elapsed < 60 
          ? 'Still working...'
          : 'Almost there...';
    </script>
    
    <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
      <span class="animate-pulse">●</span>
      <span>{message}</span>
    </div>
    ```
  - Write test to verify progressive loading messages appear at correct intervals

  **Must NOT do**:
  - Do NOT add language detection in the UI — Langflow handles this
  - Do NOT add separate code paths for Hungarian vs English — the existing flow works for both
  - Do NOT add streaming for Hungarian in this task — Task 28-30 handles webhook streaming
  - Do NOT add timeout shorter than 120s — Hungarian responses can take 90s legitimately

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Minor enhancement to existing loading indicator — progressive messages based on elapsed time
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 26, 27 in Wave 4)
  - **Parallel Group**: Wave 4 (continuation)
  - **Blocks**: Task 28
  - **Blocked By**: Tasks 18, 19 (needs non-streaming flow + loading indicator)

  **References**:

  **Pattern References**:
  - `src/lib/components/chat/LoadingIndicator.svelte` (Task 19) — component to enhance with progressive messages
  - `src/routes/(app)/chat/[conversationId]/+page.svelte` (Task 18) — chat page that shows loading indicator during request

  **External References**:
  - UI_HANDOFF.md lines 190-194: "The pipeline takes 40–90 seconds for Hungarian responses. The UI must communicate that the system is working."

  **WHY Each Reference Matters**:
  - LoadingIndicator is the single point of change — add elapsed time tracking and progressive messages
  - The 40-90 second wait is specifically for Hungarian (translation overhead) — progressive messages reassure users during this wait

  **Acceptance Criteria**:
  - [ ] Loading indicator shows "Thinking..." for first 30 seconds
  - [ ] After 30s, message changes to "Still working..."
  - [ ] After 60s, message changes to "Almost there..."
  - [ ] 90+ second requests complete successfully without UI timeout
  - [ ] `npm test -- LoadingIndicator` → tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Progressive loading messages during long request
    Tool: Playwright
    Preconditions: Logged in, mock Langflow configured with 45-second delay
    Steps:
      1. Send a message
      2. At 5s: Assert loading indicator shows "Thinking..."
      3. At 35s: Assert loading indicator shows "Still working..."
      4. At 65s: Assert loading indicator shows "Almost there..."
      5. At 45s (when mock responds): Assert response appears and loading indicator disappears
      6. Screenshot at each stage
    Expected Result: Progressive reassurance messages during wait
    Failure Indicators: Static message, timeout before response arrives
    Evidence: .sisyphus/evidence/task-25-progressive-loading-5s.png, task-25-progressive-loading-35s.png, task-25-progressive-loading-complete.png

  Scenario: 90-second request completes successfully
    Tool: Bash (curl with timeout)
    Preconditions: Mock Langflow with 85-second delay
    Steps:
      1. Send POST to /api/chat/send with 120s timeout
      2. Wait for response (should take ~85s)
      3. Assert 200 response with valid message content
    Expected Result: Request completes after 85s without timeout
    Failure Indicators: Client timeout, 504 gateway timeout, empty response
    Evidence: .sisyphus/evidence/task-25-long-request.txt
  ```

  **Commit**: YES (group: commit 10)
  - Message: `feat(streaming-hu): add Hungarian webhook streaming path`
  - Files: `src/lib/components/chat/LoadingIndicator.svelte`
  - Pre-commit: `npm test -- LoadingIndicator`

---

- [x] 26. File Upload Placeholder Button

  **What to do**:
  - Modify `src/lib/components/chat/MessageInput.svelte` (from Task 15) to add a file upload button:
    - Add a paperclip icon button to the left of the text input (or right, near send button)
    - Button is **visually present but disabled** — grayed out appearance
    - On hover: show tooltip "File attachments coming soon"
    - On click: show a brief toast/notification "File attachments are not yet available"
  - Implementation:
    ```svelte
    <button
      type="button"
      disabled
      class="p-2 text-gray-400 cursor-not-allowed opacity-50"
      title="File attachments coming soon"
      on:click|preventDefault={() => showToast('File attachments are not yet available')}
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
          d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
      </svg>
    </button>
    ```
  - Create simple toast utility if not already present: `src/lib/stores/toast.ts`
    - Writable store: `{ message: string, visible: boolean }`
    - `showToast(message: string, duration = 3000)` function
    - Auto-dismiss after duration
  - Add toast display component to app layout (shows at bottom of screen)
  - Write test for placeholder button existence and disabled state

  **Must NOT do**:
  - Do NOT implement actual file upload logic — placeholder only
  - Do NOT add file input element or file handling code
  - Do NOT add drag-and-drop functionality
  - Do NOT add file type restrictions or validation (nothing to validate yet)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple UI addition — disabled button with tooltip, basic toast
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 25, 27 in Wave 4)
  - **Parallel Group**: Wave 4 (continuation)
  - **Blocks**: None
  - **Blocked By**: Task 15 (needs MessageInput component)

  **References**:

  **Pattern References**:
  - `src/lib/components/chat/MessageInput.svelte` (Task 15) — component to add button to
  - Heroicons paperclip: `https://heroicons.com/` — use the "paperclip" or "paper-clip" icon

  **External References**:
  - UI_HANDOFF.md lines 230-236: "A file attachment button in the message input area (grayed out / 'coming soon' is fine)"

  **WHY Each Reference Matters**:
  - MessageInput is where the button lives — positioned alongside the text input and send button
  - The spec explicitly says "grayed out / coming soon is fine" — minimal implementation required

  **Acceptance Criteria**:
  - [ ] Paperclip icon button visible in message input area
  - [ ] Button has disabled appearance (grayed out, reduced opacity)
  - [ ] Hover shows "File attachments coming soon" tooltip
  - [ ] Click shows toast notification (doesn't trigger file picker)
  - [ ] Toast auto-dismisses after 3 seconds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: File upload button is visible but disabled
    Tool: Playwright
    Preconditions: Logged in, on chat page
    Steps:
      1. Navigate to any conversation
      2. Assert paperclip button exists in message input area (selector: button[title*="coming soon"] or similar)
      3. Assert button has disabled attribute or disabled styling (opacity-50, cursor-not-allowed)
      4. Hover over button
      5. Assert tooltip appears with "coming soon" text
      6. Screenshot showing disabled button with tooltip
    Expected Result: Grayed-out paperclip with tooltip
    Failure Indicators: Button not visible, button appears enabled, no tooltip
    Evidence: .sisyphus/evidence/task-26-file-button-disabled.png

  Scenario: Clicking disabled button shows toast
    Tool: Playwright
    Preconditions: Logged in, on chat page
    Steps:
      1. Click the paperclip button
      2. Assert toast appears at bottom of screen
      3. Assert toast contains "not yet available" text
      4. Wait 4 seconds
      5. Assert toast has disappeared
    Expected Result: Toast appears and auto-dismisses
    Failure Indicators: File picker opens, no toast, toast doesn't dismiss
    Evidence: .sisyphus/evidence/task-26-file-toast.png
  ```

  **Commit**: YES (group: commit 11)
  - Message: `feat(ux): add error handling, retry, loading indicators, responsive layout`
  - Files: `src/lib/components/chat/MessageInput.svelte, src/lib/stores/toast.ts, src/lib/components/layout/Toast.svelte`
  - Pre-commit: `npm run build`

---

- [x] 27. Responsive Layout (Sidebar Collapse, Tablet Support)

  **What to do**:
  - Modify `src/routes/(app)/+layout.svelte` (from Task 10) for responsive behavior:
    - **Desktop (≥1024px)**: Sidebar always visible, fixed width (256px)
    - **Tablet (768px-1023px)**: Sidebar collapsible, hamburger menu in header
    - **Mobile (<768px)**: Sidebar as overlay/drawer, hamburger menu to toggle
  - Implement sidebar toggle:
    - Add hamburger button to `Header.svelte` (only visible on tablet/mobile)
    - Toggle `sidebarOpen` store value on click
    - Sidebar animates in/out (slide from left)
  - Modify `src/lib/components/layout/Sidebar.svelte`:
    - Accept `isOpen` prop (or read from store)
    - On mobile/tablet: render as fixed overlay with backdrop
    - Clicking backdrop closes sidebar
    - Add close button (X) inside sidebar header on mobile
  - Modify `src/lib/stores/ui.ts`:
    - `sidebarOpen` writable store (default: true on desktop, false on mobile)
    - Initialize based on viewport width on mount
  - Update conversation area to use full width when sidebar is hidden
  - Ensure code blocks have `overflow-x: auto` for horizontal scrolling (not text wrap)
  - Write responsive layout test using Playwright viewport resizing

  **Must NOT do**:
  - Do NOT add mobile-specific features beyond layout — this is desktop-first
  - Do NOT add swipe gestures — keep it simple with click/tap
  - Do NOT change desktop layout — sidebar stays fixed at ≥1024px
  - Do NOT add bottom navigation or mobile app patterns

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: CSS responsive breakpoints, slide animations, overlay behavior — UI/UX focused
  - **Skills**: [`playwright`]
    - `playwright`: For testing responsive layout at different viewport sizes

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 25, 26 in Wave 4)
  - **Parallel Group**: Wave 4 (continuation)
  - **Blocks**: None
  - **Blocked By**: Tasks 10, 11 (needs app shell + theme infrastructure)

  **References**:

  **Pattern References**:
  - `src/routes/(app)/+layout.svelte` (Task 10) — main layout to make responsive
  - `src/lib/components/layout/Sidebar.svelte` (Task 10) — sidebar to make collapsible
  - `src/lib/components/layout/Header.svelte` (Task 10) — add hamburger button here
  - `src/lib/stores/ui.ts` (Task 10) — `sidebarOpen` store

  **Design Spec References**:
  - `DESIGN_SPEC.md:143-176` — Desktop layout (>1024px): sidebar fixed 260px, conversation area fills remaining width, messages centered max 720px
  - `DESIGN_SPEC.md:179-188` — Tablet layout (768px-1024px): sidebar collapsible overlay, hidden by default, hamburger toggle, slides in from left with backdrop
  - `DESIGN_SPEC.md:192-252` — Mobile layout (<768px): CRITICAL REFERENCE — full mobile specification including header 48px height, full-screen sidebar overlay, messages full width minus 16px padding, user messages max 85% width, code blocks horizontal scroll, input pinned to viewport bottom (not content), 44×44px touch targets, keyboard handling, safe area inset
  - `DESIGN_SPEC.md:359-371` — Animations: sidebar slide 250ms, backdrop fade, ease-out enter / ease-in exit

  **External References**:
  - UI_HANDOFF.md line 259: "Desktop-first (this is a work/productivity tool), but usable on tablet"
  - Tailwind responsive prefixes: `md:`, `lg:`, `xl:` — use `lg:` for 1024px breakpoint

  **WHY Each Reference Matters**:
  - The layout component controls the grid structure — needs responsive classes
  - Sidebar needs two modes: fixed (desktop) vs overlay (mobile/tablet)
  - The `sidebarOpen` store provides reactive state for toggle behavior
  - DESIGN_SPEC.md provides exact breakpoints, dimensions, and mobile-specific rules that MUST be followed

  **Acceptance Criteria**:
  - [ ] Desktop (1024px+): Sidebar always visible, no hamburger menu
  - [ ] Tablet (768-1023px): Sidebar hidden by default, hamburger menu visible, clicking opens sidebar overlay
  - [ ] Mobile (<768px): Same as tablet — sidebar as overlay
  - [ ] Clicking backdrop closes sidebar on mobile/tablet
  - [ ] Code blocks scroll horizontally, don't wrap
  - [ ] `npm run build` succeeds

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Desktop layout — sidebar always visible
    Tool: Playwright
    Preconditions: Logged in
    Steps:
      1. Set viewport to 1280x800 (desktop)
      2. Navigate to chat
      3. Assert sidebar is visible (not hidden/collapsed)
      4. Assert no hamburger menu button visible in header
      5. Assert conversation area uses remaining width
      6. Screenshot
    Expected Result: Fixed sidebar layout on desktop
    Failure Indicators: Sidebar hidden, hamburger visible on desktop
    Evidence: .sisyphus/evidence/task-27-desktop-layout.png

  Scenario: Tablet layout — sidebar toggle works
    Tool: Playwright
    Preconditions: Logged in
    Steps:
      1. Set viewport to 900x700 (tablet)
      2. Navigate to chat
      3. Assert sidebar is NOT visible (hidden by default)
      4. Assert hamburger menu button IS visible in header
      5. Click hamburger button
      6. Assert sidebar slides in as overlay
      7. Assert backdrop appears behind sidebar
      8. Click backdrop
      9. Assert sidebar slides out, backdrop disappears
      10. Screenshot showing sidebar open state
    Expected Result: Collapsible sidebar on tablet
    Failure Indicators: Sidebar always visible, no hamburger, backdrop doesn't close sidebar
    Evidence: .sisyphus/evidence/task-27-tablet-sidebar-open.png, task-27-tablet-sidebar-closed.png

  Scenario: Code blocks scroll horizontally
    Tool: Playwright
    Preconditions: Logged in, conversation with long code block
    Steps:
      1. Set viewport to 400x700 (narrow mobile)
      2. Navigate to conversation with code block containing 200+ character line
      3. Assert code block has horizontal scrollbar
      4. Assert code text does NOT wrap to multiple lines
      5. Scroll code block horizontally
      6. Assert more code becomes visible
    Expected Result: Horizontal scroll on code blocks
    Failure Indicators: Code wraps, no scrollbar, content cut off
    Evidence: .sisyphus/evidence/task-27-code-scroll.png
  ```

  **Commit**: YES (group: commit 11)
  - Message: `feat(ux): add error handling, retry, loading indicators, responsive layout`
  - Files: `src/routes/(app)/+layout.svelte, src/lib/components/layout/Sidebar.svelte, src/lib/components/layout/Header.svelte, src/lib/stores/ui.ts`
  - Pre-commit: `npm run build`

---

- [x] 28. Hungarian Webhook Receiver Endpoint

  **What to do**:
  - Create `src/routes/api/webhook/sentence/+server.ts`:
    - POST endpoint that receives translated sentences from Langflow's Response Translator
    - Request body matches `WebhookSentencePayload` type (from Task 4):
      ```typescript
      interface WebhookSentencePayload {
        session_id: string;      // Langflow session ID (maps to conversation)
        sentence: string;        // Translated sentence text
        index: number;           // Sentence position (0-indexed)
        is_final: boolean;       // True for last sentence
      }
      ```
    - Validate payload structure (all fields required)
    - Store sentence in in-memory map (Task 29 will consume this)
    - Return 200 OK immediately (don't block the Response Translator)
  - Create `src/lib/server/services/webhook-buffer.ts`:
    - In-memory storage for incoming sentences:
      ```typescript
      // Map<session_id, { sentences: string[], isComplete: boolean, lastUpdated: number }>
      const webhookBuffer = new Map<string, WebhookSession>();
      
      export function addSentence(sessionId: string, sentence: string, index: number, isFinal: boolean): void;
      export function getSentences(sessionId: string): { sentences: string[], isComplete: boolean } | null;
      export function clearSession(sessionId: string): void;
      ```
    - Auto-cleanup: remove sessions older than 10 minutes (prevent memory leaks)
    - Handle out-of-order sentences: store by index, reconstruct in order
  - Security: This endpoint is called by the Langflow sidecar, not the browser
    - For v1: Accept requests from localhost only (`request.headers.get('x-forwarded-for')` check)
    - Optional: Add a shared secret header for verification
  - Write test `src/routes/api/webhook/sentence/webhook.test.ts`:
    - Test: valid payload stores sentence
    - Test: multiple sentences accumulate
    - Test: is_final=true marks session complete
    - Test: invalid payload returns 400
    - Test: old sessions get cleaned up

  **Must NOT do**:
  - Do NOT send responses to browser here — this just receives and buffers (Task 29 handles SSE to browser)
  - Do NOT persist sentences to database — memory-only buffer
  - Do NOT validate session_id against database — trust Langflow's session management
  - Do NOT add authentication (Langflow sidecar is internal, not user-facing)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Webhook endpoint with in-memory buffering, cleanup logic, concurrent access handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 26, 27 at end of Wave 4)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 29
  - **Blocked By**: Tasks 4, 25 (needs types + non-streaming Hungarian working first)

  **References**:

  **Pattern References**:
  - `src/lib/types.ts:WebhookSentencePayload` (Task 4) — payload interface
  - `src/routes/api/chat/send/+server.ts` (Task 18) — API route pattern for POST handlers

  **External References**:
  - UI_HANDOFF.md lines 115-120: "After translating each sentence, it POSTs the sentence to the webhook"
  - UI_HANDOFF.md line 295: "Webhook listen port: 8090" — though SvelteKit will handle this on its own port, the sidecar POSTs to this endpoint

  **WHY Each Reference Matters**:
  - The payload structure must match what Langflow's Response Translator sends — defined in types.ts
  - The endpoint pattern follows SvelteKit conventions — +server.ts in api route
  - Sentences arrive sentence-by-sentence as translation completes — need to buffer and order them

  **Acceptance Criteria**:
  - [ ] POST `/api/webhook/sentence` accepts WebhookSentencePayload
  - [ ] Sentences stored in memory buffer keyed by session_id
  - [ ] Multiple sentences for same session_id accumulate correctly
  - [ ] is_final=true marks session as complete
  - [ ] Invalid payload returns 400
  - [ ] Sessions older than 10 minutes auto-cleaned
  - [ ] `npm test -- webhook` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Webhook receives and buffers sentences
    Tool: Bash (curl)
    Preconditions: Dev server running
    Steps:
      1. POST /api/webhook/sentence with:
         { "session_id": "test-123", "sentence": "First sentence.", "index": 0, "is_final": false }
      2. Assert 200 response
      3. POST with: { "session_id": "test-123", "sentence": "Second sentence.", "index": 1, "is_final": true }
      4. Assert 200 response
      5. (Internal verification via test): Assert buffer contains both sentences in order
    Expected Result: Sentences buffered successfully
    Failure Indicators: Non-200 response, sentences not stored, wrong order
    Evidence: .sisyphus/evidence/task-28-webhook-receive.txt

  Scenario: Invalid payload rejected
    Tool: Bash (curl)
    Preconditions: Dev server running
    Steps:
      1. POST /api/webhook/sentence with: { "session_id": "test", "sentence": "Hello" }
         (missing index and is_final)
      2. Assert 400 response
      3. POST with: {} (empty body)
      4. Assert 400 response
    Expected Result: 400 Bad Request for invalid payloads
    Failure Indicators: 200 response for invalid data, 500 error
    Evidence: .sisyphus/evidence/task-28-webhook-invalid.txt

  Scenario: Out-of-order sentences handled
    Tool: Bash (vitest)
    Preconditions: webhook-buffer module importable
    Steps:
      1. addSentence("sess1", "Third.", 2, false)
      2. addSentence("sess1", "First.", 0, false)
      3. addSentence("sess1", "Second.", 1, true)
      4. getSentences("sess1")
      5. Assert sentences array is ["First.", "Second.", "Third."]
    Expected Result: Sentences reconstructed in index order
    Failure Indicators: Wrong order, missing sentences
    Evidence: .sisyphus/evidence/task-28-webhook-order.txt
  ```

  **Commit**: YES (group: commit 10)
  - Message: `feat(streaming-hu): add Hungarian webhook streaming path`
  - Files: `src/routes/api/webhook/sentence/+server.ts, src/lib/server/services/webhook-buffer.ts, src/routes/api/webhook/sentence/webhook.test.ts`
  - Pre-commit: `npm test -- webhook`

---

- [x] 29. Hungarian Webhook → Browser SSE Bridge

  **What to do**:
  - Create `src/routes/api/stream/webhook/[sessionId]/+server.ts`:
    - GET endpoint that the browser connects to for receiving webhook sentences via SSE
    - Browser opens EventSource to this endpoint with the Langflow session_id
    - Server reads from webhook buffer (Task 28) and streams sentences to browser as SSE events
    - Uses polling internally: check buffer every 100ms for new sentences
    - Event format: `event: sentence\ndata: {"text": "...", "index": N}\n\n`
    - When buffer marks session complete (is_final=true received): emit `event: end\ndata: {}\n\n` and close
    - Timeout after 2 minutes if no new sentences (prevents stuck connections)
  - Implementation pattern:
    ```typescript
    export const GET: RequestHandler = async ({ params, locals }) => {
      const { sessionId } = params;
      
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          let lastIndex = -1;
          let timeout = 0;
          
          const interval = setInterval(() => {
            const data = getSentences(sessionId);
            if (!data) {
              timeout += 100;
              if (timeout > 120000) { // 2 min timeout
                controller.enqueue(encoder.encode('event: error\ndata: {"message":"timeout"}\n\n'));
                controller.close();
                clearInterval(interval);
              }
              return;
            }
            
            // Stream new sentences
            for (let i = lastIndex + 1; i < data.sentences.length; i++) {
              controller.enqueue(encoder.encode(
                `event: sentence\ndata: ${JSON.stringify({ text: data.sentences[i], index: i })}\n\n`
              ));
              lastIndex = i;
            }
            
            if (data.isComplete) {
              controller.enqueue(encoder.encode('event: end\ndata: {}\n\n'));
              controller.close();
              clearInterval(interval);
              clearSession(sessionId); // cleanup
            }
          }, 100);
        }
      });
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    };
    ```
  - Write test `src/routes/api/stream/webhook/webhook-sse.test.ts`:
    - Test: SSE stream emits sentence events as buffer fills
    - Test: stream ends with 'end' event when is_final received
    - Test: timeout after 2 minutes of inactivity

  **Must NOT do**:
  - Do NOT use WebSocket — SSE only (matches English streaming path)
  - Do NOT persist stream state to database
  - Do NOT authenticate this endpoint separately — session validation happens in hooks (user must be logged in)
  - Do NOT block waiting for all sentences — stream as they arrive

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: SSE streaming with polling, ReadableStream construction, timeout handling, buffer coordination
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 28 (webhook buffer)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 30
  - **Blocked By**: Tasks 22, 28 (needs streaming markdown + webhook buffer)

  **References**:

  **Pattern References**:
  - `src/lib/server/services/webhook-buffer.ts` (Task 28) — `getSentences(sessionId)` returns buffered sentences
  - `src/routes/api/chat/stream/+server.ts` (Task 20) — SSE response construction pattern (same ReadableStream approach)

  **External References**:
  - UI_HANDOFF.md lines 213-218: "As each sentence arrives, it's appended to the message area... text appearing sentence-by-sentence with a typing cursor"

  **WHY Each Reference Matters**:
  - The webhook buffer is the data source — this endpoint polls it and streams to browser
  - The SSE response format must match Task 20's pattern so client code can handle both uniformly
  - Sentences arrive at sentence-level granularity (not token-level like English) — different but compatible display

  **Acceptance Criteria**:
  - [ ] GET `/api/stream/webhook/{sessionId}` returns `Content-Type: text/event-stream`
  - [ ] Sentences from webhook buffer appear as `event: sentence` SSE events
  - [ ] Stream ends with `event: end` when buffer marks complete
  - [ ] 2-minute timeout if no data arrives
  - [ ] `npm test -- webhook-sse` → tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Browser receives sentences via SSE bridge
    Tool: Bash (curl + mock webhook)
    Preconditions: Dev server running, logged in (have session cookie)
    Steps:
      1. Start curl SSE listener: `curl -N http://localhost:5173/api/stream/webhook/test-sess -H "Cookie: session=$COOKIE" &`
      2. POST to webhook endpoint: { session_id: "test-sess", sentence: "Hello.", index: 0, is_final: false }
      3. Assert curl output contains `event: sentence` with "Hello."
      4. POST: { session_id: "test-sess", sentence: "World.", index: 1, is_final: true }
      5. Assert curl output contains `event: sentence` with "World."
      6. Assert curl output contains `event: end`
      7. Assert curl connection closed
    Expected Result: SSE bridge streams sentences and closes on completion
    Failure Indicators: No SSE events, connection hangs, sentences out of order
    Evidence: .sisyphus/evidence/task-29-sse-bridge.txt

  Scenario: Timeout after 2 minutes of inactivity
    Tool: Bash (vitest with fast timer mocks)
    Preconditions: webhook-sse module testable with mocked timers
    Steps:
      1. Open SSE stream to non-existent session
      2. Advance timer by 2 minutes (mock)
      3. Assert stream emits `event: error` with timeout message
      4. Assert stream closes
    Expected Result: Graceful timeout
    Failure Indicators: Stream hangs indefinitely, no error event
    Evidence: .sisyphus/evidence/task-29-sse-timeout.txt
  ```

  **Commit**: YES (group: commit 10)
  - Message: `feat(streaming-hu): add Hungarian webhook streaming path`
  - Files: `src/routes/api/stream/webhook/[sessionId]/+server.ts, src/routes/api/stream/webhook/webhook-sse.test.ts`
  - Pre-commit: `npm test -- webhook-sse`

---

- [x] 30. Unified Streaming Abstraction (SSE + Webhook → Same Display)

  **What to do**:
  - Create `src/lib/services/unified-streaming.ts`:
    - A single API that abstracts both streaming paths (English SSE via Langflow, Hungarian webhook SSE)
    - The chat page calls this, not the individual streaming services
    - **Key insight**: Both paths now use SSE to the browser (English: proxy from Langflow, Hungarian: bridge from webhook buffer). The difference is the endpoint and event format.
    ```typescript
    export type StreamSource = 'langflow' | 'webhook';
    
    export interface UnifiedStreamCallbacks {
      onChunk: (text: string) => void;    // Called for each text chunk/sentence
      onEnd: (fullText: string) => void;  // Called when complete
      onError: (error: string) => void;   // Called on error
    }
    
    /**
     * Start a unified stream. The source is determined by... 
     * For now, always use 'langflow' (SSE). Webhook path can be enabled later
     * when the Langflow Response Translator webhook is implemented.
     */
    export function startStream(
      source: StreamSource,
      params: { message: string; conversationId: string; sessionId: string },
      callbacks: UnifiedStreamCallbacks
    ): { abort: () => void } {
      if (source === 'langflow') {
        // Use English SSE path (Task 21)
        return streamChat(params.message, params.conversationId, {
          onToken: callbacks.onChunk,
          onEnd: callbacks.onEnd,
          onError: callbacks.onError
        });
      } else {
        // Use Hungarian webhook SSE bridge (Task 29)
        return streamWebhook(params.sessionId, {
          onSentence: callbacks.onChunk,
          onEnd: callbacks.onEnd,
          onError: callbacks.onError
        });
      }
    }
    ```
  - Create `src/lib/services/webhook-streaming.ts`:
    - Client-side consumer for the webhook SSE bridge (Task 29)
    ```typescript
    export function streamWebhook(
      sessionId: string,
      callbacks: { onSentence: (text: string) => void; onEnd: (fullText: string) => void; onError: (error: string) => void }
    ): { abort: () => void } {
      const eventSource = new EventSource(`/api/stream/webhook/${sessionId}`);
      let fullText = '';
      
      eventSource.addEventListener('sentence', (e) => {
        const data = JSON.parse(e.data);
        fullText += data.text + ' ';
        callbacks.onSentence(data.text);
      });
      
      eventSource.addEventListener('end', () => {
        callbacks.onEnd(fullText.trim());
        eventSource.close();
      });
      
      eventSource.addEventListener('error', () => {
        callbacks.onError('Webhook stream failed');
        eventSource.close();
      });
      
      return { abort: () => eventSource.close() };
    }
    ```
  - Update `src/routes/(app)/chat/[conversationId]/+page.svelte`:
    - Import and use `startStream` from unified-streaming instead of calling `streamChat` directly
    - For v1: Always use 'langflow' source (webhook path ready but not triggered)
    - The display logic (streaming markdown, progressive rendering) already works — unified abstraction just picks the source
  - Write test for unified streaming abstraction

  **Must NOT do**:
  - Do NOT add language detection — the source selection will be configurable later, not auto-detected
  - Do NOT change the display components — they already handle streaming text
  - Do NOT add feature flags in the UI — source selection is backend concern
  - Do NOT block on waiting for both paths — it's one or the other

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Abstraction layer coordinating two streaming implementations, EventSource handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — integrates Tasks 20, 21, 29
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 31
  - **Blocked By**: Tasks 20, 21, 29 (needs both streaming paths working)

  **References**:

  **Pattern References**:
  - `src/lib/services/streaming.ts:streamChat` (Task 21) — English SSE consumer to wrap
  - `src/routes/api/stream/webhook/[sessionId]/+server.ts` (Task 29) — webhook SSE endpoint to consume
  - `src/routes/(app)/chat/[conversationId]/+page.svelte` (Task 21) — chat page to update

  **External References**:
  - UI_HANDOFF.md line 227: "The UI should abstract the streaming transport so both paths (webhook for Hungarian, SSE for English) feed into the same display logic."

  **WHY Each Reference Matters**:
  - `streamChat` is the English implementation — unified abstraction delegates to it for 'langflow' source
  - The webhook SSE bridge is the Hungarian implementation — unified abstraction delegates to it for 'webhook' source
  - The chat page becomes simpler — just calls `startStream` without knowing which path is used

  **Acceptance Criteria**:
  - [ ] `startStream('langflow', ...)` uses English SSE path
  - [ ] `startStream('webhook', ...)` uses Hungarian webhook SSE bridge
  - [ ] Both paths call the same callbacks (onChunk, onEnd, onError)
  - [ ] Chat page updated to use unified abstraction
  - [ ] Display behavior unchanged (tokens/sentences appear progressively)
  - [ ] `npm test -- unified` → tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Unified streaming with Langflow source
    Tool: Playwright
    Preconditions: Logged in, mock Langflow with streaming enabled
    Steps:
      1. Send message in chat
      2. Assert streaming behavior (tokens appear incrementally)
      3. Assert response completes normally
      4. Verify unified abstraction was used (console log or network inspection)
    Expected Result: English SSE streaming works through unified abstraction
    Failure Indicators: No streaming, direct streamChat call bypassing abstraction
    Evidence: .sisyphus/evidence/task-30-unified-langflow.png

  Scenario: Unified streaming with webhook source (mock)
    Tool: Bash (vitest)
    Preconditions: unified-streaming module importable, mock EventSource
    Steps:
      1. Call startStream('webhook', { sessionId: 'test' }, callbacks)
      2. Simulate SSE events: sentence, sentence, end
      3. Assert onChunk called twice
      4. Assert onEnd called with concatenated text
    Expected Result: Webhook streaming works through unified abstraction
    Failure Indicators: Wrong callbacks, incorrect text accumulation
    Evidence: .sisyphus/evidence/task-30-unified-webhook.txt
  ```

  **Commit**: YES (group: commit 10)
  - Message: `feat(streaming-hu): add Hungarian webhook streaming path`
  - Files: `src/lib/services/unified-streaming.ts, src/lib/services/webhook-streaming.ts, src/routes/(app)/chat/[conversationId]/+page.svelte (modified)`
  - Pre-commit: `npm test -- unified`

---

- [x] 31. Error Handling (Timeouts, Retries, Network Errors)

  **What to do**:
  - Create `src/lib/components/chat/ErrorMessage.svelte`:
    - Displays error messages in the chat area (styled differently from assistant messages)
    - Shows error icon + message text
    - Includes "Retry" button that re-sends the last user message
    ```svelte
    <script lang="ts">
      export let message: string;
      export let onRetry: (() => void) | null = null;
    </script>
    
    <div class="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
      <svg class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"><!-- error icon --></svg>
      <div class="flex-1">
        <p class="text-red-700 dark:text-red-300">{message}</p>
        {#if onRetry}
          <button 
            on:click={onRetry}
            class="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
          >
            Try again
          </button>
        {/if}
      </div>
    </div>
    ```
  - Update chat page to handle errors:
    - On API error: show ErrorMessage with retry option
    - On timeout (120s): show "The request took too long. Please try again."
    - On network error: show "Connection lost. Please check your network and try again."
    - On Langflow error: show "Something went wrong. Please try again." (generic user-friendly)
  - Handle `[Translation unavailable]` prefix (from UI_HANDOFF.md):
    - If assistant response starts with `[Translation unavailable]`, strip the prefix
    - Show a subtle indicator (small icon or tooltip) that parts may be in English
    - Implementation: regex strip in markdown renderer or before display
  - Add retry logic:
    - Store the last user message temporarily
    - Retry button re-sends the same message
    - Clear retry state after successful response
  - Write tests for error display and retry functionality

  **Must NOT do**:
  - Do NOT add automatic retry (only manual retry via button)
  - Do NOT retry more than once without user action
  - Do NOT show technical error details to users (log them instead)
  - Do NOT block the UI during error state — user can still type new messages

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Error handling across multiple failure modes, retry logic, UI state management
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — integrates with chat flow
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 35
  - **Blocked By**: Tasks 19, 30 (needs loading indicator + streaming abstraction)

  **References**:

  **Pattern References**:
  - `src/routes/(app)/chat/[conversationId]/+page.svelte` (Task 18/21) — chat page to add error handling
  - `src/lib/components/chat/LoadingIndicator.svelte` (Task 19/25) — similar component styling

  **External References**:
  - UI_HANDOFF.md lines 238-247: Error handling requirements (flow failed, timeout, translation unavailable, network errors)

  **WHY Each Reference Matters**:
  - Chat page is where errors surface — needs to catch and display them
  - Error styling should be consistent with the chat UI but visually distinct (red theme)
  - The `[Translation unavailable]` handling is specific to the Hungarian pipeline

  **Acceptance Criteria**:
  - [ ] API errors show user-friendly ErrorMessage component
  - [ ] 120s timeout shows appropriate message
  - [ ] Network disconnection shows appropriate message
  - [ ] Retry button re-sends last message
  - [ ] `[Translation unavailable]` prefix stripped from responses
  - [ ] User can type new messages even when error is displayed
  - [ ] `npm test -- error` → tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Timeout error shows retry option
    Tool: Playwright
    Preconditions: Logged in, mock Langflow configured to never respond (infinite hang)
    Steps:
      1. Send a message
      2. Wait 125 seconds (past 120s timeout)
      3. Assert loading indicator disappears
      4. Assert ErrorMessage appears with timeout text
      5. Assert "Try again" button is visible
      6. Screenshot
    Expected Result: Timeout handled gracefully with retry option
    Failure Indicators: UI hangs, no error message, no retry button
    Evidence: .sisyphus/evidence/task-31-timeout-error.png

  Scenario: Retry button re-sends message
    Tool: Playwright
    Preconditions: Logged in, mock returns error on first call, success on second
    Steps:
      1. Send message "Hello"
      2. Wait for error message to appear
      3. Click "Try again" button
      4. Assert loading indicator appears
      5. Wait for response
      6. Assert assistant message appears (success on retry)
    Expected Result: Retry successfully sends same message
    Failure Indicators: Different message sent, retry fails, error persists
    Evidence: .sisyphus/evidence/task-31-retry-success.png

  Scenario: Translation unavailable prefix stripped
    Tool: Playwright
    Preconditions: Logged in, mock returns "[Translation unavailable] Some English text"
    Steps:
      1. Send a message
      2. Wait for response
      3. Assert assistant message does NOT contain "[Translation unavailable]"
      4. Assert message shows "Some English text"
      5. (Optional) Assert subtle indicator that response is untranslated
    Expected Result: Prefix stripped, content displayed
    Failure Indicators: Prefix visible to user, content missing
    Evidence: .sisyphus/evidence/task-31-translation-strip.png
  ```

  **Commit**: YES (group: commit 11)
  - Message: `feat(ux): add error handling, retry, loading indicators, responsive layout`
  - Files: `src/lib/components/chat/ErrorMessage.svelte, src/routes/(app)/chat/[conversationId]/+page.svelte (modified)`
  - Pre-commit: `npm test -- error`

---

- [x] 32. Conversation Delete + Rename UI

  **What to do**:
  - Update `src/lib/components/sidebar/ConversationItem.svelte` (from Task 14):
    - Add context menu (right-click or three-dot menu) with "Rename" and "Delete" options
    - **Rename flow**:
      1. Click "Rename" → title becomes editable inline (input field)
      2. User types new title
      3. Press Enter or click away → save via API
      4. Press Escape → cancel, revert to original title
    - **Delete flow**:
      1. Click "Delete" → show confirmation dialog "Delete this conversation?"
      2. Confirm → DELETE API call → remove from list → navigate to another conversation
      3. Cancel → close dialog, no action
  - Create `src/lib/components/ui/ConfirmDialog.svelte`:
    - Reusable confirmation dialog component
    - Props: `title`, `message`, `confirmText`, `cancelText`, `onConfirm`, `onCancel`
    - Modal overlay with focus trap
  - Wire to existing API routes:
    - Rename: PATCH `/api/conversations/{id}` with `{ title: newTitle }` (Task 13)
    - Delete: DELETE `/api/conversations/{id}` (Task 13)
  - Handle edge cases:
    - Deleting the currently active conversation → navigate to most recent remaining conversation
    - Deleting the last conversation → navigate to "new conversation" state
    - Rename to empty string → revert to original (don't allow empty titles)
  - Write tests for rename and delete flows

  **Must NOT do**:
  - Do NOT add bulk delete (single conversation at a time)
  - Do NOT add conversation archive (delete is permanent in v1)
  - Do NOT add undo for delete (confirmation dialog is sufficient)
  - Do NOT add drag-to-reorder conversations

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Context menu, inline editing, modal dialog, keyboard interactions — UI-heavy
  - **Skills**: [`playwright`]
    - `playwright`: For testing context menu, inline edit, dialog interactions

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 25-27 in Wave 4 continuation)
  - **Parallel Group**: Wave 5
  - **Blocks**: None
  - **Blocked By**: Task 14 (needs conversation sidebar with items)

  **References**:

  **Pattern References**:
  - `src/lib/components/sidebar/ConversationItem.svelte` (Task 14) — component to enhance
  - `src/lib/stores/conversations.ts` (Task 14) — `deleteConversation`, `updateConversationTitle` functions
  - `src/routes/api/conversations/[id]/+server.ts` (Task 13) — PATCH and DELETE handlers

  **Design Spec References**:
  - `DESIGN_SPEC.md:349-355` — Modals and dialogs: centered overlay with `rgba(0,0,0,0.4)` backdrop, `--bg-primary` card, `--radius-lg`, `--shadow-lg`, `--space-lg` padding, max-width 480px, nearly full width on mobile with `--space-md` margin
  - `DESIGN_SPEC.md:339-347` — Buttons: primary uses `--accent` background/white text, secondary uses transparent with `--border`, icon buttons 36×36px desktop / 44×44px mobile
  - `DESIGN_SPEC.md:361-363` — Animation timing: 300ms for modals, ease-out enter / ease-in exit

  **WHY Each Reference Matters**:
  - ConversationItem is the target component — add context menu and inline edit here
  - The store provides reactive state updates — deleting/renaming updates sidebar immediately
  - API routes already exist — this task wires UI to them
  - DESIGN_SPEC.md defines exact modal styling, button appearance, and animation timing

  **Acceptance Criteria**:
  - [ ] Right-click on conversation shows context menu with Rename/Delete
  - [ ] Clicking Rename turns title into editable input
  - [ ] Enter saves new title, Escape cancels
  - [ ] Clicking Delete shows confirmation dialog
  - [ ] Confirming delete removes conversation and navigates appropriately
  - [ ] Empty title not allowed (reverts)
  - [ ] `npm test -- conversation` → tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Rename conversation via context menu
    Tool: Playwright
    Preconditions: Logged in, at least one conversation exists
    Steps:
      1. Right-click on a conversation in sidebar
      2. Assert context menu appears with "Rename" option
      3. Click "Rename"
      4. Assert title becomes an input field
      5. Type "New Title"
      6. Press Enter
      7. Assert input becomes text again showing "New Title"
      8. Refresh page
      9. Assert conversation still shows "New Title"
    Expected Result: Rename persists to database
    Failure Indicators: Title doesn't change, reverts on refresh, API error
    Evidence: .sisyphus/evidence/task-32-rename.png

  Scenario: Delete conversation with confirmation
    Tool: Playwright
    Preconditions: Logged in, at least 2 conversations exist, viewing conversation A
    Steps:
      1. Right-click on conversation A
      2. Click "Delete"
      3. Assert confirmation dialog appears
      4. Assert dialog says "Delete this conversation?"
      5. Click "Cancel"
      6. Assert dialog closes, conversation still exists
      7. Right-click again, click "Delete"
      8. Click "Confirm" (or "Delete" button)
      9. Assert conversation A removed from sidebar
      10. Assert navigated to another conversation (not A)
    Expected Result: Delete requires confirmation, removes conversation
    Failure Indicators: No confirmation, wrong conversation deleted, navigation error
    Evidence: .sisyphus/evidence/task-32-delete-confirm.png, task-32-delete-done.png

  Scenario: Delete last conversation
    Tool: Playwright
    Preconditions: Logged in, exactly 1 conversation exists
    Steps:
      1. Delete the conversation (via context menu + confirm)
      2. Assert sidebar shows empty state or "New conversation" prompt
      3. Assert main area shows welcome/empty state
    Expected Result: Graceful handling of empty state
    Failure Indicators: Error, stuck UI, orphaned data
    Evidence: .sisyphus/evidence/task-32-delete-last.png
  ```

  **Commit**: YES (group: commit 11)
  - Message: `feat(ux): add error handling, retry, loading indicators, responsive layout`
  - Files: `src/lib/components/sidebar/ConversationItem.svelte, src/lib/components/ui/ConfirmDialog.svelte`
  - Pre-commit: `npm test -- conversation`

---

- [x] 33. Apache VirtualHost Configuration + SSE Anti-Buffering

  **What to do**:
  - Create `deploy/apache-site.conf`:
    - VirtualHost configuration for Apache reverse proxy to the Node.js app
    - SSL via Let's Encrypt (Virtualmin manages certs)
    - Proxy all requests to `http://127.0.0.1:3000`
    - **Critical SSE anti-buffering directives** for streaming endpoints
    ```apache
    <VirtualHost *:443>
        ServerName chat.example.com
        
        # SSL (Virtualmin/Let's Encrypt)
        SSLEngine on
        SSLCertificateFile /etc/letsencrypt/live/chat.example.com/fullchain.pem
        SSLCertificateKeyFile /etc/letsencrypt/live/chat.example.com/privkey.pem
        
        # Proxy settings
        ProxyRequests Off
        ProxyPreserveHost On
        
        # General proxy to Node app
        ProxyPass / http://127.0.0.1:3000/
        ProxyPassReverse / http://127.0.0.1:3000/
        
        # SSE endpoints need special handling to disable buffering
        <LocationMatch "^/api/(chat/stream|stream/webhook)">
            # Disable proxy buffering for SSE
            SetEnv proxy-sendchunked 1
            SetEnv proxy-nokeepalive 1
            
            # Disable gzip (breaks SSE)
            SetEnv no-gzip 1
            
            # Ensure immediate flush
            ProxyPass http://127.0.0.1:3000 flushpackets=on
        </LocationMatch>
        
        # Timeouts (generous for long-running requests)
        ProxyTimeout 300
        
        # Required modules: mod_proxy, mod_proxy_http, mod_ssl, mod_headers, mod_setenvif
    </VirtualHost>
    
    # HTTP to HTTPS redirect
    <VirtualHost *:80>
        ServerName chat.example.com
        Redirect permanent / https://chat.example.com/
    </VirtualHost>
    ```
  - Include placeholders for:
    - `ServerName` (replace with actual domain)
    - SSL cert paths (Virtualmin standard location)
    - Port (3000 default, configurable)
  - Add comments explaining each section
  - Create `deploy/apache-modules.md` documenting required Apache modules:
    - mod_proxy, mod_proxy_http, mod_ssl, mod_headers, mod_setenvif
    - Commands to enable: `a2enmod proxy proxy_http ssl headers setenvif`

  **Must NOT do**:
  - Do NOT include WebSocket proxy config (we're SSE-only)
  - Do NOT hardcode domain names — use placeholders
  - Do NOT modify actual Apache configs — this is a template file
  - Do NOT include application secrets in the config

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Apache config file creation — well-defined structure, minimal logic
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 31, 32 in Wave 5)
  - **Parallel Group**: Wave 5
  - **Blocks**: Task 34
  - **Blocked By**: Task 1 (needs project structure to exist)

  **References**:

  **External References**:
  - UI_HANDOFF.md lines 270-277: "Apache reverse proxy with Virtualmin... virtual host configuration"
  - Apache mod_proxy docs: `https://httpd.apache.org/docs/2.4/mod/mod_proxy.html`
  - Research finding: "SetEnv proxy-sendchunked, SetEnv no-gzip, ProxyPass flushpackets=on" for SSE

  **WHY Each Reference Matters**:
  - The SSE anti-buffering directives are critical — without them, streaming appears to buffer and deliver in chunks
  - Virtualmin manages SSL certs in standard Let's Encrypt locations
  - The app runs alongside other Virtualmin sites — must be a proper VirtualHost, not monopolize ports

  **Acceptance Criteria**:
  - [ ] `deploy/apache-site.conf` exists with complete VirtualHost config
  - [ ] SSE endpoints have anti-buffering directives
  - [ ] SSL config uses Let's Encrypt paths
  - [ ] HTTP redirect to HTTPS included
  - [ ] Config syntax valid: `apachectl -t -f deploy/apache-site.conf` (dry run)
  - [ ] Required modules documented in `deploy/apache-modules.md`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Apache config syntax is valid
    Tool: Bash
    Preconditions: Apache installed (for syntax check only)
    Steps:
      1. Run: `apachectl -t -f deploy/apache-site.conf 2>&1 || echo "Syntax check requires full Apache env"`
      2. Alternatively: grep for required directives
      3. Assert: ProxyPass, ProxyPassReverse, SSLEngine present
      4. Assert: LocationMatch for streaming endpoints present
      5. Assert: SetEnv proxy-sendchunked present
    Expected Result: Config contains all required directives
    Failure Indicators: Missing proxy directives, missing SSE handling
    Evidence: .sisyphus/evidence/task-33-apache-syntax.txt

  Scenario: Config has placeholder values (not hardcoded)
    Tool: Bash (grep)
    Preconditions: deploy/apache-site.conf exists
    Steps:
      1. Grep for "example.com" or similar placeholder
      2. Assert placeholder domain found (not a real domain)
      3. Assert no real API keys or secrets
    Expected Result: Template uses placeholders
    Failure Indicators: Hardcoded production values
    Evidence: .sisyphus/evidence/task-33-apache-placeholders.txt
  ```

  **Commit**: YES (group: commit 12)
  - Message: `feat(deploy): add Apache config, systemd service, and deployment docs`
  - Files: `deploy/apache-site.conf, deploy/apache-modules.md`
  - Pre-commit: `grep -q "ProxyPass" deploy/apache-site.conf`

---

- [x] 34. systemd Service File + Deployment Documentation

  **What to do**:
  - Create `deploy/langflow-chat.service`:
    - systemd service unit file for running the Node.js app
    - Run as dedicated user (e.g., `langflow-chat`)
    - Working directory: application root
    - Environment file for configuration
    - Auto-restart on failure
    ```ini
    [Unit]
    Description=Langflow Chat UI
    After=network.target
    
    [Service]
    Type=simple
    User=langflow-chat
    Group=langflow-chat
    WorkingDirectory=/opt/langflow-chat
    EnvironmentFile=/opt/langflow-chat/.env
    ExecStart=/usr/bin/node build/index.js
    Restart=on-failure
    RestartSec=10
    StandardOutput=journal
    StandardError=journal
    
    # Security hardening
    NoNewPrivileges=true
    PrivateTmp=true
    
    [Install]
    WantedBy=multi-user.target
    ```
  - Create `deploy/README.md` with deployment instructions:
    1. **Prerequisites**: Node.js 20+, npm, Apache with required modules
    2. **Build**: `npm install && npm run build`
    3. **Database setup**: `mkdir -p data && node scripts/seed-user.ts`
    4. **Configuration**: Copy `.env.example` to `.env`, fill in values
    5. **Service installation**:
       - `sudo cp deploy/langflow-chat.service /etc/systemd/system/`
       - `sudo systemctl daemon-reload`
       - `sudo systemctl enable langflow-chat`
       - `sudo systemctl start langflow-chat`
    6. **Apache setup**: Copy config, update domain, enable site
    7. **Verification**: `curl http://localhost:3000/login` should return HTML
    8. **Logs**: `journalctl -u langflow-chat -f`
  - Document environment variables needed (reference .env.example from Task 2)
  - Include health check endpoint note: `GET /api/health` returns 200 if app is running
    - (This endpoint should be created as part of the service — simple ping)
  - Create `src/routes/api/health/+server.ts`:
    ```typescript
    export const GET = () => new Response('OK', { status: 200 });
    ```

  **Must NOT do**:
  - Do NOT include actual secrets in the service file or README
  - Do NOT assume specific installation paths — use placeholders
  - Do NOT create the user account — document the command
  - Do NOT auto-start the service during build — manual start only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Config file + documentation — templates with placeholders
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO — depends on Task 33 (Apache config)
  - **Parallel Group**: Wave 5 (after Task 33)
  - **Blocks**: None
  - **Blocked By**: Task 33 (should be written after Apache config)

  **References**:

  **Pattern References**:
  - `deploy/apache-site.conf` (Task 33) — referenced in deployment README
  - `.env.example` (Task 2) — environment variables to document

  **External References**:
  - systemd unit file docs: `https://www.freedesktop.org/software/systemd/man/systemd.service.html`
  - UI_HANDOFF.md lines 284-295: Configuration values (ports, URLs)

  **WHY Each Reference Matters**:
  - The service file must point to the built app (`build/index.js` from adapter-node)
  - The README ties together all deployment artifacts
  - Environment variables control runtime behavior — must be documented

  **Acceptance Criteria**:
  - [ ] `deploy/langflow-chat.service` is valid systemd unit file
  - [ ] `deploy/README.md` contains step-by-step deployment instructions
  - [ ] Health check endpoint exists: `GET /api/health → 200 OK`
  - [ ] All environment variables documented
  - [ ] Startup sequence documented (database, then app, then Apache)
  - [ ] Verification commands included

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: systemd service file is valid
    Tool: Bash
    Preconditions: deploy/langflow-chat.service exists
    Steps:
      1. Run: `systemd-analyze verify deploy/langflow-chat.service 2>&1 || echo "verify not available, checking manually"`
      2. Grep for required directives: ExecStart, WorkingDirectory, User
      3. Assert all required directives present
    Expected Result: Valid systemd unit file
    Failure Indicators: Missing required directives, syntax errors
    Evidence: .sisyphus/evidence/task-34-systemd-syntax.txt

  Scenario: Health check endpoint works
    Tool: Bash (curl)
    Preconditions: App running locally
    Steps:
      1. Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/api/health`
      2. Assert HTTP 200
    Expected Result: Health endpoint responds
    Failure Indicators: 404, 500, or no response
    Evidence: .sisyphus/evidence/task-34-health-check.txt

  Scenario: Deployment README is complete
    Tool: Bash (grep)
    Preconditions: deploy/README.md exists
    Steps:
      1. Assert file contains "Prerequisites" section
      2. Assert file contains "npm run build" instruction
      3. Assert file contains "systemctl" commands
      4. Assert file contains environment variable documentation
      5. Assert file contains verification steps
    Expected Result: Complete deployment documentation
    Failure Indicators: Missing sections, incomplete instructions
    Evidence: .sisyphus/evidence/task-34-readme-sections.txt
  ```

  **Commit**: YES (group: commit 12)
  - Message: `feat(deploy): add Apache config, systemd service, and deployment docs`
  - Files: `deploy/langflow-chat.service, deploy/README.md, src/routes/api/health/+server.ts`
  - Pre-commit: `npm run build`

---

- [x] 35. Playwright E2E Test Suite (Full User Journey)

  **What to do**:
  - Create comprehensive E2E tests in `tests/e2e/`:
    - `auth.spec.ts` — Login flow
    - `conversation.spec.ts` — CRUD operations
    - `chat.spec.ts` — Send/receive messages
    - `streaming.spec.ts` — SSE streaming verification
    - `responsive.spec.ts` — Layout at different viewport sizes
    - `full-journey.spec.ts` — Complete user journey
  - **Full user journey test** (`full-journey.spec.ts`):
    ```typescript
    test('complete user journey', async ({ page }) => {
      // 1. Login
      await page.goto('/login');
      await page.fill('[name="email"]', 'admin@local');
      await page.fill('[name="password"]', 'admin123');
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL(/chat/);
      
      // 2. Create new conversation
      await page.click('[data-testid="new-conversation"]');
      await expect(page.locator('[data-testid="conversation-item"]')).toHaveCount(1);
      
      // 3. Send message
      await page.fill('[data-testid="message-input"]', 'Hello, AI!');
      await page.click('[data-testid="send-button"]');
      
      // 4. Wait for response (with streaming)
      await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible({ timeout: 30000 });
      
      // 5. Verify markdown rendering
      await expect(page.locator('[data-testid="assistant-message"]').locator('p')).toBeVisible();
      
      // 6. Toggle dark mode
      await page.click('[data-testid="theme-toggle"]');
      await expect(page.locator('html')).toHaveClass(/dark/);
      
      // 7. Rename conversation
      await page.click('[data-testid="conversation-item"]', { button: 'right' });
      await page.click('[data-testid="rename-option"]');
      await page.fill('[data-testid="title-input"]', 'Test Chat');
      await page.keyboard.press('Enter');
      await expect(page.locator('[data-testid="conversation-item"]')).toContainText('Test Chat');
      
      // 8. Delete conversation
      await page.click('[data-testid="conversation-item"]', { button: 'right' });
      await page.click('[data-testid="delete-option"]');
      await page.click('[data-testid="confirm-delete"]');
      await expect(page.locator('[data-testid="conversation-item"]')).toHaveCount(0);
    });
    ```
  - Configure Playwright (`playwright.config.ts`):
    - Base URL: `http://localhost:5173`
    - Start dev server before tests: `npm run dev`
    - Browsers: Chromium only for speed (can add Firefox/WebKit later)
    - Test timeout: 60s (for streaming tests)
  - Add test data-testid attributes to components (if not already present)
  - Create mock setup that runs automatically for E2E tests

  **Must NOT do**:
  - Do NOT test against real Langflow — use mocks only
  - Do NOT add flaky timing-based assertions — use proper waitFor patterns
  - Do NOT skip error scenarios — test error handling too
  - Do NOT hardcode test credentials — use env vars or seed data

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Comprehensive E2E test suite with streaming, multiple user flows, proper assertions
  - **Skills**: [`playwright`]
    - `playwright`: Core skill for E2E testing

  **Parallelization**:
  - **Can Run In Parallel**: NO — integration test that verifies all other tasks
  - **Parallel Group**: Wave 5 (final implementation task)
  - **Blocks**: Final Verification Wave (F1-F4)
  - **Blocked By**: Tasks 5, 9, 18, 31 (needs mocks, login, chat, error handling)

  **References**:

  **Pattern References**:
  - `tests/mocks/langflow-server.ts` (Task 5) — mock for E2E tests
  - All component files — need `data-testid` attributes for selectors
  - `scripts/seed-user.ts` (Task 6) — creates test user for login

  **External References**:
  - Playwright docs: `https://playwright.dev/docs/test-configuration`
  - UI_HANDOFF.md full spec — E2E tests should cover all described features

  **WHY Each Reference Matters**:
  - Mock server must be running for E2E tests — can't hit real Langflow
  - Test selectors use data-testid — components need these attributes
  - The seed script creates the admin@local user that E2E tests log in as

  **Acceptance Criteria**:
  - [ ] `npx playwright test` runs full E2E suite
  - [ ] Full journey test passes (login → chat → rename → delete)
  - [ ] Streaming test verifies tokens appear incrementally
  - [ ] Responsive test checks desktop/tablet/mobile layouts
  - [ ] Error handling test verifies retry flow
  - [ ] All E2E tests pass with mock Langflow

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full E2E suite passes
    Tool: Bash (playwright)
    Preconditions: App built, mocks configured
    Steps:
      1. Run: `npx playwright test --reporter=list`
      2. Assert all tests pass
      3. Run: `npx playwright test --reporter=html`
      4. Check HTML report at playwright-report/
    Expected Result: All E2E tests pass
    Failure Indicators: Any test failure, timeout, selector not found
    Evidence: .sisyphus/evidence/task-35-e2e-results.txt, .sisyphus/evidence/task-35-e2e-report.html

  Scenario: Full user journey completes
    Tool: Playwright (via test run)
    Preconditions: full-journey.spec.ts exists
    Steps:
      1. Run: `npx playwright test full-journey`
      2. Assert test passes
      3. Verify video/screenshot if failure
    Expected Result: Complete journey from login to delete works
    Failure Indicators: Any step fails, assertion timeout
    Evidence: .sisyphus/evidence/task-35-journey.txt

  Scenario: Streaming test verifies incremental display
    Tool: Playwright (via test run)
    Preconditions: streaming.spec.ts exists, mock configured with delayed tokens
    Steps:
      1. Run streaming test
      2. Assert test captures partial content during stream
      3. Assert test verifies final content after stream ends
    Expected Result: Streaming verified at UI level
    Failure Indicators: Content appears all at once, test times out
    Evidence: .sisyphus/evidence/task-35-streaming-e2e.txt
  ```

  **Commit**: YES (group: commit 11)
  - Message: `feat(ux): add error handling, retry, loading indicators, responsive layout`
  - Files: `tests/e2e/auth.spec.ts, tests/e2e/conversation.spec.ts, tests/e2e/chat.spec.ts, tests/e2e/streaming.spec.ts, tests/e2e/responsive.spec.ts, tests/e2e/full-journey.spec.ts, playwright.config.ts`
  - Pre-commit: `npx playwright test --reporter=list`

---

- [x] 36. Mobile Design Polish (Second Design Pass)

  **What to do**:
  This task performs a comprehensive mobile design review and polish pass, using `DESIGN_SPEC.md` as the authoritative reference. Every visual element must be audited against the spec and adjusted to match exactly.

  - **Audit all components against DESIGN_SPEC.md**:
    - Verify ALL colors use CSS custom property tokens (no hardcoded hex values)
    - Verify typography: serif for messages, sans-serif for UI chrome, monospace for code
    - Verify spacing uses the 4px-based system (`--space-xs` through `--space-2xl`)
    - Verify border radius tokens (`--radius-sm`, `--radius-md`, `--radius-lg`)
    - Verify shadows are subtle and match spec (`--shadow-sm`, `--shadow-md`, `--shadow-lg`)

  - **Mobile layout verification (<768px breakpoint)**:
    - Header: exactly 48px height, hamburger left, title center, theme toggle + new chat right
    - Sidebar: full-screen overlay when open, slides from left, close button (X) top-right
    - Messages: full width minus 16px (`--space-md`) each side, NO max-width constraint on mobile
    - User messages: right-aligned bubble, max-width 85% of screen
    - Assistant messages: left-aligned, full width, no bubble (flat on `--bg-primary`)
    - Code blocks: full width, horizontal scroll, font stays 14px (never shrink code)
    - Input area: pinned to viewport bottom (not content bottom), 48px minimum height, expands to 120px max

  - **Touch target verification**:
    - Audit ALL tappable elements for 44×44px minimum size
    - Sidebar conversation items: 44px minimum height
    - Hamburger menu button: 44×44px
    - Send button: 44×44px
    - Theme toggle: 44×44px
    - New chat button: 44×44px
    - Copy buttons on code blocks: 44×44px
    - Add padding/hitslop where needed to meet touch target requirement

  - **Keyboard handling**:
    - Input area remains visible when software keyboard opens
    - Conversation scrolls so latest message stays visible above keyboard
    - iOS safe area inset at bottom (home indicator bar) properly handled

  - **Animation/transition polish**:
    - Sidebar slide: 250ms, translateX from -100% to 0, with backdrop fade
    - Message appear: subtle fade-in (opacity 0→1 over 200ms), no slide/bounce/scale
    - Typing indicator dots: staggered opacity pulse, 600ms cycle per dot, 100ms stagger
    - Respect `prefers-reduced-motion` — disable animations when set

  - **Accessibility verification**:
    - All interactive elements keyboard navigable (Tab, Enter, Escape)
    - Focus rings: 2px `--border-focus` with 2px offset
    - Icon buttons have `aria-label`
    - Messages in ARIA live region for screen reader announcements
    - Color contrast meets WCAG AA (4.5:1 for body text)

  - **Create mobile-specific Playwright tests** in `tests/e2e/mobile-design.spec.ts`:
    - Test touch target sizes (measure element dimensions)
    - Test sidebar overlay behavior
    - Test input area keyboard handling
    - Test code block horizontal scroll
    - Visual regression screenshots at 375×667 (iPhone SE) and 390×844 (iPhone 14)

  **Must NOT do**:
  - Do NOT change any functionality — this is visual polish only
  - Do NOT add new features
  - Do NOT modify API endpoints or business logic
  - Do NOT change the desktop (>1024px) layout
  - Do NOT add swipe gestures or native mobile patterns

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Pure visual design polish, CSS refinement, responsive layout verification — UI/UX focused
  - **Skills**: [`playwright`]
    - `playwright`: For mobile viewport testing, touch target verification, visual regression

  **Parallelization**:
  - **Can Run In Parallel**: NO — this is a final polish pass that reviews all previous visual work
  - **Parallel Group**: Wave 6 (after all implementation tasks, before Final Verification)
  - **Blocks**: Final Verification Wave (F1-F4)
  - **Blocked By**: Tasks 27, 32, 35 (needs responsive layout, all UI components, and E2E tests complete)

  **References**:

  **Design Spec Reference (PRIMARY — use as drop-in spec)**:
  - `DESIGN_SPEC.md` — **ENTIRE DOCUMENT** is the authoritative reference for this task
  - `DESIGN_SPEC.md:1-5` — Design philosophy: "Follow these specifications exactly. Do not improvise colors, spacing, fonts, or layout decisions — everything is defined here."
  - `DESIGN_SPEC.md:21-66` — Color palette: ALL CSS custom property tokens for light and dark mode
  - `DESIGN_SPEC.md:70-91` — Typography: font stacks, sizes, weights, line heights, minimum size rules
  - `DESIGN_SPEC.md:95-117` — Spacing system: 4px base unit, all spacing tokens
  - `DESIGN_SPEC.md:120-127` — Border radius tokens
  - `DESIGN_SPEC.md:131-139` — Shadow tokens
  - `DESIGN_SPEC.md:192-252` — **CRITICAL: Mobile layout specification** — header, sidebar, messages, code blocks, input area, touch targets, keyboard handling
  - `DESIGN_SPEC.md:255-356` — Component specifications: message bubbles, code blocks, inline code, message input, sidebar, loading indicator, buttons, modals
  - `DESIGN_SPEC.md:359-371` — Animations and transitions: duration, easing, specific behaviors
  - `DESIGN_SPEC.md:375-386` — Accessibility requirements

  **Pattern References**:
  - All visual-engineering task outputs (Tasks 9-11, 14-15, 17, 19, 26-27, 32) — components to audit
  - `src/app.css` — global styles, CSS custom properties
  - `tailwind.config.ts` — Tailwind theme configuration

  **WHY Each Reference Matters**:
  - DESIGN_SPEC.md is the single source of truth for ALL visual decisions — this task enforces compliance
  - Previous visual tasks may have deviated from spec or missed details — this pass catches everything
  - Mobile-specific rules in DESIGN_SPEC.md:192-252 are comprehensive and must be followed exactly

  **Acceptance Criteria**:
  - [ ] All colors verified to use CSS custom property tokens (grep for hardcoded hex in components → zero matches)
  - [ ] Typography verified: serif for messages, sans-serif for UI, monospace for code
  - [ ] All touch targets measured at ≥44×44px
  - [ ] Header exactly 48px height on mobile
  - [ ] Sidebar opens as full-screen overlay on mobile
  - [ ] Input area pinned to viewport bottom (test with keyboard open)
  - [ ] Code blocks scroll horizontally, 14px font size preserved
  - [ ] User message bubbles max 85% width on mobile
  - [ ] `prefers-reduced-motion` respected — animations disabled when set
  - [ ] All icon buttons have `aria-label`
  - [ ] Focus rings visible on all interactive elements
  - [ ] `npm run build` succeeds
  - [ ] Mobile design Playwright tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Touch targets meet 44×44px minimum
    Tool: Playwright
    Preconditions: Logged in, viewport 375×667 (iPhone SE)
    Steps:
      1. Navigate to chat
      2. Measure hamburger button dimensions (getBoundingClientRect)
      3. Assert width ≥ 44px AND height ≥ 44px
      4. Open sidebar
      5. Measure conversation item height
      6. Assert height ≥ 44px
      7. Measure send button dimensions
      8. Assert width ≥ 44px AND height ≥ 44px
      9. Measure theme toggle dimensions
      10. Assert width ≥ 44px AND height ≥ 44px
    Expected Result: All touch targets meet minimum size
    Failure Indicators: Any element < 44px in either dimension
    Evidence: .sisyphus/evidence/task-36-touch-targets.json (dimensions log)

  Scenario: Mobile sidebar is full-screen overlay
    Tool: Playwright
    Preconditions: Logged in, viewport 375×667
    Steps:
      1. Assert sidebar is NOT visible initially
      2. Click hamburger button
      3. Assert sidebar is visible
      4. Assert sidebar covers full viewport width (measure)
      5. Assert backdrop is visible behind sidebar
      6. Assert close button (X) is visible in sidebar
      7. Click close button
      8. Assert sidebar closes
      9. Screenshot showing sidebar open state
    Expected Result: Sidebar as full-screen overlay with close button
    Failure Indicators: Sidebar not full width, no backdrop, no close button
    Evidence: .sisyphus/evidence/task-36-mobile-sidebar.png

  Scenario: Input area pinned to viewport bottom
    Tool: Playwright
    Preconditions: Logged in, viewport 375×667, conversation with many messages
    Steps:
      1. Navigate to conversation with 20+ messages
      2. Scroll up to view old messages
      3. Assert input area is STILL visible at bottom of viewport
      4. Assert input area does NOT scroll with content
      5. Screenshot showing input pinned while content scrolled
    Expected Result: Input stays fixed at viewport bottom
    Failure Indicators: Input scrolls with content, input not visible when scrolled up
    Evidence: .sisyphus/evidence/task-36-input-pinned.png

  Scenario: Code blocks have horizontal scroll on mobile
    Tool: Playwright
    Preconditions: Logged in, viewport 375×667, conversation with long code block
    Steps:
      1. Navigate to conversation containing code block with 200+ char line
      2. Assert code block uses full available width
      3. Assert code block has overflow-x: auto or scroll
      4. Assert code text does NOT wrap
      5. Assert code font size is 14px (not smaller)
      6. Perform horizontal scroll on code block
      7. Assert more code becomes visible
    Expected Result: Code blocks scroll horizontally, font size preserved
    Failure Indicators: Code wraps, font shrunk below 14px, no horizontal scroll
    Evidence: .sisyphus/evidence/task-36-code-scroll-mobile.png

  Scenario: User message bubbles max 85% width on mobile
    Tool: Playwright
    Preconditions: Logged in, viewport 375×667
    Steps:
      1. Send a short message ("Hi")
      2. Send a very long message (200+ characters)
      3. Measure short message bubble width
      4. Measure long message bubble width
      5. Assert long message width ≤ 85% of viewport width (≤318.75px)
      6. Assert long message IS NOT full width
    Expected Result: User bubbles capped at 85% width
    Failure Indicators: Bubble exceeds 85%, bubble uses full width
    Evidence: .sisyphus/evidence/task-36-bubble-width.json

  Scenario: No hardcoded hex colors in components
    Tool: Bash (grep)
    Preconditions: All components built
    Steps:
      1. Run: `grep -rn '#[0-9A-Fa-f]\{3,6\}' src/lib/components/ --include='*.svelte' | grep -v '// color:' | grep -v 'DESIGN_SPEC'`
      2. Assert zero matches (no hardcoded hex in component files)
      3. Run: `grep -rn 'var(--' src/lib/components/ --include='*.svelte' | wc -l`
      4. Assert count > 0 (CSS variables ARE being used)
    Expected Result: All colors use CSS custom properties
    Failure Indicators: Hardcoded hex values found in component files
    Evidence: .sisyphus/evidence/task-36-color-audit.txt

  Scenario: Reduced motion preference respected
    Tool: Playwright
    Preconditions: Logged in, viewport 375×667
    Steps:
      1. Enable reduced motion: `await page.emulateMedia({ reducedMotion: 'reduce' })`
      2. Open sidebar
      3. Assert sidebar appears WITHOUT slide animation (instant)
      4. Send a message
      5. Assert message appears WITHOUT fade animation (instant)
      6. Screenshot
    Expected Result: Animations disabled when prefers-reduced-motion set
    Failure Indicators: Animations still play with reduced motion preference
    Evidence: .sisyphus/evidence/task-36-reduced-motion.png
  ```

  **Commit**: YES (group: commit 13)
  - Message: `style(mobile): polish mobile design per DESIGN_SPEC.md`
  - Files: `src/lib/components/**/*.svelte, src/app.css, tests/e2e/mobile-design.spec.ts`
  - Pre-commit: `npm run build && npx tsc --noEmit`

 - [x] 37. Comprehensive Design Reinspection — Visual Fidelity Audit Against DESIGN_SPEC.md

  > **HIGH PRIORITY — EXTRA ATTENTION REQUIRED**
  > Previous implementation pass produced styling that was severely deficient: barely any styling applied, element sizing incorrect, overall visual quality far below acceptable. This task exists specifically to catch and fix every visual discrepancy. The agent MUST treat DESIGN_SPEC.md as the absolute source of truth and fix EVERY deviation found.

  **What to do**:

  **Phase 1 — Systematic Visual Audit (read-only, compile findings)**:
  1. Read `DESIGN_SPEC.md` end-to-end. Extract every concrete visual specification: colors, spacing, font sizes, border radii, shadows, layout proportions, breakpoints, component dimensions, animations, z-indices
  2. For EACH of the following visual tasks, open the actual component files and compare implementation against DESIGN_SPEC.md line by line:
     - **Task 9 (Login Page UI)**: Check login form dimensions, input field heights, button sizing, form centering, background colors, logo/branding placement, spacing between elements, font sizes for labels/inputs/buttons
     - **Task 10 (App Shell Layout)**: Check sidebar width (exact px/%), chat area proportions, header height, padding/margins between major sections, overall grid/flex layout structure, max-width constraints
     - **Task 11 (Dark/Light Mode)**: Check ALL color tokens — background, foreground, accent, border, hover, active states for BOTH themes. Verify CSS custom properties match DESIGN_SPEC.md hex values exactly. Check contrast ratios
     - **Task 14 (Conversation Sidebar)**: Check list item heights, padding, active/hover states, truncation behavior, timestamp font size, new-conversation button sizing, scroll area height, divider styling
     - **Task 15 (Message Input)**: Check textarea height (min/max), padding, border styling, send button size and position, character counter placement, placeholder text styling, focus ring
     - **Task 17 (Message Display)**: Check message bubble width (max-width), padding, border-radius, spacing between messages, avatar sizing, timestamp placement, user vs AI message differentiation (colors, alignment)
     - **Task 19 (Loading Indicator)**: Check spinner/dots sizing, animation timing, placement within chat area, color
     - **Task 26 (File Upload Placeholder)**: Check button dimensions, disabled state styling, tooltip text, icon size
     - **Task 27 (Responsive Layout)**: Check breakpoint values match DESIGN_SPEC.md, sidebar collapse behavior, padding adjustments at each breakpoint, touch target sizes (≥44×44px)
     - **Task 32 (Conversation Delete/Rename UI)**: Check modal/popover dimensions, button sizing, input field styling, danger-action coloring, backdrop
     - **Task 36 (Mobile Design Polish)**: Check all mobile-specific overrides were actually applied — full-screen sidebar overlay, bottom-pinned input, swipe gestures if specified
  3. Build a findings list: `[component] [property] [expected from DESIGN_SPEC] [actual in code] [severity: critical/major/minor]`

  **Phase 2 — Fix Every Discrepancy**:
  4. For each finding, edit the component file to match DESIGN_SPEC.md exactly
  5. Priorities for fixes:
     - **CRITICAL (fix first)**: Wrong layout structure (flex vs grid, missing containers), missing entire style blocks, wrong responsive breakpoints
     - **MAJOR (fix second)**: Wrong dimensions (width, height, padding, margin off by >4px), wrong colors (not using design tokens or wrong token), wrong font sizes/weights
     - **MINOR (fix last)**: Transitions/animations not matching spec, minor spacing (<4px off), missing hover/focus states
  6. After fixing each component, verify the Tailwind classes or CSS actually produce the intended visual result — check for conflicting styles, specificity issues, missing responsive prefixes
  7. Verify ALL color values use CSS custom property tokens defined in `src/app.css` — NO hardcoded hex/rgb values in component files
  8. Verify dark mode: every component that has light-mode styling MUST have corresponding `.dark` variant or `dark:` Tailwind prefix

  **Phase 3 — Cross-Component Consistency Check**:
  9. Verify consistent spacing scale across all components (same spacing tokens used for similar gaps)
  10. Verify consistent border-radius values (buttons, cards, inputs should use same radius tokens)
  11. Verify consistent typography scale (heading sizes, body text, captions use same font-size tokens)
  12. Verify consistent interactive states (hover, focus, active, disabled look the same across all interactive elements)
  13. Run `npm run build && npx tsc --noEmit` to ensure no regressions from style fixes

  **Must NOT do**:
  - Do NOT change component logic/behavior — this is a visual-only pass
  - Do NOT add new components or remove existing ones
  - Do NOT modify API routes, services, or server-side code
  - Do NOT change test logic (only update test selectors if component class names changed)
  - Do NOT invent styles not in DESIGN_SPEC.md — if the spec doesn't specify something, leave it as-is
  - Do NOT use `!important` to override styles — fix the root cause instead

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: This is entirely a visual fidelity task — reading design specs, comparing against CSS/Tailwind, fixing styling. Visual-engineering agents have design-eye for spotting discrepancies.
  - **Skills**: [`frontend-ui-ux`, `playwright`]
    - `frontend-ui-ux`: Core skill — designer-developer who can evaluate visual quality and apply precise CSS fixes
    - `playwright`: Required for QA scenario screenshots proving visual fixes
  - **Skills Evaluated but Omitted**:
    - `dev-browser`: Not needed — Playwright skill covers all browser verification needs

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 7 (sequential — must complete before Task 38)
  - **Blocks**: Task 38, F1-F4
  - **Blocked By**: Task 36 (all visual tasks must be complete before reinspection)

  **References** (CRITICAL — Be Exhaustive):

  **Design Spec (THE source of truth)**:
  - `DESIGN_SPEC.md` — Read EVERY section. This is the authoritative reference for all visual properties. Every CSS value must trace back to this document.

  **Pattern References (components to inspect and fix)**:
  - `src/routes/login/+page.svelte` — Login page (Task 9)
  - `src/routes/(app)/+layout.svelte` — App shell layout (Task 10)
  - `src/lib/components/layout/Sidebar.svelte` — Sidebar container (Task 10)
  - `src/lib/components/layout/Header.svelte` — Header bar (Task 10)
  - `src/lib/stores/theme.ts` or `src/lib/stores/theme.svelte.ts` — Theme store (Task 11)
  - `src/app.css` — Global styles, CSS custom properties, dark/light tokens (Task 11)
  - `src/lib/components/sidebar/ConversationList.svelte` — Conversation sidebar items (Task 14)
  - `src/lib/components/chat/MessageInput.svelte` — Message input area (Task 15)
  - `src/lib/components/chat/MessageBubble.svelte` or `Message.svelte` — Message display (Task 17)
  - `src/lib/components/chat/LoadingIndicator.svelte` — Loading states (Task 19)
  - `src/lib/components/chat/FileUploadButton.svelte` — Upload placeholder (Task 26)
  - `src/lib/components/sidebar/ConversationActions.svelte` — Delete/rename UI (Task 32)

  **CSS Token References**:
  - `src/app.css` — All CSS custom properties (--color-*, --spacing-*, --radius-*, --font-*). Verify these match DESIGN_SPEC.md values, then verify components USE these tokens.
  - `tailwind.config.ts` — Tailwind theme extensions. Verify design tokens are properly mapped.

  **WHY Each Reference Matters**:
  - DESIGN_SPEC.md: Every visual fix must be justified by a specific line in this spec — no guessing
  - Component files: These are what the user SAW and judged "horrendous" — they need surgical fixes
  - app.css + tailwind.config.ts: The token system must be correct FIRST, then components consume correct tokens

  **Acceptance Criteria**:
  - [ ] Every visual component listed above has been audited against DESIGN_SPEC.md
  - [ ] Findings list created with [component][property][expected][actual][severity] for every discrepancy found
  - [ ] ALL critical and major discrepancies fixed
  - [ ] ALL minor discrepancies fixed
  - [ ] Zero hardcoded hex/rgb color values in any component file (all use CSS custom properties or Tailwind tokens)
  - [ ] Every component has dark mode styling that matches DESIGN_SPEC.md dark theme
  - [ ] `npm run build` succeeds after all fixes
  - [ ] `npx tsc --noEmit` reports no errors after all fixes
  - [ ] Cross-component consistency verified (spacing, radius, typography, interactive states)

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Login page matches DESIGN_SPEC.md (light mode)
    Tool: Playwright
    Preconditions: App running with mock server, NOT logged in
    Steps:
      1. Navigate to /login
      2. Set viewport to 1280×800 (desktop)
      3. Screenshot full page
      4. Verify login form is vertically and horizontally centered (check computed position)
      5. Verify input fields have correct height (check element.boundingBox().height against DESIGN_SPEC value)
      6. Verify primary button has correct background color (getComputedStyle → backgroundColor matches design token)
      7. Verify font sizes on labels, inputs, button text match DESIGN_SPEC
    Expected Result: All visual properties match DESIGN_SPEC.md specifications exactly
    Failure Indicators: Any computed style value deviates from DESIGN_SPEC by >2px or wrong color
    Evidence: .sisyphus/evidence/task-37-login-light-desktop.png

  Scenario: Login page matches DESIGN_SPEC.md (dark mode)
    Tool: Playwright
    Preconditions: App running with mock server, NOT logged in, dark mode enabled via localStorage or system preference
    Steps:
      1. Navigate to /login
      2. Set prefers-color-scheme: dark via page.emulateMedia({ colorScheme: 'dark' })
      3. Screenshot full page
      4. Verify background color matches dark theme token from DESIGN_SPEC
      5. Verify input field backgrounds, borders, text colors match dark theme
      6. Verify button colors match dark theme
    Expected Result: Dark mode colors all match DESIGN_SPEC.md dark theme section
    Failure Indicators: Any element using light-mode colors in dark mode, or wrong dark-mode tokens
    Evidence: .sisyphus/evidence/task-37-login-dark-desktop.png

  Scenario: App shell layout proportions correct (desktop)
    Tool: Playwright
    Preconditions: Logged in, viewport 1280×800, at least 1 conversation exists
    Steps:
      1. Navigate to main chat page
      2. Measure sidebar width via sidebar.boundingBox().width — compare to DESIGN_SPEC value
      3. Measure header height via header.boundingBox().height — compare to DESIGN_SPEC value
      4. Measure chat area width = viewport width - sidebar width — verify proportions
      5. Verify padding/gaps between sidebar and chat area
      6. Screenshot
    Expected Result: Sidebar width, header height, chat area proportions all match DESIGN_SPEC.md within 2px
    Failure Indicators: Layout dimensions off by >2px from spec, elements overlapping, wrong proportions
    Evidence: .sisyphus/evidence/task-37-shell-layout-desktop.png

  Scenario: Message display styling correct
    Tool: Playwright
    Preconditions: Logged in, conversation open with at least 3 messages (user + AI), mock server running
    Steps:
      1. Navigate to conversation with messages
      2. Measure user message bubble max-width — compare to DESIGN_SPEC
      3. Measure AI message bubble max-width — compare to DESIGN_SPEC
      4. Verify user vs AI message color differentiation matches DESIGN_SPEC
      5. Verify message padding, border-radius, spacing between messages
      6. Check timestamp font-size and placement
      7. Screenshot the message thread
    Expected Result: Message bubbles match DESIGN_SPEC in width, padding, colors, radius, spacing
    Failure Indicators: Bubbles wrong width, wrong colors, wrong spacing, timestamps missing or misplaced
    Evidence: .sisyphus/evidence/task-37-messages-styling.png

  Scenario: Sidebar conversation list styling correct
    Tool: Playwright
    Preconditions: Logged in, 5+ conversations exist, viewport 1280×800
    Steps:
      1. Navigate to main page
      2. Verify conversation list item height matches DESIGN_SPEC
      3. Click a conversation — verify active state styling (background color, text color)
      4. Hover another conversation — verify hover state styling
      5. Verify text truncation on long conversation titles
      6. Verify New Conversation button dimensions and styling
      7. Screenshot sidebar
    Expected Result: All sidebar items match DESIGN_SPEC for dimensions, colors, states
    Failure Indicators: Wrong item height, missing hover/active states, no text truncation, button wrong size
    Evidence: .sisyphus/evidence/task-37-sidebar-styling.png

  Scenario: Input area styling correct
    Tool: Playwright
    Preconditions: Logged in, conversation open, viewport 1280×800
    Steps:
      1. Focus the message input textarea
      2. Verify textarea min-height and max-height match DESIGN_SPEC
      3. Verify textarea padding, border color, border-radius
      4. Verify focus ring appearance matches DESIGN_SPEC
      5. Verify send button size, position, and icon sizing
      6. Type a long message — verify textarea grows correctly up to max-height
      7. Screenshot input area (unfocused and focused)
    Expected Result: Input area matches DESIGN_SPEC in all dimensions and states
    Failure Indicators: Wrong heights, wrong padding, missing focus ring, button mispositioned
    Evidence: .sisyphus/evidence/task-37-input-area-styling.png

  Scenario: Mobile layout matches DESIGN_SPEC.md
    Tool: Playwright
    Preconditions: Logged in, viewport 375×667 (iPhone SE)
    Steps:
      1. Navigate to main chat page at mobile viewport
      2. Verify sidebar is hidden by default (not overlapping content)
      3. Open sidebar — verify it renders as full-screen overlay per DESIGN_SPEC
      4. Verify all touch targets >= 44x44px (measure button/link boundingBox dimensions)
      5. Verify input area is pinned to viewport bottom
      6. Verify message bubbles have appropriate mobile padding/width
      7. Screenshot mobile layout (sidebar closed), (sidebar open), (chat view)
    Expected Result: Mobile layout matches every DESIGN_SPEC mobile breakpoint specification
    Failure Indicators: Sidebar not full-screen, touch targets too small, input not pinned, wrong sizing
    Evidence: .sisyphus/evidence/task-37-mobile-layout.png

  Scenario: Dark mode consistency across all components
    Tool: Playwright
    Preconditions: Logged in, dark mode enabled, viewport 1280×800, conversation with messages open
    Steps:
      1. Enable dark mode via page.emulateMedia({ colorScheme: 'dark' })
      2. Screenshot full app (sidebar + chat + header + input)
      3. Verify NO light-mode background flashes (all containers have dark backgrounds)
      4. Verify text is legible (light text on dark backgrounds, sufficient contrast)
      5. Verify sidebar, header, chat area, input all use correct dark tokens
      6. Verify code blocks in messages have dark-mode Shiki theme
    Expected Result: Entire app uses correct dark mode tokens with no light-mode remnants
    Failure Indicators: White/light backgrounds showing, unreadable text, inconsistent dark colors
    Evidence: .sisyphus/evidence/task-37-dark-mode-full.png

  Scenario: CSS token audit — no hardcoded colors
    Tool: Bash (grep)
    Preconditions: Codebase built successfully
    Steps:
      1. Run: grep -rn '#[0-9a-fA-F]\{3,8\}' src/lib/components/ src/routes/ --include='*.svelte' --include='*.css' | grep -v 'app.css' | grep -v node_modules
      2. Run: grep -rn 'rgb\|rgba\|hsl\|hsla' src/lib/components/ src/routes/ --include='*.svelte' --include='*.css' | grep -v 'app.css' | grep -v node_modules
      3. If any results found, these are hardcoded color violations — list them
    Expected Result: Zero hardcoded color values in component files (all in app.css or via Tailwind tokens)
    Failure Indicators: Any grep match = hardcoded color that must use a CSS variable/Tailwind token instead
    Evidence: .sisyphus/evidence/task-37-color-audit.txt
  ```

  **Evidence to Capture:**
  - [ ] task-37-login-light-desktop.png — Login page screenshot (light mode)
  - [ ] task-37-login-dark-desktop.png — Login page screenshot (dark mode)
  - [ ] task-37-shell-layout-desktop.png — App shell layout screenshot
  - [ ] task-37-messages-styling.png — Message display screenshot
  - [ ] task-37-sidebar-styling.png — Sidebar list screenshot
  - [ ] task-37-input-area-styling.png — Input area screenshot
  - [ ] task-37-mobile-layout.png — Mobile layout screenshots
  - [ ] task-37-dark-mode-full.png — Full app dark mode screenshot
  - [ ] task-37-color-audit.txt — Grep results for hardcoded colors

  **Commit**: YES (group: commit 14)
  - Message: `fix(ui): comprehensive design reinspection — fix all visual discrepancies per DESIGN_SPEC.md`
  - Files: `src/lib/components/**/*.svelte, src/routes/**/*.svelte, src/app.css, tailwind.config.ts`
  - Pre-commit: `npm run build && npx tsc --noEmit`

 - [x] 38. Comprehensive Codebase Testing — Full Syntax + Runtime Verification Against Plan

  > **THOROUGH TESTING PASS**
  > This task systematically verifies the ENTIRE codebase works correctly: TypeScript compiles, linting passes, the build succeeds, Vitest unit/integration tests pass, and Playwright E2E tests execute the full user journey — ALL against the mocked Langflow server. Every feature from the original plan is tested to confirm it actually functions, not just exists.

  **What to do**:

  **Phase 1 — Static Analysis (syntax + type correctness)**:
  1. Run `npx tsc --noEmit` — fix EVERY TypeScript error. Zero errors allowed. Do not suppress with `@ts-ignore` or `as any` — fix root causes
  2. Run `npm run lint` — fix EVERY linting error and warning. Zero warnings allowed
  3. Run `npm run build` — verify production build succeeds. Fix any build errors (import resolution, missing modules, SSR issues)
  4. Verify all imports resolve correctly: no circular dependencies, no missing modules, no unused imports
  5. Verify all `.env.example` variables are documented and match what the code actually reads

  **Phase 2 — Unit/Integration Test Execution (Vitest)**:
  6. Start the mock Langflow server (`tests/mocks/langflow-server.ts`) and mock nemotron-nano server
  7. Run `npm test` (Vitest) — execute ALL unit and integration tests
  8. For EACH failing test:
     a. Read the test to understand what it expects
     b. Read the implementation to understand what it does
     c. Determine if the bug is in the test or implementation
     d. Fix the actual bug (prefer fixing implementation; only fix test if the test expectation is wrong per the plan)
  9. Re-run `npm test` until ALL tests pass with zero failures
  10. Review test coverage — verify each major feature has corresponding tests:
      - Auth (login, logout, session validation, route guards)
      - Conversation CRUD (create, list, get, delete, rename)
      - Langflow client (non-streaming request, error handling)
      - Title generation service
      - Markdown rendering
      - SSE streaming (English path)
      - Webhook receiver + bridge (Hungarian path)
      - Error handling (timeouts, network errors, retries)

  **Phase 3 — E2E Test Execution (Playwright)**:
  11. Verify Playwright config (`playwright.config.ts`) is correct: base URL, timeout, project browsers, webServer command
  12. Ensure mock servers are configured to start automatically (via Playwright's `webServer` config or globalSetup)
  13. Run `npx playwright test` — execute ALL E2E test specs
  14. For EACH failing E2E test:
      a. Read the test spec to understand the expected user journey
      b. Use Playwright's trace/screenshot output to diagnose the failure
      c. Determine if failure is: wrong selector, timing issue, missing mock data, or actual implementation bug
      d. Fix the root cause (update selectors, add waits, fix mock data, or fix implementation)
  15. Re-run `npx playwright test` until ALL E2E tests pass
  16. E2E tests should cover these user journeys (verify they exist; write missing ones):
      - Login flow (valid credentials → redirect to chat)
      - Login failure (invalid credentials → error message)
      - Logout flow (session cleared → redirect to login)
      - Route guard (unauthenticated → redirect to login)
      - Create new conversation (sidebar updates, conversation opens)
      - Send message and receive non-streaming response (via mock Langflow)
      - Send message and receive English SSE streaming response (via mock Langflow)
      - Conversation list (shows titles, click switches conversation)
      - Delete conversation (confirmation → removed from sidebar)
      - Rename conversation (inline edit → title updates)
      - Dark/light mode toggle (persists across navigation)
      - Markdown rendering (code blocks with syntax highlighting, copy button)
      - Loading indicator appears during response wait
      - Error handling (mock server timeout → error message displayed)
      - Responsive layout (mobile viewport → sidebar hidden, hamburger menu)

  **Phase 4 — Plan Compliance Verification**:
  17. Cross-reference every "Must Have" from the plan's Work Objectives against actual running behavior:
      - Authentication with bcrypt + httpOnly cookies → test login API, verify Set-Cookie header
      - Conversation management with SQLite → test CRUD endpoints, verify DB file created
      - Markdown with Shiki highlighting → send message with code block, verify syntax colored
      - English SSE streaming → test stream endpoint, verify chunked response
      - Hungarian non-streaming → test with Hungarian language param, verify full response
      - Title auto-generation → send first message, verify title appears after response
      - File upload placeholder → verify button visible but disabled
      - Dark/light mode → toggle, verify theme applies to all components
  18. Cross-reference every "Must NOT Have" to verify nothing forbidden was built:
      - No message content stored in SQLite (only metadata)
      - No file upload implementation (button is placeholder only)
      - No WebSocket usage (SSE only)
      - No admin panel/UI
      - No external auth libraries (custom bcrypt only)

  **Phase 5 — Fix and Re-verify Loop**:
  19. After all fixes, run the complete verification sequence one final time:
      ```
      npx tsc --noEmit && npm run lint && npm run build && npm test && npx playwright test
      ```
  20. ALL five commands must pass with zero errors/failures before this task is complete

  **Must NOT do**:
  - Do NOT skip any failing test — every failure must be investigated and fixed
  - Do NOT suppress TypeScript errors with `@ts-ignore`, `as any`, or `// eslint-disable` — fix root causes
  - Do NOT delete or skip tests to make the suite pass — fix the underlying code
  - Do NOT start a real Langflow server — all tests use mocked services from `tests/mocks/`
  - Do NOT modify DESIGN_SPEC.md or the plan file
  - Do NOT add features not in the plan — this is a testing/fixing pass, not a feature pass
  - Do NOT change visual styling (that's Task 37's job) unless a test reveals a CSS import error or build breakage

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: This task requires systematic debugging, reading test output, tracing failures to root causes, fixing implementation bugs — deep analytical work across the full codebase. Not quick fixes but thorough investigation.
  - **Skills**: [`playwright`]
    - `playwright`: Required for running and debugging Playwright E2E tests, capturing traces, fixing selectors and timing issues
  - **Skills Evaluated but Omitted**:
    - `frontend-ui-ux`: Not needed — this is testing/debugging, not design work
    - `dev-browser`: Not needed — Playwright skill covers all browser test automation

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 8 (sequential — must complete after Task 37, before F1-F4)
  - **Blocks**: F1-F4
  - **Blocked By**: Task 37 (design fixes must be complete before full test pass)

  **References** (CRITICAL — Be Exhaustive):

  **Plan Reference (source of truth for feature requirements)**:
  - `.sisyphus/plans/langflow-chat-ui.md` — Read the "Work Objectives" section (Must Have / Must NOT Have) and each task's "What to do" for expected behavior

  **Test Infrastructure References**:
  - `vitest.config.ts` or `vite.config.ts` — Vitest configuration, test environment settings
  - `playwright.config.ts` — Playwright configuration, base URL, browser projects, webServer setup
  - `package.json` — Test scripts (`test`, `test:e2e`), dependencies

  **Mock Server References**:
  - `tests/mocks/langflow-server.ts` — Mock Langflow REST API (non-streaming + SSE streaming responses)
  - `tests/mocks/nemotron-server.ts` or similar — Mock nemotron-nano for title generation
  - `tests/mocks/webhook-sender.ts` — Utility for simulating Hungarian webhook POSTs

  **Unit/Integration Test References**:
  - `src/**/*.test.ts` — All Vitest test files (auth, conversations, langflow client, streaming, etc.)
  - `src/lib/server/services/langflow.ts` — Langflow client (verify tests cover all methods)
  - `src/lib/server/services/title-generator.ts` — Title generation (verify tests cover success + failure)
  - `src/hooks.server.ts` — Auth hooks (verify tests cover protected + public routes)

  **E2E Test References**:
  - `tests/e2e/**/*.spec.ts` — All Playwright E2E specs
  - `tests/e2e/auth.spec.ts` — Login/logout/guard flows
  - `tests/e2e/chat.spec.ts` — Message send/receive flows
  - `tests/e2e/conversations.spec.ts` — CRUD flows
  - `tests/e2e/streaming.spec.ts` — SSE streaming flows
  - `tests/e2e/mobile-design.spec.ts` — Mobile responsive tests

  **WHY Each Reference Matters**:
  - Plan file: The ultimate source of truth — every test assertion must trace back to a plan requirement
  - Mock servers: Tests MUST use these, not real Langflow — this is a dev environment constraint
  - Test files: These are what get executed — failures here are what this task fixes
  - Source files: When tests fail, these are where bugs live and get fixed

  **Acceptance Criteria**:
  - [ ] `npx tsc --noEmit` exits 0 — zero TypeScript errors
  - [ ] `npm run lint` exits 0 — zero linting errors or warnings
  - [ ] `npm run build` exits 0 — production build succeeds
  - [ ] `npm test` exits 0 — ALL Vitest tests pass (zero failures, zero skipped)
  - [ ] `npx playwright test` exits 0 — ALL Playwright E2E tests pass (zero failures, zero skipped)
  - [ ] Every "Must Have" feature verified to function (not just exist)
  - [ ] Every "Must NOT Have" verified absent
  - [ ] All tests run against mocked Langflow server (zero real API calls)
  - [ ] Complete verification sequence passes in one clean run: `npx tsc --noEmit && npm run lint && npm run build && npm test && npx playwright test`

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Full static analysis passes clean
    Tool: Bash
    Preconditions: All Task 37 design fixes applied
    Steps:
      1. Run: npx tsc --noEmit 2>&1
      2. Assert exit code 0 and zero lines containing "error TS"
      3. Run: npm run lint 2>&1
      4. Assert exit code 0 and zero lines containing "error" or "warning"
      5. Run: npm run build 2>&1
      6. Assert exit code 0 and build/ directory exists with index.js
    Expected Result: All three commands pass with zero errors
    Failure Indicators: Non-zero exit code, error messages in output, missing build artifacts
    Evidence: .sisyphus/evidence/task-38-static-analysis.txt

  Scenario: All Vitest unit/integration tests pass
    Tool: Bash
    Preconditions: Mock servers available, dependencies installed
    Steps:
      1. Run: npm test -- --reporter=verbose 2>&1
      2. Capture full output including test names and results
      3. Assert exit code 0
      4. Assert output contains "0 failed"
      5. Assert output does NOT contain "0 passed" (i.e., tests actually ran)
      6. Count total tests passed — verify reasonable coverage (expect 20+ tests minimum)
    Expected Result: All Vitest tests pass, zero failures, zero skipped
    Failure Indicators: Non-zero exit code, any line with "FAIL", "0 passed" (no tests found)
    Evidence: .sisyphus/evidence/task-38-vitest-results.txt

  Scenario: All Playwright E2E tests pass
    Tool: Bash
    Preconditions: App built, mock servers configured in playwright.config.ts webServer
    Steps:
      1. Run: npx playwright test --reporter=list 2>&1
      2. Capture full output including test names and results
      3. Assert exit code 0
      4. Assert output shows "passed" for all test cases
      5. Assert zero "failed" test cases
      6. Verify test count covers key journeys (expect 10+ E2E tests minimum)
    Expected Result: All Playwright E2E tests pass, zero failures
    Failure Indicators: Non-zero exit code, any test marked "failed", timeout errors
    Evidence: .sisyphus/evidence/task-38-playwright-results.txt

  Scenario: Login → chat → send message → receive response (full integration)
    Tool: Playwright
    Preconditions: App running with mock Langflow server
    Steps:
      1. Navigate to /login
      2. Fill email: "admin@local", password: "admin123"
      3. Click login button
      4. Assert redirect to chat page (URL contains /chat or /(app))
      5. Click "New Conversation" button
      6. Type "Hello, how are you?" in message input
      7. Press Enter or click send button
      8. Wait for response message to appear (max 10s timeout)
      9. Assert response message element exists and contains text (not empty)
      10. Assert loading indicator appeared and then disappeared
      11. Assert conversation appears in sidebar with a title
      12. Screenshot final state
    Expected Result: Complete user journey works end-to-end with mocked backend
    Failure Indicators: Login fails, redirect doesn't happen, message not sent, no response, sidebar empty
    Evidence: .sisyphus/evidence/task-38-full-integration.png

  Scenario: SSE streaming response renders incrementally
    Tool: Playwright
    Preconditions: App running, logged in, mock Langflow server configured to return SSE stream
    Steps:
      1. Navigate to active conversation
      2. Send a message that triggers English SSE streaming (per mock config)
      3. Assert streaming indicator appears
      4. Wait for response to start appearing
      5. Assert response text grows incrementally (poll text content at 500ms intervals, verify it increases)
      6. Wait for stream to complete
      7. Assert final message is fully rendered with markdown formatting
      8. Screenshot during streaming and after completion
    Expected Result: Response streams in visibly, text grows incrementally, final render is complete
    Failure Indicators: Response appears all at once (not streaming), empty response, rendering errors
    Evidence: .sisyphus/evidence/task-38-sse-streaming.png

  Scenario: Error handling — mock server timeout
    Tool: Playwright
    Preconditions: App running, logged in, mock Langflow server configured with delay > timeout threshold
    Steps:
      1. Configure mock to delay response by 60s (or beyond app's timeout setting)
      2. Send a message
      3. Wait for timeout to trigger (watch for loading indicator to change to error state)
      4. Assert error message is displayed to user (not a blank screen or frozen state)
      5. Assert error message is user-friendly (not a raw stack trace)
      6. Assert user can still interact — type a new message, navigate sidebar
      7. Screenshot the error state
    Expected Result: Graceful timeout handling with user-friendly error message, app remains interactive
    Failure Indicators: Frozen UI, raw error displayed, app becomes unresponsive, no error message shown
    Evidence: .sisyphus/evidence/task-38-error-timeout.png

  Scenario: Dark/light mode persists across navigation
    Tool: Playwright
    Preconditions: Logged in, default theme active
    Steps:
      1. Note current theme (check body class or CSS variable values)
      2. Toggle theme via dark/light mode button
      3. Assert theme changed (body class or CSS variables updated)
      4. Navigate to a different conversation
      5. Assert theme is still the toggled value (persisted)
      6. Reload the page
      7. Assert theme is still the toggled value (persisted via localStorage/cookie)
      8. Screenshot before toggle, after toggle, and after reload
    Expected Result: Theme toggle works, persists across navigation and page reload
    Failure Indicators: Theme reverts on navigation, theme lost on reload, toggle button doesn't work
    Evidence: .sisyphus/evidence/task-38-theme-persistence.png

  Scenario: Final clean verification sequence
    Tool: Bash
    Preconditions: All fixes from this task applied
    Steps:
      1. Run: npx tsc --noEmit && npm run lint && npm run build && npm test && npx playwright test 2>&1
      2. Assert exit code 0 for the entire chained command
      3. Capture full output
      4. Verify no errors, warnings, or failures in any step
    Expected Result: Complete verification chain passes in one clean run
    Failure Indicators: Any non-zero exit code, any error/failure in any step
    Evidence: .sisyphus/evidence/task-38-final-verification.txt
  ```

  **Evidence to Capture:**
  - [ ] task-38-static-analysis.txt — tsc + lint + build output
  - [ ] task-38-vitest-results.txt — Full Vitest test output
  - [ ] task-38-playwright-results.txt — Full Playwright test output
  - [ ] task-38-full-integration.png — Login → chat → message E2E screenshot
  - [ ] task-38-sse-streaming.png — SSE streaming in action screenshot
  - [ ] task-38-error-timeout.png — Error handling screenshot
  - [ ] task-38-theme-persistence.png — Theme toggle + persistence screenshot
  - [ ] task-38-final-verification.txt — Complete chained verification output

  **Commit**: YES (group: commit 15)
  - Message: `test(all): comprehensive codebase testing — fix all syntax errors and test failures`
  - Files: `src/**/*.ts, src/**/*.svelte, tests/**/*.ts, tests/**/*.spec.ts`
  - Pre-commit: `npx tsc --noEmit && npm run lint && npm run build && npm test && npx playwright test`

---

- [ ] 39. Translation Pipeline Toggle Button

  **What to do**:
  - Create `src/lib/stores/settings.ts` — settings store for user preferences:
    ```typescript
    type TranslationState = 'enabled' | 'disabled';
    
    // Persisted to localStorage, defaults to 'enabled'
    export const translationState = writable<TranslationState>('enabled');
    
    // Initialize from localStorage on mount
    export function initSettings(): void {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('translationState');
        if (stored === 'enabled' || stored === 'disabled') {
          translationState.set(stored);
        }
      }
    }
    
    export function setTranslationState(state: TranslationState): void {
      translationState.set(state);
      if (typeof window !== 'undefined') {
        localStorage.setItem('translationState', state);
      }
    }
    ```
  - Create `src/lib/components/chat/TranslationToggle.svelte`:
    - Icon button with globe/language icon (SVG or Unicode 🌐)
    - Positioned in the message input bar, **to the left of the file attachment button**
    - Two states: enabled (accent color) and disabled (muted color)
    - Tooltip: "Translation enabled" / "Translation disabled"
    - Click toggles state and persists to localStorage
    - Visual feedback: filled globe when enabled, outlined or crossed-out globe when disabled
    - Style matching DESIGN_SPEC.md: `--text-secondary` default, `--accent` when active, 44x44px touch target
  - Integrate into `MessageInput.svelte`:
    - Import `TranslationToggle` component
    - Place it in the `.composer-actions` div, to the left of the file attachment button
    - The toggle does NOT dispatch events — the parent chat page reads the store directly
  - Create `src/lib/types.ts` — add type:
    ```typescript
    export type TranslationState = 'enabled' | 'disabled';
    export type ModelId = 'model1' | 'model2';
    ```
  - Write test `src/lib/stores/settings.test.ts`:
    - Test: default state is 'enabled'
    - Test: setTranslationState updates store
    - Test: state persists to localStorage (mock localStorage)
  - Write test `src/lib/components/chat/TranslationToggle.test.ts`:
    - Test: component renders with globe icon
    - Test: click toggles state
    - Test: tooltip shows correct state text

  **Must NOT do**:
  - Do NOT store translation preference in the database (localStorage only)
  - Do NOT add per-conversation translation settings (out of scope)
  - Do NOT add any backend integration in this task (Task 40 handles that)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with toggle state, icon styling, tooltip — primarily visual work
  - **Skills**: [`playwright`]
    - `playwright`: For verifying toggle interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 40)
  - **Parallel Group**: Wave 9
  - **Blocks**: None
  - **Blocked By**: Task 15 (needs MessageInput component to integrate into)

  **References**:

  **Pattern References**:
  - `src/lib/components/chat/MessageInput.svelte` (Task 15) — integration point, button placement
  - `src/lib/stores/theme.ts` (Task 11) — pattern for localStorage persistence

  **Design Spec References**:
  - `DESIGN_SPEC.md:310-312` — File attachment button placement; translation toggle goes to its left
  - `DESIGN_SPEC.md:241-243` — Touch targets: 44×44px minimum on mobile
  - `DESIGN_SPEC.md:346` — Icon buttons: 36×36px (desktop), 44×44px (mobile)

  **WHY Each Reference Matters**:
  - MessageInput.svelte defines the `.composer-actions` container — toggle must be placed correctly
  - Theme store shows the proven pattern for localStorage persistence in SvelteKit
  - DESIGN_SPEC.md defines exact sizing for icon buttons

  **Acceptance Criteria**:
  - [ ] Translation toggle button visible in message input bar (left of file icon)
  - [ ] Clicking toggle switches between enabled/disabled states
  - [ ] State persists across page refreshes (localStorage)
  - [ ] Icon visual feedback indicates current state
  - [ ] Tooltip shows "Translation enabled" / "Translation disabled"
  - [ ] Touch target is 44×44px on mobile
  - [ ] `npm test -- settings` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Translation toggle shows and changes state
    Tool: Playwright
    Preconditions: Logged in, on conversation page
    Steps:
      1. Assert translation toggle button visible (selector: `[data-testid="translation-toggle"]`)
      2. Assert initial state shows "Translation enabled" tooltip
      3. Click the toggle
      4. Assert tooltip changes to "Translation disabled"
      5. Assert icon styling changed (check CSS class or style)
      6. Screenshot both states
    Expected Result: Toggle works with visual feedback
    Failure Indicators: No toggle visible, click doesn't change state, no tooltip
    Evidence: .sisyphus/evidence/task-39-translation-toggle.png

  Scenario: Translation state persists across refresh
    Tool: Playwright
    Preconditions: Logged in
    Steps:
      1. Click toggle to disable translation
      2. Reload the page
      3. Assert toggle still shows disabled state
      4. Assert localStorage has translationState=disabled
    Expected Result: Preference remembered after refresh
    Failure Indicators: State resets to enabled
    Evidence: .sisyphus/evidence/task-39-translation-persist.png
  ```

  **Commit**: YES (group: commit 16)
  - Message: `feat(settings): add translation pipeline toggle button in message input`
  - Files: `src/lib/stores/settings.ts, src/lib/components/chat/TranslationToggle.svelte, src/lib/components/chat/MessageInput.svelte, src/lib/types.ts, src/lib/stores/settings.test.ts, src/lib/components/chat/TranslationToggle.test.ts`
  - Pre-commit: `npm test -- settings && npm run build`

---

- [ ] 40. Model Selection Feature (2 Fixed Models via .env)

  **What to do**:
  - Update `src/lib/server/env.ts` — add model configuration variables:
    ```typescript
    interface ModelConfig {
      baseUrl: string;
      apiKey: string;
      modelName: string;
      displayName: string;
    }
    
    // Add to Config interface:
    model1: ModelConfig;
    model2: ModelConfig;
    ```
  - Update `.env.example` with new variables:
    ```
    # Model 1 Configuration
    MODEL_1_BASEURL=http://192.168.1.96:30001/v1
    MODEL_1_API_KEY=your-api-key-here
    MODEL_1_NAME=nemotron-nano
    MODEL_1_DISPLAY_NAME=Nemotron Nano
    
    # Model 2 Configuration
    MODEL_2_BASEURL=http://192.168.1.96:30002/v1
    MODEL_2_API_KEY=your-api-key-here
    MODEL_2_NAME=translategemma
    MODEL_2_DISPLAY_NAME=TranslateGemma
    ```
  - Create `src/lib/components/chat/ModelSelector.svelte`:
    - Dropdown or segmented control for model selection
    - Positioned in the message input bar, **to the left of the translation toggle**
    - Shows the two model display names from config
    - Default selection: Model 1
    - Selection persists to localStorage (`selectedModel: 'model1' | 'model2'`)
    - Compact design: icon + dropdown on click, or two inline toggle buttons
    - Style matching DESIGN_SPEC.md
  - Add to `src/lib/stores/settings.ts`:
    ```typescript
    export const selectedModel = writable<ModelId>('model1');
    
    export function initModelSelection(): void {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('selectedModel');
        if (stored === 'model1' || stored === 'model2') {
          selectedModel.set(stored);
        }
      }
    }
    
    export function setSelectedModel(model: ModelId): void {
      selectedModel.set(model);
      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedModel', model);
      }
    }
    ```
  - Create API endpoint `src/routes/api/models/+server.ts`:
    - GET: returns available models with display names
    ```json
    {
      "models": [
        { "id": "model1", "displayName": "Nemotron Nano" },
        { "id": "model2", "displayName": "TranslateGemma" }
      ]
    }
    ```
  - Integrate into `MessageInput.svelte`:
    - Import `ModelSelector` component
    - Place in `.composer-actions`, left of translation toggle
    - The selector updates the store — parent chat page reads it
  - Update `src/lib/server/services/langflow.ts`:
    - Add function to get model config by ID:
    ```typescript
    export function getModelConfig(modelId: 'model1' | 'model2'): ModelConfig {
      return modelId === 'model1' ? config.model1 : config.model2;
    }
    ```
    - Modify `sendMessage` and `sendMessageStream` to accept optional `modelId` parameter
    - Route to the correct model endpoint based on selection
  - Write test `src/lib/stores/settings.test.ts` (add to existing):
    - Test: default model is 'model1'
    - Test: setSelectedModel updates store
    - Test: model selection persists to localStorage
  - Write test `src/routes/api/models/models.test.ts`:
    - Test: GET returns two models with display names

  **Must NOT do**:
  - Do NOT add more than 2 models (user specified 2 fixed models)
  - Do NOT add dynamic model configuration (no admin UI)
  - Do NOT store model preference in database (localStorage only)
  - Do NOT integrate translation bypass logic here (separate concern)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: Dropdown/selector UI component + styling + localStorage persistence
  - **Skills**: [`playwright`]
    - `playwright`: For verifying model selection interaction

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 39)
  - **Parallel Group**: Wave 9
  - **Blocks**: None
  - **Blocked By**: Task 15 (needs MessageInput component to integrate into)

  **References**:

  **Pattern References**:
  - `src/lib/components/chat/MessageInput.svelte` (Task 15) — integration point
  - `src/lib/components/chat/TranslationToggle.svelte` (Task 39) — similar pattern for settings persistence
  - `src/lib/server/env.ts` (Task 2) — config module to extend
  - `src/lib/server/services/langflow.ts` (Task 12) — API client to modify for model routing

  **Design Spec References**:
  - `DESIGN_SPEC.md:310-312` — Button placement in input bar
  - `DESIGN_SPEC.md:241-243` — Touch targets: 44×44px minimum

  **WHY Each Reference Matters**:
  - env.ts already defines the config pattern — extend with model configs
  - langflow.ts handles API calls — must route to correct model endpoint
  - TranslationToggle shows the pattern for localStorage persistence

  **Acceptance Criteria**:
  - [ ] Two model options visible in selector (display names from .env)
  - [ ] Default selection is Model 1
  - [ ] Selection persists across page refreshes (localStorage)
  - [ ] GET `/api/models` returns model list with display names
  - [ ] `npm test -- settings` → all tests pass
  - [ ] `npm test -- models` → all tests pass

  **QA Scenarios (MANDATORY)**:

  ```
  Scenario: Model selector shows two options
    Tool: Playwright
    Preconditions: Logged in, on conversation page
    Steps:
      1. Assert model selector visible (selector: `[data-testid="model-selector"]`)
      2. Click the selector to open dropdown
      3. Assert two options visible with display names from config
      4. Assert Model 1 is selected by default
      5. Screenshot
    Expected Result: Model selector with two options
    Failure Indicators: No selector, wrong number of options, no default
    Evidence: .sisyphus/evidence/task-40-model-selector.png

  Scenario: Model selection persists
    Tool: Playwright
    Preconditions: Logged in
    Steps:
      1. Click model selector, select Model 2
      2. Assert Model 2 is now selected
      3. Reload page
      4. Assert Model 2 is still selected
      5. Assert localStorage has selectedModel=model2
    Expected Result: Selection remembered after refresh
    Failure Indicators: Resets to Model 1
    Evidence: .sisyphus/evidence/task-40-model-persist.png

  Scenario: Models API returns correct data
    Tool: Bash (curl)
    Preconditions: Server running
    Steps:
      1. Run: `curl -s http://localhost:5173/api/models`
      2. Parse JSON response
      3. Assert `models` array has 2 items
      4. Assert each item has `id` and `displayName`
      5. Assert display names match .env config
    Expected Result: API returns model configuration
    Failure Indicators: Wrong format, missing fields, wrong names
    Evidence: .sisyphus/evidence/task-40-models-api.txt
  ```

  **Commit**: YES (group: commit 16)
  - Message: `feat(settings): add translation pipeline toggle button in message input`
  - Files: `src/lib/server/env.ts, .env.example, src/lib/components/chat/ModelSelector.svelte, src/lib/components/chat/MessageInput.svelte, src/lib/stores/settings.ts, src/routes/api/models/+server.ts, src/lib/server/services/langflow.ts, src/routes/api/models/models.test.ts`
  - Pre-commit: `npm test -- settings && npm test -- models && npm run build`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.
> **Task 38 has already verified runtime tests pass.** Final wave performs independent audits.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, check exports, validate structure). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Verify all task deliverables exist as files. Compare against plan requirements. Verify Task 37-40 evidence files exist in `.sisyphus/evidence/task-{N}-*`.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | Evidence [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npx tsc --noEmit` + `npm run lint` + `npm run build`. Run `npm test` and `npx playwright test` to confirm Task 38's fixes hold. Review all changed files for: `as any`/`@ts-ignore`, empty catches, console.log in prod, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names (data/result/item/temp). Verify all `.env.example` vars are documented (including new MODEL_1_* and MODEL_2_* vars).
  Output: `Build [PASS/FAIL] | Lint [PASS/FAIL] | Tests [PASS/FAIL] | E2E [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Full QA — Playwright End-to-End Verification** — `unspecified-high`
  Run the complete Playwright test suite. Additionally, manually execute key user journeys via Playwright to verify beyond scripted tests: login → create conversation → send message → receive streamed response → toggle translation → select model → toggle dark mode → delete conversation → logout. Verify mock servers are used (no real API calls). Capture screenshots at each step. Cross-reference Task 37 design evidence screenshots — confirm visual quality is acceptable.
  Output: `Playwright Suite [PASS/FAIL] | Manual Journeys [N/N] | Visual Quality [PASS/FAIL] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task (including 37-40): read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built (no missing), nothing beyond spec was built (no creep). Check "Must NOT Have" compliance: no message content in SQLite, no file upload logic, no export, no WebSocket, no admin UI, no auth libraries. Verify Tasks 39-40 only added UI toggle/selector and localStorage persistence, no backend logic changes beyond model config routing. Detect unaccounted changes.
  Output: `Tasks [N/N compliant] | Forbidden [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

> **Pre-commit checks for Tasks 1-36 are STATIC ONLY**: `npm run build`, `npx tsc --noEmit`, `npm run lint`
> **Task 38 commit includes FULL runtime verification**: `npm test`, `npx playwright test` (all against mocked Langflow)

| # | Commit Message | Files | Pre-commit Check |
|---|---|---|---|
| 1 | `init: scaffold SvelteKit project with TypeScript, Tailwind, adapter-node` | package.json, svelte.config.js, tailwind.config.ts, tsconfig.json, .env.example, src/app.html, src/app.css | `npm run build` |
| 2 | `feat(db): add SQLite schema with Drizzle ORM and seed script` | src/lib/server/db/*, drizzle.config.ts, scripts/seed-user.ts | `npx tsc --noEmit` |
| 3 | `feat(auth): add login/logout with session cookies and route guards` | src/routes/login/*, src/routes/api/auth/*, src/hooks.server.ts | `npx tsc --noEmit && npm run lint` |
| 4 | `feat(layout): add app shell with sidebar, chat area, and dark mode` | src/routes/(app)/+layout.svelte, src/lib/components/layout/*, src/lib/stores/* | `npm run build` |
| 5 | `feat(conversations): add conversation CRUD and sidebar list` | src/routes/api/conversations/*, src/lib/components/sidebar/* | `npx tsc --noEmit && npm run lint` |
| 6 | `feat(chat): add non-streaming message send/receive via Langflow` | src/lib/server/services/langflow.ts, src/routes/(app)/chat/*, src/lib/components/chat/* | `npx tsc --noEmit && npm run lint` |
| 7 | `feat(markdown): add Markdown rendering with Shiki syntax highlighting` | src/lib/components/chat/MarkdownRenderer.svelte, src/lib/components/chat/CodeBlock.svelte | `npm run build` |
| 8 | `feat(streaming-en): add English SSE streaming via Langflow` | src/routes/api/chat/stream/+server.ts, src/lib/services/streaming.ts | `npx tsc --noEmit && npm run lint` |
| 9 | `feat(titles): add auto-generated conversation titles via nemotron-nano` | src/lib/server/services/title-generator.ts | `npx tsc --noEmit` |
| 10 | `feat(streaming-hu): add Hungarian webhook streaming path` | src/routes/api/webhook/sentence/+server.ts, src/lib/server/services/webhook-bridge.ts | `npx tsc --noEmit && npm run lint` |
| 11 | `feat(ux): add error handling, retry, loading indicators, responsive layout` | src/lib/components/chat/ErrorMessage.svelte, src/lib/components/chat/LoadingIndicator.svelte | `npm run build` |
| 12 | `feat(deploy): add Apache config, systemd service, and deployment docs` | deploy/apache-site.conf, deploy/langflow-chat.service, deploy/README.md | `apachectl -t -f deploy/apache-site.conf` (syntax only) |
| 13 | `style(mobile): polish mobile design per DESIGN_SPEC.md` | src/lib/components/**/*.svelte, src/app.css, tests/e2e/mobile-design.spec.ts | `npm run build && npx tsc --noEmit` |
| 14 | `fix(ui): comprehensive design reinspection — fix all visual discrepancies per DESIGN_SPEC.md` | src/lib/components/**/*.svelte, src/routes/**/*.svelte, src/app.css, tailwind.config.ts | `npm run build && npx tsc --noEmit` |
| 15 | `test(all): comprehensive codebase testing — fix all syntax errors and test failures` | src/**/*.ts, src/**/*.svelte, tests/**/*.ts, tests/**/*.spec.ts | `npx tsc --noEmit && npm run lint && npm run build && npm test && npx playwright test` |
| 16 | `feat(settings): add translation toggle and model selection in message input` | src/lib/stores/settings.ts, src/lib/components/chat/TranslationToggle.svelte, src/lib/components/chat/ModelSelector.svelte, src/lib/server/env.ts, .env.example | `npm test -- settings && npm run build` |

---

## Success Criteria

### Agent Verification Commands (Static + Runtime)
```bash
npm run build                    # Expected: Build succeeds, output in build/
npx tsc --noEmit                 # Expected: No TypeScript errors
npm run lint                     # Expected: No linting errors
npm test                         # Expected: All Vitest tests pass (Task 38 ensures this)
npx playwright test              # Expected: All Playwright E2E tests pass (Task 38 ensures this)
ls src/**/*.test.ts              # Expected: Unit test files exist
ls tests/e2e/**/*.spec.ts        # Expected: E2E test files exist
```

### Manual Verification Commands (Run on Deployment Machine)
```bash
node build/index.js              # Expected: Server starts on port 3000
curl http://localhost:3000/login # Expected: 200, HTML login page
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@local","password":"admin123"}' # Expected: 200 + Set-Cookie
```

### Final Checklist
- [ ] All "Must Have" features implemented and verified
- [ ] All "Must NOT Have" guardrails respected (no message storage, no export, no WebSocket, etc.)
- [ ] `npm run build` succeeds without errors
- [ ] `npx tsc --noEmit` reports no errors
- [ ] `npm run lint` passes
- [ ] `npm test` passes — all Vitest tests green (verified by Task 38)
- [ ] `npx playwright test` passes — all E2E tests green (verified by Task 38)
- [ ] Apache config is syntactically valid
- [ ] systemd service file is syntactically valid
- [ ] Dark/light mode components exist with proper styling
- [ ] English SSE streaming service implemented
- [ ] Hungarian non-streaming path implemented
- [ ] File upload button component exists (visible but disabled)
- [ ] Loading indicator component exists
- [ ] Mobile design polish complete per DESIGN_SPEC.md (Task 36)
- [ ] All colors use CSS custom property tokens (no hardcoded hex) — verified by Task 37
- [ ] All touch targets ≥44×44px on mobile — verified by Task 37
- [ ] Mobile sidebar renders as full-screen overlay — verified by Task 37
- [ ] Input area pinned to viewport bottom on mobile — verified by Task 37
- [ ] Design reinspection complete — all visual components match DESIGN_SPEC.md (Task 37)
- [ ] Comprehensive codebase testing complete — zero test failures (Task 38)
- [ ] Translation toggle button exists in message input (Task 39)
- [ ] Model selector exists in message input with 2 options (Task 40)
- [ ] Translation and model preferences persist to localStorage (Tasks 39-40)
- [ ] Task 37 evidence screenshots exist in `.sisyphus/evidence/task-37-*`
- [ ] Task 38 evidence files exist in `.sisyphus/evidence/task-38-*`
- [ ] Task 39 evidence files exist in `.sisyphus/evidence/task-39-*`
- [ ] Task 40 evidence files exist in `.sisyphus/evidence/task-40-*`
