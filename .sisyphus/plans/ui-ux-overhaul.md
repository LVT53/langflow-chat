# UI/UX Overhaul: Warm Amber Color Migration + Design Fixes

## TL;DR

> **Comprehensive UI/UX overhaul of AlfyAI chat application**
> 
> **Core Changes**:
> - Migrate accent color from terracotta (#C15F3C) to warm amber/gold (#D97706 / #F59E0B)
> - Fix all interactive element cursors and hover states
> - Redesign login modal spacing and overflow issues
> - Fix dropdown positioning and dark mode styling
> - Add collapsible sidebar animation
> - Redesign landing page with centered input + fade animation
> - Fix button designs and contrast ratios
> 
> **Estimated Effort**: Large (20+ tasks across 5 waves)
> **Parallel Execution**: YES - 5 waves with maximum parallelization
> **Critical Path**: Color System → Button System → Layout Fixes → Landing Page → Polish

---

## Context

### Original Request
User wants to:
1. Change from orange/terracotta to a different warm-editorial color
2. Fix cursor-pointer on all clickable elements
3. Improve hover animations for better contrast
4. Overhaul non-colored button design
5. Fix conversation options dropdown (clipping, dark mode)
6. Fix login modal spacing and overflow
7. Add navbar bottom padding
8. Redesign landing page (centered input, fade animation)
9. Fix sidebar padding and add collapsible animation
10. Fix input field alignment and file icon visibility
11. Move AlfyAI title to sidebar

### Interview Summary
**Key Decisions**:
- **Color**: Warm Amber/Gold chosen over terracotta
- **Scope**: All fixes in one comprehensive plan
- **Design Philosophy**: Warm-editorial (Notion/Linear/Apple aesthetic)

### Research Findings
**Current Color Issues**:
- Light mode: #C15F3C → #D97706 (less orange, more gold)
- Dark mode: #D4836B → #F59E0B (much better visibility)
- Hover contrast insufficient throughout

**Identified Code Issues**:
- Multiple buttons missing cursor-pointer
- Dropdown uses `right-0` causing overflow
- Login inputs use `text-lg` with insufficient container space
- Sidebar padding inconsistent (`p-4` vs `px-4 py-2`)
- File attachment icon `text-icon-muted` invisible in dark mode

---

## Work Objectives

### Core Objective
Transform AlfyAI's UI from terracotta-accented to warm amber/gold while fixing all identified UX issues across buttons, modals, dropdowns, sidebar, and landing page.

### Concrete Deliverables
- Updated CSS variables in `src/app.css` with amber/gold palette
- Fixed cursor-pointer on all interactive elements
- Redesigned non-colored button styling
- Fixed dropdown positioning and dark mode styling
- Fixed login modal spacing and overflow
- Added collapsible sidebar with animation
- Redesigned landing page with centered input + fade animation
- Fixed input field vertical alignment
- Moved AlfyAI title to sidebar
- Fixed navbar bottom padding

### Definition of Done
- [ ] All buttons have cursor-pointer
- [ ] Color system uses amber/gold with proper contrast
- [ ] Login modal elements properly spaced with no overflow
- [ ] Dropdown displays correctly in both modes without clipping
- [ ] Sidebar collapsible with smooth animation
- [ ] Landing page has centered input that fades on first message
- [ ] All hover states provide clear visual feedback
- [ ] File attachment icon visible in dark mode
- [ ] Visual regression testing passes in both modes

### Must Have
- Warm amber/gold as primary accent
- Consistent cursor-pointer on all interactive elements
- Working dropdown in conversation items
- Collapsible sidebar animation
- Landing page redesign with fade animation
- Login modal spacing fix

### Must NOT Have (Guardrails)
- NO changes to chat functionality or API
- NO changes to message rendering or streaming
- NO new features beyond UI fixes
- NO breaking changes to component props
- Keep all existing accessibility attributes

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed.

### Test Decision
- **Infrastructure exists**: YES (Vitest configured)
- **Automated tests**: None for UI (visual testing only)
- **Framework**: bun test available
- **Visual Testing**: Playwright for UI verification

### QA Policy
Every task includes Agent-Executed QA Scenarios with Playwright for browser UI verification. Evidence saved to `.sisyphus/evidence/`.

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Color System + Core CSS):
├── T1: Update CSS color variables to amber/gold
├── T2: Fix cursor-pointer on all interactive elements  
└── T3: Create new button design system classes

Wave 2 (Component Fixes - MAX PARALLEL):
├── T4: Fix login modal spacing and overflow
├── T5: Fix conversation dropdown positioning
├── T6: Fix dropdown dark mode styling
├── T7: Fix message input vertical alignment
├── T8: Fix file attachment icon visibility
└── T9: Fix non-colored button hover states

Wave 3 (Layout + Sidebar - MAX PARALLEL):
├── T10: Fix sidebar padding system
├── T11: Add sidebar collapsible animation
├── T12: Move AlfyAI title to sidebar
└── T13: Fix navbar bottom padding

Wave 4 (Landing Page - Sequential):
├── T14: Redesign landing page structure
└── T15: Add title fade + input reposition animation

Wave 5 (Polish + Integration):
├── T16: Fix orange icon hover contrast
├── T17: Update all accent-color references
└── T18: Verify all hover states

