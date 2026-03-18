# Learnings — ui-ux-overhaul

## [2026-03-17] Session: ses_3045dfbdaffe3yhMD0cDaxDrnK

### Framework
- SvelteKit (Svelte 5 compatible) with Tailwind CSS
- Bun as package manager/runner
- Vitest for unit tests, Playwright for e2e

### Color System
- CSS variables in `src/app.css` — semantic token layer already exists
- Tailwind config maps CSS vars to utility classes (e.g., `bg-accent`, `text-text-primary`)
- Current accent: `#C15F3C` (light) / `#D4836B` (dark) — terracotta
- Target accent: `#D97706` (light) / `#F59E0B` (dark) — warm amber/gold
- Hover: `#B45309` (light) / `#FBBF24` (dark)

### Key File Locations
- CSS variables: `src/app.css` (lines 33-163)
- Tailwind config: `tailwind.config.ts`
- Header: `src/lib/components/layout/Header.svelte`
- Sidebar: `src/lib/components/layout/Sidebar.svelte`
- Login: `src/routes/login/+page.svelte`
- Landing page: `src/routes/(app)/+page.svelte`
- Message input: `src/lib/components/chat/MessageInput.svelte`
- Conversation item (dropdown): `src/lib/components/sidebar/ConversationItem.svelte`
- App layout: `src/routes/(app)/+layout.svelte`

### Spacing Tokens
- `--space-xs: 4px`, `--space-sm: 8px`, `--space-md: 16px`
- `--space-lg: 24px`, `--space-xl: 32px`, `--space-2xl: 48px`
- Tailwind: `p-xs`, `p-sm`, `p-md`, `p-lg`, `p-xl`, `p-2xl`

### Motion Tokens
- `--duration-micro: 150ms`, `--duration-standard: 250ms`, `--duration-emphasis: 300ms`
- Tailwind: `duration-micro`, `duration-250`, `duration-emphasis`

### Sidebar State
- `sidebarOpen` store in `src/lib/stores/ui.ts`
- Desktop: always visible (CSS `position: static`)
- Mobile: slide-in overlay with `translate-x` animation
- Currently NO desktop collapsible — needs to be added

### Known Issues
- Dropdown `right-0` causes right-side clipping in sidebar
- File attachment button uses `text-icon-muted` — invisible in dark mode
- Textarea `py-2.5` causes off-center placeholder
- Header title "AlfyAI" is centered — needs to move to sidebar
- Landing page has "Select a conversation..." — needs full redesign
- Many buttons missing `cursor-pointer`
