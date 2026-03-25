# Knowledge Base & Chat Elements Redesign

## TL;DR

> **Quick Summary**: Redesign 5 visual elements to consistently apply the warm minimalism design system: FileAttachment component (compact cards), ContextStatus component (standard detail), WorkingWithBlock component (below input), unified Knowledge Base card grid, and rename "Honcho Memory" to "Memory Profile".
> 
> **Deliverables**:
> - 3 new Svelte components extracted from inline code
> - Unified file attachment styling across chat
> - Redesigned Knowledge Base page with consistent card grid
> - "Honcho Memory" → "Memory Profile" rename
> - Zero functional changes, visual redesign only
> 
> **Estimated Effort**: Medium (3-4 hours)
> **Parallel Execution**: YES - 3 waves of tasks
> **Critical Path**: Component extraction → KB page redesign → Integration verification

---

## Context

### Original Request
Redesign the following new elements to fit into the rest of the app's design language:
1. Uploaded file notice in user message
2. Context status block
3. "Working with" block
4. Uploaded files in chat
5. Entirety of the Knowledge base pages including Library and Honcho Memory (rename to "Memory Profile")

### Interview Summary
**Key Discussions**:
- **Attachment style**: Compact cards with icon + filename (not pills, not full cards)
- **"Working with" placement**: Below message input (in chat flow area)
- **Context status detail**: Standard (token count + optimization badge)
- **Knowledge Base layout**: Unified 2-column card grid for all sections
- **Component extraction**: YES, extract all inline code to reusable components

### Research Findings
**Design System (from DESIGN_SYSTEM_LLM_SPEC.md)**:
- **Aesthetic**: Warm minimalism, paper-like, editorial
- **Colors**: Terracotta accent #C15F3C, warm neutrals (#FAFAF8 page, #F4F3EE elevated)
- **Typography**: Libre Baskerville (serif) for content, Nimbus Sans L (sans-serif) for UI
- **Cards**: `rounded-[1.2rem]` to `rounded-[1.5rem]`, `border border-border`, `bg-surface-elevated`
- **Spacing**: Multiples of 4px, generous whitespace (`--space-md` = 16px)
- **Shadows**: Soft, layered with `var(--shadow-sm)` or `var(--shadow-lg)`

**Existing Patterns**:
- Knowledge Base cards use `rounded-[1.2rem]` with subtle borders
- Message bubbles use `rounded-md` with `bg-surface-elevated`
- Sidebar items use hover states with gold-tinted backgrounds
- Buttons use 44px min touch targets with consistent transitions

### Metis Review
**Identified Gaps** (addressed):
- Responsive specifications → Use existing breakpoints (lg: 1024px, md: 768px)
- Empty/loading/error states → Follow existing patterns (subtle text, no harsh errors)
- Interaction specs → Hover reveals, click for actions (like ConversationItem)
- Animation specs → Use `--duration-micro` (100ms) and `--duration-standard` (150ms)
- Data thresholds → Show max 3 files + overflow counter, truncate long names

---

## Work Objectives

### Core Objective
Extract inline code to 3 reusable Svelte components and redesign the Knowledge Base page to consistently apply the warm minimalism design system, achieving visual harmony across all file displays, status blocks, and knowledge sections.

### Concrete Deliverables
1. **FileAttachment.svelte** component - Compact card style for all file displays
2. **ContextStatus.svelte** component - Token count + optimization badge
3. **WorkingWithBlock.svelte** component - AI working indicator below input
4. **Redesigned knowledge/+page.svelte** - Unified card grid layout
5. **Updated references** - "Honcho Memory" → "Memory Profile" (visual only)

### Definition of Done
- [x] All 5 elements visually consistent with design system
- [x] New components extracted and imported in parent pages
- [x] "Memory Profile" tab label updated (no URL changes)
- [x] Responsive behavior verified at 320px, 768px, 1024px+
- [x] All existing chat functionality preserved (verified by agent QA)
- [x] No console errors or accessibility violations

### Must Have
- Use existing CSS custom properties exclusively (no hardcoded values)
- Apply `rounded-[1.2rem]` card pattern consistently
- Maintain 44px minimum touch targets for all interactive elements
- Support both light and dark mode via existing `.dark` class
- Preserve all existing functionality (data flow, events, APIs)

### Must NOT Have (Guardrails)
- NO functional changes to data loading or API calls
- NO drag-and-drop file upload (out of scope)
- NO file preview modals (out of scope)
- NO new animation libraries (use existing CSS transitions only)
- NO changes to routing or URL structure
- NO modifications to database queries or types
- NO "while I'm here" improvements to unrelated code

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES - Vitest + Playwright configured
- **Automated tests**: Tests-after implementation
- **Framework**: Vitest for unit tests, Playwright for E2E visual verification
- **QA Policy**: Every task includes Agent-Executed QA Scenarios

### QA Policy
Every task MUST include agent-executed QA scenarios:
- **Frontend/UI**: Playwright screenshots of components at multiple viewports
- **Evidence**: Screenshots saved to `.sisyphus/evidence/task-{N}-{scenario}.png`
- **Assertions**: Visual comparison + functional verification (click, hover, etc.)

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately - Component Extraction Foundation):
├── Task 1: Extract FileAttachment.svelte component [quick]
├── Task 2: Extract ContextStatus.svelte component [quick]
└── Task 3: Extract WorkingWithBlock.svelte component [quick]

