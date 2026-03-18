# Langflow UI Design Polish — Comprehensive Execution Plan

## TL;DR
- **Summary**: Transform the current inconsistently-designed SvelteKit UI into a polished, warm editorial experience by consolidating shell layout invariants, strengthening the token system, hardening responsive behavior, and refining component surfaces across login, app shell, sidebar, and chat.
- **Deliverables**: Unified design token layer, shell primitives, polished page surfaces, hardened responsive breakpoints, improved motion and consistency, updated Playwright coverage.
- **Effort**: Large (15–25 tasks).
- **Parallel**: YES — 4 waves: foundation → shell → surfaces → verification.
- **Critical Path**: Tokens → Shell → Chat input polish → Responsive verification.

---

## Context

### Original Request
The user reported a wide range of UI quality issues: login screen is only a few dozen pixels wide regardless of viewport, relation signs appear at top/bottom of the page, the entire UI is scrollable (which is a no-no), and most icons are unreadable due to gray-on-black color choices. The design is consistent but consistently poor. The user wants a full-blown plan to make the UI look 500% more polished with better consistency, UI design, animations, grid and spacing, and no broken layouts.

### Interview Summary
- **Visual direction**: Warm editorial (user selected).
- **Test strategy**: Tests-after with existing Vitest + Playwright infrastructure.
- **Scope boundaries**: UI polish only; no product feature changes unless required for UI integrity.
- **Key pain points**: login width, scroll ownership, icon contrast, stray artifacts, empty state weakness, mobile header density.

### Research Findings
1. **Token surface**: `src/app.css` uses CSS variables but lacks semantic status tokens (danger, success, overlay) and relies on hardcoded hex values in components.
2. **Shell fragmentation**: Header, sidebar, and chat layout each carry their own breakpoint logic (CSS media queries + JS stores), leading to drift.
3. **Theme initialization gap**: `initTheme()` runs only in authenticated layout; `/login` has no theme init, creating visual inconsistency.
4. **Scroll ownership risk**: Multiple `overflow-hidden`/`overflow-auto` declarations across shell + chat components without a single documented owner.
5. **Login sizing**: Uses `max-w-sm` which is approximately 384px; user wants a more substantial, centered login card.
6. **Test coupling**: `mobile-design.spec.ts` asserts exact class names and pixel dimensions; redesign will break these assertions.

### Oracle Guardrails
- Prevent page-by-page partial redesign; consolidate shell invariants first.
- Normalize tokens before component polish (no new hardcoded colors in leaf PRs).
- Keep contrast targets explicit: 4.5:1 for text, 3:1 for icons/borders.
- Update tests after implementation; expect initial failures on class/pixel assertions.
- Root layout must initialize theme so login and app share the same system.

---

## Work Objectives

### Core Objective
Deliver a cohesive, warm editorial UI system with unified tokens, consistent shell behavior, hardened responsive layout, and polished component surfaces, verified by updated automated tests.

### Deliverables
1. Consolidated CSS custom properties + Tailwind plugin for semantic tokens
2. Single source of truth for shell breakpoints and scroll ownership
3. Polished login, app shell, sidebar, empty state, chat messages, code blocks, dialogs
4. Refined motion defaults (duration, easing) applied consistently
5. Updated Playwright coverage for responsive + mobile polish
6. QA evidence screenshots and verification logs

### Definition of Done
- Login page renders at an appropriate max width on desktop without appearing tiny
- App shell prevents body scroll; only MessageArea (and sidebar list) scroll
- Icon contrast passes 3:1 minimum against surfaces in both light and dark themes
- No stray visual artifacts at page edges
- All Playwright tests pass with updated assertions (class/behavior-based, not brittle pixel checks)
- Visual QA shows consistent spacing, radius, and typography across surfaces

### Must Have
- Token normalization (semantic layers: surface, text, accent, danger, success, overlay, focus)
- Shell invariant consolidation (header height, sidebar behavior, content max-width, footer/input pattern)
- Responsive breakpoint hardening (mobile/tablet/desktop)
- Login layout redesign (centered, substantial card, warm editorial styling)
- Chat input polish (sticky within column, safe-area padding)
- Empty state polish (visual centering, hierarchy, CTA clarity)
- Sidebar list/item polish (active states, hover consistency, truncation)
- Code block / message bubble polish (contrast, radius, spacing)
- Motion refinement (standardized durations 150–300ms, prefers-reduced-motion support)
- Theme init moved to root layout
- Updated Playwright tests (responsive, mobile-design, auth, chat)

