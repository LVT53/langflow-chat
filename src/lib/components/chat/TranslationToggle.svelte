<script lang="ts">
	import { translationState, toggleTranslationState } from '$lib/stores/settings';

	$: tooltipText = $translationState === 'enabled' ? 'Translation enabled' : 'Translation disabled';
	$: iconColorClass = $translationState === 'enabled' ? 'text-accent' : 'text-text-muted';
</script>

<button
	type="button"
	data-testid="translation-toggle"
	class="btn-icon-bare flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center transition-colors duration-150 {iconColorClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
	on:click={toggleTranslationState}
	title={tooltipText}
	aria-label={tooltipText}
>
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<circle cx="12" cy="12" r="10" />
		<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
		<path d="M2 12h20" />
	</svg>
</button>