Wave 2 (After Wave 1 - Knowledge Base Redesign):
├── Task 4: Redesign Knowledge Base header and stats [visual-engineering]
├── Task 5: Redesign Documents section (2-col card grid) [visual-engineering]
├── Task 6: Redesign Results section (2-col card grid) [visual-engineering]
├── Task 7: Redesign Workflows section (2-col card grid) [visual-engineering]
└── Task 8: Rename "Honcho Memory" to "Memory Profile" + redesign [visual-engineering]

Wave 3 (After Wave 2 - Integration & Parent Updates):
├── Task 9: Update MessageBubble.svelte to use FileAttachment [quick]
├── Task 10: Update MessageInput.svelte to use FileAttachment [quick]
├── Task 11: Update chat page to use ContextStatus + WorkingWithBlock [quick]
└── Task 12: Final responsive verification across all breakpoints [unspecified-high]

Wave FINAL (After ALL tasks - 3 parallel reviews, then user okay):
├── Task F1: Visual regression testing (Playwright screenshots) [unspecified-high]
├── Task F2: Functional regression testing (chat flow verification) [unspecified-high]
└── Task F3: Accessibility audit (axe-core scan) [unspecified-high]
-> Present results -> Get explicit user okay
```

### Dependency Matrix

- **1-3**: — → 9, 10, 11
- **4-8**: — → 12
- **9**: 1 → 11
- **10**: 1 → 11
- **11**: 2, 3, 9, 10 → 12
- **12**: 4-11 → F1-F3
- **F1-F3**: 1-12 → user okay

**Critical Path**: Task 1 → Task 9 → Task 11 → Task 12 → F1-F3 → user okay
**Parallel Speedup**: ~60% faster than sequential
**Max Concurrent**: 5 (Wave 2)

### Agent Dispatch Summary

- **1**: **3** - T1-T3 → `quick`
- **2**: **5** - T4-T8 → `visual-engineering`
- **3**: **4** - T9-T12 → `quick`, `unspecified-high`
- **FINAL**: **3** - F1-F3 → `unspecified-high`

---

## TODOs

> Implementation + Test = ONE Task. Never separate.
> EVERY task MUST have: Recommended Agent Profile + QA Scenarios.

- [x] 1. Extract FileAttachment.svelte Component

  **What to do**:
  - Create new component at `src/lib/components/chat/FileAttachment.svelte`
  - Extract inline code from MessageBubble.svelte lines 189-196 AND MessageInput.svelte lines 193-209
  - Implement compact card design:
    - Container: `rounded-[1.2rem] border border-border bg-surface-elevated shadow-sm`
    - Padding: `px-3 py-2` (12px horizontal, 8px vertical)
    - Icon: File icon (16px) with `text-icon-muted`
    - Filename: `text-sm font-sans text-text-primary`, truncate with ellipsis at 180px max-width
    - Remove button: `btn-icon-bare h-6 w-6` with × icon, only when `removable` prop is true
  - Props interface:
    - `attachment: {id: string, name: string, type?: string}`
    - `removable?: boolean` - show remove button
    - `onRemove?: (id: string) => void` - callback when remove clicked
    - `variant: 'compact' | 'pending'` - compact for sent, pending for uploading
  - For pending variant: Add subtle pulse animation on border using `--duration-standard`

  **Must NOT do**:
  - Handle file upload logic (parent component handles that)
  - Implement drag-and-drop (out of scope)
  - Add file preview functionality (out of scope)
  - Use hardcoded colors (must use CSS custom properties)

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: [] (no special skills needed)
  - **Rationale**: Component extraction with straightforward Tailwind styling, clear specifications from design system

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 9, 10, 11
  - **Blocked By**: None

  **References**:
  - **Pattern**: `src/lib/components/chat/MessageBubble.svelte:189-196` - Current attachment display
  - **Pattern**: `src/lib/components/chat/MessageInput.svelte:193-209` - Pending attachments display
  - **Pattern**: `src/lib/components/sidebar/ConversationItem.svelte:30-45` - Hover state pattern with gold tint
  - **Design Tokens**: `src/app.css:85-157` - All CSS custom properties
  - **Icon Set**: Use Lucide icons (already in project) - FileText, X

  **Acceptance Criteria**:
  - [ ] Component file created at correct path
  - [ ] Props interface defined with TypeScript
  - [ ] Compact variant matches design: rounded-[1.2rem], border, surface-elevated bg
  - [ ] Pending variant has subtle border pulse animation
  - [ ] Filename truncates with ellipsis at max-width 180px
  - [ ] Remove button only appears when removable=true
  - [ ] Uses CSS custom properties exclusively (no hardcoded colors)
  - [ ] 44px minimum touch target for remove button

  **QA Scenarios**:
  ```
  Scenario: Component renders in compact variant
    Tool: Read + verification
    Preconditions: Component file exists
    Steps:
      1. Read FileAttachment.svelte
      2. Verify props interface matches spec
      3. Verify HTML structure uses rounded-[1.2rem] container
      4. Verify CSS custom properties used for colors
    Expected Result: Component code matches all acceptance criteria
    Evidence: None needed (code review)
  ```

  **Commit**: YES (groups with Tasks 2, 3 as "style(components): extract FileAttachment, ContextStatus, WorkingWithBlock components")

---

- [x] 2. Extract ContextStatus.svelte Component

  **What to do**:
  - Create new component at `src/lib/components/chat/ContextStatus.svelte`
  - Extract inline code from chat/[conversationId]/+page.svelte lines 483-501
  - Implement standard detail design:
    - Container: `rounded-[1.2rem] border border-border bg-surface-elevated/80 px-4 py-3`
    - Token display: `text-sm font-sans text-text-muted`
      - Format: "{estimatedTokens.toLocaleString()} / {maxContextTokens.toLocaleString()} tokens"
    - Optimization badge (when compactionApplied=true):
      - `rounded-full bg-accent/10 px-2 py-0.5 text-xs font-sans text-accent`
      - Label: "Optimized"
    - Layers used (when layersUsed.length > 0):
      - Container: `mt-2 flex flex-wrap gap-2`
      - Each layer: `rounded-full border border-border px-2 py-1 text-xs font-sans text-text-secondary`
  - Props interface:
    - `contextStatus: {estimatedTokens: number, maxContextTokens: number, compactionApplied: boolean, layersUsed: string[]}`

  **Must NOT do**:
  - Modify token calculation logic (receive pre-calculated values)
  - Add real-time updates (use existing data flow)
  - Change the data structure from parent

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Rationale**: Straightforward extraction with clear design specs

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Task 11
  - **Blocked By**: None

  **References**:
  - **Source**: `src/routes/(app)/chat/[conversationId]/+page.svelte:483-501` - Current inline implementation
  - **Pattern**: `src/routes/(app)/knowledge/+page.svelte:86-98` - Stats card pattern (rounded-[1.1rem])
  - **Badge Pattern**: `src/lib/components/chat/ThinkingBlock.svelte:188-217` - Animated text sweep (for reference only, don't copy animation)

  **Acceptance Criteria**:
  - [ ] Component file created
  - [ ] Props interface with TypeScript types
  - [ ] Token count displays with comma separators (toLocaleString)
  - [ ] Optimization badge shows only when compactionApplied=true
  - [ ] Badge uses accent color with 10% opacity background
  - [ ] Layers displayed as rounded-full tags with border
  - [ ] Container uses rounded-[1.2rem] with bg-surface-elevated/80

  **QA Scenarios**:
  ```
  Scenario: ContextStatus renders with all data
    Tool: Read + verification
    Preconditions: Component file exists
    Steps:
      1. Read ContextStatus.svelte
      2. Verify token count formatting includes commas
      3. Verify optimization badge conditional rendering
      4. Verify layers mapping to tag elements
    Expected Result: All conditional rendering logic correct
    Evidence: None needed (code review)
  ```

  **Commit**: YES (groups with Tasks 1, 3)

---

- [x] 3. Extract WorkingWithBlock.svelte Component

  **What to do**:
  - Create new component at `src/lib/components/chat/WorkingWithBlock.svelte`
  - Extract inline code from chat/[conversationId]/+page.svelte lines 513-532
  - Implement placement below message input:
    - Container: `rounded-[1rem] border border-border bg-surface-elevated/70 px-4 py-3`
    - Header: `text-[0.7rem] font-sans uppercase tracking-[0.1em] text-text-muted` - "Working with"
    - Artifacts list: `flex flex-wrap items-center gap-2`
      - Each artifact: `flex items-center gap-2 rounded-full border border-border bg-surface-page px-3 py-1`
        - Type label: `text-[10px] uppercase tracking-[0.08em] text-text-muted` ("Doc" or "Result")
        - Name: `max-w-[180px] truncate text-sm font-sans text-text-primary`
    - Overflow indicator: `rounded-full bg-surface-page px-2 py-1 text-xs font-sans text-text-muted` - "+{count}"
  - Props interface:
    - `artifacts: {id: string, name: string, type: 'document' | 'result'}[]`
    - `maxVisible?: number` - default 3

  **Must NOT do**:
  - Determine "working" state (parent controls visibility)
  - Auto-dismiss or hide (parent controls lifecycle)
  - Change artifact data structure

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Rationale**: Component extraction with established patterns

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: Task 11
  - **Blocked By**: None

  **References**:
  - **Source**: `src/routes/(app)/chat/[conversationId]/+page.svelte:513-532` - Current inline implementation
  - **Pattern**: `src/routes/(app)/knowledge/+page.svelte:149-181` - Artifact card pattern
  - **Badge Style**: `src/routes/(app)/knowledge/+page.svelte:291-296` - Uppercase tracking pattern

  **Acceptance Criteria**:
  - [ ] Component file created
  - [ ] Props interface with TypeScript types
  - [ ] Shows max 3 artifacts by default (configurable via maxVisible)
  - [ ] Overflow shown as "+N" badge
  - [ ] Type labels use 10px uppercase with tracking
  - [ ] Artifact names truncate at 180px max-width
  - [ ] Container uses rounded-[1rem] with subtle bg (bg-surface-elevated/70)

  **QA Scenarios**:
  ```
  Scenario: WorkingWithBlock with overflow
    Tool: Read + verification
    Preconditions: Component file exists
    Steps:
      1. Read WorkingWithBlock.svelte
      2. Verify maxVisible prop with default value 3
      3. Verify slice logic for visible artifacts
      4. Verify overflow count calculation
    Expected Result: Shows correct number of artifacts + overflow indicator
    Evidence: None needed (code review)
  ```

  **Commit**: YES (groups with Tasks 1, 2)

---

- [x] 4. Redesign Knowledge Base Header and Stats

  **What to do**:
  - Update `src/routes/(app)/knowledge/+page.svelte` header section (lines 72-128)
  - Keep existing structure but refine styling:
    - Main container: Already uses `rounded-[1.5rem] border border-border bg-surface-elevated px-5 py-5 shadow-sm` - verify this is correct
    - Title: `text-[2rem] font-serif tracking-[-0.05em] text-text-primary md:text-[2.75rem]` - keep as-is
    - Description: `text-sm font-sans leading-[1.5] text-text-secondary` - keep as-is
  - Redesign stats cards (lines 85-98):
    - Current uses `rounded-[1.1rem]` - update to `rounded-[1.2rem]` for consistency
    - Ensure consistent padding: `px-3 py-3`
    - Labels: `text-[0.65rem] uppercase tracking-[0.12em] text-text-muted`
    - Values: `text-xl font-serif text-text-primary`
    - Background: `bg-surface-page` (keep)
    - Border: `border border-border` (keep)
  - Tabs (lines 101-126):
    - Keep existing pill-style tabs
    - Active tab: `bg-surface-elevated text-text-primary shadow-sm`
    - Inactive tab: `text-text-secondary hover:text-text-primary`
    - Just update "Honcho Memory" label to "Memory Profile"

  **Must NOT do**:
  - Change data loading logic
  - Modify tab switching behavior
  - Change the grid layout (keep 3-column stats)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]
  - **Rationale**: Visual redesign requiring understanding of warm minimalism aesthetic and Tailwind application

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5-8)
  - **Blocks**: Task 12 (responsive verification)
  - **Blocked By**: None

  **References**:
  - **Target**: `src/routes/(app)/knowledge/+page.svelte:72-128` - Header section
  - **Pattern**: `src/lib/components/layout/Sidebar.svelte:330-345` - Card shadow pattern
  - **Typography**: `DESIGN_SYSTEM_LLM_SPEC.md:295-326` - Typography scale

  **Acceptance Criteria**:
  - [ ] Stats cards use rounded-[1.2rem] consistently
  - [ ] Tab label "Honcho Memory" changed to "Memory Profile"
  - [ ] All spacing uses design system tokens (no magic numbers)
  - [ ] Dark mode support preserved

  **QA Scenarios**:
  ```
  Scenario: Header renders correctly at desktop
    Tool: Playwright (skill: frontend-ui-ux)
    Preconditions: Dev server running
    Steps:
      1. Navigate to /knowledge
      2. Set viewport to 1280x720
      3. Screenshot header section
      4. Verify stats cards have rounded-[1.2rem]
      5. Verify "Memory Profile" tab label visible
    Expected Result: Header matches design spec, tab renamed
    Evidence: .sisyphus/evidence/task-4-header-desktop.png
  ```

  **Commit**: NO (groups with Tasks 5-8 as single KB redesign commit)

---

- [x] 5. Redesign Documents Section (2-Column Card Grid)

  **What to do**:
  - Update Documents section in knowledge/+page.svelte (lines 136-184)
  - Change from current grid to unified card pattern:
    - Section container: Keep existing `rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5`
    - Header: Keep existing `flex items-center justify-between` with h2 and count badge
    - Grid: Change to `grid gap-3 md:grid-cols-2` (standardize 2-col)
    - Empty state: Keep existing dashed border style
    - **Card redesign** (current lines 149-181):
      - Container: `rounded-[1.2rem] border border-border bg-surface-page px-4 py-4`
      - Header: `flex items-start justify-between gap-3`
        - Title section: `min-w-0 flex-1`
          - Name: `text-sm font-sans font-medium text-text-primary`
          - Type: `mt-1 text-xs uppercase tracking-[0.08em] text-text-muted`
        - Actions: `flex items-start gap-2`
          - Size: `text-xs font-sans text-text-muted` (when available)
          - Remove button: `btn-icon-bare h-8 w-8 rounded-full text-icon-muted hover:text-danger`
      - Summary (if present): `mt-3 text-sm font-serif leading-[1.45] text-text-secondary`

  **Must NOT do**:
  - Change delete functionality
  - Modify data structure or API calls
  - Add new features (search, filter, etc.)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]
  - **Rationale**: Card grid redesign requiring visual consistency

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6-8)
  - **Blocks**: Task 12
  - **Blocked By**: None

  **References**:
  - **Target**: `src/routes/(app)/knowledge/+page.svelte:136-184` - Documents section
  - **Pattern**: Existing card styling in same file
  - **Button**: `src/app.css:340-375` - btn-icon-bare styles

  **Acceptance Criteria**:
  - [ ] Uses unified 2-column grid layout
  - [ ] Cards use rounded-[1.2rem] consistently
  - [ ] Type labels use uppercase tracking pattern
  - [ ] Remove button uses btn-icon-bare pattern
  - [ ] Summary text uses font-serif

  **QA Scenarios**:
  ```
  Scenario: Documents grid at tablet viewport
    Tool: Playwright
    Preconditions: Knowledge base has documents
    Steps:
      1. Navigate to /knowledge
      2. Set viewport to 768x1024
      3. Screenshot Documents section
      4. Verify 2-column grid visible
      5. Verify card styling matches spec
    Expected Result: 2-col grid, cards styled consistently
    Evidence: .sisyphus/evidence/task-5-documents-tablet.png
  ```

  **Commit**: NO (groups with Tasks 4-8)

---

- [x] 6. Redesign Results Section (2-Column Card Grid)

  **What to do**:
  - Update Results section in knowledge/+page.svelte (lines 186-225)
  - Apply same unified card pattern as Documents section:
    - Section container: Same as Documents
    - Header: Same structure with h2 + count badge
    - Grid: `grid gap-3 md:grid-cols-2`
    - Card structure:
      - Container: `rounded-[1.2rem] border border-border bg-surface-page px-4 py-4`
      - Content: Similar to Documents but Results don't have type labels
      - Just name + remove button + optional summary

  **Must NOT do**:
  - Different styling from Documents section
  - Change data structure

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]
  - **Rationale**: Consistency with Task 5

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 7, 8)
  - **Blocks**: Task 12
  - **Blocked By**: None

  **References**:
  - **Target**: `src/routes/(app)/knowledge/+page.svelte:186-225` - Results section
  - **Pattern**: Task 5 output (Documents section)

  **Acceptance Criteria**:
  - [ ] Matches Documents section styling
  - [ ] Uses 2-column grid
  - [ ] No type label (Results don't have types)
  - [ ] Consistent card padding and borders

  **QA Scenarios**:
  ```
  Scenario: Results section matches Documents
    Tool: Playwright
    Preconditions: Both sections have content
    Steps:
      1. Navigate to /knowledge
      2. Screenshot full page
      3. Verify Results cards match Documents cards visually
    Expected Result: Visual consistency between sections
    Evidence: .sisyphus/evidence/task-6-results.png
  ```

  **Commit**: NO (groups with Tasks 4-8)

---

- [x] 7. Redesign Workflows Section (2-Column Card Grid)

  **What to do**:
  - Update Workflows section in knowledge/+page.svelte (lines 227-285)
  - Convert from current list layout to unified 2-column card grid:
    - Section container: Same as Documents/Results
    - Header: Same structure
    - Grid: Change from `space-y-3` to `grid gap-3 md:grid-cols-2`
    - Card structure:
      - Container: `rounded-[1.2rem] border border-border bg-surface-page px-4 py-4`
      - Header: `flex flex-wrap items-center justify-between gap-2`
        - Title + taskSummary
        - Stats: `text-xs uppercase tracking-[0.08em] text-text-muted` - "{N} docs / {N} outputs"
        - Remove button
      - Workflow summary (if present): `mt-3 text-sm font-serif text-text-secondary`
      - Tags (if present): `mt-3 flex flex-wrap gap-2`
        - Each tag: `rounded-full border border-border px-3 py-1 text-xs font-sans text-text-secondary`

  **Must NOT do**:
  - Remove tag functionality
  - Change workflow data structure

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]
  - **Rationale**: Convert list to grid while preserving workflow-specific data

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4-6, 8)
  - **Blocks**: Task 12
  - **Blocked By**: None

  **References**:
  - **Target**: `src/routes/(app)/knowledge/+page.svelte:227-285` - Workflows section
  - **Pattern**: Task 5 (Documents) for card base structure

  **Acceptance Criteria**:
  - [ ] Uses 2-column grid (not list)
  - [ ] Preserves all workflow data (taskSummary, stats, tags)
  - [ ] Tags display as rounded-full pills
  - [ ] Stats use uppercase tracking pattern
  - [ ] Card styling matches Documents/Results

  **QA Scenarios**:
  ```
  Scenario: Workflow cards with tags
    Tool: Playwright
    Preconditions: Workflow with tags exists
    Steps:
      1. Navigate to /knowledge
      2. Screenshot Workflows section
      3. Verify 2-col grid
      4. Verify tags display as pills
    Expected Result: Grid layout with all data visible
    Evidence: .sisyphus/evidence/task-7-workflows.png
  ```

  **Commit**: NO (groups with Tasks 4-8)

---

- [x] 8. Rename "Honcho Memory" to "Memory Profile" and Redesign Tab

  **What to do**:
  - Update Memory Profile tab in knowledge/+page.svelte (lines 287-354)
  - **Rename** (visual only):
    - Tab label: Change "Honcho Memory" to "Memory Profile" (line 124)
    - Section badges: Update labels from "Honcho user memory" to "Memory Profile" (line 291)
    - Title: Change "What Honcho currently knows about you" to "Memory Overview" (line 298)
  - **Redesign** overview panel:
    - Main container: `rounded-[1.3rem] border border-border bg-surface-page px-5 py-5`
    - Keep existing badges layout
    - Keep existing typography for overview text
  - **Redesign** info boxes:
    - Container: `rounded-[1.3rem] border border-border bg-surface-page px-4 py-4`
    - Labels: `text-[0.7rem] uppercase tracking-[0.12em] text-text-muted`
    - Content: `mt-3 text-sm font-sans leading-[1.6] text-text-secondary`
  - **Redesign** memory signals:
    - Grid: `grid gap-3 md:grid-cols-2`
    - Cards: `rounded-[1.2rem] border border-border bg-surface-page px-4 py-4`
    - Labels: `text-[0.7rem] uppercase tracking-[0.12em] text-text-muted`
    - Content: `mt-3 text-sm font-serif leading-[1.55] text-text-secondary`

  **Must NOT do**:
  - Change URL (/knowledge stays same)
  - Modify variable names (honchoEnabled, honchoOverview, etc.)
  - Change API calls
  - Only update visible user-facing strings

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: [`frontend-ui-ux`]
  - **Rationale**: Text updates + visual consistency with Library tab

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4-7)
  - **Blocks**: Task 12
  - **Blocked By**: None

  **References**:
  - **Target**: `src/routes/(app)/knowledge/+page.svelte:287-354` - Memory tab section
  - **Pattern**: Tasks 5-7 for grid/card patterns

  **Acceptance Criteria**:
  - [ ] Tab shows "Memory Profile" (not "Honcho Memory")
  - [ ] Badge shows "Memory Profile" (not "Honcho user memory")
  - [ ] Title shows "Memory Overview" or similar (not "What Honcho...")
  - [ ] Info boxes use consistent rounded-[1.3rem] styling
  - [ ] Memory signals use 2-col grid with rounded-[1.2rem] cards
  - [ ] All text changes are visual only (no variable renames)

  **QA Scenarios**:
  ```
  Scenario: Memory Profile tab renamed
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to /knowledge
      2. Click "Memory Profile" tab
      3. Screenshot tab content
      4. Verify "Memory Profile" visible (not "Honcho Memory")
      5. Verify no "Honcho" text visible in UI
    Expected Result: All user-facing "Honcho" references removed
    Evidence: .sisyphus/evidence/task-8-memory-profile.png
  ```

  **Commit**: YES (groups with Tasks 4-7 as "style(knowledge): redesign Knowledge Base with unified card grid")

---

- [x] 9. Update MessageBubble.svelte to Use FileAttachment Component

  **What to do**:
  - Update `src/lib/components/chat/MessageBubble.svelte` (lines 189-196)
  - Replace inline attachment display with FileAttachment component:
    - Import FileAttachment component
    - Replace:
      ```svelte
      {#each message.attachments ?? [] as attachment (attachment.id)}
        <div class="rounded-full ...">{attachment.name}</div>
      {/each}
      ```
    - With:
      ```svelte
      {#each message.attachments ?? [] as attachment (attachment.id)}
        <FileAttachment {attachment} variant="compact" />
      {/each}
      ```
  - Keep existing container wrapper with flex layout and gap-2
  - Ensure no functional changes (data flow, events, etc.)

  **Must NOT do**:
  - Modify message data structure
  - Change attachment handling logic
  - Touch message editing functionality (lines 173-187)
  - Modify copy/regenerate functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Rationale**: Simple component substitution with no logic changes

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 10-12)
  - **Blocks**: Task 11 (chat page integration), Task 12
  - **Blocked By**: Task 1 (FileAttachment component)

  **References**:
  - **Target**: `src/lib/components/chat/MessageBubble.svelte:189-196` - Attachment display
  - **Component**: Task 1 output - FileAttachment.svelte

  **Acceptance Criteria**:
  - [ ] FileAttachment imported and used
  - [ ] variant="compact" prop set correctly
  - [ ] No removable prop (sent attachments not removable in message bubble)
  - [ ] Visual appearance matches new compact card design

  **QA Scenarios**:
  ```
  Scenario: Message with attachment renders
    Tool: Playwright
    Preconditions: Chat page with existing conversation containing attachments
    Steps:
      1. Navigate to chat/[conversationId]
      2. Screenshot message with attachment
      3. Verify compact card styling (not old pill)
    Expected Result: Attachments show as compact cards per design
    Evidence: .sisyphus/evidence/task-9-message-attachment.png
  ```

  **Commit**: YES (groups with Tasks 10, 11 as "refactor(chat): integrate new components into chat pages")

---

- [x] 10. Update MessageInput.svelte to Use FileAttachment Component

  **What to do**:
  - Update `src/lib/components/chat/MessageInput.svelte` (lines 193-209)
  - Replace inline pending attachment display with FileAttachment component:
    - Import FileAttachment component
    - Replace current attachment-chip div with FileAttachment
    - Use variant="pending" and removable=true
    - Wire up onRemove callback to existing removePendingAttachment function
    - Keep existing container wrapper with flex layout

  **Must NOT do**:
  - Modify upload logic (lines 127-166)
  - Change file selection handling
  - Modify textarea behavior
  - Touch send/stop button functionality

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Rationale**: Component substitution with existing callback wiring

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 11, 12)
  - **Blocks**: Task 11
  - **Blocked By**: Task 1 (FileAttachment component)

  **References**:
  - **Target**: `src/lib/components/chat/MessageInput.svelte:193-209` - Pending attachments
  - **Component**: Task 1 output
  - **Callback**: Line 168 - removePendingAttachment function

  **Acceptance Criteria**:
  - [ ] FileAttachment imported and used
  - [ ] variant="pending" for uploading animation
  - [ ] removable=true with onRemove callback wired
  - [ ] removePendingAttachment still works correctly

  **QA Scenarios**:
  ```
  Scenario: Upload file shows pending attachment
    Tool: Playwright
    Preconditions: Active conversation
    Steps:
      1. Click attach button
      2. Select file
      3. Screenshot pending attachment display
      4. Verify pending animation (subtle border pulse)
      5. Click remove button
    Expected Result: Pending card shows with animation, remove works
    Evidence: .sisyphus/evidence/task-10-pending-attachment.png
  ```

  **Commit**: YES (groups with Tasks 9, 11)

---

- [x] 11. Update Chat Page to Use ContextStatus and WorkingWithBlock Components

  **What to do**:
  - Update `src/routes/(app)/chat/[conversationId]/+page.svelte`
  - **ContextStatus integration** (replace lines 483-501):
    - Import ContextStatus component
    - Replace inline context status block with `<ContextStatus {contextStatus} />`
    - Keep existing conditional: `{#if contextStatus}`
    - Keep container positioning/styling that wraps the component
  - **WorkingWithBlock integration** (replace lines 513-532):
    - Import WorkingWithBlock component
    - Replace inline working with block with:
      ```svelte
      <WorkingWithBlock 
        artifacts={activeWorkingSet.map(a => ({...a, type: a.type === 'generated_output' ? 'result' : 'document'}))} 
        maxVisible={3} 
      />
      ```
    - Keep existing conditional: `{#if activeWorkingSet.length > 0}`
    - Verify placement is "below message input" (in composer area, not in message flow)

  **Must NOT do**:
  - Modify context status data fetching
  - Change working set calculation logic
  - Modify chat message sending flow
  - Touch streaming message logic

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Rationale**: Component substitution in parent page

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 9, 10, 12)
  - **Blocks**: Task 12
  - **Blocked By**: Tasks 2, 3 (ContextStatus, WorkingWithBlock components), Tasks 9, 10

  **References**:
  - **Target**: `src/routes/(app)/chat/[conversationId]/+page.svelte:483-501, 513-532`
  - **Components**: Tasks 2, 3 output
  - **Data**: Lines 35-55 - contextStatus and workingSet variables

  **Acceptance Criteria**:
  - [ ] ContextStatus component imported and used
  - [ ] WorkingWithBlock component imported and used
  - [ ] All props passed correctly
  - [ ] Conditionals preserved ({#if contextStatus}, {#if activeWorkingSet.length > 0})
  - [ ] Chat page functionality unchanged

  **QA Scenarios**:
  ```
  Scenario: Chat page with AI working shows components
    Tool: Playwright
    Preconditions: Active conversation with file attachments
    Steps:
      1. Navigate to chat/[conversationId]
      2. Send message that triggers AI tool usage
      3. Screenshot chat area
      4. Verify ContextStatus visible with token count
      5. Verify WorkingWithBlock visible below input
    Expected Result: Both new components visible and styled correctly
    Evidence: .sisyphus/evidence/task-11-chat-components.png
  ```

  **Commit**: YES (groups with Tasks 9, 10)

---

- [x] 12. Final Responsive Verification Across All Breakpoints

  **What to do**:
  - Create Playwright test script to verify all redesigned elements at 3 viewports:
    - Mobile: 375px width (iPhone SE size)
    - Tablet: 768px width (iPad portrait)
    - Desktop: 1280px width
  - Test pages:
    - /knowledge (Library tab)
    - /knowledge (Memory Profile tab)
    - /chat/[conversationId] (with attachments)
  - Verify:
    - Knowledge Base: 2-col grid on tablet+, 1-col on mobile
    - FileAttachment cards: Readable at all sizes, proper wrapping
    - ContextStatus: Fully visible, no overflow
    - WorkingWithBlock: Proper positioning below input
    - No horizontal scrollbars
    - Touch targets remain 44px minimum

  **Must NOT do**:
  - Fix responsive issues (report them, don't fix inline)
  - Change breakpoint values
  - Add new responsive features

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: [`playwright`]
  - **Rationale**: Multi-viewport testing requires Playwright automation

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on all previous tasks)
  - **Sequential**: After Tasks 4-11
  - **Blocks**: F1-F3 (Final Verification)
  - **Blocked By**: Tasks 4-11

  **References**:
  - **Test Examples**: `tests/` directory for existing Playwright patterns
  - **Breakpoints**: `DESIGN_SYSTEM_LLM_SPEC.md:1760-1823`

  **Acceptance Criteria**:
  - [ ] Screenshots captured at all 3 viewports for all 3 pages
  - [ ] No horizontal scrollbars detected
  - [ ] All elements readable and functional at 320px+
  - [ ] Grid layouts collapse correctly
  - [ ] Touch targets verified 44px+

  **QA Scenarios**:
  ```
  Scenario: Responsive verification
    Tool: Playwright (skill: playwright)
    Preconditions: All Tasks 4-11 complete
    Steps:
      1. Run responsive test script
      2. Capture screenshots at 375px, 768px, 1280px
      3. Verify KB grids collapse to 1-col at mobile
      4. Verify chat elements remain accessible
    Expected Result: All screenshots pass visual criteria
    Evidence: .sisyphus/evidence/task-12-responsive-{viewport}.png (9 total)
  ```

  **Commit**: NO (no code changes, testing only)

---

## Final Verification Wave

> 3 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.

- [x] F1. **Visual Regression Testing** — `unspecified-high` (+ `playwright` skill)
  **What to do**:
  - Use Playwright to capture screenshots of all redesigned elements:
    - FileAttachment (compact + pending variants) at 375px, 768px, 1280px
    - ContextStatus at 3 viewports
    - WorkingWithBlock at 3 viewports
    - Knowledge Base Library tab at 3 viewports
    - Knowledge Base Memory Profile tab at 3 viewports
  - Verify design system compliance:
    - No hardcoded colors (all use CSS custom properties)
    - Border radius matches spec (rounded-[1.2rem] for cards)
    - Typography uses correct font families (serif/sans as appropriate)
    - Spacing uses design tokens
  - Save all screenshots to `.sisyphus/evidence/final-visual/`
  
  **Acceptance Criteria**:
  - [ ] 15 screenshots captured (5 elements × 3 viewports)
  - [ ] All colors verified to use CSS custom properties
  - [ ] All border radius values match spec
  - [ ] No visual regressions from design system
  - [ ] VERDICT: APPROVE or REJECT with specific issues

  **Output Format**:
  ```
  Visual Regression Results:
  - FileAttachment: [PASS/FAIL] - [notes]
  - ContextStatus: [PASS/FAIL] - [notes]
  - WorkingWithBlock: [PASS/FAIL] - [notes]
  - Knowledge Base (Library): [PASS/FAIL] - [notes]
  - Knowledge Base (Memory): [PASS/FAIL] - [notes]
  - Token Usage: [PASS/FAIL]
  - VERDICT: [APPROVE/REJECT]
  ```

- [x] F2. **Functional Regression Testing** — `unspecified-high`
  **What to do**:
  - Run end-to-end chat flow verification:
    1. Create new conversation
    2. Send text message
    3. Verify message appears
    4. Attach file and send
    5. Verify attachment displays correctly
    6. Wait for AI response
    7. Verify context status appears (if applicable)
    8. Verify "working with" shows during processing
    9. Verify all existing buttons work (copy, regenerate, edit)
  - Run Knowledge Base verification:
    1. Navigate to /knowledge
    2. Switch between Library and Memory Profile tabs
    3. Verify all sections display
    4. Test artifact removal (if test environment allows)
  - Verify no console errors
  - Verify no network errors
  
  **Acceptance Criteria**:
  - [ ] Chat flow works identically to before redesign
  - [ ] File attachments upload and display correctly
  - [ ] Context status displays when applicable
  - [ ] All interactive elements functional
  - [ ] Knowledge Base tabs switch correctly
  - [ ] No console errors
  - [ ] VERDICT: APPROVE or REJECT with specific issues

  **Output Format**:
  ```
  Functional Regression Results:
  - Chat Creation: [PASS/FAIL]
  - Message Send: [PASS/FAIL]
  - File Attachment: [PASS/FAIL]
  - AI Response: [PASS/FAIL]
  - Context Status: [PASS/FAIL]
  - Working With: [PASS/FAIL]
  - Knowledge Base Tabs: [PASS/FAIL]
  - Console Errors: [NONE/FOUND]
  - VERDICT: [APPROVE/REJECT]
  ```

- [x] F3. **Accessibility Audit** — `unspecified-high`
  **What to do**:
  - Run automated accessibility checks:
    - Use axe-core or similar tool
    - Test all 3 new components in isolation
    - Test integrated pages (chat, knowledge base)
  - Manual verification:
    - Verify 44px minimum touch targets on all interactive elements
    - Verify keyboard navigation (Tab order logical)
    - Verify ARIA labels on icon buttons
    - Verify color contrast ratios (WCAG AA minimum)
  - Check reduced motion support:
    - Verify `@media (prefers-reduced-motion: reduce)` respected
  
  **Acceptance Criteria**:
  - [ ] axe-core scan shows 0 violations
  - [ ] All interactive elements have 44px+ touch targets
  - [ ] All icon buttons have aria-label attributes
  - [ ] Color contrast meets WCAG AA (4.5:1 for text)
  - [ ] Keyboard navigation works logically
  - [ ] VERDICT: APPROVE or REJECT with specific issues

  **Output Format**:
  ```
  Accessibility Audit Results:
  - axe-core Violations: [N critical, N serious, N moderate, N minor]
  - Touch Targets: [PASS/FAIL] - [notes]
  - ARIA Labels: [PASS/FAIL] - [notes]
  - Color Contrast: [PASS/FAIL] - [notes]
  - Keyboard Nav: [PASS/FAIL] - [notes]
  - Reduced Motion: [PASS/FAIL] - [notes]
  - VERDICT: [APPROVE/REJECT]
  ```

**CONSOLIDATION & USER APPROVAL**:
After F1-F3 complete, present consolidated results:

```
========================================
FINAL VERIFICATION RESULTS
========================================

Visual Regression: [APPROVE/REJECT]
- [Summary of any issues]

Functional Regression: [APPROVE/REJECT]
- [Summary of any issues]

Accessibility Audit: [APPROVE/REJECT]
- [Summary of any issues]

OVERALL: [READY FOR COMPLETION / NEEDS FIXES]

Evidence Location: .sisyphus/evidence/
========================================
```

**DO NOT mark F1-F3 as complete until user gives explicit "okay".**
If any verification fails, create fix tasks and re-run verification.

---

## Commit Strategy

- **1**: `style(components): extract FileAttachment, ContextStatus, WorkingWithBlock components`
  - Files: `src/lib/components/chat/FileAttachment.svelte`, `ContextStatus.svelte`, `WorkingWithBlock.svelte`
  - Pre-commit: `npm run check` (TypeScript + linting)

- **2**: `style(knowledge): redesign Knowledge Base with unified card grid`
  - Files: `src/routes/(app)/knowledge/+page.svelte`
  - Pre-commit: `npm run check`

- **3**: `refactor(chat): integrate new components into chat pages`
  - Files: `MessageBubble.svelte`, `MessageInput.svelte`, `chat/[conversationId]/+page.svelte`
  - Pre-commit: `npm run test` (vitest + playwright)

---

## Success Criteria

### Verification Commands
```bash
# Visual verification (Playwright)
npx playwright test --grep "knowledge-base" --grep "chat-elements"

# Functional verification
npm run test

# Accessibility audit
npx axe-core --include "#knowledge-page,#chat-page"
```

### Final Checklist
- [x] All 3 new components created and extracted
- [x] Knowledge Base uses unified 2-column card grid
- [x] "Honcho Memory" renamed to "Memory Profile" (visible text only)
- [x] All file attachments use compact card style consistently
- [x] ContextStatus shows token count + optimization badge
- [x] WorkingWithBlock appears below message input
- [x] Responsive at 320px, 768px, 1024px+
- [x] All existing tests pass
- [x] No console errors
- [x] Accessibility audit passes (0 violations)
