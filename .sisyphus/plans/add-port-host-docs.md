# Add PORT and HOST to Documentation

## TL;DR

> **Quick Summary**: Add `PORT` and `HOST` environment variables to `.env.example` and `deploy/README.md` for documentation completeness.
> 
> **Deliverables**:
> - Updated `.env.example` with PORT and HOST variables
> - Updated `deploy/README.md` environment variables table
> 
> **Estimated Effort**: Quick (< 5 minutes)
> **Parallel Execution**: NO - sequential (2 edits)

---

## Context

### Original Request
User asked to add `PORT` and `HOST` environment variables to `.env.example` and document them in `deploy/README.md`.

### Background
- `@sveltejs/adapter-node` reads `PORT` and `HOST` at runtime
- Default values: `PORT=3000`, `HOST=0.0.0.0`
- These were discovered during architecture analysis but not documented

---

## Work Objectives

### Core Objective
Document server configuration environment variables for completeness.

### Definition of Done
- [ ] `.env.example` contains `PORT` and `HOST` with comments
- [ ] `deploy/README.md` table includes both variables with descriptions

---

## TODOs

- [ ] 1. Update .env.example

  **What to do**:
  Add to the end of `.env.example`:
  ```
  # Server Configuration (used by @sveltejs/adapter-node)
  PORT=3000
  HOST=0.0.0.0
  ```

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **References**:
  - `/Users/lvt53/Desktop/langflow-design/.env.example` - Current file (10 lines)

  **Acceptance Criteria**:
  - [ ] File ends with PORT and HOST variables
  - [ ] Comment explains these are for adapter-node

  **QA Scenarios**:
  ```
  Scenario: Verify variables added
    Tool: Bash (grep)
    Steps:
      1. grep -E "^PORT=|^HOST=" .env.example
    Expected Result: Both lines present with values 3000 and 0.0.0.0
    Evidence: .sisyphus/evidence/task-1-env-check.txt
  ```

---

- [ ] 2. Update deploy/README.md

  **What to do**:
  Add two rows to the environment variables table (after `DATABASE_PATH`):
  
  | Variable | Description | Example |
  |----------|-------------|---------|
  | `PORT` | Server port (adapter-node) | `3000` |
  | `HOST` | Server bind address (adapter-node) | `0.0.0.0` |

  Also add a note after the table:
  > **Note:** `PORT` and `HOST` are used by `@sveltejs/adapter-node` at runtime. The default values (`3000` and `0.0.0.0`) work for most deployments. Change `HOST` to `127.0.0.1` if Apache is on the same machine and you don't want the app accessible directly.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **References**:
  - `/Users/lvt53/Desktop/langflow-design/deploy/README.md:17-30` - Environment variables table

  **Acceptance Criteria**:
  - [ ] Table has PORT and HOST rows
  - [ ] Note about adapter-node added

  **QA Scenarios**:
  ```
  Scenario: Verify documentation updated
    Tool: Bash (grep)
    Steps:
      1. grep -E "PORT|HOST" deploy/README.md
    Expected Result: Multiple lines showing PORT and HOST in table and note
    Evidence: .sisyphus/evidence/task-2-readme-check.txt
  ```

---

## Success Criteria

### Verification Commands
```bash
grep -E "^PORT=|^HOST=" .env.example  # Expected: PORT=3000, HOST=0.0.0.0
grep "adapter-node" deploy/README.md  # Expected: Note about adapter-node
```

### Final Checklist
- [ ] Both files updated
- [ ] Documentation is accurate and helpful