Wave FINAL (4 parallel verification agents):
├── F1: Plan compliance audit (oracle)
├── F2: Visual regression - Light mode
├── F3: Visual regression - Dark mode
└── F4: Accessibility audit
```

### Dependency Matrix

| Task | Depends On | Blocks |
|------|------------|--------|
| T1 (Color vars) | — | T4, T5, T16, T17, F2, F3 |
| T2 (Cursor) | — | F1 |
| T3 (Button system) | — | T6, T9 |
| T4 (Login modal) | T1 | F4 |
| T5 (Dropdown pos) | — | F1 |
| T6 (Dropdown style) | T1, T3 | F2, F3 |
| T7 (Input align) | — | F1 |
| T8 (File icon) | T1 | F2, F3 |
| T9 (Button hover) | T3 | F1 |
| T10 (Sidebar pad) | — | T11, T12 |
| T11 (Sidebar anim) | T10 | F1 |
| T12 (Title move) | T10 | F1 |
| T13 (Navbar pad) | — | F1 |
| T14 (Landing redesign) | — | T15 |
| T15 (Landing anim) | T14 | F1, F4 |
| T16 (Icon contrast) | T1 | F2, F3 |
| T17 (Accent refs) | T1 | F1 |
| T18 (Hover verify) | T3, T9 | F1 |

### Agent Dispatch Summary

- **Wave 1**: 3 tasks → `quick` (CSS variables, cursor fixes)
- **Wave 2**: 6 tasks → `visual-engineering` (component styling)
- **Wave 3**: 4 tasks → `visual-engineering` + `unspecified-high` (sidebar + layout)
- **Wave 4**: 2 tasks → `visual-engineering` + `deep` (landing page + animations)
- **Wave 5**: 3 tasks → `quick` (polish)
- **FINAL**: 4 tasks → `oracle`, `visual-engineering`, `unspecified-high`

---

## TODOs

- [x] 1. Update CSS Color Variables to Amber/Gold

  **What to do**:
  - Edit `src/app.css` lines 46-47, 82-84 (light mode) and 124-125, 160-162 (dark mode)
  - Change `--accent` from `#C15F3C` to `#D97706` (light) and `#D4836B` to `#F59E0B` (dark)
  - Change `--accent-hover` from `#9C4A2E` to `#B45309` (light) and `#C15F3C` to `#FBBF24` (dark)
  - Change `--border-focus` and `--focus-ring` to match new accent
  - Ensure all semantic tokens reference the new accent correctly

  **Must NOT do**:
  - Don't change any other color variables (surface, text, danger, success)
  - Don't modify Tailwind config - only CSS variables
  - Don't change any component files yet - just the CSS

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `playwright` (for visual verification)
  - **Why**: Simple CSS variable changes requiring visual QA to verify contrast

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (T1, T2, T3)
  - **Blocks**: T4, T5, T16, T17, F2, F3
  - **Blocked By**: None

  **References**:
  - `src/app.css:46-47` - Current light mode accent
  - `src/app.css:82-84` - Current light mode interactive tokens
  - `src/app.css:124-125` - Current dark mode accent  
  - `src/app.css:160-162` - Current dark mode interactive tokens

  **Acceptance Criteria**:
  - [ ] `--accent` = `#D97706` in :root
  - [ ] `--accent` = `#F59E0B` in .dark
  - [ ] `--accent-hover` = `#B45309` (light) / `#FBBF24` (dark)
  - [ ] All border-focus and focus-ring variables updated

  **QA Scenarios**:
  
  ```
  Scenario: Verify amber color in light mode
    Tool: Playwright
    Steps:
      1. Start dev server: bun run dev
      2. Navigate to http://localhost:5173/login
      3. Screenshot the login button
      4. Assert: Button has golden/amber color, not terracotta
    Expected: Login button displays amber (#D97706)
    Evidence: .sisyphus/evidence/task-1-light-mode.png

  Scenario: Verify amber color in dark mode
    Tool: Playwright
    Steps:
      1. Click theme toggle to switch to dark mode
      2. Screenshot the login button
      3. Assert: Button has lighter gold color
    Expected: Login button displays light amber (#F59E0B)
    Evidence: .sisyphus/evidence/task-1-dark-mode.png
  ```

  **Commit**: YES
  - Message: `style: migrate accent color to warm amber/gold`
  - Files: `src/app.css`

- [x] 2. Add cursor-pointer to All Interactive Elements

  **What to do**:
  - Add `cursor-pointer` class to ALL clickable elements that don't have it:
  - `src/lib/components/chat/MessageInput.svelte:73-83` (file attachment button)
  - `src/lib/components/sidebar/ConversationItem.svelte:122-128` (menu toggle button)
  - `src/lib/components/layout/ThemeToggle.svelte:15-21` (theme toggle)
  - `src/lib/components/layout/Header.svelte:44-64` (hamburger menu)
  - `src/lib/components/layout/Header.svelte:73-80` (new chat button)
  - Any other interactive elements found

  **Must NOT do**:
  - Don't add cursor-pointer to disabled buttons
  - Don't add to non-interactive elements
  - Don't change any other styling

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Why**: Simple class addition across multiple files

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (T1, T2, T3)
  - **Blocks**: F1
  - **Blocked By**: None

  **References**:
  - `src/lib/components/chat/MessageInput.svelte:73` - File button missing cursor
  - `src/lib/components/sidebar/ConversationItem.svelte:122` - Menu button missing cursor
  - `src/lib/components/layout/ThemeToggle.svelte:15` - Theme toggle missing cursor
  - `src/lib/components/layout/Header.svelte:44` - Sidebar toggle missing cursor

  **Acceptance Criteria**:
  - [ ] All buttons show pointer cursor on hover
  - [ ] Disabled buttons still show not-allowed cursor
  - [ ] No regressions in existing cursor behavior

  **QA Scenarios**:
  
  ```
  Scenario: Verify pointer cursor on file attachment
    Tool: Playwright
    Steps:
      1. Navigate to chat page
      2. Hover over file attachment button
      3. Screenshot showing cursor
      4. Assert: cursor style is 'pointer'
    Expected: File button shows pointer cursor
    Evidence: .sisyphus/evidence/task-2-file-cursor.png

  Scenario: Verify pointer cursor on conversation menu
    Tool: Playwright
    Steps:
      1. Create a conversation
      2. Hover over three-dot menu
      3. Assert cursor is pointer
    Expected: Menu button shows pointer cursor
    Evidence: .sisyphus/evidence/task-2-menu-cursor.png
  ```

  **Commit**: YES
  - Message: `fix: add cursor-pointer to all interactive elements`
  - Files: `src/lib/components/chat/MessageInput.svelte`, `src/lib/components/sidebar/ConversationItem.svelte`, etc.

