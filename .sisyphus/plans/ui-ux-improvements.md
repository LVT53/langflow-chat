# UI/UX Improvements Work Plan

## TL;DR

> **Comprehensive UI/UX polish for AlfyAI Langflow custom UI**  
> Implementing warm-editorial + minimalist Claude-like design system with consistent buttons, refined sidebar, polished navbar, and improved spacing throughout.
>
> **13 deliverables**: Button suite redesign | Icon-only buttons | Hover effects | Sidebar width/animation | Color harmony | Navbar spacing | Float input | Typography polish | Dropdown redesign | Border consistency | Chat whitespace
>
> **Estimated Effort**: Medium (focused improvements, well-scoped)
> **Parallel Execution**: YES - 4 waves (foundation → components → polish → integration)
> **Critical Path**: CSS design tokens → Button components → Sidebar/Header → MessageInput → Chat pages

---

## Context

### Original Request
User provided detailed feedback on 13 UI/UX issues in their SvelteKit Langflow custom UI, seeking a warm-editorial aesthetic mixed with minimalist Claude-like design.

### Key Feedback Points
1. **Button inconsistency** - designs all over the place, need unified suite
2. **Icon buttons too boxy** - should be bare icons (like ThemeToggle) except send button
3. **Hover effects too long** - lower duration, apply universally
4. **Sidebar too wide when collapsed** - halve width (64px → 32px)
5. **Sidebar lacks animation** - smooth in/out transitions needed
6. **Color contrast too stark** - lessen sidebar vs main content difference
7. **Navbar spacing issues** - items need gap, bottom padding missing
8. **Prompt input not spacious** - needs float-like design with shadow, vertical centering
9. **Remove subtitle** - "Ask me anything" should be removed
10. **Conversation dropdown undesigned** - needs visual polish
11. **AlfyAI title not prominent** - bigger, more opaque
12. **Border radius inconsistent** - round to 5px minimum
13. **Chat pages too crowded** - add whitespace between content and edges

### Current State (from research)
- **Tech Stack**: SvelteKit + Tailwind CSS
- **Current Button Classes**: `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-icon` (all boxed)
- **Current Sidebar**: 260px expanded, 64px collapsed (needs ~32px)
- **Current Hover**: 250ms duration (needs reduction)
- **Current Border Radius**: CSS vars with 4px/8px/12px (needs 5px minimum)
- **Current Colors**: Light #FFFFFF page vs #F4F3EE sidebar (too different)
- **Current Navbar Gap**: `gap-sm md:gap-md` (inconsistent)
- **Current MessageInput**: No float shadow, uses `items-end` not centered

### Gap Analysis (Self-Review)

**Critical decisions needed**: NONE - all requirements are clear and actionable

**Minor gaps self-resolved**:
- Border radius: Will set `--radius-sm: 5px` as minimum, adjust others proportionally
- Color harmony: Will bring sidebar closer to main (reduce contrast by ~50%)
- Animation: Will use CSS transitions with `cubic-bezier(0.4, 0, 0.2, 1)` for smooth feel
- Button suite: Will create semantic hierarchy matching Claude's approach

**Ambiguous with defaults applied**:
- Hover duration: Defaulting to 150ms (reduced from 250ms)
- Icon button style: Defaulting to bare icon with hover opacity shift
- Float shadow: Defaulting to `0 4px 20px rgba(0,0,0,0.08)` for subtle lift

**Guardrails established**:
- NO changes to business logic or API calls
- NO new features beyond visual polish
- NO breaking changes to existing layout structure
- Maintain all existing accessibility (keyboard nav, focus rings)

---

## Work Objectives

### Core Objective
Unify the visual design across all UI components with a warm-editorial + minimalist Claude-like aesthetic, ensuring consistency in spacing, typography, colors, and interactions.

### Concrete Deliverables
- [ ] Redesigned button CSS component suite (primary, secondary, ghost, icon)
- [ ] Icon-only button styles (bare icons with hover states)
- [ ] Reduced hover transition duration (150ms universal)
- [ ] Collapsed sidebar width 32px with halved "New" button padding
- [ ] Smooth sidebar collapse/expand animations
- [ ] Harmonized sidebar/main content colors (subtle contrast)
- [ ] Navbar with consistent spacing and symmetric padding
- [ ] Float-like message input with shadow and vertical centering
- [ ] Removed subtitle from new prompt screen
- [ ] Redesigned conversation options dropdown
- [ ] Prominent AlfyAI sidebar title (larger, balanced opacity)
- [ ] Consistent 5px minimum border radius across components
- [ ] Chat page whitespace solution (padding/gap between content and edges)

### Definition of Done
- [ ] All buttons use consistent styling from new design system
- [ ] Icon buttons (except send) display as bare icons
- [ ] Every interactive element has 150ms hover transition
- [ ] Sidebar collapses to 32px with smooth animation
- [ ] Color difference between sidebar and main is subtle (<15% contrast)
- [ ] Navbar items have gap-sm spacing and symmetric pt/pb-safe
- [ ] Message input has shadow-md, vertically centered contents
- [ ] New prompt screen shows only main title
- [ ] Conversation dropdown matches design system
- [ ] AlfyAI title is 18-20px with opacity-80
- [ ] All borders use minimum 5px radius
- [ ] Chat pages have 16-24px gap from sidebar and page edges