### Must NOT Have
- New product features beyond UI integrity fixes
- Backend API changes
- Component library replacement (keep existing primitives, refine styling)
- Breaking route/URL changes
- AI slop: no arbitrary decorative elements, gradients, or animations that do not serve UX

---

## Verification Strategy
- **Test decision**: Tests-after (user preference). Implement polish first, then update assertions.
- **QA policy**: Every task includes agent-executed QA scenarios (happy path + edge case).
- **Evidence**: `.sisyphus/evidence/task-{N}-{slug}.{ext}` (screenshots, logs).
- **Tools**: Playwright for UI verification, Vitest for logic utilities if needed, plus manual QA matrix (light/dark, mobile/desktop, login/app/chat/dialog).

---

## Execution Strategy

### Parallel Execution Waves
**Wave 1: Foundation (tokens + shell invariants)** — Establish the single source of truth for design tokens and layout contracts.

**Wave 2: Shell surfaces (login, layout, sidebar frame)** — Apply the foundation to high-impact shell surfaces.

**Wave 3: Content surfaces (chat, messages, dialogs)** — Polish the conversation experience and supporting UI.

**Wave 4: Motion, contrast, verification** — Add polish details and harden verification.

### Agent Dispatch Summary
- Wave 1: 4 sequential foundation tasks
- Wave 2: 4 surface tasks in parallel
- Wave 3: 5 surface tasks in parallel
- Wave 4: 6 verification/finalization tasks in parallel, then 1 final verification task

---

## TODOs

- [x] 1. Consolidate and expand design tokens

  **What to do**:
  - Audit `src/app.css` and add semantic tokens: `surface-page`, `surface-elevated`, `surface-overlay`, `text-primary`, `text-muted`, `icon-primary`, `icon-muted`, `accent`, `accent-hover`, `danger`, `success`, `focus-ring`.
  - Ensure no hardcoded hex values remain in component CSS except token definitions.
  - Update `tailwind.config.ts` to expose tokens as utilities (e.g., `bg-surface-page`, `text-muted`).

  **Must NOT do**: Add component-specific tokens (keep semantic only); change existing variable names used by logic.

  **Recommended Agent Profile**:
  - Category: `unspecified-high` (requires CSS architecture decisions)
  - Skills: Tailwind + CSS variables experience
  - Omitted: Testing frameworks (not needed here)

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2–19 | Blocked By: —

  **References**:
  - Pattern: `src/app.css:1–109` — extend existing variable blocks
  - Pattern: `tailwind.config.ts` — add safelist/plugin mapping for new tokens
  - API/Type: `src/lib/stores/theme.ts` — ensure token names align with theme init

  **Acceptance Criteria**:
  - [ ] `src/app.css` contains semantic tokens for surfaces, text, accents, statuses, focus
  - [ ] `tailwind.config.ts` exports utilities for all new tokens
  - [ ] No hardcoded hex values in component files (grep "#[0-9a-f]{3,6}" in `src/**/*.svelte` except `src/app.css`)

  **QA Scenarios**:
  ```
  Scenario: Light theme token presence
    Tool: Bash
    Steps: grep "surface-page" src/app.css && grep "text-muted" tailwind.config.ts
    Expected: Both present and exported
    Evidence: .sisyphus/evidence/task-01-tokens-light.txt

  Scenario: Dark theme token presence
    Tool: Bash
    Steps: grep "dark {" src/app.css | head -5
    Expected: Contains surface/text/accent/danger tokens
    Evidence: .sisyphus/evidence/task-01-tokens-dark.txt
  ```

  **Commit**: YES | Message: `design(tokens): consolidate semantic token layer` | Files: `src/app.css`, `tailwind.config.ts`

---

