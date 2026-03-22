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
	<span class="hu-label">HU</span>
</button>

<style>
	.hu-label {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.03em;
	}
</style>
