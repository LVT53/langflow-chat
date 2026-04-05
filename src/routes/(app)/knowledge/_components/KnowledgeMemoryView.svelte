<script lang="ts">
	import type {
		KnowledgeMemoryOverviewSource,
		KnowledgeMemoryOverviewStatus,
	} from '$lib/types';

	let {
		memoryLoading,
		memoryLoaded,
		memoryLoadError,
		personaMemoryCount,
		focusContinuityItemCount,
		honchoEnabled,
		honchoOverview,
		honchoOverviewSource,
		honchoOverviewStatus,
		honchoOverviewHtml,
		honchoOverviewUpdatedAt,
		honchoOverviewLastAttemptAt,
		durablePersonaCount,
		activeConstraintCount,
		currentProjectContextCount,
		liveOverviewRefreshing,
		onRetryLoadMemory,
		onRetryLiveOverview,
		onOpenMemoryModal,
	}: {
		memoryLoading: boolean;
		memoryLoaded: boolean;
		memoryLoadError: string;
		personaMemoryCount: number;
		focusContinuityItemCount: number;
		honchoEnabled: boolean;
		honchoOverview: string;
		honchoOverviewSource: KnowledgeMemoryOverviewSource;
		honchoOverviewStatus: KnowledgeMemoryOverviewStatus;
		honchoOverviewHtml: string;
		honchoOverviewUpdatedAt: number | null;
		honchoOverviewLastAttemptAt: number | null;
		durablePersonaCount: number;
		activeConstraintCount: number;
		currentProjectContextCount: number;
		liveOverviewRefreshing: boolean;
		onRetryLoadMemory: () => void | Promise<void>;
		onRetryLiveOverview: () => void | Promise<void>;
		onOpenMemoryModal: (kind: 'persona' | 'focus') => void;
	} = $props();
</script>

