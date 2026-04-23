import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { read, persist } from './_local-storage';

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

const isValidBool = (v: string): v is 'true' | 'false' => v === 'true' || v === 'false';

const initialSidebarOpenValue = browser
	? read('sidebarOpen', window.innerWidth >= SIDEBAR_DESKTOP_BREAKPOINT ? 'true' : 'false', isValidBool)
	: 'false';
export const sidebarOpen = writable<boolean>(initialSidebarOpenValue === 'true');

/**
 * Register the window resize listener for sidebar auto-open/close.
 * Call this once from the app layout bootstrap (onMount).
 * Returns a cleanup function for teardown if needed.
 */
export function initUIListeners(): () => void {
	if (!browser) {
		return () => {};
	}

	let wasDesktop = window.innerWidth >= SIDEBAR_DESKTOP_BREAKPOINT;

	const handler = () => {
		const isDesktop = window.innerWidth >= SIDEBAR_DESKTOP_BREAKPOINT;

		if (isDesktop) {
			sidebarOpen.set(true);
		} else if (wasDesktop) {
			sidebarOpen.set(false);
		}

		wasDesktop = isDesktop;
	};

	window.addEventListener('resize', handler);
	return () => window.removeEventListener('resize', handler);
}

// Tracks the currently active conversation
export const currentConversationId = writable<string | null>(null);

// Tracks whether the desktop sidebar is collapsed to icon-only mode
const initialSidebarCollapsedValue = browser
	? read('sidebarCollapsed', 'true', isValidBool)
	: 'true';
export const sidebarCollapsed = writable<boolean>(initialSidebarCollapsedValue === 'true');

sidebarOpen.subscribe((value) => persist('sidebarOpen', value ? 'true' : 'false'));
sidebarCollapsed.subscribe((value) => persist('sidebarCollapsed', value ? 'true' : 'false'));