### Must Have
- All 13 feedback items addressed
- Mobile responsive behavior maintained
- Dark/light mode compatibility
- Accessibility preserved (keyboard nav, focus rings)
- No visual regressions in existing functionality

### Must NOT Have (Guardrails)
- NO new business logic or features
- NO changes to API integrations
- NO breaking layout changes
- NO removal of existing functionality
- NO over-engineered animation systems
- NO scope creep into unrelated components

---

## Verification Strategy

### Test Decision
- **Infrastructure exists**: YES (Vitest configured)
- **Automated tests**: NO - UI-focused work, visual QA is primary
- **Framework**: N/A for UI polish
- **Strategy**: Visual QA with Playwright screenshots + manual component inspection

### QA Policy
Every task includes Agent-Executed QA Scenarios:

- **UI Components**: Playwright screenshots for visual regression
- **Animations**: Video capture for smoothness verification
- **Spacing**: Inspector measurement verification
- **Responsive**: Mobile/desktop viewport testing

Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation - Design Tokens & CSS):
├── Task 1: Update CSS design tokens (border radius, hover duration, colors)
├── Task 2: Create new button design system classes
└── Task 3: Update Tailwind config with new tokens

Wave 2 (Components - Sidebar & Header):
├── Task 4: Redesign sidebar (width, animation, colors, title)
├── Task 5: Redesign navbar (spacing, padding, icon buttons)
└── Task 6: Update ConversationItem and dropdown menu

Wave 3 (Chat & Input):
├── Task 7: Redesign MessageInput (float style, vertical centering)
├── Task 8: Update chat page layouts (whitespace solution)
└── Task 9: Update new prompt screen (remove subtitle)

Wave 4 (Integration & Polish):
├── Task 10: Audit all remaining buttons for consistency
├── Task 11: Cross-browser/component visual regression check
└── Task 12: Mobile responsive verification

Wave FINAL (Verification):
├── Task F1: Visual compliance audit (oracle)
├── Task F2: Responsive design check
├── Task F3: Accessibility preservation check
└── Task F4: Design system completeness check