- [x] 2. Define shell breakpoint contract

  **What to do**:
  - Document one source of truth for breakpoints: choose Tailwind breakpoints (`sm`, `md`, `lg`, `xl`) as canonical.
  - Replace inline `window.innerWidth` checks in JS with CSS-first behavior where possible; keep JS only for temporary overlay states.
  - Ensure `src/lib/stores/ui.ts` (sidebar state) respects the same breakpoints as Tailwind media queries.

  **Must NOT do**: Change route behavior or navigation; add new stores.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: Svelte stores, CSS media queries, responsive patterns
  - Omitted: Playwright (not needed here)

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 3–19 | Blocked By: 1

  **References**:
  - Pattern: `src/lib/components/layout/Sidebar.svelte:101–131` — media queries + JS class toggling
  - Pattern: `src/lib/stores/ui.ts` — sidebarOpen default state

  **Acceptance Criteria**:
  - [ ] Single document or code comment stating: "Breakpoints are Tailwind sm/md/lg/xl; sidebar overlay behavior uses JS only for open/close, not layout."
  - [ ] Sidebar store initializes `open` based on `window.innerWidth >= 1024` (keep), but layout styling uses CSS media queries exclusively

  **QA Scenarios**:
  ```
  Scenario: Sidebar responsive behavior consistency
    Tool: Playwright
    Steps:
      1. Open /login, sign in
      2. Resize viewport 1440 → 768 → 375
      3. Observe sidebar visibility transitions
    Expected: No layout thrashing; sidebar shows/hides per breakpoint without JS flicker
    Evidence: .sisyphus/evidence/task-02-breakpoints.mp4
  ```

  **Commit**: YES | Message: `refactor(layout): consolidate breakpoint contract between CSS and stores` | Files: `src/lib/stores/ui.ts`, `src/lib/components/layout/Sidebar.svelte`

---

- [x] 3. Document scroll ownership and fix body scroll

  **What to do**:
  - Decide: `body` must never scroll in-app; only `MessageArea` (and sidebar list) scrolls.
  - Add `overscroll-behavior: none` to body/app root.
  - Ensure `src/routes/(app)/+layout.svelte` uses `h-screen overflow-hidden` and delegates scroll to children.

  **Must NOT do**: Change message list virtualization or pagination; only fix scroll containment.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: CSS layout, overflow behavior, mobile viewport handling
  - Omitted: Testing frameworks

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 5–19 | Blocked By: 2

  **References**:
  - Pattern: `src/routes/(app)/+layout.svelte:16–26` — shell scroll structure
  - Pattern: `src/lib/components/chat/MessageArea.svelte:32–35` — message list scroll

  **Acceptance Criteria**:
  - [ ] `body` has `overscroll-behavior: none` in global CSS
  - [ ] `src/routes/(app)/+layout.svelte` prevents body scroll; scrollable regions are explicitly `overflow-y-auto` with defined heights
  - [ ] Mobile: pull-to-refresh disabled on chat surfaces

  **QA Scenarios**:
  ```
  Scenario: No body scroll on mobile
    Tool: Playwright (mobile viewport)
    Steps:
      1. Open chat route with long conversation
      2. Attempt to scroll the whole page (not just message list)
    Expected: Only message list scrolls; body stays fixed
    Evidence: .sisyphus/evidence/task-03-scroll-containment.png
  ```

  **Commit**: YES | Message: `fix(layout): prevent body scroll, delegate to message area` | Files: `src/app.css`, `src/routes/(app)/+layout.svelte`

---

- [x] 4. Move theme initialization to root layout

  **What to do**:
  - Call `initTheme()` in `src/routes/+layout.svelte` (root) so `/login` shares the same theme system and avoids flash.
  - Ensure theme store reads from `localStorage` and applies class to `document.documentElement` before first paint where possible.

  **Must NOT do**: Change token values or theme options; move logic only.

  **Recommended Agent Profile**:
  - Category: `quick`
  - Skills: Svelte lifecycle, localStorage, CSS class toggling
  - Omitted: Heavy CSS changes

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 5–19 | Blocked By: —

  **References**:
  - Pattern: `src/routes/(app)/+layout.svelte:11–13` — current initTheme location
  - Pattern: `src/routes/+layout.svelte` — root layout (move here)
  - Pattern: `src/lib/stores/theme.ts` — initTheme implementation

  **Acceptance Criteria**:
  - [ ] `src/routes/+layout.svelte` calls `initTheme()` in `onMount`
  - [ ] `/login` renders with correct theme class on `html` element immediately after load
  - [ ] No theme flash observed on hard reload

  **QA Scenarios**:
  ```
  Scenario: Login theme consistency
    Tool: Playwright
    Steps:
      1. Set theme to dark in app
      2. Logout → redirects to /login
      3. Screenshot /login
    Expected: Login renders in dark mode without flash
    Evidence: .sisyphus/evidence/task-04-login-theme.png
  ```

  **Commit**: YES | Message: `fix(theme): init theme in root layout so login shares system` | Files: `src/routes/+layout.svelte`, `src/routes/(app)/+layout.svelte`

