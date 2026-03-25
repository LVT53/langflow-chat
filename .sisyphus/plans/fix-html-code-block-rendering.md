# Fix: HTML Code Block Rendering During Streaming

## TL;DR

> **Quick Summary**: Code block opening fence regex doesn't match valid markdown with space before language name (e.g., ` ``` html`). This causes HTML code to be treated as regular text and rendered as actual DOM elements by `marked` instead of being highlighted by shiki.

> **Deliverables**:
> - Fixed regex pattern in `splitMarkdownBlocks()` function
> - HTML code blocks render correctly during and after streaming
>
> **Estimated Effort**: Quick (5-10 minutes)
> **Parallel Execution**: NO - single file change
> **Critical Path**: Regex fix → Test

---

## Context

### Original Request
User reported that during streaming output generation, HTML code snippets (like `<nav><ul><li>Home</li></ul></nav>`) appear as rendered DOM elements (blue menu visible, layout shifts). After streaming completes, only the text content shows ("Home") and the code block never appears with syntax highlighting.

### Interview Summary
**Key Discussions**:
- Issue appeared after streaming animation changes were implemented
- Shiki was tested and DOES properly escape HTML entities (`&#x3C;` for `<`)
- The problem is in the markdown parsing, not shiki
- `marked` library outputs raw HTML when content is not inside a code block

**Research Findings**:
- Current opening fence regex: `/^\s*```([^\s`]*)\s*$/`
- This regex requires the language name to be immediately after the backticks
- Valid markdown ` ``` html` (space before language) does NOT match
- When regex doesn't match, HTML content goes to `textLines` → `renderMarkdown()` → `marked.parse()` → raw HTML output

### Root Cause Analysis
The regex pattern fails to match valid CommonMark/GFM markdown syntax where whitespace separates the fence from the language identifier.

**Before fix:**
- ` ```html` → MATCH ✓
- ` ``` html` → NO MATCH ✗ (valid markdown, should match!)

**Result:** HTML code blocks with space-separated language names are not recognized, causing HTML to render as DOM elements.

---

## Work Objectives

### Core Objective
Fix the opening fence regex to match all valid markdown code block syntaxes.

### Concrete Deliverables
- Modified regex in `/src/lib/components/chat/MarkdownRenderer.svelte` line 70
- HTML code blocks render correctly regardless of whitespace formatting

### Definition of Done
- [x] Regex updated to `/^\s*```\s*([^\s`]*)\s*$/`
- [x] Test with ` ``` html` syntax
- [x] Test with ` ```html` syntax
- [x] Verify HTML code blocks appear with syntax highlighting

### Must Have
- Opening fence regex matches ` ``` html` (space before language)
- Opening fence regex matches ` ```html` (no space)
- Opening fence regex matches ` ``` html ` (trailing space)

### Must NOT Have
- Breaking existing code block detection for ` ```html` syntax
- Changing behavior of closing fence detection
- Breaking streaming animation (fixed in previous commit)

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (vitest)
- **Automated tests**: Tests-after acceptable
- **Framework**: bun test / vitest
- **Agent-Executed QA**: Manual testing recommended

### QA Policy
Each task will include agent-executed QA scenarios.

---

## Execution Strategy

### Sequential Execution (Single Task)

```
Task 1 (Fix regex):
├── Edit line 70 in MarkdownRenderer.svelte
└── Change regex pattern

Task 2 (Verify fix):
├── Run existing tests
├── Manual QA with streaming HTML code
└── Verify code blocks appear correctly
```

---

## TODOs

- [x] 1. Fix Opening Fence Regex in MarkdownRenderer.svelte

  **What to do**:
  - Open `src/lib/components/chat/MarkdownRenderer.svelte`
  - Locate line 70 with the opening fence regex
  - Change from: `/^\s*```([^\s`]*)\s*$/`
  - Change to: `/^\s*```\s*([^\s`]*)\s*$/`
  - The fix adds `\s*` between the backticks and the language capture group

  **Must NOT do**:
  - Do NOT modify the closing fence regex
  - Do NOT change any other parsing logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single-line regex change, straightforward fix
  - **Skills**: []
    - No special skills needed

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential
  - **Blocks**: Task 2
  - **Blocked By**: None

  **References**:
  - `src/lib/components/chat/MarkdownRenderer.svelte:70` - Current regex location
  - CommonMark spec: Code spans with language info string can have leading/trailing spaces

  **Acceptance Criteria**:
  - [x] Regex pattern updated in file
  - [x] No TypeScript/svelte errors

  **QA Scenarios**:
  ```
  Scenario: Code block with space before language name
    Tool: Bash (node)
    Preconditions: File has been modified
    Steps:
      1. Run: node -e "console.log('``` html'.match(/^\s*```\s*([^\s`]*)\s*$/))"
    Expected Result: Match array with 'html' in capture group
    Evidence: .sisyphus/evidence/task-1-regex-match.txt
  ```

  **Commit**: YES
  - Message: `fix: allow whitespace before language name in code fence`
  - Files: `src/lib/components/chat/MarkdownRenderer.svelte`

---

- [x] 2. Verify Fix Works

  **What to do**:
  - Run test suite to ensure no regressions
  - Test with actual streaming content containing HTML code blocks
  - Verify both ` ```html` and ` ``` html` syntaxes work

  **Must NOT do**:
  - Do NOT commit failing tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Testing and verification
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after Task 1)
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:
  - `src/lib/services/streaming-markdown.test.ts` - Existing tests
  - `tests/e2e/streaming.spec.ts` - E2E streaming tests

  **Acceptance Criteria**:
  - [x] All existing tests pass
  - [x] HTML code blocks render correctly during streaming
  - [x] HTML code blocks render correctly after streaming

  **QA Scenarios**:
  ```
  Scenario: Streaming HTML code block renders correctly
    Tool: Manual testing in browser
    Preconditions: Dev server running, Task 1 complete
    Steps:
      1. Send message: "Create an HTML navbar snippet"
      2. Observe streaming output
      3. Verify code block appears (not rendered HTML elements)
      4. Verify syntax highlighting shows after completion
    Expected Result: Code block with HTML syntax highlighting, NOT rendered DOM elements
    Evidence: .sisyphus/evidence/task-2-streaming-qa.png
  ```

  **Commit**: NO (verification only)

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Verify regex was changed correctly. Test both whitespace variants.

- [ ] F2. **Code Quality Review** — `quick`
  Run `tsc --noEmit` + `bun test`. Check for any type errors.

- [ ] F3. **Real Manual QA** — `quick`
  Test streaming with HTML code blocks in browser. Verify code blocks appear.

- [ ] F4. **Scope Fidelity Check** — `quick`
  Verify only the regex was changed, nothing else modified.

---

## Commit Strategy

- **1**: `fix: allow whitespace before language name in code fence` — MarkdownRenderer.svelte

---

## Success Criteria

### Verification Commands
```bash
bun test src/lib/services/streaming-markdown.test.ts
# Expected: All tests pass
```

### Final Checklist
- [ ] Regex updated to allow whitespace before language
- [ ] HTML code blocks render with syntax highlighting
- [ ] No rendered DOM elements during streaming
- [ ] All existing tests pass