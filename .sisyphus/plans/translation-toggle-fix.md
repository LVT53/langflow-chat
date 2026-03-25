# Work Plan: Fix Translation Toggle Not Disabling Hungarian Pipeline

## TL;DR

> **Problem**: The Hungarian translation toggle in the UI is completely ignored by the backend. When users turn OFF translation, the chat endpoints still translate Hungarian text because they never check the `translationEnabled` setting.
>
> **Solution**: Add `translationEnabled` to the SessionUser type, update the auth service to include it, and add conditional checks in both chat endpoints.
>
> **Files Modified**: 5 files (types.ts, auth.ts, send/+server.ts, stream/+server.ts, settings/+server.ts)
>
> **Estimated Effort**: Short (2-3 hours with tests)
>
> **Parallel Execution**: Sequential (dependencies between tasks)
>
> **Critical Path**: Task 1 → Task 2 → Task 3 → Task 4 → Task 5

---

## Context

### Original Request
User asked to verify that when the translation icon is toggled OFF in the prompt input box, the Hungarian translation pipeline is fully disabled.

### Investigation Findings
**BUG CONFIRMED** - The translation pipeline runs regardless of toggle state.

**Current Broken Flow**:
1. ✅ UI Toggle works - stores state in DB via `/api/settings/preferences`
2. ✅ Database has `translationEnabled` field (default: 0 = disabled)
3. ❌ **SessionUser type doesn't include `translationEnabled`**
4. ❌ **Auth service doesn't return `translationEnabled`**
5. ❌ **Chat endpoints never check `user.translationEnabled`**

**Root Cause**: The `validateSession` function in auth.ts returns a `SessionUser` object without `translationEnabled`, and the chat endpoints use `event.locals.user` which is this SessionUser type.

### Metis Review Findings
1. **Critical Gap**: `translationEnabled` not available in `event.locals.user`
2. **Requires prerequisite fix**: Add field to SessionUser type and auth service
3. **Default behavior**: Should default to DISABLED (safe, matches DB schema)
4. **Both endpoints affected**: send and stream need fixes
5. **Test coverage**: Existing tests need mock updates

---

## Work Objectives

### Core Objective
Wire up the translation toggle so that when it's OFF, the Hungarian translation pipeline is completely bypassed in both chat endpoints.

### Concrete Deliverables
1. `SessionUser` interface includes `translationEnabled: boolean`
2. `validateSession()` returns `translationEnabled` from database
3. Chat send endpoint checks `user.translationEnabled` before translating
4. Chat stream endpoint checks `user.translationEnabled` before translating
5. Settings API returns `translationEnabled` in correct format (fix type mismatch)
6. Tests verify toggle ON = translation happens, toggle OFF = no translation

### Definition of Done
- [ ] Hungarian message + toggle OFF → No `translateHungarianToEnglish` call
- [ ] Hungarian message + toggle ON → `translateHungarianToEnglish` called
- [ ] All existing tests pass
- [ ] New tests cover toggle behavior for both endpoints

### Must Have
- Add `translationEnabled` to SessionUser type
- Update auth service to include the field
- Conditional translation in send endpoint
- Conditional translation in stream endpoint
- Tests for both enabled/disabled states

### Must NOT Have (Guardrails)
- MUST NOT: Change database schema or default (already correct)
- MUST NOT: Add migration to enable translation for existing users
- MUST NOT: Modify translator service logic
- MUST NOT: Change UI toggle behavior
- MUST NOT: Modify language detection

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (bun test + vitest)
- **Automated tests**: YES (TDD approach - write tests first)
- **Framework**: bun test
- **Approach**: Write failing tests showing bug, then fix

### QA Policy
Every task includes agent-executed QA scenarios with concrete assertions.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Sequential):
├── Task 1: Add translationEnabled to SessionUser type [quick]
├── Task 2: Update auth service validateSession [quick]
└── Task 3: Fix Settings API type mismatch [quick]

Wave 2 (Core Fix - Sequential):
├── Task 4: Add conditional check to send endpoint [quick]
└── Task 5: Add conditional check to stream endpoint [quick]