---

- [x] 5. Redesign login page layout and styling

  **What to do**:
  - Replace `max-w-sm` with `max-w-md` or `max-w-lg` (warm editorial: substantial but not sprawling).
  - Apply new token classes: `bg-surface-elevated`, `text-primary`, `border-border`, `focus-ring`.
  - Add warm visual hierarchy: larger title, improved input height (44px), stronger primary button presence.
  - Ensure vertical centering and comfortable padding on all viewports.

  **Must NOT do**: Change form logic or validation; only styling.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: Tailwind, responsive layout, form accessibility
  - Omitted: Testing frameworks

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: — | Blocked By: 1,2,4

  **References**:
  - Pattern: `src/routes/login/+page.svelte:46–106` — current login structure
  - Token: `bg-surface-elevated`, `text-primary`, `accent`, `focus-ring` (from task 1)

  **Acceptance Criteria**:
  - [ ] Login card uses `max-w-md` (or `max-w-lg` if content warrants)
  - [ ] Inputs are 44px+ height, clear focus rings with `focus-ring` token
  - [ ] Primary button has strong contrast and hover state
  - [ ] Layout centers vertically with safe padding on mobile

  **QA Scenarios**:
  ```
  Scenario: Login desktop appearance
    Tool: Playwright (Desktop Chrome)
    Steps:
      1. Navigate to /login
      2. Screenshot full page
    Expected: Card is substantial, centered, warm editorial styling, no stray artifacts
    Evidence: .sisyphus/evidence/task-05-login-desktop.png

  Scenario: Login mobile appearance
    Tool: Playwright (iPhone SE viewport)
    Steps:
      1. Navigate to /login
      2. Screenshot full page
    Expected: Card fills width appropriately, touch targets >=44px, readable
    Evidence: .sisyphus/evidence/task-05-login-mobile.png
  ```

  **Commit**: YES | Message: `design(login): warm editorial redesign with expanded width and tokens` | Files: `src/routes/login/+page.svelte`

---

- [x] 6. Polish app shell layout (header + main structure)

  **What to do**:
  - Unify header height: mobile 48px, tablet/desktop 56–64px.
  - Use token-based borders, backgrounds, text colors.
  - Ensure header actions have consistent 44px touch targets.
  - Add safe-area padding for mobile landscape/notch handling.

  **Must NOT do**: Change header functionality or navigation logic.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: Tailwind, mobile viewport handling, safe-area-inset
  - Omitted: Complex state management

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: 7,9 | Blocked By: 1,2,3,4

  **References**:
  - Pattern: `src/lib/components/layout/Header.svelte:40–94` — header markup
  - Token: `border-border`, `bg-surface-page`, `text-primary`, `text-muted`, `focus-ring`

  **Acceptance Criteria**:
  - [ ] Header height: 48px (mobile), 56px (md), 64px (lg+)
  - [ ] All interactive header elements >=44px touch target
  - [ ] Uses token classes for all colors/borders
  - [ ] No stray visual artifacts at top/bottom

  **QA Scenarios**:
  ```
  Scenario: Header touch targets
    Tool: Playwright (mobile viewport)
    Steps:
      1. Open authenticated app
      2. Inspect hamburger, new chat, theme toggle, logout
    Expected: All bounding boxes >=44×44px
    Evidence: .sisyphus/evidence/task-06-header-touch.png

  Scenario: Header visual polish
    Tool: Playwright (desktop)
    Steps: Screenshot header area
    Expected: Clean borders, consistent spacing, no overflow or clipping artifacts
    Evidence: .sisyphus/evidence/task-06-header-desktop.png
  ```

  **Commit**: YES | Message: `design(shell): polish header with consistent sizing and tokens` | Files: `src/lib/components/layout/Header.svelte`