- [x] 3. Create New Button Design System Classes

  **What to do**:
  - Add new button utility classes to `src/app.css` @layer components:
  - `.btn-primary`: Amber background, white text, subtle shadow
  - `.btn-secondary`: Transparent bg, border, hover bg-surface-elevated
  - `.btn-ghost`: No border, hover bg-surface-elevated only
  - `.btn-icon`: Square button for icons
  - Define consistent padding, border-radius, transitions
  - Update existing buttons to use new classes where appropriate

  **Must NOT do**:
  - Don't break existing button functionality
  - Don't change button behavior or click handlers
  - Don't remove existing button classes yet

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - **Why**: Design system work requiring visual consistency

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (T1, T2, T3)
  - **Blocks**: T6, T9
  - **Blocked By**: T1 (needs amber color)

  **References**:
  - `src/lib/components/layout/Header.svelte:86-99` - Current logout button styling (needs redesign)
  - `src/lib/components/layout/Sidebar.svelte:72-94` - New chat button (reference for primary)
  - `src/routes/login/+page.svelte:94-108` - Login submit button (primary style)

  **Acceptance Criteria**:
  - [ ] New button classes exist in app.css
  - [ ] Primary buttons use amber with proper contrast
  - [ ] Secondary buttons have subtle borders and hover
  - [ ] Ghost buttons are minimal with hover feedback
  - [ ] All transitions consistent (250ms)

  **QA Scenarios**:
  
  ```
  Scenario: Verify new button classes render correctly
    Tool: Playwright
    Steps:
      1. Add test buttons to a test page using new classes
      2. Navigate and screenshot
      3. Verify: Primary = amber bg, Secondary = bordered, Ghost = minimal
    Expected: All button variants display correctly
    Evidence: .sisyphus/evidence/task-3-button-classes.png
  ```

  **Commit**: YES
  - Message: `feat: add button design system utility classes`
  - Files: `src/app.css`

---

## Wave 2: Component Fixes (MAX PARALLEL)

- [x] 4. Fix Login Modal Spacing and Overflow

  **What to do**:
  - Edit `src/routes/login/+page.svelte`:
  - Line 53: Change `gap-y-6` to `gap-y-4` (reduce between inputs)
  - Add `mb-6` after password input div (line 86) to create space before button
  - Remove `mt-6` from button (line 97) - now handled by input margin
  - Line 48: Change `mb-10` to `mb-8` (title spacing)
  - Fix input overflow: Change `text-base md:text-lg` to `text-base` on inputs (lines 66, 83)
  - Add focus state styling: `focus:bg-surface-overlay` to inputs

  **Must NOT do**:
  - Don't change form functionality
  - Don't modify validation or error handling
  - Don't change modal size or position

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - **Why**: Visual spacing adjustments requiring design eye

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (T4, T5, T6, T7, T8, T9)
  - **Blocks**: F4
  - **Blocked By**: T1 (amber color for button)

  **References**:
  - `src/routes/login/+page.svelte:48` - Title margin
  - `src/routes/login/+page.svelte:53` - Form gap
  - `src/routes/login/+page.svelte:66` - Email input sizing
  - `src/routes/login/+page.svelte:83` - Password input sizing
  - `src/routes/login/+page.svelte:97` - Button margin

  **Acceptance Criteria**:
  - [ ] Clear visual chunking: title group, input group, button
  - [ ] Proper spacing between inputs and button
  - [ ] No text overflow on inputs
  - [ ] Focus state visible

  **QA Scenarios**:
  
  ```
  Scenario: Verify login modal spacing
    Tool: Playwright
    Steps:
      1. Navigate to /login
      2. Screenshot full modal
      3. Measure: Title→Subtitle = tight, Last Input→Button = 24px gap
    Expected: Proper spacing with clear visual hierarchy
    Evidence: .sisyphus/evidence/task-4-login-spacing.png

  Scenario: Verify input focus state
    Tool: Playwright
    Steps:
      1. Click on email input
      2. Screenshot showing focus ring + bg change
    Expected: Input shows focus ring and subtle bg change
    Evidence: .sisyphus/evidence/task-4-input-focus.png
  ```

  **Commit**: YES
  - Message: `fix: improve login modal spacing and overflow`
  - Files: `src/routes/login/+page.svelte`

- [x] 5. Fix Conversation Dropdown Positioning

  **What to do**:
  - Edit `src/lib/components/sidebar/ConversationItem.svelte` lines 147-166:
  - Change dropdown positioning from `right-0` to prevent clipping
  - Use `left-0` or calculate position based on viewport
  - Consider `position: fixed` or portal approach if needed
  - Add `min-w-[140px]` to ensure consistent width
  - Ensure dropdown opens within viewport bounds

  **Must NOT do**:
  - Don't change dropdown functionality (rename/delete)
  - Don't break click-outside-to-close behavior
  - Don't change menu item styling yet (that's T6)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Why**: Requires careful positioning logic, potential z-index handling

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (T4, T5, T6, T7, T8, T9)
  - **Blocks**: F1
  - **Blocked By**: None

  **References**:
  - `src/lib/components/sidebar/ConversationItem.svelte:147-166` - Current dropdown implementation
  - `src/lib/components/sidebar/ConversationItem.svelte:82-86` - Outside click handler

  **Acceptance Criteria**:
  - [ ] Dropdown opens without right-side clipping
  - [ ] Dropdown visible fully within viewport
  - [ ] Click outside still closes menu
  - [ ] Menu buttons still functional

  **QA Scenarios**:
  
  ```
  Scenario: Verify dropdown positioning
    Tool: Playwright
    Steps:
      1. Create conversation
      2. Click three-dot menu on rightmost conversation
      3. Screenshot showing dropdown fully visible
      4. Assert: No right-side clipping
    Expected: Dropdown displays completely within screen
    Evidence: .sisyphus/evidence/task-5-dropdown-position.png

  Scenario: Verify click-outside behavior
    Tool: Playwright
    Steps:
      1. Open dropdown
      2. Click on conversation item outside menu
      3. Assert dropdown closes
    Expected: Menu closes on outside click
    Evidence: .sisyphus/evidence/task-5-dropdown-close.png
  ```

  **Commit**: YES
  - Message: `fix: fix conversation dropdown right-side clipping`
  - Files: `src/lib/components/sidebar/ConversationItem.svelte`

