<script lang="ts">
	interface Artifact {
		id: string;
		name: string;
		type: 'document' | 'result' | string;
	}

	interface Props {
		artifacts: Artifact[];
		maxVisible?: number;
	}

	let { artifacts, maxVisible = 3 }: Props = $props();

	// Calculate visible artifacts and overflow
	let visibleArtifacts = $derived(artifacts.slice(0, maxVisible));
	let overflowCount = $derived(Math.max(0, artifacts.length - maxVisible));

	// Map artifact type to display label
	function getTypeLabel(type: string): string {
		return type === 'generated_output' ? 'Result' : 'Doc';
	}
</script>

<div
	class="rounded-[1rem] border border-border bg-surface-elevated/70 px-4 py-3 text-xs font-sans text-text-secondary shadow-sm"
>
	<div class="flex flex-wrap items-center gap-2">
		<span class="text-[0.7rem] uppercase tracking-[0.1em] text-text-muted">Working with</span>
		{#each visibleArtifacts as artifact (artifact.id)}
			<div
				class="flex items-center gap-2 rounded-full border border-border bg-surface-page px-3 py-1"
			>
				<span class="text-[10px] uppercase tracking-[0.08em] text-text-muted">
					{getTypeLabel(artifact.type)}
				</span>
				<span class="max-w-[180px] truncate text-sm font-sans text-text-primary">
					{artifact.name}
				</span>
			</div>
		{/each}
		{#if overflowCount > 0}
			<div
				class="rounded-full bg-surface-page px-2 py-1 text-xs font-sans text-text-muted"
			>
				+{overflowCount}
			</div>
		{/if}
	</div>
</div>