---

- [x] 7. Polish sidebar frame and overlay behavior

  **What to do**:
  - Refine sidebar width: 280px (mobile/tablet overlay), 260px (desktop inline).
  - Apply token-based backgrounds/borders; add subtle shadow for overlay state.
  - Improve mobile overlay backdrop (blur + opacity token).
  - Ensure animation duration 250ms with ease-out (already present, verify consistency).

  **Must NOT do**: Change conversation list logic; only frame styling.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: Svelte transitions, CSS transforms, overlay patterns
  - Omitted: Complex state logic

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: — | Blocked By: 1,2,4,6

  **References**:
  - Pattern: `src/lib/components/layout/Sidebar.svelte:42–99` — sidebar markup
  - Token: `surface-overlay`, `border-border`, `shadow-lg` (or new overlay shadow token)

  **Acceptance Criteria**:
  - [ ] Sidebar uses token classes for background, border, shadow
  - [ ] Mobile overlay has backdrop blur + `bg-overlay` token
  - [ ] Animation uses standard duration (250ms) and easing

  **QA Scenarios**:
  ```
  Scenario: Sidebar overlay mobile
    Tool: Playwright (iPhone SE)
    Steps:
      1. Tap hamburger
      2. Screenshot during animation (if possible) and after
    Expected: Smooth slide, proper backdrop, no layout shift in main content
    Evidence: .sisyphus/evidence/task-07-sidebar-overlay.png
  ```

  **Commit**: YES | Message: `design(sidebar): polish frame, overlay, and animation` | Files: `src/lib/components/layout/Sidebar.svelte`

---

- [x] 8. Polish sidebar conversation list and items

  **What to do**:
  - Apply token-based hover, active, and focus states.
  - Improve active indicator (left border accent) — ensure it uses `accent` token.
  - Ensure text truncation with ellipsis works correctly with new font sizes.
  - Increase touch targets on item actions (menu button, rename, delete).

  **Must NOT do**: Change data loading or persistence logic.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: Svelte components, accessibility, truncation patterns
  - Omitted: Backend logic

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: — | Blocked By: 1,2,7

  **References**:
  - Pattern: `src/lib/components/sidebar/ConversationList.svelte` — list container
  - Pattern: `src/lib/components/sidebar/ConversationItem.svelte` — item markup
  - Token: `bg-hover`, `border-accent`, `text-primary`, `text-muted`, `danger`

  **Acceptance Criteria**:
  - [ ] List uses token classes for all states
  - [ ] Active item has clear accent border
  - [ ] All interactive elements >=44px touch target
  - [ ] Truncation works without breaking layout

  **QA Scenarios**:
  ```
  Scenario: Conversation item states
    Tool: Playwright (desktop)
    Steps:
      1. Hover, click, and open menu on a conversation item
      2. Screenshot each state
    Expected: Clear visual feedback, consistent token usage
    Evidence: .sisyphus/evidence/task-08-item-states.png
  ```

  **Commit**: YES | Message: `design(sidebar): polish list and item styling, states, and touch targets` | Files: `src/lib/components/sidebar/ConversationList.svelte`, `src/lib/components/sidebar/ConversationItem.svelte`

---

- [x] 9. Polish chat layout and sticky input/footer

  **What to do**:
  - Ensure chat page layout uses flex column with `MessageArea` as scrollable flex-1 and input as sticky sibling.
  - Apply safe-area padding for mobile (account for iOS keyboard and home indicator).
  - Ensure input container uses token-based borders, shadows, backgrounds.

  **Must NOT do**: Change message sending logic or streaming behavior.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: Mobile viewport handling, safe-area-inset, flexbox layout
  - Omitted: WebSocket/streaming logic

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: 10 | Blocked By: 1,2,3,4,6

  **References**:
  - Pattern: `src/routes/(app)/chat/[conversationId]/+page.svelte:192–206` — chat layout
  - Pattern: `src/lib/components/chat/MessageInput.svelte` — input component
  - Token: `surface-elevated`, `border-border`, `focus-ring`, `shadow-md`

  **Acceptance Criteria**:
  - [ ] Input stays visible above keyboard on mobile
  - [ ] Input container uses token classes
  - [ ] No layout jump when keyboard opens/closes
  - [ ] Safe-area padding applied to bottom on mobile

  **QA Scenarios**:
  ```
  Scenario: Chat input visibility with keyboard
    Tool: Playwright (mobile + virtual keyboard simulation if available)
    Steps:
      1. Focus message input
      2. Type several lines
    Expected: Input remains visible and tappable; no page scroll
    Evidence: .sisyphus/evidence/task-09-chat-input.png
  ```

  **Commit**: YES | Message: `design(chat): polish layout and sticky input with safe-area support` | Files: `src/routes/(app)/chat/[conversationId]/+page.svelte`, `src/lib/components/chat/MessageInput.svelte`

