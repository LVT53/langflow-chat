<script lang="ts">
	interface Props {
		contextStatus: {
			estimatedTokens: number;
			maxContextTokens: number;
			compactionApplied: boolean;
			layersUsed: string[];
		};
	}

	let { contextStatus }: Props = $props();
</script>

<div class="rounded-[1.2rem] border border-border bg-surface-elevated/80 px-4 py-3">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<span class="text-sm font-sans text-text-muted">
			{contextStatus.estimatedTokens.toLocaleString()} / {contextStatus.maxContextTokens.toLocaleString()} tokens
		</span>
		{#if contextStatus.compactionApplied}
			<span class="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-sans text-accent">Optimized</span>
		{/if}
	</div>
	{#if contextStatus.layersUsed.length > 0}
		<div class="mt-2 flex flex-wrap gap-2">
			{#each contextStatus.layersUsed as layer}
				<span class="rounded-full border border-border px-2 py-1 text-xs font-sans text-text-secondary">{layer}</span>
			{/each}
		</div>
	{/if}
</div>