- [x] 6. Fix Dropdown Dark Mode Styling

  **What to do**:
  - Edit `src/lib/components/sidebar/ConversationItem.svelte` lines 147-166:
  - Current: `bg-surface-page`, `border-default`
  - Update: Ensure dropdown uses proper semantic tokens
  - Add `shadow-lg` for elevation
  - Ensure text colors use proper `text-text-primary` and `text-danger`
  - Add `rounded-md` consistency
  - Check hover states: `hover:bg-surface-elevated`
  - Add focus-visible states for accessibility

  **Must NOT do**:
  - Don't use hardcoded colors
  - Don't change dropdown structure

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - **Why**: Dark mode styling requires careful token usage

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (T4, T5, T6, T7, T8, T9)
  - **Blocks**: F2, F3
  - **Blocked By**: T1 (color system), T3 (button system)

  **References**:
  - `src/lib/components/sidebar/ConversationItem.svelte:148` - Dropdown container
  - `src/lib/components/sidebar/ConversationItem.svelte:151-164` - Menu items
  - `src/app.css` - Semantic color tokens reference

  **Acceptance Criteria**:
  - [ ] Dropdown styled with semantic tokens
  - [ ] Visible in dark mode with proper contrast
  - [ ] Hover states work in both modes
  - [ ] Delete option shows danger color

  **QA Scenarios**:
  
  ```
  Scenario: Verify dropdown in dark mode
    Tool: Playwright
    Steps:
      1. Switch to dark mode
      2. Open conversation menu
      3. Screenshot dropdown
      4. Assert: Readable text, visible border, proper bg
    Expected: Dropdown looks polished in dark mode
    Evidence: .sisyphus/evidence/task-6-dropdown-dark.png

  Scenario: Verify hover states
    Tool: Playwright
    Steps:
      1. Open dropdown
      2. Hover over each option
      3. Screenshot showing hover state
    Expected: Clear hover feedback on all items
    Evidence: .sisyphus/evidence/task-6-dropdown-hover.png
  ```

  **Commit**: YES
  - Message: `style: fix dropdown dark mode styling`
  - Files: `src/lib/components/sidebar/ConversationItem.svelte`

- [x] 7. Fix Message Input Vertical Alignment

  **What to do**:
  - Edit `src/lib/components/chat/MessageInput.svelte` line 92:
  - Current: `py-2.5` on textarea
  - Issue: Placeholder "Type a message..." not vertically centered
  - Fix: Adjust padding or use flex centering on container
  - Consider: Change to `py-3` or calculate based on line-height
  - Ensure alignment works with multi-line input

  **Must NOT do**:
  - Don't break auto-resize functionality
  - Don't change send button positioning
  - Don't modify placeholder text

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Why**: Simple padding adjustment

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (T4, T5, T6, T7, T8, T9)
  - **Blocks**: F1
  - **Blocked By**: None

  **References**:
  - `src/lib/components/chat/MessageInput.svelte:85-95` - Textarea implementation
  - `src/lib/components/chat/MessageInput.svelte:33-39` - Auto-resize logic

  **Acceptance Criteria**:
  - [ ] Placeholder text vertically centered in single-line state
  - [ ] Multi-line input still works correctly
  - [ ] Send button remains aligned

  **QA Scenarios**:
  
  ```
  Scenario: Verify placeholder alignment
    Tool: Playwright
    Steps:
      1. Navigate to chat page
      2. Screenshot input field (empty)
      3. Measure: "Type a message..." centered vertically
    Expected: Placeholder text perfectly centered
    Evidence: .sisyphus/evidence/task-7-input-center.png
  ```

  **Commit**: YES
  - Message: `fix: center message input placeholder vertically`
  - Files: `src/lib/components/chat/MessageInput.svelte`

- [x] 8. Fix File Attachment Icon Visibility in Dark Mode

  **What to do**:
  - Edit `src/lib/components/chat/MessageInput.svelte` lines 73-83:
  - Current: `text-icon-muted` (becomes invisible on dark bg)
  - Change: Use `text-text-muted` or make it adaptive
  - Better: Use `text-icon-primary` with `opacity-60` hover to `opacity-100`
  - Ensure visible in both light and dark modes
  - Add hover state that improves visibility

  **Must NOT do**:
  - Don't change icon SVG
  - Don't enable the button (keep disabled state)
  - Don't change button size or position

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - **Why**: Color contrast fix requiring dark mode testing

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (T4, T5, T6, T7, T8, T9)
  - **Blocks**: F2, F3
  - **Blocked By**: None

  **References**:
  - `src/lib/components/chat/MessageInput.svelte:73-83` - File button
  - `src/app.css:66-68` - Icon color tokens (light)
  - `src/app.css:144-146` - Icon color tokens (dark)

  **Acceptance Criteria**:
  - [ ] Icon visible in light mode
  - [ ] Icon visible in dark mode
  - [ ] Hover state improves visibility
  - [ ] Still indicates "coming soon" via disabled state

  **QA Scenarios**:
  
  ```
  Scenario: Verify icon in light mode
    Tool: Playwright
    Steps:
      1. Stay in light mode
      2. Screenshot input area
      3. Assert: Paperclip icon clearly visible
    Expected: Icon visible against elevated surface
    Evidence: .sisyphus/evidence/task-8-icon-light.png

  Scenario: Verify icon in dark mode
    Tool: Playwright
    Steps:
      1. Switch to dark mode
      2. Screenshot input area
      3. Assert: Paperclip icon clearly visible
    Expected: Icon visible against dark elevated surface
    Evidence: .sisyphus/evidence/task-8-icon-dark.png
  ```

  **Commit**: YES
  - Message: `fix: improve file attachment icon visibility in dark mode`
  - Files: `src/lib/components/chat/MessageInput.svelte`

