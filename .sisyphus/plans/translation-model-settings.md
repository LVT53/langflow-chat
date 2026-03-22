# Translation Toggle + Model Selection Features

## TL;DR

> **Quick Summary**: Rename NEMOTRON_* env vars to TITLE_GEN_* for clarity, then add two new settings controls to the message input bar - a translation pipeline toggle button and a model selection dropdown (2 configurable models via .env).
>
> **Deliverables**:
> - Renamed environment variables (NEMOTRON_* → TITLE_GEN_*)
> - Translation toggle button (enable/disable translation pipeline)
> - Model selection dropdown (2 models via .env configuration)
> - localStorage persistence for both settings
> - API endpoint to fetch available models
>
> **Estimated Effort**: Short (3 tasks, single wave)
> **Parallel Execution**: YES - all three tasks can run in parallel
> **Critical Path**: Task 0/1/2 (parallel) → Verification

---

## Context

### Original Request
User requested two features:
1. **Translation toggle**: A button to disable/enable the translation pipeline altogether, placed next to the file icon in the prompt box
2. **Model selection**: Ability to select different models (2 fixed models), configured via .env with baseUrl, apiKey, modelName, and displayName

### Key Decisions
- **Translation toggle placement**: Left of file attachment button in MessageInput
- **Model selector placement**: Left of translation toggle in MessageInput
- **Default state**: Translation enabled, Model 1 selected
- **Persistence**: localStorage (survives page refresh, defaults if cleared)
- **Design**: Match existing design per DESIGN_SPEC.md via visual-engineering agent

### Scope Boundaries

**INCLUDE**:
- Toggle button in MessageInput component
- Model selector in MessageInput component
- 2 model options configurable via .env
- State management via Svelte stores
- localStorage persistence
- API endpoint for model list

**EXCLUDE**:
- More than 2 models
- Dynamic model configuration (admin UI)
- Per-conversation persistence
- Translation bypass backend logic (Langflow integration)

---

## Work Objectives

### Core Objective
Add user-facing controls for translation pipeline toggle and model selection in the message input bar, with localStorage persistence.

### Concrete Deliverables
- [ ] Renamed environment variables (NEMOTRON_* → TITLE_GEN_*)
- [ ] Updated env.ts, .env.example, title-generator.ts, tests
- [ ] Translation toggle button in MessageInput.svelte
- [ ] Model selector dropdown in MessageInput.svelte
- [ ] Settings store with localStorage persistence
- [ ] GET /api/models endpoint

### Definition of Done
- [ ] NEMOTRON_* variables renamed to TITLE_GEN_*
- [ ] Translation toggle shows in message input bar
- [ ] Model selector shows two options from config
- [ ] Both settings persist across page refresh
- [ ] Build succeeds without errors
- [ ] All tests pass
- [ ] No visual regressions

### Must Have
- NEMOTRON_* env vars renamed to TITLE_GEN_*
- Translation toggle with enabled/disabled states
- Model selector with 2 configurable models
- localStorage persistence
- UI matching DESIGN_SPEC.md

### Must NOT Have (Guardrails)
- NO changes to existing Langflow integration logic
- NO changes to other UI components
- NO more than 2 models
- NO database storage of preferences

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Vitest configured)
- **Automated tests**: YES - write tests for stores and API
- **Strategy**: Unit tests + Playwright screenshots

### QA Policy
Every task includes Agent-Executed QA Scenarios:
- **UI Components**: Playwright screenshots
- **Stores**: Vitest unit tests
- **API**: Bash curl tests

Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (All three tasks in parallel):
├── Task 0: Rename NEMOTRON_* to TITLE_GEN_* [quick]
├── Task 1: Translation Toggle + Settings Store [visual-engineering]
└── Task 2: Model Selection + API Endpoint [visual-engineering]

Wave FINAL (Verification):
├── Task F1: Visual compliance check
├── Task F2: localStorage persistence verification
└── Task F3: API endpoint verification