---

- [x] 10. Polish message bubbles

  **What to do**:
  - Unify user vs assistant bubble styling using tokens.
  - Ensure user bubbles have sufficient contrast against background.
  - Improve copy button visibility (icon contrast, hover state).
  - Ensure timestamp readability (`text-muted` token, sufficient size).

  **Must NOT do**: Change message rendering logic or streaming behavior.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: Component styling, contrast checking
  - Omitted: Complex logic

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: — | Blocked By: 1,4,9

  **References**:
  - Pattern: `src/lib/components/chat/MessageBubble.svelte` — bubble markup
  - Token: `surface-elevated`, `surface-page`, `text-primary`, `text-muted`, `icon-muted`, `icon-primary`

  **Acceptance Criteria**:
  - [ ] User bubble uses `surface-elevated` with `text-primary`
  - [ ] Assistant bubble uses `surface-page` with `text-primary`
  - [ ] Copy button has >=3:1 contrast in both themes
  - [ ] Timestamp uses `text-muted` and is legible

  **QA Scenarios**:
  ```
  Scenario: Message bubble contrast
    Tool: Playwright + manual contrast check (or automated if available)
    Steps:
      1. Send messages in both light and dark themes
      2. Screenshot user and assistant bubbles
    Expected: Text passes 4.5:1 against bubble background; icons pass 3:1
    Evidence: .sisyphus/evidence/task-10-bubbles-contrast.png
  ```

  **Commit**: YES | Message: `design(chat): polish message bubbles with token consistency` | Files: `src/lib/components/chat/MessageBubble.svelte`

---

- [x] 11. Polish code blocks

  **What to do**:
  - Apply token-based backgrounds (`surface-code`), borders, text colors.
  - Ensure code block has rounded corners (`radius-md`).
  - Improve copy button integration (positioning, contrast).
  - Ensure horizontal scroll works without breaking layout.

  **Must NOT do**: Change syntax highlighting logic.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: CSS layout, overflow handling, token usage
  - Omitted: Shiki/markdown logic

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: — | Blocked By: 1,4,10

  **References**:
  - Pattern: `src/lib/components/chat/CodeBlock.svelte` — code block component
  - Token: `surface-code`, `border-border`, `radius-md`, `text-primary`

  **Acceptance Criteria**:
  - [ ] Code block uses `surface-code` background
  - [ ] Border uses `border-border` token
  - [ ] Horizontal scroll contained within block, no page overflow
  - [ ] Copy button visible and reachable

  **QA Scenarios**:
  ```
  Scenario: Code block mobile scroll
    Tool: Playwright (mobile viewport)
    Steps:
      1. Send a message with wide code block
      2. Attempt to scroll code block horizontally
    Expected: Only code block scrolls; page does not scroll horizontally
    Evidence: .sisyphus/evidence/task-11-codeblock-scroll.png
  ```

  **Commit**: YES | Message: `design(chat): polish code blocks with token-based surfaces` | Files: `src/lib/components/chat/CodeBlock.svelte`

---