{#if memoryLoading && !memoryLoaded}
	<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
		<div class="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
			<div class="rounded-[1.3rem] border border-border bg-surface-page px-5 py-5">
				<div class="h-3 w-28 animate-pulse rounded-full bg-surface-page"></div>
				<div class="mt-5 h-8 w-52 animate-pulse rounded-full bg-surface-page"></div>
				<div class="mt-5 space-y-3">
					<div class="h-3 w-full animate-pulse rounded-full bg-surface-page"></div>
					<div class="h-3 w-11/12 animate-pulse rounded-full bg-surface-page"></div>
					<div class="h-3 w-9/12 animate-pulse rounded-full bg-surface-page"></div>
				</div>
			</div>
			<div class="space-y-4">
				<div class="grid grid-cols-2 gap-3">
					<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
						<div class="h-3 w-20 animate-pulse rounded-full bg-surface-page"></div>
						<div class="mt-3 h-7 w-12 animate-pulse rounded-full bg-surface-page"></div>
					</div>
					<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
						<div class="h-3 w-20 animate-pulse rounded-full bg-surface-page"></div>
						<div class="mt-3 h-7 w-12 animate-pulse rounded-full bg-surface-page"></div>
					</div>
				</div>
				<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
					<div class="h-3 w-28 animate-pulse rounded-full bg-surface-page"></div>
					<div class="mt-4 space-y-3">
						<div class="h-3 w-full animate-pulse rounded-full bg-surface-page"></div>
						<div class="h-3 w-10/12 animate-pulse rounded-full bg-surface-page"></div>
					</div>
				</div>
			</div>
		</div>

		<div class="mt-6 rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm font-sans text-text-muted">
			Loading memory profile…
		</div>
	</section>
{:else if memoryLoadError && !memoryLoaded}
	<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
		<div class="rounded-[1.2rem] border border-danger bg-surface-page px-4 py-5">
				<div class="text-sm font-sans font-medium text-danger">Memory Profile failed to load.</div>
				<p class="mt-2 text-sm font-sans leading-[1.6] text-text-secondary">{memoryLoadError}</p>
				<button
					type="button"
					class="mt-4 cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-page"
					onclick={onRetryLoadMemory}
				>
					Try again
				</button>
		</div>
	</section>
{:else}
	<section class="memory-section rounded-[1.5rem] border border-border bg-surface-elevated px-5 py-5 shadow-sm md:px-6">
		<div class="mb-4">
			<h2 class="text-2xl font-serif tracking-[-0.02em] text-text-primary">Memory Profile</h2>
			<p class="text-sm text-text-secondary mt-1">View and manage your stored memories, persona data, and focus continuity</p>
		</div>
		<div class="grid gap-4 lg:grid-cols-2">
			<div class="flex flex-col rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h3 class="text-lg font-sans font-semibold text-text-primary">
							Manage durable profile memories
						</h3>
					</div>
				<span class="rounded-full border border-border bg-surface-elevated px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
					{personaMemoryCount}
				</span>
				</div>
				<div class="mt-4 flex flex-wrap gap-2">
					{#if activeConstraintCount > 0}
						<span class="rounded-full border border-border bg-surface-elevated px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.08em] text-text-muted">
							{activeConstraintCount} active constraint{activeConstraintCount === 1 ? '' : 's'}
						</span>
					{/if}
					{#if currentProjectContextCount > 0}
						<span class="rounded-full border border-border bg-surface-elevated px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.08em] text-text-muted">
							{currentProjectContextCount} current project context item{currentProjectContextCount === 1 ? '' : 's'}
						</span>
					{/if}
				</div>

				<p class="mt-4 text-sm font-sans leading-[1.6] text-text-secondary">
					Review and forget stored persona memories in a compact table instead of scanning long card stacks.
				</p>

				<div class="mt-auto flex flex-wrap items-center gap-3 pt-4">
					<button
						type="button"
						class="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
						onclick={() => onOpenMemoryModal('persona')}
						disabled={!honchoEnabled}
					>
						Manage persona memory
					</button>
					{#if !honchoEnabled}
						<span class="text-xs font-sans text-text-muted">
							Unavailable while Honcho is disabled.
						</span>
					{:else if memoryLoaded && personaMemoryCount === 0}
						<span class="text-xs font-sans text-text-muted">
							No stored persona memory yet.
						</span>
					{/if}
				</div>
			</div>

			<div class="flex flex-col rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
				<div class="flex items-center justify-between gap-3">
					<div>
						<h3 class="text-lg font-sans font-semibold text-text-primary">
							Manage focus continuity
						</h3>
					</div>
				<span class="rounded-full border border-border bg-surface-elevated px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
					{focusContinuityItemCount}
				</span>
				</div>

				<p class="mt-4 text-sm font-sans leading-[1.6] text-text-secondary">
					Focus continuity combines per-chat task checkpoints with across-chat continuity groups in one background system.
				</p>

				<div class="mt-auto flex flex-wrap items-center gap-3 pt-4">
					<button
						type="button"
						class="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
						onclick={() => onOpenMemoryModal('focus')}
					>
						Manage focus continuity
					</button>
					{#if memoryLoaded && focusContinuityItemCount === 0}
						<span class="text-xs font-sans text-text-muted">
							No focus continuity has been captured yet.
						</span>
					{/if}
				</div>
			</div>
		</div>

		<div class="mt-6 rounded-[1.3rem] border border-border bg-surface-page px-5 py-5">
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h2 class="text-[1.75rem] font-serif tracking-[-0.04em] text-text-primary">
						Memory Overview
					</h2>
					{#if honchoOverviewUpdatedAt}
						<p class="mt-1 text-xs font-sans uppercase tracking-[0.08em] text-text-muted">
							Last live overview {new Date(honchoOverviewUpdatedAt).toLocaleString()}
						</p>
					{:else if honchoOverviewLastAttemptAt}
						<p class="mt-1 text-xs font-sans uppercase tracking-[0.08em] text-text-muted">
							Last live attempt {new Date(honchoOverviewLastAttemptAt).toLocaleString()}
						</p>
					{/if}
				</div>
				{#if honchoEnabled && memoryLoaded}
					<button
						type="button"
						class="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated disabled:opacity-50"
						onclick={onRetryLiveOverview}
						disabled={liveOverviewRefreshing}
					>
						{liveOverviewRefreshing ? 'Refreshing…' : 'Retry live overview'}
					</button>
				{/if}
			</div>
			{#if honchoOverview}
				{#if honchoOverviewSource === 'honcho_cache'}
					<p class="mt-4 text-xs font-sans uppercase tracking-[0.08em] text-text-muted">
						Showing the last successful Honcho overview while a refresh is in progress.
					</p>
				{:else if honchoOverviewSource === 'persona_fallback'}
					<p class="mt-4 text-xs font-sans uppercase tracking-[0.08em] text-text-muted">
						Showing a local durable-memory fallback while the live Honcho overview is unavailable.
					</p>
				{/if}
				<div class="memory-markdown prose mt-4 max-w-none text-base leading-[1.65] text-text-secondary dark:prose-invert">
					{@html honchoOverviewHtml}
				</div>
			{:else if honchoOverviewStatus === 'temporarily_unavailable'}
				<p class="mt-4 text-sm font-sans leading-[1.6] text-text-muted">
					Durable persona memory exists, but the live Honcho overview is temporarily unavailable right now. The stored profile still contains {durablePersonaCount} durable signal{durablePersonaCount === 1 ? '' : 's'}.
				</p>
			{:else if honchoEnabled}
				<p class="mt-4 text-sm font-sans leading-[1.6] text-text-muted">
					Memory Profile is enabled, but there is not enough durable persona memory yet to render a useful overview.
				</p>
			{:else}
				<p class="mt-4 text-sm font-sans leading-[1.6] text-text-muted">
					Memory Profile is disabled in this deployment, so the live persona memory overview is not available.
				</p>
			{/if}
		</div>
	</section>
{/if}