Critical Path: Task 0/1/2 (parallel) → F1-F3 (parallel)
Parallel Speedup: ~65% faster than sequential
Max Concurrent: 3
```

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** - T0 (quick), T1 (visual-engineering), T2 (visual-engineering)
- **FINAL**: **3 tasks** - F1 (visual-engineering), F2 (unspecified-high), F3 (unspecified-high)

---

## TODOs

- [x] 0. Rename NEMOTRON_* Environment Variables to TITLE_GEN_*

  **What to do**:
  
  Rename the title generator environment variables from `NEMOTRON_*` to `TITLE_GEN_*` for clarity:
  - `NEMOTRON_URL` → `TITLE_GEN_URL`
  - `NEMOTRON_API_KEY` → `TITLE_GEN_API_KEY`
  - `NEMOTRON_MODEL` → `TITLE_GEN_MODEL`
  
  **Files to update**:
  
  1. `src/lib/server/env.ts`:
     - Rename Config interface properties: `nemotronUrl` → `titleGenUrl`, `nemotronApiKey` → `titleGenApiKey`, `nemotronModel` → `titleGenModel`
     - Update process.env references
  
  2. `.env.example`:
     - Rename all NEMOTRON_* variables to TITLE_GEN_*
  
  3. `src/lib/server/services/title-generator.ts`:
     - Update references from `config.nemotronUrl` → `config.titleGenUrl`, etc.
  
  4. `src/lib/server/services/title-generator.test.ts`:
     - Update any mock/test references
  
  5. `src/lib/server/env.test.ts`:
     - Update test env variable names
  
  6. `tests/mocks/nemotron-server.ts` → rename to `tests/mocks/title-gen-server.ts`:
     - Update file name and internal references
  
  7. `tests/mocks/start-mocks.ts`:
     - Update import and variable names
  
  8. `.env.test`:
     - Rename variables
  
  9. `deploy/README.md`:
     - Update documentation references

  **Must NOT do**:
  - Do NOT change the actual title generation logic
  - Do NOT change default values (keep same defaults)
  - Do NOT break existing deployments (users will need to update their .env)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple renaming across multiple files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Tasks 1, 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **Acceptance Criteria**:
  - [ ] All NEMOTRON_* variables renamed to TITLE_GEN_*
  - [ ] All config property references updated
  - [ ] Mock file renamed
  - [ ] Tests updated and passing
  - [ ] Build succeeds
  - [ ] No references to old names remain

  **QA Scenarios**:

  ```
  Scenario: No old NEMOTRON references remain
    Tool: Bash
    Preconditions: Changes applied
    Steps:
      1. grep -r "NEMOTRON" src/ tests/ .env.example
      2. grep -r "nemotron" src/lib/server/env.ts src/lib/server/services/title-generator.ts
    Expected Result: No matches (except in comments/docs if any)
    Failure Indicators: Old variable names found
    Evidence: .sisyphus/evidence/task-0-no-old-refs.txt

  Scenario: Tests pass with new names
    Tool: Bash
    Preconditions: Changes applied
    Steps:
      1. npm test -- title-generator
      2. npm test -- env
    Expected Result: All tests pass
    Failure Indicators: Test failures due to undefined config
    Evidence: .sisyphus/evidence/task-0-tests-pass.txt
  ```

  **Commit**: YES
  - Message: `refactor(env): rename NEMOTRON_* to TITLE_GEN_* for clarity`
  - Files: All files listed above
  - Pre-commit: `npm test && npm run build`

---

- [x] 1. Translation Toggle Button + Settings Store

  **What to do**:
  
  **Part A: Create Settings Store**
  - Create `src/lib/stores/settings.ts`:
    ```typescript
    export type TranslationState = 'enabled' | 'disabled';
    export type ModelId = 'model1' | 'model2';
    
    // Translation state
    export const translationState = writable<TranslationState>('enabled');
    
    export function initSettings(): void {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('translationState');
        if (stored === 'enabled' || stored === 'disabled') {
          translationState.set(stored);
        }
        const storedModel = localStorage.getItem('selectedModel');
        if (storedModel === 'model1' || storedModel === 'model2') {
          selectedModel.set(storedModel);
        }
      }
    }
    
    export function setTranslationState(state: TranslationState): void {
      translationState.set(state);
      if (typeof window !== 'undefined') {
        localStorage.setItem('translationState', state);
      }
    }
    
    // Model selection (for Task 2)
    export const selectedModel = writable<ModelId>('model1');
    
    export function setSelectedModel(model: ModelId): void {
      selectedModel.set(model);
      if (typeof window !== 'undefined') {
        localStorage.setItem('selectedModel', model);
      }
    }
    ```
  
  **Part B: Create TranslationToggle Component**
  - Create `src/lib/components/chat/TranslationToggle.svelte`:
    - Icon button with globe icon (SVG)
    - Positioned in message input bar, left of file attachment button
    - Two visual states: enabled (accent color) / disabled (muted)
    - Tooltip: "Translation enabled" / "Translation disabled"
    - Click toggles state, persists to localStorage
    - Touch target: 44x44px minimum
    - Style matching DESIGN_SPEC.md tokens
  
  **Part C: Integrate into MessageInput**
  - Update `src/lib/components/chat/MessageInput.svelte`:
    - Import TranslationToggle component
    - Add to `.composer-actions` div, left of file attachment button
    - Pass current state from store, component updates store on click
  
  **Part D: Initialize Settings on App Load**
  - Update `src/routes/(app)/+layout.svelte`:
    - Import `initSettings` from stores/settings
    - Call `initSettings()` in `onMount`
  
  **Part E: Write Tests**
  - Create `src/lib/stores/settings.test.ts`:
    - Test: default translationState is 'enabled'
    - Test: setTranslationState updates store
    - Test: state persists to localStorage (mock)

  **Must NOT do**:
  - Do NOT change any backend/Langflow logic
  - Do NOT store preferences in database
  - Do NOT affect other components

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component with styling + store setup
  - **Skills**: [`playwright`]
    - `playwright`: For screenshot verification

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 2)
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/lib/components/chat/MessageInput.svelte` - integration point
  - `src/lib/stores/theme.ts` - localStorage persistence pattern
  - `src/lib/components/layout/ThemeToggle.svelte` - bare icon button pattern

  **Design Spec References**:
  - `DESIGN_SPEC.md:241-243` - Touch targets 44x44px
  - `DESIGN_SPEC.md:346` - Icon buttons 36x36px desktop, 44x44px mobile
  - `DESIGN_SPEC.md:310-312` - Button placement in input bar

  **Acceptance Criteria**:
  - [ ] Translation toggle visible in message input bar
  - [ ] Clicking toggles between enabled/disabled
  - [ ] State persists across page refresh
  - [ ] Icon shows current state (accent vs muted)
  - [ ] Tooltip shows current state text
  - [ ] Touch target is 44x44px
  - [ ] `npm test -- settings` passes

  **QA Scenarios**:

  ```
  Scenario: Translation toggle shows and changes state
    Tool: Playwright
    Preconditions: Logged in, on conversation page
    Steps:
      1. Assert toggle visible (selector: `[data-testid="translation-toggle"]`)
      2. Assert initial tooltip shows "Translation enabled"
      3. Click toggle
      4. Assert tooltip changes to "Translation disabled"
      5. Assert icon style changed
      6. Screenshot both states
    Expected Result: Toggle works with visual feedback
    Failure Indicators: No toggle, click doesn't change state
    Evidence: .sisyphus/evidence/task-1-translation-toggle.png

  Scenario: Translation state persists across refresh
    Tool: Playwright
    Preconditions: Logged in
    Steps:
      1. Click toggle to disable
      2. Reload page
      3. Assert toggle still shows disabled
      4. Assert localStorage has translationState=disabled
    Expected Result: Preference remembered
    Failure Indicators: State resets
    Evidence: .sisyphus/evidence/task-1-translation-persist.png
  ```

  **Commit**: YES
  - Message: `feat(settings): add translation toggle button with localStorage persistence`
  - Files: `src/lib/stores/settings.ts, src/lib/components/chat/TranslationToggle.svelte, src/lib/components/chat/MessageInput.svelte, src/routes/(app)/+layout.svelte, src/lib/stores/settings.test.ts`
  - Pre-commit: `npm test -- settings && npm run build`