Wave 3 (Tests - Sequential):
├── Task 6: Write tests for send endpoint toggle [quick]
└── Task 7: Write tests for stream endpoint toggle [quick]

Wave 4 (Verification - Parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Run full test suite [quick]
└── Task F3: Verify with Playwright E2E [quick]
-> Present results -> Get explicit user okay
```

### Dependency Matrix
- **Task 1**: — — Task 2, 3
- **Task 2**: Task 1 — Task 4, 5
- **Task 3**: — — Task 4, 5
- **Task 4**: Task 2, 3 — Task 6
- **Task 5**: Task 2, 3 — Task 7
- **Task 6**: Task 4 — F1-F3
- **Task 7**: Task 5 — F1-F3

### Agent Dispatch Summary
- **Wave 1**: **3** tasks → `quick`
- **Wave 2**: **2** tasks → `quick`
- **Wave 3**: **2** tasks → `quick`
- **Wave 4**: **3** tasks → `oracle`, `quick`, `quick`

---

## TODOs

- [x] **Task 1: Add translationEnabled to SessionUser type**

  **What to do**:
  - Open `src/lib/types.ts`
  - Add `translationEnabled: boolean` to `SessionUser` interface (line 33-40)
  
  **Current code** (lines 33-40):
  ```typescript
  export interface SessionUser {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    avatarId: number | null;
    profilePicture: string | null;
  }
  ```
  
  **New code**:
  ```typescript
  export interface SessionUser {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    avatarId: number | null;
    profilePicture: string | null;
    translationEnabled: boolean;
  }
  ```

  **Must NOT do**:
  - Do not modify other interfaces (User, UserSettings)
  - Do not change field order (add at end for minimal diff)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple type definition change, 1 line addition
  - **Skills**: []
    - None needed - straightforward TypeScript edit

  **Parallelization**:
  - **Can Run In Parallel**: NO (blocks Tasks 2, 3)
  - **Parallel Group**: Wave 1 (first task)
  - **Blocks**: Task 2, Task 3
  - **Blocked By**: None

  **References**:
  - **Pattern References**:
    - `src/lib/types.ts:33-40` - SessionUser interface to modify
  - **API/Type References**:
    - `src/lib/types.ts:9-14` - UserPreferences shows translationEnabled pattern
  
  **WHY Each Reference Matters**:
  - SessionUser interface: Add the field here so it's available in event.locals.user
  - UserPreferences: Shows the field should be a boolean, not integer

  **Acceptance Criteria**:
  - [ ] `SessionUser` interface includes `translationEnabled: boolean`
  - [ ] TypeScript compiles without errors: `bun tsc --noEmit`
  - [ ] No other files need changes for this task alone

  **QA Scenarios**:
  
  ```
  Scenario: Verify SessionUser type change compiles
    Tool: Bash
    Preconditions: Task 1 code change complete
    Steps:
      1. Run: cd /Users/lvt53/Desktop/langflow-design && bun tsc --noEmit
    Expected Result: No TypeScript errors
    Failure Indicators: Type errors about SessionUser or related types
    Evidence: .sisyphus/evidence/task-1-tsc-output.txt
  ```

  **Evidence to Capture**:
  - [ ] TypeScript compilation output

  **Commit**: YES
  - Message: `types(SessionUser): add translationEnabled field`
  - Files: `src/lib/types.ts`
  - Pre-commit: `bun tsc --noEmit`

---

- [x] **Task 2: Update auth service validateSession to return translationEnabled**

  **What to do**:
  - Open `src/lib/server/services/auth.ts`
  - Modify `validateSession()` function (lines 25-52)
  - Add `translationEnabled` to the return object
  
  **Current code** (lines 44-51):
  ```typescript
  return {
    id: userObj.id,
    email: userObj.email,
    displayName: userObj.name ?? userObj.email,
    role: (userObj.role ?? 'user') as import('../../types').UserRole,
    avatarId: userObj.avatarId ?? null,
    profilePicture: userObj.profilePicture ?? null,
  };
  ```
  
  **New code**:
  ```typescript
  return {
    id: userObj.id,
    email: userObj.email,
    displayName: userObj.name ?? userObj.email,
    role: (userObj.role ?? 'user') as import('../../types').UserRole,
    avatarId: userObj.avatarId ?? null,
    profilePicture: userObj.profilePicture ?? null,
    translationEnabled: (userObj.translationEnabled ?? 0) === 1,
  };
  ```

  **Must NOT do**:
  - Do not modify other fields
  - Do not change error handling
  - Do not add console logs

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single line addition with boolean conversion
  - **Skills**: []
    - None needed - straightforward edit

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 1, blocks Tasks 4-5)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4, Task 5
  - **Blocked By**: Task 1

  **References**:
  - **Pattern References**:
    - `src/lib/server/services/auth.ts:44-51` - validateSession return object
    - `src/routes/(app)/+layout.server.ts:29` - Shows (value ?? 0) === 1 pattern for boolean conversion
  - **API/Type References**:
    - `src/lib/server/db/schema.ts:11` - translationEnabled is INTEGER in DB

  **WHY Each Reference Matters**:
  - validateSession return: Where to add the new field
  - +layout.server.ts:29: Pattern for converting INTEGER (0/1) to boolean
  - schema.ts:11: Confirms DB stores INTEGER, not boolean - conversion needed

  **Acceptance Criteria**:
  - [ ] `validateSession` returns `translationEnabled` as boolean
  - [ ] TypeScript compiles without errors
  - [ ] Boolean conversion correct: (0, null, undefined) → false, 1 → true

  **QA Scenarios**:
  
  ```
  Scenario: Verify validateSession returns correct boolean values
    Tool: Bash
    Preconditions: Task 1 and 2 complete
    Steps:
      1. Run TypeScript check: bun tsc --noEmit
      2. Run auth tests: bun test src/lib/server/services/auth.test.ts
    Expected Result: All tests pass, no type errors
    Failure Indicators: Type errors or test failures
    Evidence: .sisyphus/evidence/task-2-test-output.txt
  ```

  **Evidence to Capture**:
  - [ ] Test execution output

  **Commit**: YES
  - Message: `auth(validateSession): include translationEnabled in SessionUser`
  - Files: `src/lib/server/services/auth.ts`
  - Pre-commit: `bun tsc --noEmit && bun test src/lib/server/services/auth.test.ts`

---

- [x] **Task 3: Fix Settings API type mismatch in preferences endpoint**

  **What to do**:
  - Open `src/routes/api/settings/+server.ts`
  - Fix the type mismatch where `profilePicture` is missing from the response object
  - This is a pre-existing bug that will block compilation after Task 2
  
  **Current code** (lines 18-29):
  ```typescript
  const settings: UserSettings = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'user' | 'admin',
    preferences: {
      preferredModel: (user.preferredModel ?? 'model1') as 'model1' | 'model2',
      translationEnabled: (user.translationEnabled ?? 0) === 1,
      theme: (user.theme ?? 'system') as 'system' | 'light' | 'dark',
      avatarId: user.avatarId ?? null,
    },
  };
  ```
  
  **Issue**: `UserSettings` interface requires `profilePicture: string | null`
  
  **New code**:
  ```typescript
  const settings: UserSettings = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'user' | 'admin',
    preferences: {
      preferredModel: (user.preferredModel ?? 'model1') as 'model1' | 'model2',
      translationEnabled: (user.translationEnabled ?? 0) === 1,
      theme: (user.theme ?? 'system') as 'system' | 'light' | 'dark',
      avatarId: user.avatarId ?? null,
    },
    profilePicture: user.profilePicture ?? null,
  };
  ```

  **Must NOT do**:
  - Do not change other settings fields
  - Do not modify the UserSettings interface

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single field addition to fix type error
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (can run in parallel with Task 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 4, Task 5
  - **Blocked By**: None (but related to Task 1-2 changes)

  **References**:
  - **Pattern References**:
    - `src/lib/types.ts:16-23` - UserSettings interface showing profilePicture requirement
    - `src/routes/api/settings/+server.ts:18-29` - Current code with missing field

  **Acceptance Criteria**:
  - [ ] `settings` object includes `profilePicture` field
  - [ ] TypeScript compiles without errors

  **QA Scenarios**:
  
  ```
  Scenario: Verify Settings API compiles
    Tool: Bash
    Preconditions: Task 1 complete
    Steps:
      1. Run: bun tsc --noEmit
    Expected Result: No type errors in settings API
    Failure Indicators: Error about missing profilePicture
    Evidence: .sisyphus/evidence/task-3-tsc-output.txt
  ```

  **Commit**: YES
  - Message: `fix(settings): add missing profilePicture to UserSettings response`
  - Files: `src/routes/api/settings/+server.ts`
  - Pre-commit: `bun tsc --noEmit`

---

- [x] **Task 4: Add conditional check to chat send endpoint**

  **What to do**:
  - Open `src/routes/api/chat/send/+server.ts`
  - Add `translationEnabled` check before calling translation functions (lines 52-61)
  
  **Current code** (lines 52-61):
  ```typescript
  const normalizedMessage = message.trim();
  const sourceLanguage = detectLanguage(normalizedMessage);
  const upstreamMessage =
    sourceLanguage === 'hu'
      ? await translateHungarianToEnglish(normalizedMessage)
      : normalizedMessage;

  const { text } = await sendMessage(upstreamMessage, conversationId, modelId);
  const responseText =
    sourceLanguage === 'hu' ? await translateEnglishToHungarian(text) : text;
  ```
  
  **New code**:
  ```typescript
  const normalizedMessage = message.trim();
  const sourceLanguage = detectLanguage(normalizedMessage);
  const isTranslationEnabled = user.translationEnabled;
  
  const upstreamMessage =
    sourceLanguage === 'hu' && isTranslationEnabled
      ? await translateHungarianToEnglish(normalizedMessage)
      : normalizedMessage;

  const { text } = await sendMessage(upstreamMessage, conversationId, modelId);
  const responseText =
    sourceLanguage === 'hu' && isTranslationEnabled
      ? await translateEnglishToHungarian(text)
      : text;
  ```

  **Must NOT do**:
  - Do not change language detection logic
  - Do not change error handling
  - Do not modify sendMessage call

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple conditional addition
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 2-3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 6
  - **Blocked By**: Task 2, Task 3

  **References**:
  - **Pattern References**:
    - `src/routes/api/chat/send/+server.ts:52-61` - Lines to modify
    - `src/lib/server/services/translator.ts:595-609` - translateHungarianToEnglish signature

  **Acceptance Criteria**:
  - [ ] Input translation only happens when `user.translationEnabled && sourceLanguage === 'hu'`
  - [ ] Output translation only happens when `user.translationEnabled && sourceLanguage === 'hu'`
  - [ ] TypeScript compiles without errors

  **QA Scenarios**:
  
  ```
  Scenario: Verify conditional translation in send endpoint
    Tool: Bash
    Preconditions: Tasks 1-3 complete
    Steps:
      1. Run TypeScript check: bun tsc --noEmit
      2. Run send tests: bun test src/routes/api/chat/send.test.ts
    Expected Result: Tests pass, no type errors
    Failure Indicators: Type errors or test failures
    Evidence: .sisyphus/evidence/task-4-test-output.txt
  
  Scenario: Verify translator functions not called when toggle OFF
    Tool: Bash (grep search)
    Preconditions: Task 4 code complete
    Steps:
      1. Read the modified file
      2. Verify: translateHungarianToEnglish and translateEnglishToHungarian calls are wrapped in `user.translationEnabled && sourceLanguage === 'hu'`
    Expected Result: Both calls have the conditional
    Failure Indicators: Missing conditional on either call
    Evidence: .sisyphus/evidence/task-4-code-review.txt
  ```

  **Evidence to Capture**:
  - [ ] Code review of conditional placement
  - [ ] Test results

  **Commit**: YES
  - Message: `fix(chat): respect translationEnabled in send endpoint`
  - Files: `src/routes/api/chat/send/+server.ts`
  - Pre-commit: `bun tsc --noEmit && bun test src/routes/api/chat/send.test.ts`

---

- [x] **Task 5: Add conditional check to chat stream endpoint**

  **What to do**:
  - Open `src/routes/api/chat/stream/+server.ts`
  - Add `translationEnabled` check before creating StreamingHungarianTranslator (lines 577-584, 601)
  
  **Current code** (lines 577-584):
  ```typescript
  const normalizedMessage = message.trim();
  const sourceLanguage = detectLanguage(normalizedMessage);

  let upstreamMessage = normalizedMessage;
  try {
    if (sourceLanguage === 'hu') {
      upstreamMessage = await translateHungarianToEnglish(normalizedMessage);
    }
  }
  ```
  
  **New code** (lines 577-585):
  ```typescript
  const normalizedMessage = message.trim();
  const sourceLanguage = detectLanguage(normalizedMessage);
  const isTranslationEnabled = user.translationEnabled;

  let upstreamMessage = normalizedMessage;
  try {
    if (sourceLanguage === 'hu' && isTranslationEnabled) {
      upstreamMessage = await translateHungarianToEnglish(normalizedMessage);
    }
  }
  ```
  
  **Current code** (line 601):
  ```typescript
  const outputTranslator =
    sourceLanguage === 'hu' ? new StreamingHungarianTranslator() : null;
  ```
  
  **New code** (line 602):
  ```typescript
  const outputTranslator =
    sourceLanguage === 'hu' && isTranslationEnabled ? new StreamingHungarianTranslator() : null;
  ```

  **Must NOT do**:
  - Do not change streaming logic
  - Do not change error handling
  - Do not modify sendMessageStream call

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple conditional additions at two locations
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Tasks 2-3)
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 7
  - **Blocked By**: Task 2, Task 3

  **References**:
  - **Pattern References**:
    - `src/routes/api/chat/stream/+server.ts:577-584` - Input translation conditional
    - `src/routes/api/chat/stream/+server.ts:601` - Output translator creation
    - `src/lib/server/services/translator.ts:757` - StreamingHungarianTranslator class

  **Acceptance Criteria**:
  - [ ] Input translation only when `user.translationEnabled && sourceLanguage === 'hu'`
  - [ ] StreamingHungarianTranslator only created when `user.translationEnabled && sourceLanguage === 'hu'`
  - [ ] TypeScript compiles without errors

  **QA Scenarios**:
  
  ```
  Scenario: Verify conditional translation in stream endpoint
    Tool: Bash
    Preconditions: Tasks 1-3 complete
    Steps:
      1. Run TypeScript check: bun tsc --noEmit
      2. Run stream tests: bun test src/routes/api/chat/stream.test.ts
    Expected Result: Tests pass, no type errors
    Failure Indicators: Type errors or test failures
    Evidence: .sisyphus/evidence/task-5-test-output.txt
  
  Scenario: Verify both translation points have conditionals
    Tool: Bash (grep search)
    Preconditions: Task 5 code complete
    Steps:
      1. Verify: translateHungarianToEnglish call has conditional
      2. Verify: StreamingHungarianTranslator creation has conditional
    Expected Result: Both locations have `isTranslationEnabled && sourceLanguage === 'hu'`
    Failure Indicators: Missing conditional at either location
    Evidence: .sisyphus/evidence/task-5-code-review.txt
  ```

  **Evidence to Capture**:
  - [ ] Code review showing both conditionals
  - [ ] Test results

  **Commit**: YES
  - Message: `fix(chat): respect translationEnabled in stream endpoint`
  - Files: `src/routes/api/chat/stream/+server.ts`
  - Pre-commit: `bun tsc --noEmit && bun test src/routes/api/chat/stream.test.ts`

---

- [ ] **Task 6: Write tests for send endpoint translation toggle**

  **What to do**:
  - Open `src/routes/api/chat/send.test.ts`
  - Add tests verifying translation only occurs when toggle enabled
  
  **Test cases to add**:
  1. Hungarian message + toggle OFF → verify `translateHungarianToEnglish` NOT called
  2. Hungarian message + toggle ON → verify `translateHungarianToEnglish` called
  3. English message + toggle ON → verify translation NOT called (language detection works)
  
  **Must NOT do**:
  - Do not remove existing tests
  - Do not modify test utilities
  - Do not add console logs in tests

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding test cases to existing test file
  - **Skills**: []
    - bun test for running tests

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 4)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F3
  - **Blocked By**: Task 4

  **References**:
  - **Pattern References**:
    - `src/routes/api/chat/send/send.test.ts` - Existing test file structure
    - Look at how existing tests mock `translateHungarianToEnglish` and `translateEnglishToHungarian`
    - Look at how user object is mocked in tests

  **Acceptance Criteria**:
  - [ ] Test: toggle OFF + Hungarian → no translation
  - [ ] Test: toggle ON + Hungarian → translation occurs
  - [ ] All new tests pass
  - [ ] All existing tests still pass

  **QA Scenarios**:
  
  ```
  Scenario: Run send endpoint tests
    Tool: Bash
    Preconditions: Task 4 complete
    Steps:
      1. Run: bun test src/routes/api/chat/send.test.ts
    Expected Result: All tests pass (existing + new)
    Failure Indicators: Any test failures
    Evidence: .sisyphus/evidence/task-6-test-results.txt
  ```

  **Evidence to Capture**:
  - [ ] Full test output showing all tests pass

  **Commit**: YES (can be combined with Task 4 commit)
  - Message: `test(chat): add translation toggle tests for send endpoint`
  - Files: `src/routes/api/chat/send.test.ts`
  - Pre-commit: `bun test src/routes/api/chat/send.test.ts`

---

- [ ] **Task 7: Write tests for stream endpoint translation toggle**

  **What to do**:
  - Open `src/routes/api/chat/stream.test.ts`
  - Add tests verifying StreamingHungarianTranslator only created when toggle enabled
  
  **Test cases to add**:
  1. Hungarian message + toggle OFF → verify `StreamingHungarianTranslator` NOT created
  2. Hungarian message + toggle ON → verify `StreamingHungarianTranslator` created
  3. Verify stream content is not translated when toggle OFF
  
  **Must NOT do**:
  - Do not remove existing tests
  - Do not modify stream testing utilities

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding test cases to existing test file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on Task 5)
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F3
  - **Blocked By**: Task 5

  **References**:
  - **Pattern References**:
    - `src/routes/api/chat/stream/stream.test.ts` - Existing test file structure
    - Look at how existing tests mock streaming behavior

  **Acceptance Criteria**:
  - [ ] Test: toggle OFF + Hungarian → no StreamingHungarianTranslator
  - [ ] Test: toggle ON + Hungarian → StreamingHungarianTranslator created
  - [ ] All new tests pass
  - [ ] All existing tests still pass

  **QA Scenarios**:
  
  ```
  Scenario: Run stream endpoint tests
    Tool: Bash
    Preconditions: Task 5 complete
    Steps:
      1. Run: bun test src/routes/api/chat/stream.test.ts
    Expected Result: All tests pass (existing + new)
    Failure Indicators: Any test failures
    Evidence: .sisyphus/evidence/task-7-test-results.txt
  ```

  **Evidence to Capture**:
  - [ ] Full test output showing all tests pass

  **Commit**: YES (can be combined with Task 5 commit)
  - Message: `test(chat): add translation toggle tests for stream endpoint`
  - Files: `src/routes/api/chat/stream.test.ts`
  - Pre-commit: `bun test src/routes/api/chat/stream.test.ts`

---

## Final Verification Wave

- [ ] **Task F1: Plan Compliance Audit** — `oracle`
  
  **What to do**:
  - Read all modified files and verify they match the plan
  - Check that `translationEnabled` is properly threaded through all layers
  - Verify conditionals are in correct locations
  
  **Acceptance Criteria**:
  - [ ] `SessionUser` type has `translationEnabled: boolean`
  - [ ] `validateSession` returns `translationEnabled` with (value ?? 0) === 1 conversion
  - [ ] Send endpoint has `user.translationEnabled && sourceLanguage === 'hu'` on both translation calls
  - [ ] Stream endpoint has conditionals on both translation points
  - [ ] Settings API includes `profilePicture`
  - [ ] No Must NOT Have items violated

  **QA Scenarios**:
  
  ```
  Scenario: Verify all plan requirements met
    Tool: Bash (read + grep)
    Preconditions: All Tasks 1-7 complete
    Steps:
      1. Read src/lib/types.ts:33-40 - verify SessionUser has translationEnabled
      2. Read src/lib/server/services/auth.ts:44-52 - verify validateSession includes translationEnabled
      3. Read src/routes/api/chat/send/+server.ts - verify conditionals on lines ~55 and ~62
      4. Read src/routes/api/chat/stream/+server.ts - verify conditionals on lines ~582 and ~602
      5. Read src/routes/api/settings/+server.ts - verify profilePicture present
    Expected Result: All checks pass
    Failure Indicators: Any missing field or conditional
    Evidence: .sisyphus/evidence/f1-compliance-report.txt
  ```

---

- [ ] **Task F2: Run Full Test Suite** — `quick`
  
  **What to do**:
  - Run all tests to ensure no regressions
  
  **Commands**:
  ```bash
  bun tsc --noEmit
  bun test
  ```

  **Acceptance Criteria**:
  - [ ] TypeScript compiles without errors
  - [ ] All existing tests pass
  - [ ] All new tests pass

  **QA Scenarios**:
  
  ```
  Scenario: Full test suite passes
    Tool: Bash
    Preconditions: All tasks complete
    Steps:
      1. Run: bun tsc --noEmit
      2. Run: bun test
    Expected Result: All tests pass
    Failure Indicators: Any test failures
    Evidence: .sisyphus/evidence/f2-full-test-output.txt
  ```

---

- [ ] **Task F3: Manual Verification (Optional E2E)** — `quick`
  
  **What to do**:
  - Start the dev server
  - Toggle translation OFF
  - Send Hungarian message
  - Verify no translation API calls in network tab
  
  **Note**: This is optional since automated tests cover the logic. Only run if specifically requested.

---

## Commit Strategy

### Commit 1: Foundation (Tasks 1-3)
```
types(SessionUser): add translationEnabled field
auth(validateSession): include translationEnabled in SessionUser  
fix(settings): add missing profilePicture to UserSettings response

