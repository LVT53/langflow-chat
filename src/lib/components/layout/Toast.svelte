<script lang="ts">
	import { toast } from '$lib/stores/toast';
	import { derived } from 'svelte/store';

	// Derive visibility and message for reactive updates
	const toastState = derived(toast, ($toast) => ({
		message: $toast.message,
		visible: $toast.visible
	}));
</script>

{#if $toast.visible}
	<div
		class="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-[var(--text-primary)] text-[var(--bg-primary)] px-6 py-3 rounded-lg shadow-[var(--shadow-lg)] opacity-0 transition-opacity duration-[var(--duration-emphasis)] ease-out z-50"
		class:opacity-100=$toast.visible
		role="alert"
		aria-live="polite"
	>
		{$toast.message}
	</div>
{/if}