---

- [x] 2. Model Selection + API Endpoint

  **What to do**:
  
  **Part A: Update Environment Config**
  - Update `src/lib/server/env.ts`:
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
    
    // In getConfig():
    model1: {
      baseUrl: process.env.MODEL_1_BASEURL || 'http://localhost:30001/v1',
      apiKey: process.env.MODEL_1_API_KEY || '',
      modelName: process.env.MODEL_1_NAME || 'model-1',
      displayName: process.env.MODEL_1_DISPLAY_NAME || 'Model 1',
    },
    model2: {
      baseUrl: process.env.MODEL_2_BASEURL || '',
      apiKey: process.env.MODEL_2_API_KEY || '',
      modelName: process.env.MODEL_2_NAME || '',
      displayName: process.env.MODEL_2_DISPLAY_NAME || 'Model 2',
    },
    ```
  
  **Part B: Update .env.example**
  - Add new variables:
    ```
    # Model 1 Configuration (default)
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
  
  **Part C: Create Models API Endpoint**
  - Create `src/routes/api/models/+server.ts`:
    ```typescript
    import { config } from '$lib/server/env';
    import type { RequestHandler } from './$types';
    
    export const GET: RequestHandler = async () => {
      return new Response(JSON.stringify({
        models: [
          { id: 'model1', displayName: config.model1.displayName },
          { id: 'model2', displayName: config.model2.displayName },
        ]
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    };
    ```
  
  **Part D: Create ModelSelector Component**
  - Create `src/lib/components/chat/ModelSelector.svelte`:
    - Dropdown or compact selector
    - Positioned in message input bar, left of translation toggle
    - Shows two model display names from API/config
    - Default selection: Model 1
    - Selection persists to localStorage
    - Style matching DESIGN_SPEC.md
    - Props: none (reads from store, updates store on change)
  
  **Part E: Integrate into MessageInput**
  - Update `src/lib/components/chat/MessageInput.svelte`:
    - Import ModelSelector component
    - Add to `.composer-actions` div, left of translation toggle
  
  **Part F: Write Tests**
  - Create `src/routes/api/models/models.test.ts`:
    - Test: GET returns two models with display names
  - Add to `src/lib/stores/settings.test.ts`:
    - Test: default selectedModel is 'model1'
    - Test: setSelectedModel updates store
    - Test: model selection persists

  **Must NOT do**:
  - Do NOT add more than 2 models
  - Do NOT change Langflow client logic
  - Do NOT store in database

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: UI component + API endpoint + config
  - **Skills**: [`playwright`]
    - `playwright`: For screenshot verification

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 1)
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `src/lib/components/chat/MessageInput.svelte` - integration point
  - `src/lib/server/env.ts` - config module to extend
  - `src/lib/stores/settings.ts` (Task 1) - selectedModel store

  **Design Spec References**:
  - `DESIGN_SPEC.md:241-243` - Touch targets
  - `DESIGN_SPEC.md:310-312` - Button placement

  **Acceptance Criteria**:
  - [ ] Model selector visible in message input bar
  - [ ] Two options shown with display names from config
  - [ ] Default selection is Model 1
  - [ ] Selection persists across page refresh
  - [ ] GET /api/models returns model list
  - [ ] `npm test -- settings` passes
  - [ ] `npm test -- models` passes

  **QA Scenarios**:

  ```
  Scenario: Model selector shows two options
    Tool: Playwright
    Preconditions: Logged in, on conversation page
    Steps:
      1. Assert selector visible (selector: `[data-testid="model-selector"]`)
      2. Click to open dropdown
      3. Assert two options visible
      4. Assert Model 1 selected by default
      5. Screenshot
    Expected Result: Selector with two options
    Failure Indicators: No selector, wrong count
    Evidence: .sisyphus/evidence/task-2-model-selector.png

  Scenario: Model selection persists
    Tool: Playwright
    Preconditions: Logged in
    Steps:
      1. Select Model 2
      2. Reload page
      3. Assert Model 2 still selected
      4. Assert localStorage has selectedModel=model2
    Expected Result: Selection remembered
    Failure Indicators: Resets to Model 1
    Evidence: .sisyphus/evidence/task-2-model-persist.png

  Scenario: Models API returns correct data
    Tool: Bash (curl)
    Preconditions: Server running
    Steps:
      1. curl -s http://localhost:5173/api/models
      2. Parse JSON
      3. Assert models array has 2 items
      4. Assert each has id and displayName
    Expected Result: Valid model list
    Failure Indicators: Wrong format, wrong count
    Evidence: .sisyphus/evidence/task-2-models-api.txt
  ```

  **Commit**: YES
  - Message: `feat(settings): add model selection dropdown with 2 configurable models`
  - Files: `src/lib/server/env.ts, .env.example, src/routes/api/models/+server.ts, src/lib/components/chat/ModelSelector.svelte, src/lib/components/chat/MessageInput.svelte, src/lib/stores/settings.ts, src/routes/api/models/models.test.ts`
  - Pre-commit: `npm test -- models && npm test -- settings && npm run build`