Critical Path: Task 1 → Task 2 → Task 4 → Task 5 → Task 7 → Task 8 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 3 (Waves 1 & 2)
```

### Agent Dispatch Summary

- **Wave 1**: **3 tasks** - T1 (quick CSS), T2 (quick CSS), T3 (quick config)
- **Wave 2**: **3 tasks** - T4 (visual-engineering), T5 (visual-engineering), T6 (visual-engineering)
- **Wave 3**: **3 tasks** - T7 (visual-engineering), T8 (visual-engineering), T9 (quick)
- **Wave 4**: **3 tasks** - T10 (unspecified-high audit), T11 (visual-engineering), T12 (visual-engineering)
- **FINAL**: **4 tasks** - All review agents

---

## TODOs

- [x] 1. Update CSS Design Tokens (border radius, hover duration, colors)

  **What to do**:
  - Update CSS variables in `src/app.css` for:
    - Border radius: Set `--radius-sm: 5px`, `--radius-md: 8px` (keep), `--radius-lg: 12px` (keep)
    - Hover duration: Change button transitions from 250ms to 150ms
    - Sidebar color: Make `--surface-overlay` closer to `--surface-page` (reduce contrast)
      - Light: Change from #F4F3EE to #FAFAF8 (subtle warm tint, 3% difference instead of 8%)
      - Dark: Keep as is (already subtle)
  - Verify all transition durations in button classes use 150ms
  - Ensure dark mode tokens remain consistent

  **Must NOT do**:
  - Do not change semantic token structure
  - Do not break existing color references
  - Do not affect non-UI component styles

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: Simple CSS value changes with predictable scope

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3)
  - **Blocks**: Tasks 2, 4, 5, 6, 7
  - **Blocked By**: None

  **References**:
  - `src/app.css:32-139` - CSS custom properties section
  - `src/app.css:194-253` - Button component classes
  - `tailwind.config.ts:63-68` - Border radius tokens

  **Acceptance Criteria**:
  - [ ] `--radius-sm` is 5px in both light and dark modes
  - [ ] Button hover transitions use 150ms duration
  - [ ] Sidebar `--surface-overlay` is #FAFAF8 (light) with subtle difference from page
  - [ ] All existing color references still work

  **QA Scenarios**:

  ```
  Scenario: Verify border radius minimum is 5px
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to any page
      2. Open browser DevTools
      3. Inspect a button element
      4. Check computed border-radius value
    Expected Result: border-radius is at least 5px (or inherits from --radius-sm)
    Evidence: .sisyphus/evidence/task-1-border-radius.png

  Scenario: Verify hover transition is 150ms
    Tool: Playwright video recording
    Preconditions: Dev server running
    Steps:
      1. Navigate to main page
      2. Hover over a button
      3. Record the transition timing
    Expected Result: Transition completes noticeably faster than before (150ms vs 250ms)
    Evidence: .sisyphus/evidence/task-1-hover-timing.mp4
  ```

  **Commit**: YES
  - Message: `style(tokens): Update design tokens for radius, hover, and sidebar colors`
  - Files: `src/app.css`

- [x] 2. Create New Button Design System Classes

  **What to do**:
  - Redesign button classes in `src/app.css` for warm-editorial + Claude aesthetic:
    - `.btn-primary`: Keep accent background, ensure 5px radius, 150ms transitions
    - `.btn-secondary`: Ghost style with border, subtle hover
    - `.btn-ghost`: Bare text button, minimal styling
    - `.btn-icon-bare`: NEW - bare icon button (no box, just icon + hover opacity/color change)
    - `.btn-icon-boxed`: Keep for special cases like send button
  - Ensure all buttons use consistent:
    - Border radius (minimum 5px)
    - Transition duration (150ms)
    - Font weight and sizing
  - Add CSS custom properties for button-specific values if needed

  **Must NOT do**:
  - Do not change existing class names being used elsewhere (keep old ones as aliases if needed)
  - Do not add complex animations
  - Do not use hardcoded values - use CSS vars

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: CSS class definitions with clear design spec

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3)
  - **Blocks**: Tasks 4, 5, 10
  - **Blocked By**: Task 1 (needs radius tokens)

  **References**:
  - `src/app.css:194-253` - Current button classes
  - `DESIGN_SPEC.md:339-347` - Button specifications from design doc
  - ThemeToggle component style (bare icon pattern)

  **Acceptance Criteria**:
  - [ ] `.btn-icon-bare` class exists with no background/box, just icon
  - [ ] All button classes use 5px minimum border radius
  - [ ] All button classes use 150ms transitions
  - [ ] Warm, minimal aesthetic achieved

  **QA Scenarios**:

  ```
  Scenario: Verify btn-icon-bare has no box
    Tool: Playwright
    Preconditions: Dev server running with test HTML page
    Steps:
      1. Create test page with btn-icon-bare
      2. Inspect element
      3. Check computed styles
    Expected Result: No background, no border, just icon visible
    Evidence: .sisyphus/evidence/task-2-bare-icon.png

  Scenario: Verify all buttons have consistent hover
    Tool: Playwright video
    Preconditions: Dev server running
    Steps:
      1. Hover over each button type
      2. Record transitions
    Expected Result: All complete in ~150ms with smooth ease
    Evidence: .sisyphus/evidence/task-2-button-hovers.mp4
  ```

  **Commit**: YES
  - Message: `style(buttons): Redesign button suite with bare icon support`
  - Files: `src/app.css`

- [x] 3. Update Tailwind Config

  **What to do**:
  - Update `tailwind.config.ts` to match new CSS tokens:
    - Ensure borderRadius.sm maps to 5px
    - Add transitionDuration for 150ms if not present
    - Verify all color mappings still valid
  - Add any new utility classes needed for button system
  - Run build to verify no config errors

  **Must NOT do**:
  - Do not remove existing tokens (backward compatibility)
  - Do not change content paths
  - Do not break dark mode class strategy

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: Configuration file update

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2)
  - **Blocks**: All subsequent tasks
  - **Blocked By**: None

  **References**:
  - `tailwind.config.ts:63-68` - Border radius config
  - `tailwind.config.ts:74-78` - Transition duration config

  **Acceptance Criteria**:
  - [ ] Build succeeds without errors
  - [ ] Border radius sm = 5px verified
  - [ ] No breaking changes to existing classes

  **QA Scenarios**:

  ```
  Scenario: Verify Tailwind build succeeds
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run `npm run build` or `bun run build`
    Expected Result: Build completes without config errors
    Evidence: .sisyphus/evidence/task-3-build.log
  ```

  **Commit**: YES
  - Message: `config(tailwind): Update tokens for new design system`
  - Files: `tailwind.config.ts`

---

## Wave 2 Tasks

- [ ] 4. Redesign Sidebar (width, animation, colors, title)

  **What to do**:
  - Update `src/lib/components/layout/Sidebar.svelte`:
    - Collapsed width: Change from 64px to 32px
    - "New" button padding: Halve when collapsed (current uses `p-sm`, use tighter padding)
    - Animation: Add smooth width transition using `transition-all duration-300 ease-out`
    - AlfyAI title: Increase size from 16px to 18-20px, reduce opacity to 0.8 for visual balance
    - Ensure color harmony with updated `--surface-overlay`
  - Update sidebar styles section:
    - `.sidebar-collapsed` width 32px
    - Add transition for width property
  - Verify mobile behavior unchanged

  **Must NOT do**:
  - Do not change expanded width (260px)
  - Do not break mobile overlay behavior
  - Do not remove existing functionality

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Reason: Component styling with animations and responsive behavior

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 5, 6)
  - **Blocks**: None
  - **Blocked By**: Task 1 (color tokens), Task 2 (button classes if needed)

  **References**:
  - `src/lib/components/layout/Sidebar.svelte:47-188`
  - `src/lib/components/layout/Sidebar.svelte:145-188` - Styles section
  - Current ThemeToggle as icon-only reference

  **Acceptance Criteria**:
  - [ ] Collapsed sidebar is 32px wide
  - [ ] "New" button in collapsed state has halved padding BUT maintains 44px touch target
  - [ ] Sidebar animates smoothly when collapsing/expanding (300ms)
  - [ ] AlfyAI title is 18-20px with opacity 0.8
  - [ ] Color difference from main content is subtle

  **QA Scenarios**:

  ```
  Scenario: Verify collapsed sidebar width is 32px
    Tool: Playwright
    Preconditions: Dev server running, desktop viewport
    Steps:
      1. Navigate to chat page
      2. Click collapse button
      3. Measure sidebar width with DevTools
    Expected Result: Width is 32px
    Evidence: .sisyphus/evidence/task-4-sidebar-width.png

  Scenario: Verify smooth animation
    Tool: Playwright video
    Preconditions: Dev server running
    Steps:
      1. Record while clicking collapse/expand
      2. Review animation smoothness
    Expected Result: Smooth 300ms transition visible
    Evidence: .sisyphus/evidence/task-4-sidebar-animation.mp4

  Scenario: Verify AlfyAI title prominence
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Inspect AlfyAI title element
      2. Check font-size and opacity
    Expected Result: 18-20px, opacity 0.8
    Evidence: .sisyphus/evidence/task-4-title-style.png
  ```

  **Commit**: YES
  - Message: `style(sidebar): Redesign with narrower collapse, animation, and prominent title`
  - Files: `src/lib/components/layout/Sidebar.svelte`

- [ ] 5. Redesign Navbar (spacing, padding, icon buttons)

  **What to do**:
  - Update `src/lib/components/layout/Header.svelte`:
    - Add consistent spacing between navbar items using gap
    - ThemeToggle, user name, logout button should have gap-sm between them
    - Apply `pb-safe` (bottom padding) matching `pt-safe` (top padding)
    - Convert icon buttons to use bare icon style (like ThemeToggle)
      - Sidebar toggle (hamburger)
      - New chat button (mobile)
    - Ensure Logout button maintains appropriate styling
  - Ensure responsive behavior maintained across breakpoints
  - Update button classes to use new `.btn-icon-bare` where appropriate

  **Must NOT do**:
  - Do not change header height
  - Do not remove mobile-only/desktop-only classes
  - Do not break logout functionality

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Reason: Component layout with responsive considerations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 6)
  - **Blocks**: None
  - **Blocked By**: Task 2 (button classes)

  **References**:
  - `src/lib/components/layout/Header.svelte:40-100`
    - Line 41: Current gap classes `gap-2 md:gap-4`
    - Line 70: Right side items need explicit gap
    - Line 41: pt-safe exists, needs pb-safe added
  - `src/lib/components/layout/ThemeToggle.svelte` - Bare icon reference

  **Acceptance Criteria**:
  - [ ] ThemeToggle, user name, logout have gap-sm between them
  - [ ] Header has pb-safe matching pt-safe
  - [ ] Sidebar toggle uses bare icon style
  - [ ] Mobile new chat button uses bare icon style
  - [ ] All hover effects are 150ms

  **QA Scenarios**:

  ```
  Scenario: Verify navbar item spacing
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Inspect navbar right-side container
      2. Check gap property between items
    Expected Result: gap-sm (8px) between items
    Evidence: .sisyphus/evidence/task-5-navbar-spacing.png

  Scenario: Verify bare icon buttons
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Inspect hamburger menu button
      2. Check for background/border
    Expected Result: No background/box, just icon
    Evidence: .sisyphus/evidence/task-5-bare-icons.png

  Scenario: Verify symmetric padding
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Inspect header element
      2. Check padding-top and padding-bottom
    Expected Result: pt-safe and pb-safe both applied
    Evidence: .sisyphus/evidence/task-5-header-padding.png
  ```

  **Commit**: YES
  - Message: `style(header): Redesign navbar with consistent spacing and bare icon buttons`
  - Files: `src/lib/components/layout/Header.svelte`

- [ ] 6. Update ConversationItem and Dropdown Menu

  **What to do**:
  - Update `src/lib/components/sidebar/ConversationItem.svelte`:
    - Redesign the three-dot menu button to use bare icon style
    - Update dropdown menu styling:
      - Use 5px border radius
      - Apply consistent shadow (shadow-md)
      - Better padding and spacing
      - Match design system colors
    - Ensure rename/delete options have consistent hover states
    - Add subtle animation for menu open/close
  - Ensure active state styling is consistent with new design
  - Update any border-radius to minimum 5px

  **Must NOT do**:
  - Do not change conversation selection logic
  - Do not break rename/delete functionality
  - Do not affect conversation list scroll behavior

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Reason: Component with dropdown and interaction states

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5)
  - **Blocks**: None
  - **Blocked By**: Task 1 (radius tokens), Task 2 (button classes)

  **References**:
  - `src/lib/components/sidebar/ConversationItem.svelte:91-181`
    - Line 123: Menu button styling
    - Lines 147-167: Dropdown menu styling
  - Dropdown needs: border-radius, shadow, consistent padding

  **Acceptance Criteria**:
  - [ ] Three-dot menu button is bare icon (no box)
  - [ ] Dropdown menu has 5px border radius
  - [ ] Dropdown has shadow-md elevation
  - [ ] Menu items have consistent hover states (150ms)
  - [ ] Menu open/close has subtle animation

  **QA Scenarios**:

  ```
  Scenario: Verify dropdown design
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Open conversation dropdown
      2. Inspect menu styling
    Expected Result: 5px radius, shadow, consistent spacing
    Evidence: .sisyphus/evidence/task-6-dropdown-design.png

  Scenario: Verify menu button is bare icon
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Inspect three-dot menu button
      2. Check for background
    Expected Result: No background, just icon
    Evidence: .sisyphus/evidence/task-6-menu-button.png
  ```

  **Commit**: YES
  - Message: `style(conversation): Redesign dropdown menu and options button`
  - Files: `src/lib/components/sidebar/ConversationItem.svelte`

---

## Wave 3 Tasks

- [ ] 7. Redesign MessageInput (float style, vertical centering)

  **What to do**:
  - Update `src/lib/components/chat/MessageInput.svelte`:
    - Add float-like design with subtle shadow
      - Use `shadow-md` or custom: `0 4px 20px rgba(0,0,0,0.08)`
      - Add slight elevation feel
    - Make input more spacious:
      - Increase padding inside container
      - Ensure textarea has comfortable internal spacing
    - Vertically center all elements inside:
      - File attachment button
      - Textarea
      - Send button
      - Change from `items-end` to `items-center`
    - Ensure send button maintains boxed style (as specified - exception to bare icon rule)
    - Update border radius to minimum 5px
    - Maintain existing focus ring behavior
  - Verify mobile behavior (keyboard handling, safe area)
  - Test with multi-line input (textarea expansion)

  **Must NOT do**:
  - Do not break auto-resize functionality
  - Do not break Enter-to-send behavior
  - Do not break disabled states
  - Do not remove file attachment placeholder
  - Do not let elements jump when textarea expands (maintain centering)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Reason: Complex component with interaction states and responsive behavior

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 8, 9)
  - **Blocks**: None
  - **Blocked By**: Task 1 (tokens), Task 2 (button classes for send button)

  **References**:
  - `src/lib/components/chat/MessageInput.svelte:71-110`
    - Line 72: Main container needs shadow and centering
    - Line 75: File button needs centering
    - Line 85-95: Textarea styling
    - Line 97-109: Send button (keep boxed)

  **Acceptance Criteria**:
  - [ ] Input container has float-like shadow
  - [ ] Elements (attach, textarea, send) are vertically centered
  - [ ] Input feels more spacious (increased padding)
  - [ ] Border radius is 5px minimum
  - [ ] Multi-line expansion still works
  - [ ] Mobile keyboard handling preserved

  **QA Scenarios**:

  ```
  Scenario: Verify float-like shadow
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to chat page
      2. Inspect message input container
      3. Check box-shadow property
    Expected Result: Shadow visible, 0 4px 20px rgba(0,0,0,0.08) or similar
    Evidence: .sisyphus/evidence/task-7-input-shadow.png

  Scenario: Verify vertical centering
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Inspect input container
      2. Check align-items property
      3. Verify all child elements centered
    Expected Result: align-items: center, all elements vertically aligned
    Evidence: .sisyphus/evidence/task-7-vertical-center.png

  Scenario: Verify spacious design
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Inspect padding values
      2. Compare to original design
    Expected Result: Increased padding, more breathing room
    Evidence: .sisyphus/evidence/task-7-spacing.png

  Scenario: Verify multi-line still works
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Type multi-line message
      2. Verify textarea expands
      3. Check elements stay centered
    Expected Result: Textarea grows, elements remain centered
    Evidence: .sisyphus/evidence/task-7-multiline.mp4
  ```

  **Commit**: YES
  - Message: `style(input): Redesign MessageInput with float shadow and vertical centering`
  - Files: `src/lib/components/chat/MessageInput.svelte`

- [ ] 8. Update Chat Page Layouts (whitespace solution)

  **What to do**:
  - Update `src/routes/(app)/chat/[conversationId]/+page.svelte`:
    - Add proper spacing between content and sidebar
    - Add spacing between content and page edges
    - Ensure MessageArea and MessageInput have breathing room
    - Consider padding or margin solution
  - Update `src/routes/(app)/+layout.svelte` if needed for main content spacing
  - Ensure consistent spacing across mobile/desktop
  - The solution should feel "uncrowded" as requested

  **Must NOT do**:
  - Do not break the scroll ownership contract
  - Do not break message auto-scroll
  - Do not create double scrollbars
  - Do not affect sidebar behavior

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Reason: Layout changes with responsive considerations

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 9)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/routes/(app)/chat/[conversationId]/+page.svelte:192-208` - Main layout
  - `src/routes/(app)/+layout.svelte:16-26` - App layout structure
  - Current: Content touches sidebar (`flex-1` directly adjacent)

  **Acceptance Criteria**:
  - [ ] Chat content has 16-24px gap from sidebar
  - [ ] Chat content has padding from page edges
  - [ ] Message area doesn't feel cramped
  - [ ] Mobile maintains usable space
  - [ ] No visual crowding

  **QA Scenarios**:

  ```
  Scenario: Verify whitespace from sidebar
    Tool: Playwright
    Preconditions: Dev server running, desktop viewport
    Steps:
      1. Navigate to chat page
      2. Measure gap between sidebar and message area
    Expected Result: 16-24px visible gap
    Evidence: .sisyphus/evidence/task-8-sidebar-gap.png

  Scenario: Verify page edge spacing
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Check padding on main content area
      2. Verify messages don't touch screen edge
    Expected Result: Comfortable padding visible
    Evidence: .sisyphus/evidence/task-8-edge-spacing.png

  Scenario: Verify mobile spacing
    Tool: Playwright mobile viewport
    Preconditions: Dev server running
    Steps:
      1. Set mobile viewport
      2. Check message area spacing
    Expected Result: Appropriate spacing maintained
    Evidence: .sisyphus/evidence/task-8-mobile-spacing.png
  ```

  **Commit**: YES
  - Message: `style(layout): Add whitespace to chat pages for uncrowded feel`
  - Files: `src/routes/(app)/chat/[conversationId]/+page.svelte`, `src/routes/(app)/+layout.svelte`

