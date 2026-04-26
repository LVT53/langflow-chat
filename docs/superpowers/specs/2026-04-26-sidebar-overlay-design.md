# Sidebar Overlay Mode — Design Spec

**Date:** 2026-04-26
**Approach:** Fixed sidebar with constant content padding (Approach A)
**Scope:** Layout CSS only — no component logic changes

## Problem

On desktop (≥1024px), the sidebar currently uses `position: static` inside a flex row, meaning its width (48px collapsed / 300px expanded) physically pushes the `<main>` content area. This causes:

1. Chat content shifts horizontally when the sidebar expands/collapses
2. Centered chat content (composer, message list) is no longer truly centered relative to the viewport — it’s centered within the remaining flex space

## Goal

- Sidebar must float over content without displacing it
- Chat content remains centered in the viewport regardless of sidebar state
- All existing behaviors preserved: collapsed strip, expand animation, mobile overlay

## Design

### Desktop (≥1024px)

The sidebar already renders as `position: fixed` by default. The desktop media query currently overrides this to `position: static !important`:

```css
@media (min-width: 1024px) {
  .sidebar-panel {
    position: static !important;   /* ← REMOVE THIS */
    transform: translateX(0) !important;
    opacity: 1 !important;
    width: 300px;
  }
  .sidebar-panel.sidebar-collapsed {
    width: 48px;
  }
}
```

**Change:** Remove the `position: static !important` override. The sidebar stays `position: fixed` at all breakpoints.

**New rule for `<main>`:** Add `padding-left: 48px` to reserve space for the always-present collapsed strip. The `48px` matches the collapsed sidebar width exactly.

```css
main {
  padding-left: 48px;
}
```

When the user expands the sidebar to 300px, it simply widens over the content — the main area does not shift.

### Mobile (<1024px)

No changes. The sidebar is already `position: fixed` with a translate animation and overlay backdrop. Removing the `position: static !important` rule has no effect on mobile because that rule is inside `@media (min-width: 1024px)`.

### Content Centering

With `padding-left: 48px` on `<main>`, the available content width is `viewport - 48px`. The chat content max-width (`780px`) remains the same, so it is centered within this stable area — no horizontal shift on expand/collapse.

## Files to Touch

1. `src/lib/components/layout/Sidebar.svelte` — remove `position: static !important` from desktop media query
2. `src/routes/(app)/+layout.svelte` — add `padding-left: 48px` (or `pl-12`) to the `<main>` element

## Anti-Patterns Avoided

- No JavaScript state tracking of sidebar width
- No dynamic CSS variable updates
- No width measurement or resize listeners
- No grid/flex restructuring of the layout container
- Mobile behavior is completely untouched

## Testing

- Desktop: expand/collapse sidebar — content does not shift horizontally
- Desktop: verify collapsed strip (48px) is visible and clickable
- Mobile: verify sidebar still slides in with overlay backdrop
- Verify chat composer and message list remain centered in viewport