- [x] 9. Fix Non-Colored Button Hover States

  **What to do**:
  - Edit `src/lib/components/layout/Header.svelte` line 87:
  - Current: `hover:bg-surface-overlay` is too strong
  - Change: Use `hover:bg-surface-elevated` (subtler)
  - Or use new `.btn-secondary` class from T3
  - Update: Add proper `cursor-pointer`
  - Fix any other ghost/outline buttons found in codebase
  - Ensure transitions are smooth (250ms)

  **Must NOT do**:
  - Don't change button functionality
  - Don't affect primary amber buttons
  - Don't change button borders unless using btn-secondary

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - **Why**: Hover state refinement requiring visual judgment

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (T4, T5, T6, T7, T8, T9)
  - **Blocks**: F1
  - **Blocked By**: T3 (button system)

  **References**:
  - `src/lib/components/layout/Header.svelte:86-99` - Logout button
  - `src/lib/components/layout/ThemeToggle.svelte:15` - Theme toggle (ghost style)
  - `src/lib/components/layout/Header.svelte:44-64` - Sidebar toggle (ghost style)

  **Acceptance Criteria**:
  - [ ] Logout button hover is subtle, not jarring
  - [ ] Ghost buttons (theme toggle, sidebar) have proper hover
  - [ ] All hover transitions 250ms
  - [ ] All have cursor-pointer

  **QA Scenarios**:
  
  ```
  Scenario: Verify logout button hover
    Tool: Playwright
    Steps:
      1. Navigate to app
      2. Hover over logout button
      3. Screenshot
      4. Assert: Subtle bg change, not aggressive
    Expected: Smooth, subtle hover effect
    Evidence: .sisyphus/evidence/task-9-logout-hover.png

  Scenario: Verify ghost buttons
    Tool: Playwright
    Steps:
      1. Hover over theme toggle
      2. Hover over sidebar toggle
      3. Screenshot each
    Expected: Consistent, subtle hover states
    Evidence: .sisyphus/evidence/task-9-ghost-hover.png
  ```

  **Commit**: YES
  - Message: `style: fix non-colored button hover states`
  - Files: `src/lib/components/layout/Header.svelte`, others as needed

---

## Wave 3: Layout + Sidebar (MAX PARALLEL)

- [x] 10. Fix Sidebar Padding System

  **What to do**:
  - Edit `src/lib/components/layout/Sidebar.svelte`:
  - Line 72: Change `p-4` to `p-md` (consistent with design system)
  - Line 76: Change button container to `px-md py-sm` for breathing room
  - Line 96: Change list container from `px-4 py-2` to `px-md py-md`
  - Ensure ConversationItem.svelte respects new padding
  - Add consistent spacing between "New chat" button and list
  - Use semantic spacing tokens (`--space-md`, `--space-lg`)

  **Must NOT do**:
  - Don't change sidebar width
  - Don't break mobile sidebar behavior
  - Don't change scroll behavior

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - **Why**: Spacing system requires design consistency

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (T10, T11, T12, T13)
  - **Blocks**: T11, T12
  - **Blocked By**: None

  **References**:
  - `src/lib/components/layout/Sidebar.svelte:72` - Button container padding
  - `src/lib/components/layout/Sidebar.svelte:96` - List container padding
  - `src/app.css:86-92` - Spacing system tokens
  - `src/lib/components/sidebar/ConversationItem.svelte:91` - Item padding

  **Acceptance Criteria**:
  - [ ] Consistent padding throughout sidebar
  - [ ] "New chat" button has proper spacing
  - [ ] Conversation list has proper spacing
  - [ ] Breathing room between elements

  **QA Scenarios**:
  
  ```
  Scenario: Verify sidebar padding
    Tool: Playwright
    Steps:
      1. Open sidebar
      2. Screenshot showing "New chat" button and first conversation
      3. Measure consistent padding
    Expected: 16px (space-md) padding, consistent gaps
    Evidence: .sisyphus/evidence/task-10-sidebar-padding.png
  ```

  **Commit**: YES
  - Message: `style: fix sidebar padding and spacing system`
  - Files: `src/lib/components/layout/Sidebar.svelte`

- [x] 11. Add Sidebar Collapsible Animation

  **What to do**:
  - Edit `src/lib/components/layout/Sidebar.svelte`:
  - Add collapsible state for desktop (currently only mobile slides)
  - Use `sidebarOpen` store which already exists
  - Add collapse/expand button in sidebar header (desktop)
  - Implement CSS transition: `transition-all duration-[var(--duration-emphasis)]`
  - Animate width: `w-[260px]` ↔ `w-[60px]` (icon-only mode)
  - Show/hide text labels with fade transition
  - Ensure main content area adjusts with sidebar
  - Update `src/routes/(app)/+layout.svelte` to handle width change

  **Must NOT do**:
  - Don't break existing mobile sidebar
  - Don't change sidebar on mobile
  - Don't lose conversation list accessibility

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - **Why**: Complex animation requiring width transitions and state management

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (T10, T11, T12, T13)
  - **Blocks**: F1
  - **Blocked By**: T10 (padding must be consistent first)

  **References**:
  - `src/lib/components/layout/Sidebar.svelte:43-47` - Current sidebar structure
  - `src/lib/components/layout/Sidebar.svelte:101-119` - Desktop styles
  - `src/lib/stores/ui.ts` - sidebarOpen store
  - `src/routes/(app)/+layout.svelte:20` - Sidebar usage

  **Acceptance Criteria**:
  - [ ] Collapse button visible on desktop
  - [ ] Clicking collapses sidebar to icon-only (~60px)
  - [ ] Smooth width animation (300ms)
  - [ ] Text labels fade out
  - [ ] Clicking expand restores full width
  - [ ] Main content adjusts
  - [ ] Mobile behavior unchanged

  **QA Scenarios**:
  
  ```
  Scenario: Verify sidebar collapse
    Tool: Playwright
    Steps:
      1. Open app in desktop viewport (1024px+)
      2. Click collapse button
      3. Wait 300ms, screenshot
      4. Assert: Sidebar ~60px wide, icons only
    Expected: Sidebar collapses smoothly
    Evidence: .sisyphus/evidence/task-11-collapse.mp4

  Scenario: Verify sidebar expand
    Tool: Playwright
    Steps:
      1. Click expand button on collapsed sidebar
      2. Wait 300ms, screenshot
      3. Assert: Sidebar 260px wide, text visible
    Expected: Sidebar expands smoothly
    Evidence: .sisyphus/evidence/task-11-expand.mp4
  ```

  **Commit**: YES
  - Message: `feat: add collapsible sidebar animation for desktop`
  - Files: `src/lib/components/layout/Sidebar.svelte`, `src/routes/(app)/+layout.svelte`

