<script lang="ts">
	import { theme, setTheme, type Theme } from '$lib/stores/theme';

	const themes: Theme[] = ['system', 'light', 'dark'];
	
	function toggleTheme() {
		const currentIndex = themes.indexOf($theme);
		const nextIndex = (currentIndex + 1) % themes.length;
		setTheme(themes[nextIndex]);
	}

	$: tooltipText = $theme === 'system' ? 'System Theme' : $theme === 'light' ? 'Light Theme' : 'Dark Theme';
</script>

<button
	data-testid="theme-toggle"
	class="relative inline-flex shrink-0 min-h-[44px] min-w-[44px] h-[44px] w-[44px] items-center justify-center rounded-md text-icon-muted hover:bg-surface-elevated hover:text-icon-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring transition-colors"
	on:click={toggleTheme}
	title={tooltipText}
	aria-label="Toggle theme"
>
	<div class="relative flex h-[20px] w-[20px] items-center justify-center overflow-hidden">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="absolute h-full w-full transition-all duration-300 {$theme === 'light' ? 'rotate-0 opacity-100 scale-100' : '-rotate-90 opacity-0 scale-50'}"
		>
			<circle cx="12" cy="12" r="5" />
			<line x1="12" y1="1" x2="12" y2="3" />
			<line x1="12" y1="21" x2="12" y2="23" />
			<line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
			<line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
			<line x1="1" y1="12" x2="3" y2="12" />
			<line x1="21" y1="12" x2="23" y2="12" />
			<line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
			<line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
		</svg>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="absolute h-full w-full transition-all duration-300 {$theme === 'dark' ? 'rotate-0 opacity-100 scale-100' : 'rotate-90 opacity-0 scale-50'}"
		>
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		</svg>
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="absolute h-full w-full transition-all duration-300 {$theme === 'system' ? 'rotate-0 opacity-100 scale-100' : 'rotate-90 opacity-0 scale-50'}"
		>
			<rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
			<line x1="8" y1="21" x2="16" y2="21" />
			<line x1="12" y1="17" x2="12" y2="21" />
		</svg>
	</div>
</button>
