<script lang="ts">
	export let label: string = 'Thinking...';
</script>

<div class="flex flex-col items-start gap-sm p-md">
	<div class="flex items-center gap-xs h-[24px]">
		<div class="h-2 w-2 rounded-full bg-accent dot-pulse" style="animation-delay: 0ms"></div>
		<div class="h-2 w-2 rounded-full bg-accent dot-pulse" style="animation-delay: 100ms"></div>
		<div class="h-2 w-2 rounded-full bg-accent dot-pulse" style="animation-delay: 200ms"></div>
	</div>
	{#if label}
		<div class="text-[14px] font-sans text-text-muted">{label}</div>
	{/if}
</div>

<style>
	.dot-pulse {
		animation: pulse 600ms infinite;
		opacity: 0.4;
	}
	
	@keyframes pulse {
		0%, 100% {
			opacity: 0.4;
			transform: scale(0.8);
		}
		50% {
			opacity: 1;
			transform: scale(1);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.dot-pulse {
			animation: none;
			opacity: 1;
		}
	}
</style>