- [ ] 9. Remove Subtitle from New Prompt Screen

  **What to do**:
  - Update `src/routes/(app)/+page.svelte`:
    - Remove the subtitle paragraph "Ask me anything." (line 43-45)
    - Keep the main title "What can I help you with?"
    - Ensure visual balance without subtitle
    - May need to adjust spacing of remaining elements
  - Verify the page still looks good with just the title
  - Ensure mobile view is balanced

  **Must NOT do**:
  - Do not remove the main title
  - Do not remove MessageInput
  - Do not break the "hasStarted" fade transition

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []
  - Reason: Simple removal with spacing adjustment

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 7, 8)
  - **Blocks**: None
  - **Blocked By**: None

  **References**:
  - `src/routes/(app)/+page.svelte:39-47` - Title and subtitle section
    - Line 40-42: Main title
    - Lines 43-45: Subtitle to remove

  **Acceptance Criteria**:
  - [ ] Subtitle "Ask me anything." is removed
  - [ ] Main title "What can I help you with?" remains
  - [ ] Page looks visually balanced
  - [ ] Mobile view is balanced

  **QA Scenarios**:

  ```
  Scenario: Verify subtitle removed
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Navigate to root page (new conversation)
      2. Check for subtitle text
    Expected Result: No "Ask me anything" text visible
    Evidence: .sisyphus/evidence/task-9-no-subtitle.png

  Scenario: Verify visual balance
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Check spacing between title and input
      2. Verify no awkward gaps
    Expected Result: Balanced, clean appearance
    Evidence: .sisyphus/evidence/task-9-balance.png
  ```

  **Commit**: YES
  - Message: `style(prompt): Remove subtitle from new prompt screen`
  - Files: `src/routes/(app)/+page.svelte`

