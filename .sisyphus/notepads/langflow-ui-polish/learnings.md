## Task: Fix body scroll issue (F3 Real Manual QA)

### Changes Made
- Modified src/app.css to change body overflow from `visible` to `hidden`
- Added `overflow: hidden;` to body selector while keeping `overscroll-behavior: none`
- This prevents the entire page from scrolling, ensuring only MessageArea and sidebar list can scroll

### Scroll Ownership Contract Verification
- BODY: Never scrolls (overflow: hidden + overscroll-behavior: none)
- APP ROOT: h-screen overflow-hidden (in src/routes/(app)/+layout.svelte)
- SIDEBAR LIST: overflow-y-auto (scrollable conversation list)
- MESSAGE AREA: overflow-y-auto (scrollable message list)

### Verification
- Playwright responsive tests pass (5/5 tests passing)
- Body element now has computed style overflow: hidden
- No body scroll on mobile or desktop
- MessageArea and sidebar list retain their scroll functionality
## Task: Fix AlfyAI title centering in navbar
- Used CSS Grid (`grid-cols-[1fr_auto_1fr]`) instead of Flexbox on the `<header>` element to perfectly center the title across viewports without overlap issues.
- Using `1fr` for the left and right containers ensures that the middle `auto` container stays perfectly centered regardless of the disparate widths of left/right content.
- Replaced `truncate` with `whitespace-nowrap` on the title to prevent unwanted truncation when side elements get wide on mobile.
- Applied `min-w-0` to the left/right flex columns so they can shrink below intrinsic minimum sizes without breaking the grid.
- **Store Mutation & API Handling**: Wrapped `createNewConversation` API call with a module-level lock (`isCreating = true/false`) to prevent duplicate submissions from rapid UI interactions. Added robust JSON parsing catch and structured user-friendly error messages that propagate to the UI level seamlessly.