- [x] 12. Move AlfyAI Title to Sidebar

  **What to do**:
  - Edit `src/lib/components/layout/Header.svelte` lines 67-69:
  - Remove AlfyAI title from center of header
  - Edit `src/lib/components/layout/Sidebar.svelte`:
  - Add title to top of sidebar (above "New chat" button)
  - Position: Left-aligned with padding
  - Styling: Bold, text-text-primary
  - On collapse: Hide title or show icon only
  - Keep mobile header title for mobile viewports

  **Must NOT do**:
  - Don't remove title entirely (keep for mobile)
  - Don't change title styling significantly
  - Don't break responsive behavior

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Why**: Simple DOM reorganization

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (T10, T11, T12, T13)
  - **Blocks**: F1
  - **Blocked By**: T10 (sidebar padding), T11 (collapsible state)

  **References**:
  - `src/lib/components/layout/Header.svelte:67-69` - Current title placement
  - `src/lib/components/layout/Sidebar.svelte:42-71` - Sidebar header area

  **Acceptance Criteria**:
  - [ ] Title visible in sidebar on desktop
  - [ ] Title removed from header center on desktop
  - [ ] Title still visible in header on mobile
  - [ ] Title responds to sidebar collapse state

  **QA Scenarios**:
  
  ```
  Scenario: Verify title in sidebar
    Tool: Playwright
    Steps:
      1. Open app in desktop
      2. Screenshot sidebar
      3. Assert: "AlfyAI" at top of sidebar
      4. Assert: No title in header center
    Expected: Title relocated to sidebar
    Evidence: .sisyphus/evidence/task-12-sidebar-title.png

  Scenario: Verify mobile title
    Tool: Playwright
    Steps:
      1. Resize to mobile viewport (<768px)
      2. Screenshot header
      3. Assert: "AlfyAI" centered in header
    Expected: Title preserved on mobile
    Evidence: .sisyphus/evidence/task-12-mobile-title.png
  ```

  **Commit**: YES
  - Message: `refactor: move AlfyAI title from header to sidebar`
  - Files: `src/lib/components/layout/Header.svelte`, `src/lib/components/layout/Sidebar.svelte`

- [x] 13. Fix Navbar Bottom Padding

  **What to do**:
  - Edit `src/lib/components/layout/Header.svelte` line 41:
  - Current: No explicit bottom padding, relies on h-[48/56/64px]
  - Add `pb-sm` or `pb-md` for breathing room
  - Ensure content in header is vertically centered with new padding
  - Check: items-center should still work with added padding
  - Or add padding to child container instead of header

  **Must NOT do**:
  - Don't change header height significantly
  - Don't break vertical centering of content
  - Don't affect mobile layout negatively

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Why**: Simple padding addition

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (T10, T11, T12, T13)
  - **Blocks**: F1
  - **Blocked By**: None

  **References**:
  - `src/lib/components/layout/Header.svelte:40-41` - Header container
  - `src/app.css:86-92` - Spacing tokens

  **Acceptance Criteria**:
  - [ ] Header has bottom padding (8px or 16px)
  - [ ] Content still vertically centered
  - [ ] More "breathable" appearance

  **QA Scenarios**:
  
  ```
  Scenario: Verify navbar padding
    Tool: Playwright
    Steps:
      1. Screenshot header area
      2. Measure space below header content
      3. Assert: At least 8px padding
    Expected: Header appears more spacious
    Evidence: .sisyphus/evidence/task-13-navbar-padding.png
  ```

  **Commit**: YES
  - Message: `style: add bottom padding to navbar for breathing room`
  - Files: `src/lib/components/layout/Header.svelte`

---

## Wave 4: Landing Page Redesign (Sequential)

- [x] 14. Redesign Landing Page Structure

  **What to do**:
  - Edit `src/routes/(app)/+page.svelte`:
  - Remove current "Select a conversation..." content (lines 30-72)
  - Create new centered layout:
    - Big title "AlfyAI" or "What can I help you with?" centered
    - Message input field centered below title
    - Subtle subtitle if needed
  - Keep input functionality from MessageInput component
  - Import and use MessageInput component
  - Ensure page is full height with centered content
  - Style: Large typography, generous spacing, minimal chrome

  **Must NOT do**:
  - Don't change routing logic
  - Don't remove error handling
  - Don't break new conversation creation flow

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - **Why**: Layout redesign requiring visual composition

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (T14, T15)
  - **Blocks**: T15
  - **Blocked By**: None

  **References**:
  - `src/routes/(app)/+page.svelte:30-72` - Current landing page
  - `src/lib/components/chat/MessageInput.svelte` - Input component to import
  - `src/lib/components/chat/ChatArea.svelte` - Chat interface reference

  **Acceptance Criteria**:
  - [ ] Big centered title on empty state
  - [ ] Input field centered below title
  - [ ] Clean, minimal design
  - [ ] Input fully functional
  - [ ] Responsive layout

  **QA Scenarios**:
  
  ```
  Scenario: Verify landing page redesign
    Tool: Playwright
    Steps:
      1. Navigate to root /
      2. Screenshot showing empty state
      3. Assert: Big title centered, input below
      4. Assert: No "Select a conversation" message
    Expected: Clean, centered landing page
    Evidence: .sisyphus/evidence/task-14-landing.png

  Scenario: Verify input functionality
    Tool: Playwright
    Steps:
      1. Type test message in input
      2. Click send
      3. Assert: Message creates new conversation
    Expected: Input works and creates conversation
    Evidence: .sisyphus/evidence/task-14-input-works.png
  ```

  **Commit**: YES
  - Message: `feat: redesign landing page with centered input`
  - Files: `src/routes/(app)/+page.svelte`

