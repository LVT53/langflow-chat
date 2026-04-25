# MinerU OCR Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace Liteparse+Tesseract+Paddle OCR with MinerU Docker service

**Architecture:** Rewrite `document-extraction.ts` as a thin MinerU HTTP client,
remove all Paddle and Liteparse code, update config and admin UI, add new tests

**Tech Stack:** TypeScript, SvelteKit, Drizzle ORM, Vitest, Docker (MinerU)

---

### Task 1: Remove `@llamaindex/liteparse` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove liteparse from package.json**

Remove the line:
```json
"@llamaindex/liteparse": "^1.4.4",
```

- [ ] **Step 2: Run npm install to clean node_modules**

```bash
npm install
```

- [ ] **Step 3: Verify build still works (will fail if any code still imports liteparse)**

```bash
npm run build 2>&1 | head -20
```
Expected: build succeeds once all references removed (after Task 3)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove @llamaindex/liteparse dependency"
```

---

### Task 2: Delete Paddle OCR files

**Files:**
- Delete: `src/lib/server/services/ocr/paddle-adapter.ts`
- Delete: `src/routes/api/ocr/paddle/+server.ts`
- Delete: `src/routes/api/ocr/paddle/server.test.ts`

- [ ] **Step 1: Delete the files**

```bash
rm src/lib/server/services/ocr/paddle-adapter.ts
rm src/routes/api/ocr/paddle/+server.ts
rmdir src/routes/api/ocr/paddle
rmdir src/routes/api/ocr
rmdir src/lib/server/services/ocr
```

- [ ] **Step 2: Verify no imports reference paddle**

```bash
rg "paddle|PaddleOCR|paddle-adapter" src/ --include "*.ts" --include "*.svelte"
```
Expected: no matches

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove Paddle OCR adapter, route, and tests"
```

---

### Task 3: Rewrite `document-extraction.ts` as MinerU client

**Files:**
- Modify: `src/lib/server/services/document-extraction.ts`

- [ ] **Step 1: Write the new file**

Replace entire contents of `src/lib/server/services/document-extraction.ts` with MinerU HTTP client.

- [ ] **Step 2: Commit**

```bash
git add src/lib/server/services/document-extraction.ts
git commit -m "feat: replace Liteparse with MinerU HTTP client in document-extraction"
```

---

### Task 4: Add MinerU config to `env.ts`

**Files:**
- Modify: `src/lib/server/env.ts`

- [ ] **Step 1: Remove 8 OCR fields from EnvConfig type, add 2 MinerU fields**

- [ ] **Step 2: Update parseEnv function**

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/env.ts
git commit -m "feat: replace OCR env vars with MinerU config in env.ts"
```

---

### Task 5: Add MinerU config to `config-store.ts`

**Files:**
- Modify: `src/lib/server/config-store.ts`

- [ ] **Step 1: Update RUNTIME_CONFIG_KEYS, RuntimeConfig type, overrides, snapshot, initial values**

Replace 8 `DOCUMENT_PARSER_*` entries with 2 `MINERU_*` entries throughout.

- [ ] **Step 2: Commit**

```bash
git add src/lib/server/config-store.ts
git commit -m "feat: replace OCR config with MinerU config in config-store"
```

---

### Task 6: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace OCR section with MinerU section**

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: update .env.example with MinerU config"
```

---

### Task 7: Update admin UI — SettingsAdminSystemPane

**Files:**
- Modify: `src/routes/(app)/settings/_components/SettingsAdminSystemPane.svelte`

- [ ] **Step 1: Replace OCR fields with MinerU fields**

- [ ] **Step 2: Commit**

```bash
git add src/routes/(app)/settings/_components/SettingsAdminSystemPane.svelte
git commit -m "feat: replace OCR settings with MinerU settings in admin UI"
```

---

### Task 8: Clean up `chat-files.ts` binary image skip

**Files:**
- Modify: `src/lib/server/services/chat-files.ts`

- [ ] **Step 1: Remove binary image skip logic**

- [ ] **Step 2: Commit**

```bash
git add src/lib/server/services/chat-files.ts
git commit -m "feat: route all chat-generated files through MinerU extraction"
```

---

### Task 9: Write new tests for `document-extraction.ts`

**Files:**
- Create: `src/lib/server/services/document-extraction.test.ts`

- [ ] **Step 1: Delete old test file, write new test file**

Test cases: successful extraction, empty result, error status, unreachable, timeout, buffering, missing mimeType.

- [ ] **Step 2: Run new tests**

```bash
npx vitest run src/lib/server/services/document-extraction.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/services/document-extraction.test.ts
git commit -m "test: add MinerU document extraction tests"
```

---

### Task 10: Update upload tests if needed

**Files:**
- Read: `src/routes/api/knowledge/upload/upload.test.ts`

- [ ] **Step 1: Check for OCR-specific assertions, update if needed**

- [ ] **Step 2: Run upload tests**

```bash
npx vitest run src/routes/api/knowledge/upload/
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/api/knowledge/upload/upload.test.ts
git commit -m "test: update upload tests for MinerU migration"
```

---

### Task 11: Full verification

- [ ] **Step 1: Type check** `npm run check` — zero errors
- [ ] **Step 2: Lint** `npm run lint` — zero warnings
- [ ] **Step 3: All unit tests** `npm test` — all passing
- [ ] **Step 4: Production build** `npm run build` — zero warnings
- [ ] **Step 5: Database prepare** `npm run db:prepare`

---

### Task 12: Commit, branch, and push

- [ ] **Step 1: Final atomic commit**
- [ ] **Step 2: Verify clean working tree** `git status`
- [ ] **Step 3: Push to remote**
- [ ] **Step 4: Merge to main and dev, push**