---

## Final Verification Wave

- [x] F1. Visual Compliance Check — `visual-engineering`
  - Verify both controls visible in message input bar
  - Verify layout doesn't break on mobile
  - Verify touch targets are 44x44px
  - Screenshot: desktop + mobile
  - Output: `Visual [PASS/FAIL] | Mobile [PASS/FAIL] | Touch Targets [PASS/FAIL]`

- [x] F2. localStorage Persistence Check — `unspecified-high`
  - Toggle translation → refresh → verify state
  - Change model → refresh → verify state
  - Clear localStorage → verify defaults restored
  - Output: `Translation Persist [PASS/FAIL] | Model Persist [PASS/FAIL] | Defaults [PASS/FAIL]`

- [x] F3. API Endpoint Check — `unspecified-high`
  - GET /api/models returns valid JSON
  - Two models with correct display names
  - Output: `API [PASS/FAIL] | Models [2/2] | Names [CORRECT/WRONG]`

---

## Commit Strategy

| Task | Commit Message | Files |
|------|---------------|-------|
| 0 | `refactor(env): rename NEMOTRON_* to TITLE_GEN_* for clarity` | env.ts, .env.example, title-generator.ts, tests/mocks/*, deploy/README.md |
| 1 | `feat(settings): add translation toggle button with localStorage persistence` | settings.ts, TranslationToggle.svelte, MessageInput.svelte, +layout.svelte |
| 2 | `feat(settings): add model selection dropdown with 2 configurable models` | env.ts, .env.example, +server.ts, ModelSelector.svelte, MessageInput.svelte, settings.ts |

---

## Success Criteria

### Verification Commands
```bash
npm run build                    # Expected: Build succeeds
npm test -- settings             # Expected: All settings tests pass
npm test -- models               # Expected: All models tests pass
curl http://localhost:5173/api/models  # Expected: JSON with 2 models
```

### Final Checklist
- [ ] NEMOTRON_* variables renamed to TITLE_GEN_*
- [ ] All config references updated to new names
- [ ] Translation toggle visible in message input bar
- [ ] Model selector visible in message input bar
- [ ] Both controls styled per DESIGN_SPEC.md
- [ ] Translation toggle toggles between enabled/disabled
- [ ] Model selector shows 2 options from .env config
- [ ] Both settings persist across page refresh
- [ ] GET /api/models returns valid model list
- [ ] Build succeeds without errors
- [ ] All tests pass
- [ ] No visual regressions in existing components

---

## Summary

**Total Tasks**: 3 implementation + 3 verification = 6 tasks
**Execution Waves**: 1 wave (all parallel) + Final verification
**Estimated Effort**: Short - focused refactoring + feature addition
**Key Files**: env.ts, .env.example, MessageInput.svelte, settings.ts, title-generator.ts

**Success Definition**: Environment variables renamed for clarity, two new settings controls in the message input bar, both persisting to localStorage, with clean API for model configuration, matching the existing design system without affecting other parts of the application.