- [x] 15. Add Title Fade + Input Reposition Animation

  **What to do**:
  - Edit `src/routes/(app)/+page.svelte`:
  - Add state tracking: `hasStarted` boolean
  - On first message send:
    - Fade out title using Svelte transition `fade`
    - Animate input from center to bottom (chat position)
    - Use `transition:fly` or CSS transforms
  - Add CSS for smooth transitions:
    - Title: `transition: opacity 300ms ease-out`
    - Input container: `transition: all 500ms cubic-bezier(0.4, 0, 0.2, 1)`
  - When conversation created, redirect to `/chat/{id}` where input is already at bottom
  - OR use local state to show "moved" input while staying on same page

  **Must NOT do**:
  - Don't break conversation creation
  - Don't cause jarring jumps
  - Don't make animation too slow (>500ms)

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []
  - **Why**: Complex animation requiring state management and timing

  **Parallelization**:
  - **Can Run In Parallel**: NO (depends on T14)
  - **Parallel Group**: Wave 4 (T14, T15)
  - **Blocks**: F1, F4
  - **Blocked By**: T14 (landing page structure)

  **References**:
  - `src/routes/(app)/+page.svelte` - Landing page (after T14)
  - `svelte/transition` - Svelte transitions
  - `src/routes/(app)/chat/[conversationId]/+page.svelte` - Chat page reference

  **Acceptance Criteria**:
  - [ ] Title fades out on first message
  - [ ] Input animates to bottom position smoothly
  - [ ] Animation duration ~500ms
  - [ ] No jarring transitions
  - [ ] Works in both light and dark modes

  **QA Scenarios**:
  
  ```
  Scenario: Verify fade animation
    Tool: Playwright (video recording)
    Steps:
      1. Open landing page
      2. Type "Hello" and send
      3. Record video of animation
      4. Assert: Title fades smoothly
    Expected: Elegant fade out over ~300ms
    Evidence: .sisyphus/evidence/task-15-fade.mp4

  Scenario: Verify input reposition
    Tool: Playwright (video recording)
    Steps:
      1. Continue from above
      2. Assert: Input slides to bottom smoothly
    Expected: Input animates to chat position
    Evidence: .sisyphus/evidence/task-15-reposition.mp4
  ```

  **Commit**: YES
  - Message: `feat: add title fade and input reposition animation`
  - Files: `src/routes/(app)/+page.svelte`

---

## Wave 5: Polish

- [x] 16. Fix Orange Icon Hover Contrast

  **What to do**:
  - Search for all icon buttons that use accent color
  - Update hover states for better contrast:
    - Current: Amber icons with subtle hover
    - Better: Add `hover:opacity-80` or `hover:brightness-110`
  - Check: MessageInput send button, any other amber icons
  - Ensure icons have `transition-all duration-250`

  **Must NOT do**:
  - Don't change icon colors to non-accent
  - Don't make hover too aggressive

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Why**: Simple hover state refinement

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (T16, T17, T18)
  - **Blocks**: F2, F3
  - **Blocked By**: T1 (amber color)

  **References**:
  - `src/lib/components/chat/MessageInput.svelte:97-109` - Send button
  - `src/lib/components/layout/Sidebar.svelte:72-94` - New chat button icons

  **Acceptance Criteria**:
  - [ ] All amber icons have visible hover feedback
  - [ ] Hover is subtle but noticeable
  - [ ] Transitions are smooth

  **QA Scenarios**:
  
  ```
  Scenario: Verify icon hover
    Tool: Playwright
    Steps:
      1. Hover over amber icons (send, new chat)
      2. Screenshot before and after
      3. Assert: Clear visual change
    Expected: Hover state clearly visible
    Evidence: .sisyphus/evidence/task-16-icon-hover.png
  ```

  **Commit**: NO (group with T18)

- [x] 17. Update All Accent-Color References

  **What to do**:
  - Search codebase for any hardcoded terracotta values:
    - `#C15F3C`, `#D4836B`, `#9C4A2E`
  - Replace with CSS variable references
  - Use `bg-accent`, `text-accent`, `border-accent`
  - Check all Svelte components, CSS files
  - Run `grep -r "#C15F3C" src/` to find all instances

  **Must NOT do**:
  - Don't change non-accent colors
  - Don't break any components

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Why**: Search and replace task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (T16, T17, T18)
  - **Blocks**: F1
  - **Blocked By**: T1 (CSS vars must exist)

  **References**:
  - All component files
  - `src/app.css` - CSS variables

  **Acceptance Criteria**:
  - [ ] No hardcoded terracotta values remain
  - [ ] All use CSS variables
  - [ ] Visual appearance unchanged (but now amber)

  **QA Scenarios**:
  
  ```
  Scenario: Verify no hardcoded colors
    Tool: Bash
    Steps:
      1. Run: grep -r "#C15F3C\|#D4836B\|#9C4A2E" src/
      2. Assert: No matches found
    Expected: All colors use variables
    Evidence: .sisyphus/evidence/task-17-grep.txt
  ```

  **Commit**: NO (group with T18)

