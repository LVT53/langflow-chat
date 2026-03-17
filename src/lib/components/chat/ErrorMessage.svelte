<script lang="ts">
	export let error: string;
	export let onRetry: () => void;
</script>

<div class="px-4 py-2 bg-surface-elevated border-t border-border flex items-center space-x-3">
	<div class="flex-shrink-0">
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-icon-primary" viewBox="0 0 20 20" fill="currentColor" role="img" aria-label="Error">
			<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clip-rule="evenodd" />
		</svg>
	</div>
	<div>
		<p class="text-sm text-text-primary">{error}</p>
	</div>
	<div class="ml-auto">
		<button on:click={onRetry} class="min-h-[44px] px-md py-sm bg-accent text-surface-page rounded hover:bg-accent-hover transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring">
			Retry
		</button>
	</div>
</div>