---

## Wave 4 Tasks

- [ ] 10. Audit All Remaining Buttons for Consistency

  **What to do**:
  - Search codebase for all button elements not yet updated:
    - `src/routes/login/+page.svelte` - Login buttons
    - `src/lib/components/chat/MessageBubble.svelte` - Copy buttons
    - `src/lib/components/chat/ErrorMessage.svelte` - Action buttons
    - `src/lib/components/ui/ConfirmDialog.svelte` - Dialog buttons
    - Any other `<button>` elements
  - Ensure all use consistent:
    - Border radius (5px minimum)
    - Hover duration (150ms)
    - Icon style (bare for non-send, boxed only for primary actions)
  - Update classes to use new button system
  - Fix any remaining inconsistencies

  **Must NOT do**:
  - Do not break existing functionality
  - Do not change button behavior (only styling)
  - Do not miss any buttons

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: []
  - Reason: Comprehensive audit across multiple files

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 11, 12)
  - **Blocks**: None
  - **Blocked By**: Task 2 (button classes)

  **References**:
  - Search for all `<button` tags in src/
  - `src/routes/login/+page.svelte` - Login form buttons
  - `src/lib/components/chat/MessageBubble.svelte` - Message action buttons
  - `src/lib/components/ui/ConfirmDialog.svelte` - Confirm/cancel buttons

  **Acceptance Criteria**:
  - [ ] All buttons use 5px minimum border radius
  - [ ] All buttons use 150ms hover transitions
  - [ ] Icon buttons (except send) are bare style
  - [ ] Primary action buttons appropriately styled
  - [ ] No inconsistent button styling remains

  **QA Scenarios**:

  ```
  Scenario: Audit all buttons
    Tool: Playwright + code search
    Preconditions: All changes deployed
    Steps:
      1. Search codebase for button elements
      2. Verify each uses consistent classes
      3. Screenshot all button variants
    Expected Result: All buttons consistent with design system
    Evidence: .sisyphus/evidence/task-10-button-audit.md + screenshots/
  ```

  **Commit**: YES
  - Message: `style(buttons): Audit and update all remaining buttons for consistency`
  - Files: All files with button elements