- [x] 12. Polish empty state

  **What to do**:
  - Improve visual hierarchy: icon size, heading weight, description color.
  - Center content vertically and horizontally with comfortable whitespace.
  - Ensure CTA button uses accent token and has strong presence.

  **Must NOT do**: Change empty state logic or navigation.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: Visual hierarchy, centering techniques
  - Omitted: Complex logic

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: — | Blocked By: 1,4,6

  **References**:
  - Pattern: `src/routes/(app)/+page.svelte:30–71` — empty state markup
  - Token: `surface-page`, `text-primary`, `text-muted`, `accent`, `surface-elevated`

  **Acceptance Criteria**:
  - [ ] Empty state centers content with tokens for background/text
  - [ ] Icon uses `surface-elevated` container
  - [ ] CTA button prominent with `accent` token
  - [ ] Sufficient vertical padding on all viewports

  **QA Scenarios**:
  ```
  Scenario: Empty state appearance
    Tool: Playwright (desktop + mobile)
    Steps: Screenshot empty state at / (authenticated, no conversations)
    Expected: Centered, warm hierarchy, clear CTA, no stray elements
    Evidence: .sisyphus/evidence/task-12-emptystate.png
  ```

  **Commit**: YES | Message: `design(app): polish empty state with centered hierarchy and tokens` | Files: `src/routes/(app)/+page.svelte`

---

- [x] 13. Polish dialogs (ConfirmDialog and any others)

  **What to do**:
  - Apply token-based overlay backdrop, surface background, borders.
  - Ensure buttons use semantic tokens (danger, accent, neutral).
  - Improve spacing and typography in dialog content.

  **Must NOT do**: Change dialog behavior or logic.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: Modal/overlay styling, accessibility
  - Omitted: Complex state logic

  **Parallelization**: Can Parallel: YES | Wave 3 | Blocks: — | Blocked By: 1,4

  **References**:
  - Pattern: `src/lib/components/ui/ConfirmDialog.svelte` — dialog markup
  - Token: `surface-overlay`, `surface-elevated`, `danger`, `accent`, `text-primary`, `text-muted`

  **Acceptance Criteria**:
  - [ ] Dialog backdrop uses `surface-overlay` token
  - [ ] Dialog surface uses `surface-elevated` token
  - [ ] Buttons use semantic color tokens (danger for destructive, accent for primary)
  - [ ] Sufficient padding and clear typography

  **QA Scenarios**:
  ```
  Scenario: Delete confirmation dialog
    Tool: Playwright
    Steps:
      1. Open sidebar, click conversation menu, choose Delete
      2. Screenshot dialog
    Expected: Centered, clear hierarchy, danger button prominent
    Evidence: .sisyphus/evidence/task-13-dialog.png
  ```

  **Commit**: YES | Message: `design(ui): polish dialogs with token-based surfaces and actions` | Files: `src/lib/components/ui/ConfirmDialog.svelte`

---

- [x] 14. Implement consistent motion system

  **What to do**:
  - Define standard durations: 150ms (micro), 250ms (standard), 300ms (emphasis).
  - Define easing: `ease-out` for exits, `ease-in-out` for symmetrical transitions.
  - Replace arbitrary durations in components with these standards.
  - Ensure `prefers-reduced-motion` media query disables or minimizes animations.

  **Must NOT do**: Add decorative animations that do not serve UX.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: CSS animations, accessibility, motion design
  - Omitted: Complex logic

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: — | Blocked By: 1–13

  **References**:
  - Pattern: `src/app.css` — add motion variables or utility classes
  - Pattern: Component files with inline `transition:` or `animate:` directives

  **Acceptance Criteria**:
  - [ ] Standard durations documented and applied (150/250/300ms)
  - [ ] `prefers-reduced-motion` reduces durations to 0.01ms or disables entirely
  - [ ] No arbitrary animation durations outside the standard set

  **QA Scenarios**:
  ```
  Scenario: Reduced motion support
    Tool: Playwright
    Steps:
      1. Enable prefers-reduced-motion
      2. Open sidebar, trigger transitions
    Expected: Animations disabled or minimal
    Evidence: .sisyphus/evidence/task-14-reduced-motion.png
  ```

  **Commit**: YES | Message: `design(system): standardize motion durations and reduced-motion support` | Files: `src/app.css`, `src/lib/components/**/*`

---

