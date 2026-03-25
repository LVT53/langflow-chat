<script lang="ts">
	import type { ArtifactSummary, ConversationContextStatus } from '$lib/types';

	export let contextStatus: ConversationContextStatus | null = null;
	export let attachedArtifacts: ArtifactSummary[] = [];

	let expanded = false;

	$: hasAttachments = attachedArtifacts.length > 0;
	$: attachmentLabel = `${attachedArtifacts.length} ${attachedArtifacts.length === 1 ? 'attachment' : 'attachments'}`;

	function formatLayer(layer: string): string {
		return layer.replace(/_/g, ' ');
	}
</script>

{#if contextStatus}
	<div class="sticky top-0 z-10 pb-3">
		<div class="overflow-hidden rounded-[1.2rem] border border-border bg-surface-elevated/90 shadow-sm backdrop-blur">
			<button
				type="button"
				class="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
				aria-expanded={expanded}
				aria-label="Conversation context"
				on:click={() => (expanded = !expanded)}
			>
				<div class="flex min-w-0 flex-wrap items-center gap-2">
					<span class="rounded-full border border-border bg-surface-page px-2.5 py-1 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">
						Context
					</span>
					<span class="text-sm font-sans text-text-primary">
						{contextStatus.estimatedTokens.toLocaleString()} / {contextStatus.maxContextTokens.toLocaleString()} tokens
					</span>
					{#if contextStatus.compactionApplied}
						<span class="rounded-full bg-accent/10 px-2.5 py-1 text-[0.72rem] font-sans text-accent">
							Optimized
						</span>
					{/if}
					{#if hasAttachments}
						<span class="rounded-full border border-border bg-surface-page px-2.5 py-1 text-[0.72rem] font-sans text-text-secondary">
							{attachmentLabel}
						</span>
					{/if}
				</div>

				<span
					class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-page text-icon-muted transition-transform duration-200"
					class:rotate-180={expanded}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</span>
			</button>

			{#if expanded}
				<div class="border-t border-border px-4 py-4">
					<div class="grid gap-4 md:grid-cols-[minmax(0,1.1fr),minmax(0,0.9fr)]">
						<section class="rounded-[1rem] border border-border bg-surface-page px-3 py-3">
							<div class="text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">
								Context
							</div>
							<div class="mt-3 grid gap-2 text-sm font-sans text-text-secondary">
								<div class="flex items-center justify-between gap-3">
									<span>Tokens</span>
									<span class="text-text-primary">
										{contextStatus.estimatedTokens.toLocaleString()} / {contextStatus.maxContextTokens.toLocaleString()}
									</span>
								</div>
								<div class="flex items-center justify-between gap-3">
									<span>Optimization</span>
									<span class={contextStatus.compactionApplied ? 'text-accent' : 'text-text-primary'}>
										{contextStatus.compactionApplied ? 'Applied' : 'Not needed'}
									</span>
								</div>
							</div>

							{#if contextStatus.layersUsed.length > 0}
								<div class="mt-3 flex flex-wrap gap-2">
									{#each contextStatus.layersUsed as layer}
										<span class="rounded-full border border-border px-2.5 py-1 text-xs font-sans text-text-secondary">
											{formatLayer(layer)}
										</span>
									{/each}
								</div>
							{/if}
						</section>

						{#if hasAttachments}
							<section class="rounded-[1rem] border border-border bg-surface-page px-3 py-3">
								<div class="flex items-center justify-between gap-3">
									<div class="text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">
										Working with
									</div>
									<div class="text-xs font-sans text-text-muted">{attachmentLabel}</div>
								</div>

								<div class="mt-3 flex flex-wrap gap-2">
									{#each attachedArtifacts as artifact (artifact.id)}
										<span class="inline-flex max-w-full items-center rounded-full border border-border bg-surface-elevated px-3 py-1.5 text-sm font-sans text-text-primary">
											<span class="truncate">{artifact.name}</span>
										</span>
									{/each}
								</div>
							</section>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}
