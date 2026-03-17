import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * BREAKPOINT CONTRACT - Single Source of Truth
 * =============================================
 * 
 * Breakpoints are Tailwind CSS defaults (mobile-first):
 * - sm: 640px
 * - md: 768px  (tablet)
 * - lg: 1024px (desktop)
 * - xl: 1280px
 * 
 * SIDEBAR BEHAVIOR:
 * - Layout styling uses CSS media queries exclusively (no JS layout decisions)
 * - JS (this store) is used ONLY for temporary overlay open/close state
 * - At lg (1024px) and above: sidebar is always visible (CSS: position: static)
 * - Below lg: sidebar is an overlay that can be opened/closed via JS
 * 
 * USAGE GUIDELINES:
 * - Use CSS media queries for all layout decisions
 * - Use JS window.innerWidth ONLY for temporary UI states (overlays, modals)
 * - Always reference Tailwind breakpoint values for consistency
 */

export const SIDEBAR_DESKTOP_BREAKPOINT = 1024;

const initialSidebarState = browser ? window.innerWidth >= SIDEBAR_DESKTOP_BREAKPOINT : false;
export const sidebarOpen = writable<boolean>(initialSidebarState);

if (browser) {
  let wasDesktop = window.innerWidth >= SIDEBAR_DESKTOP_BREAKPOINT;

  window.addEventListener('resize', () => {
    const isDesktop = window.innerWidth >= SIDEBAR_DESKTOP_BREAKPOINT;

    if (isDesktop) {
      sidebarOpen.set(true);
    } else if (wasDesktop) {
      sidebarOpen.set(false);
    }

    wasDesktop = isDesktop;
  });
}

// Tracks the currently active conversation
export const currentConversationId = writable<string | null>(null);

// Tracks whether the desktop sidebar is collapsed to icon-only mode
export const sidebarCollapsed = writable<boolean>(false);