- [x] 15. Audit and fix contrast issues

  **What to do**:
  - Systematically review all text and icon color combinations.
  - Ensure text meets 4.5:1 against backgrounds; icons/borders meet 3:1.
  - Fix any gray-on-black or low-contrast combinations reported by user.

  **Must NOT do**: Change content or functionality; only color values.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: Accessibility, contrast checking, color theory
  - Omitted: Complex logic

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: — | Blocked By: 1–13

  **References**:
  - Token: All color tokens from task 1
  - Tool: Use online contrast checker or automated tools if available

  **Acceptance Criteria**:
  - [ ] All text >=4.5:1 against its background in both themes
  - [ ] All icons >=3:1 against their surfaces
  - [ ] No reported "unreadable" elements

  **QA Scenarios**:
  ```
  Scenario: Dark theme icon contrast
    Tool: Playwright + manual verification
    Steps:
      1. Open app in dark mode
      2. Inspect header icons, message action icons, sidebar menu icons
    Expected: All icons clearly visible against dark backgrounds
    Evidence: .sisyphus/evidence/task-15-dark-contrast.png
  ```

  **Commit**: YES | Message: `a11y: fix contrast issues across light and dark themes` | Files: `src/app.css`, component files with color issues

---

- [x] 16–18. Update Playwright test assertions (responsive, mobile, auth)

  **What to do**:
  - Update `responsive.spec.ts` and `mobile-design.spec.ts` to match new class names and dimensions.
  - Replace brittle pixel assertions with behavior/visibility checks where possible.
  - Ensure auth and chat specs still pass with new UI.

  **Must NOT do**: Change test logic fundamentally; only update assertions for new UI.

  **Recommended Agent Profile**:
  - Category: `unspecified-high`
  - Skills: Playwright, test maintenance, assertion patterns
  - Omitted: New test scenarios beyond assertion updates

  **Parallelization**: Can Parallel: YES | Wave 4 | Blocks: — | Blocked By: 1–15

  **References**:
  - Files: `tests/e2e/responsive.spec.ts`, `tests/e2e/mobile-design.spec.ts`, `tests/e2e/auth.spec.ts`, `tests/e2e/chat.spec.ts`

  **Acceptance Criteria**:
  - [ ] All Playwright tests pass
  - [ ] Tests use resilient selectors (not brittle class names where possible)
  - [ ] Coverage includes responsive breakpoints, touch targets, theme consistency

  **QA Scenarios**:
  ```
  Scenario: Full test suite passes
    Tool: Bash
    Steps: npm run test:e2e
    Expected: All tests pass with new UI
    Evidence: .sisyphus/evidence/task-16-18-e2e-results.txt
  ```

  **Commit**: YES | Message: `test(e2e): update assertions for redesigned UI` | Files: `tests/e2e/*.spec.ts`, `tests/e2e/*.test.ts`

---

## Final Verification Wave (4 parallel agents, ALL must APPROVE)

- [ ] F1. Plan Compliance Audit — oracle
  - Verify all tasks completed according to plan
  - Check no hardcoded colors remain outside tokens
  - Verify contrast targets met

- [ ] F2. Code Quality Review — unspecified-high
  - Review for code smells, duplication, accessibility issues
  - Ensure consistent patterns across all polished components

- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
  - Light theme verification on desktop and mobile
  - Dark theme verification on desktop and mobile
  - Login flow, chat flow, sidebar interactions, dialogs

- [ ] F4. Scope Fidelity Check — deep
  - Verify no scope creep occurred (no new features added)
  - Confirm all reported issues are addressed
  - Check for any remaining "stray artifacts" or broken layouts

---

## Commit Strategy

1. **Wave 1 commits**: Foundation changes (tokens, breakpoints, scroll, theme init)
2. **Wave 2 commits**: Shell surfaces (login, header, sidebar frame, sidebar items)
3. **Wave 3 commits**: Content surfaces (chat, messages, code blocks, empty state, dialogs)
4. **Wave 4 commits**: Motion, contrast, test updates
5. **Final verification commits**: Any fixes from audit/review

## Success Criteria

All of the following must be true:
- [ ] Login page displays properly at all viewport sizes (no "few dozen pixels wide")
- [ ] No stray visual artifacts at top or bottom of any page
- [ ] Body does not scroll; only designated scroll areas scroll
- [ ] All icons readable in both light and dark themes (contrast >=3:1)
- [ ] Consistent spacing, radius, and typography across all surfaces
- [ ] Smooth, appropriate animations with reduced-motion support
- [ ] All Playwright tests pass
- [ ] Visual QA approved on mobile (375px), tablet (768px), and desktop (1440px)
- [ ] Both light and dark themes verified
- [ ] No hardcoded hex values in component files
