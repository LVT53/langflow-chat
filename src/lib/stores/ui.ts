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

const initialSidebarState = browser ? window.innerWidth >= 1024 : false;
export const sidebarOpen = writable<boolean>(initialSidebarState);

if (browser) {
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) {
      sidebarOpen.set(false);
    }
  });
}

// Tracks the currently active conversation
export const currentConversationId = writable<string | null>(null);

// Tracks whether the desktop sidebar is collapsed to icon-only mode
export const sidebarCollapsed = writable<boolean>(false);