- [x] 18. Verify All Hover States

  **What to do**:
  - Comprehensive audit of all hover states:
    - Primary buttons (amber)
    - Secondary/ghost buttons
    - Icon buttons
    - List items (conversation items)
    - Input fields
  - Ensure consistent 250ms transition duration
  - Ensure consistent easing
  - Document any inconsistencies found
  - Fix any remaining issues

  **Must NOT do**:
  - Don't introduce new hover patterns
  - Don't change existing working hovers

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - **Why**: Audit and verification task

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 5 (T16, T17, T18)
  - **Blocks**: F1
  - **Blocked By**: T3, T9 (button systems)

  **References**:
  - All component files with hover states

  **Acceptance Criteria**:
  - [ ] All interactive elements have hover states
  - [ ] All transitions 250ms
  - [ ] Consistent visual language

  **QA Scenarios**:
  
  ```
  Scenario: Verify all hovers
    Tool: Playwright
    Steps:
      1. Navigate through all pages
      2. Hover over every button, link, interactive element
      3. Screenshot examples
      4. Assert: All have visible hover
    Expected: Complete hover coverage
    Evidence: .sisyphus/evidence/task-18-hover-audit.png
  ```

  **Commit**: YES
  - Message: `style: update accent color to amber and fix hover states`
  - Files: All changed files

---

## Final Verification Wave (4 Parallel Review Agents)

> **ALL must APPROVE. Rejection → fix → re-run.**

- [x] F1. Plan Compliance Audit — `oracle`

  **What to do**:
  - Read this entire plan end-to-end
  - For each "Must Have": verify implementation exists
    - Run commands, check file contents, screenshot if UI
  - For each "Must NOT Have": search codebase for forbidden patterns
  - Check evidence files exist in `.sisyphus/evidence/`
  - Compare deliverables against plan
  
  **Deliverables to verify**:
  - [ ] Amber color in CSS variables
  - [ ] Cursor-pointer on all interactive elements
  - [ ] Button design system implemented
  - [ ] Login modal spacing fixed
  - [ ] Dropdown positioning fixed
  - [ ] Dropdown dark mode styled
  - [ ] Input alignment fixed
  - [ ] File icon visible in dark mode
  - [ ] Button hover states fixed
  - [ ] Sidebar padding system
  - [ ] Sidebar collapsible animation
  - [ ] AlfyAI title in sidebar
  - [ ] Navbar padding
  - [ ] Landing page redesigned
  - [ ] Fade + reposition animation
  - [ ] All accent references updated
  - [ ] All hover states verified

  **Output**: `Must Have [17/17] | Must NOT Have [0/0] | Tasks [18/18] | VERDICT: APPROVE/REJECT`

  **Evidence**: `.sisyphus/evidence/F1-compliance-report.md`

- [x] F2. Visual Regression - Light Mode — `visual-engineering`

  **What to do**:
  - Set theme to light mode
  - Screenshot all key pages/states:
    - Login page
    - Empty landing page
    - Chat with messages
    - Sidebar with dropdown open
    - Collapsed sidebar (desktop)
  - Compare against "expected" from each task
  - Check: Amber color renders correctly
  - Check: All hover states visible
  - Check: No layout issues
  - Check: Text readable

  **Output**: `Light Mode [PASS/FAIL] - Issues: [list]`

  **Evidence**: `.sisyphus/evidence/F2-light-mode/` (screenshots)

- [x] F3. Visual Regression - Dark Mode — `visual-engineering`

  **What to do**:
  - Set theme to dark mode
  - Screenshot all key pages/states (same as F2)
  - Check: Amber/gold color renders correctly (lighter shade)
  - Check: File attachment icon visible
  - Check: Dropdown readable
  - Check: All hover states visible
  - Check: No contrast issues
  - Check: Text readable

  **Output**: `Dark Mode [PASS/FAIL] - Issues: [list]`

  **Evidence**: `.sisyphus/evidence/F3-dark-mode/` (screenshots)

- [x] F4. Accessibility Audit — `unspecified-high`

  **What to do**:
  - Run automated accessibility checks:
    - `npx playwright test --grep "a11y"` (if tests exist)
    - OR manual audit with axe-core principles
  - Check: All buttons have aria-label
  - Check: Focus rings visible on all interactive elements
  - Check: Color contrast ratios ≥4.5:1 for text
  - Check: Reduced motion respected
  - Check: Keyboard navigation works

  **Output**: `Accessibility [PASS/FAIL] - Critical Issues: [N] - Warnings: [N]`

  **Evidence**: `.sisyphus/evidence/F4-a11y-report.md`

---

## Commit Strategy

| Task | Commit | Message |
|------|--------|---------|
| T1, T2, T3 | 1 | `style: migrate to amber color, add cursor-pointer, button system` |
| T4, T5, T6 | 1 | `fix: login modal spacing, dropdown positioning and styling` |
| T7, T8, T9 | 1 | `fix: input alignment, file icon visibility, button hovers` |
| T10, T11, T12, T13 | 1 | `feat: sidebar padding, collapsible animation, title relocation` |
| T14, T15 | 1 | `feat: landing page redesign with fade animation` |
| T16, T17, T18 | 1 | `style: polish hover states and verify all accents` |
| F1-F4 | — | No commit (verification only) |

---

## Success Criteria

### Verification Commands
```bash
# Verify amber color
grep "accent.*#D97706\|accent.*#F59E0B" src/app.css

# Verify no hardcoded terracotta
grep -r "#C15F3C\|#D4836B" src/ || echo "✓ No hardcoded colors"

# Verify cursor-pointer
grep -r "cursor-pointer" src/lib/components/ | wc -l  # Should be high

# Build test
bun run build
```

### Final Checklist
- [ ] All 17 "Must Have" items present
- [ ] 0 "Must NOT Have" items found
- [ ] All 18 tasks completed
- [ ] All 4 final verification agents APPROVE
- [ ] Light mode visual regression PASS
- [ ] Dark mode visual regression PASS
- [ ] Accessibility audit PASS
- [ ] Build succeeds without errors