- [ ] 11. Cross-Browser/Component Visual Regression Check

  **What to do**:
  - Build the application (`npm run build`)
  - Preview the built version (`npm run preview`)
  - Take screenshots of key views:
    - Login page
    - New conversation page
    - Chat page with messages
    - Sidebar collapsed state
    - Sidebar expanded state
    - Mobile viewport versions
  - Compare to expected design:
    - Warm-editorial aesthetic
    - Consistent spacing
    - Unified button styles
    - Smooth animations
  - Document any visual issues
  - Fix any regressions found

  **Must NOT do**:
  - Do not skip any key views
  - Do not ignore visual regressions
  - Do not rely only on dev server (use built version)

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Reason: Visual verification across views

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 10, 12)
  - **Blocks**: None
  - **Blocked By**: Tasks 1-9 (needs all UI changes)

  **References**:
  - `src/routes/login/+page.svelte` - Login view
  - `src/routes/(app)/+page.svelte` - New conversation
  - `src/routes/(app)/chat/[conversationId]/+page.svelte` - Chat

  **Acceptance Criteria**:
  - [ ] Build succeeds
  - [ ] All key views rendered correctly
  - [ ] No visual regressions from before
  - [ ] Design system consistently applied

  **QA Scenarios**:

  ```
  Scenario: Verify all views
    Tool: Playwright + build
    Preconditions: Build completed
    Steps:
      1. Run build and preview
      2. Screenshot login, new conversation, chat
      3. Test sidebar collapse/expand
      4. Test mobile viewport
    Expected Result: All views consistent with design
    Evidence: .sisyphus/evidence/task-11-views/*.png
  ```

  **Commit**: N/A (verification task)

