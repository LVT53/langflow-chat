import { writable, get, derived } from 'svelte/store';
import { updateUserPreferences } from '$lib/client/api/settings';

export type Theme = 'light' | 'dark' | 'system';

export const theme = writable<Theme>('system');

export const isDark = derived(theme, ($theme) => {
	if (typeof window === 'undefined') return false;
	if ($theme === 'dark') return true;
	if ($theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches;
	return false;
});

function applyTheme(t: Theme) {
	if (typeof window === 'undefined') return;

	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
	const shouldBeDark = t === 'dark' || (t === 'system' && prefersDark);

	if (shouldBeDark) {
		document.documentElement.classList.add('dark');
	} else {
		document.documentElement.classList.remove('dark');
	}
}

export function initTheme(serverTheme?: Theme) {
	if (typeof window === 'undefined') return;

	const stored = localStorage.getItem('theme') as Theme | null;
	// Server-provided preference takes priority over localStorage
	const initialTheme: Theme =
		serverTheme ?? (stored && ['light', 'dark', 'system'].includes(stored) ? stored : 'system');

	theme.set(initialTheme);
	applyTheme(initialTheme);
	localStorage.setItem('theme', initialTheme);

	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		if (get(theme) === 'system') {
			applyTheme('system');
		}
	});
}

export function setTheme(t: Theme) {
	theme.set(t);
	localStorage.setItem('theme', t);
	applyTheme(t);
}

export async function setThemeAndSync(t: Theme): Promise<void> {
	setTheme(t);
	try {
		await updateUserPreferences({ theme: t });
	} catch {
		// Non-fatal: local theme already applied
	}
}