- Add translationEnabled boolean to SessionUser interface
- Return translationEnabled from validateSession with (value ?? 0) === 1 conversion
- Fix pre-existing type mismatch in settings API
```

### Commit 2: Send Endpoint (Task 4 + 6)
```
fix(chat): respect translationEnabled in send endpoint
test(chat): add translation toggle tests for send endpoint

- Add conditional: only translate when user.translationEnabled && sourceLanguage === 'hu'
- Add tests for toggle ON/OFF with Hungarian messages
```

### Commit 3: Stream Endpoint (Task 5 + 7)
```
fix(chat): respect translationEnabled in stream endpoint
test(chat): add translation toggle tests for stream endpoint

- Add conditional for input translation (translateHungarianToEnglish)
- Add conditional for output translator (StreamingHungarianTranslator)
- Add tests for toggle ON/OFF with Hungarian streaming
```

---

## Success Criteria

### Verification Commands

```bash
# Type checking
bun tsc --noEmit

# Unit tests
bun test src/lib/server/services/auth.test.ts
bun test src/routes/api/chat/send.test.ts
bun test src/routes/api/chat/stream.test.ts

# Full suite
bun test
```

### Final Checklist
- [ ] `SessionUser` interface includes `translationEnabled: boolean`
- [ ] `validateSession()` returns `translationEnabled` from database
- [ ] Send endpoint checks `user.translationEnabled` before translating
- [ ] Stream endpoint checks `user.translationEnabled` before translating
- [ ] Settings API returns `profilePicture` (type fix)
- [ ] All TypeScript compilation passes
- [ ] All existing tests pass
- [ ] New tests for toggle behavior pass
- [ ] No regressions in other functionality

### Expected Behavior After Fix
- Toggle OFF + Hungarian message → Passes through untranslated
- Toggle ON + Hungarian message → Translates HU→EN→HU
- Toggle OFF + English message → Passes through untranslated (no change)
- Toggle ON + English message → Passes through untranslated (no change)