- [ ] 12. Mobile Responsive Verification

  **What to do**:
  - Test all UI changes on mobile viewport sizes:
    - iPhone SE (375px)
    - iPhone 12/13/14 (390px)
    - iPhone Pro Max (430px)
  - Verify:
    - Sidebar overlay behavior
    - Touch targets remain 44px minimum
    - Message input keyboard handling
    - Button sizing is appropriate
    - No horizontal scroll
    - Safe area insets working
  - Test landscape orientation
  - Document any mobile-specific issues

  **Must NOT do**:
  - Do not skip mobile testing
  - Do not assume desktop changes work on mobile
  - Do not ignore safe area issues

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: []
  - Reason: Mobile-specific responsive verification

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Tasks 10, 11)
  - **Blocks**: None
  - **Blocked By**: Tasks 4, 5, 7 (mobile-affecting changes)

  **References**:
  - Mobile viewport testing requirements
  - Safe area handling in existing code
  - Touch target requirements (44px)

  **Acceptance Criteria**:
  - [ ] Sidebar overlay works correctly
  - [ ] All touch targets 44px+
  - [ ] Message input handles keyboard
  - [ ] No horizontal scroll
  - [ ] Safe areas respected

  **QA Scenarios**:

  ```
  Scenario: Test mobile viewports
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Set mobile viewport (375px, 390px, 430px)
      2. Test sidebar open/close
      3. Test message input
      4. Verify touch targets
    Expected Result: All mobile interactions work
    Evidence: .sisyphus/evidence/task-12-mobile/*.png

  Scenario: Test landscape
    Tool: Playwright
    Preconditions: Dev server running
    Steps:
      1. Set landscape orientation
      2. Verify layout
    Expected Result: Landscape layout functional
    Evidence: .sisyphus/evidence/task-12-landscape.png
  ```

  **Commit**: N/A (verification task)

---

## Final Verification Wave

- [ ] F1. Visual Compliance Audit - `oracle`

  Read the plan end-to-end. For each "Must Have" requirement:
  - Verify all 13 feedback items are addressed
  - Check design system consistency
  - Verify warm-editorial + Claude aesthetic achieved
  - Confirm no AI slop patterns introduced
  - Check evidence files exist for all tasks
  - Compare deliverables against plan

  Output: `Must Have [13/13] | Visual Consistency [PASS/FAIL] | Design Aesthetic [PASS/FAIL] | Evidence [COMPLETE/INCOMPLETE] | VERDICT: APPROVE/REJECT`

- [ ] F2. Responsive Design Check - `unspecified-high`

  Verify responsive behavior:
  - Desktop (>1024px): All layouts correct
  - Tablet (768-1024px): Sidebar overlay works
  - Mobile (<768px): All interactions functional
  - Verify no layout breaks at any width

  Output: `Desktop [PASS/FAIL] | Tablet [PASS/FAIL] | Mobile [PASS/FAIL] | VERDICT`

- [ ] F3. Accessibility Preservation Check - `unspecified-high`

  Verify accessibility maintained:
  - All interactive elements keyboard navigable
  - Focus rings visible (2px accent color)
  - Touch targets 44px+
  - Screen reader labels present
  - Reduced motion support working

  Output: `Keyboard Nav [PASS/FAIL] | Focus Rings [PASS/FAIL] | Touch Targets [PASS/FAIL] | ARIA Labels [PASS/FAIL] | VERDICT`

- [ ] F3b. Dark Mode Verification - `unspecified-high`

  Verify dark mode compatibility:
  - All color tokens have proper dark variants
  - Sidebar color harmony works in dark mode
  - Button styles render correctly in dark
  - Screenshot key views in dark theme

  Output: `Tokens [PASS/FAIL] | Sidebar Harmony [PASS/FAIL] | Buttons [PASS/FAIL] | Screenshots [COMPLETE] | VERDICT`

- [ ] F4. Design System Completeness Check - `deep`

  Verify design system implementation:
  - All CSS tokens used consistently
  - All components follow design spec
  - No hardcoded values (all use CSS vars)
  - Color contrast meets WCAG AA
  - Typography hierarchy correct

  Output: `Token Usage [PASS/FAIL] | Component Compliance [PASS/FAIL] | No Hardcoded [PASS/FAIL] | Contrast [PASS/FAIL] | VERDICT`

---

## Commit Strategy

| Task | Commit Message | Files |
|------|---------------|-------|
| 1 | `style(tokens): Update design tokens for radius, hover, and sidebar colors` | `src/app.css` |
| 2 | `style(buttons): Redesign button suite with bare icon support` | `src/app.css` |
| 3 | `config(tailwind): Update tokens for new design system` | `tailwind.config.ts` |
| 4 | `style(sidebar): Redesign with narrower collapse, animation, and prominent title` | `Sidebar.svelte` |
| 5 | `style(header): Redesign navbar with consistent spacing and bare icon buttons` | `Header.svelte` |
| 6 | `style(conversation): Redesign dropdown menu and options button` | `ConversationItem.svelte` |
| 7 | `style(input): Redesign MessageInput with float shadow and vertical centering` | `MessageInput.svelte` |
| 8 | `style(layout): Add whitespace to chat pages for uncrowded feel` | `+page.svelte (chat)`, `+layout.svelte` |
| 9 | `style(prompt): Remove subtitle from new prompt screen` | `+page.svelte (root)` |
| 10 | `style(buttons): Audit and update all remaining buttons for consistency` | Various |

---

## Success Criteria

### Evidence Manifest
Create `.sisyphus/evidence/MANIFEST.md` listing all captured evidence:
```markdown
# Evidence Manifest

## Baseline (Pre-Change)
- [ ] login-page-baseline.png
- [ ] new-chat-baseline.png
- [ ] chat-messages-baseline.png
- [ ] sidebar-collapsed-baseline.png

## Task Evidence
- [ ] task-1-border-radius.png
- [ ] task-1-hover-timing.mp4
- [ ] task-2-bare-icon.png
...
```

### Verification Commands
```bash
# Build the application
npm run build
# or
bun run build

# Preview the build
npm run preview
# or
bun run preview
```

### Pre-Flight Baseline (Before Wave 1)
```bash
# Capture current state for comparison
npm run build && npm run preview
# Screenshot: login, new-chat, chat-with-messages, sidebar-collapsed
# Save to: .sisyphus/evidence/baseline/*.png
```

### Final Checklist
- [ ] All 13 user feedback items addressed
- [ ] Button design suite is consistent across all components
- [ ] Icon buttons (except send) display as bare icons
- [ ] All hover transitions are 150ms
- [ ] Collapsed sidebar is 32px wide with smooth animation
- [ ] Sidebar color is harmonious with main content
- [ ] Navbar has consistent spacing and symmetric padding
- [ ] MessageInput has float-like shadow with vertically centered elements
- [ ] New prompt screen has no subtitle
- [ ] Conversation dropdown matches design system
- [ ] AlfyAI title is prominent (18-20px, opacity 0.8)
- [ ] All elements have minimum 5px border radius
- [ ] Chat pages have proper whitespace from sidebar and edges
- [ ] Mobile responsive behavior maintained
- [ ] Accessibility preserved (keyboard, focus, touch targets)
- [ ] Build succeeds without errors

---

## Summary

**Total Tasks**: 12 implementation + 4 verification = 16 tasks
**Execution Waves**: 4 waves + Final verification
**Estimated Effort**: Medium - well-scoped UI polish work
**Key Risk Areas**:
- Sidebar width change may affect mobile calculations
- MessageInput vertical centering with auto-resize requires careful testing
- Border radius change touches many components

**Success Definition**: Warm-editorial + Claude-like aesthetic achieved with complete consistency across all UI components, addressing all 13 user feedback points while maintaining functionality and accessibility.
