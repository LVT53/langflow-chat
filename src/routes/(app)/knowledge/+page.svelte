<script lang="ts">
	import type { ArtifactSummary, WorkCapsule } from '$lib/types';
	import type { PageData } from './$types';

	export let data: PageData;

	type KnowledgeTab = 'library' | 'memory';

	const documents = (data.documents ?? []) as ArtifactSummary[];
	const results = (data.results ?? []) as ArtifactSummary[];
	const workflows = (data.workflows ?? []) as WorkCapsule[];
	const honchoEnabled = data.honchoEnabled ?? false;
	const honchoOverview = data.honchoOverview?.trim() ?? '';

	let activeTab: KnowledgeTab = 'library';

	const honchoHighlights = honchoOverview
		? honchoOverview
				.split(/\n+/)
				.flatMap((paragraph) =>
					paragraph
						.split(/(?<=[.!?])\s+/)
						.map((part) => part.trim())
						.filter(Boolean)
				)
				.slice(0, 4)
		: [];
</script>

<svelte:head>
	<title>Knowledge Base</title>
</svelte:head>

<div class="flex h-full min-h-0 flex-col overflow-y-auto bg-surface-page px-4 py-6 md:px-8">
	<div class="mx-auto flex w-full max-w-[920px] flex-col gap-8">
		<div class="rounded-[1.5rem] border border-border bg-surface-elevated px-5 py-5 shadow-sm md:px-6">
			<div class="flex flex-col gap-5">
				<div class="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
					<div class="space-y-2">
						<h1 class="text-[2rem] font-serif tracking-[-0.05em] text-text-primary md:text-[2.75rem]">
							Knowledge Base
						</h1>
						<p class="max-w-[720px] text-sm font-sans leading-[1.5] text-text-secondary">
							Persistent documents, saved results, workflow capsules, and a live Honcho memory view of what the system currently knows about you.
						</p>
					</div>
					<div class="grid grid-cols-3 gap-2 text-left md:min-w-[320px]">
						<div class="rounded-[1.1rem] border border-border bg-surface-page px-3 py-3">
							<div class="text-[0.65rem] font-sans uppercase tracking-[0.12em] text-text-muted">Docs</div>
							<div class="mt-2 text-xl font-serif text-text-primary">{documents.length}</div>
						</div>
						<div class="rounded-[1.1rem] border border-border bg-surface-page px-3 py-3">
							<div class="text-[0.65rem] font-sans uppercase tracking-[0.12em] text-text-muted">Results</div>
							<div class="mt-2 text-xl font-serif text-text-primary">{results.length}</div>
						</div>
						<div class="rounded-[1.1rem] border border-border bg-surface-page px-3 py-3">
							<div class="text-[0.65rem] font-sans uppercase tracking-[0.12em] text-text-muted">Workflows</div>
							<div class="mt-2 text-xl font-serif text-text-primary">{workflows.length}</div>
						</div>
					</div>
				</div>

				<div class="inline-flex w-full max-w-[360px] rounded-full border border-border bg-surface-page p-1">
					<button
						type="button"
						class={`flex-1 rounded-full px-4 py-2 text-sm font-sans transition ${
							activeTab === 'library'
								? 'bg-surface-elevated text-text-primary shadow-sm'
								: 'text-text-secondary hover:text-text-primary'
						}`}
						on:click={() => (activeTab = 'library')}
						aria-pressed={activeTab === 'library'}
					>
						Library
					</button>
					<button
						type="button"
						class={`flex-1 rounded-full px-4 py-2 text-sm font-sans transition ${
							activeTab === 'memory'
								? 'bg-surface-elevated text-text-primary shadow-sm'
								: 'text-text-secondary hover:text-text-primary'
						}`}
						on:click={() => (activeTab = 'memory')}
						aria-pressed={activeTab === 'memory'}
					>
						Honcho Memory
					</button>
				</div>
			</div>
		</div>

		{#if activeTab === 'library'}
			<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
				<div class="flex items-center justify-between">
					<h2 class="text-lg font-sans font-semibold text-text-primary">Documents</h2>
					<span class="text-xs font-sans uppercase tracking-[0.08em] text-text-muted">{documents.length}</span>
				</div>
				<div class="mt-4 grid gap-3 md:grid-cols-2">
					{#if documents.length === 0}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm text-text-muted">
							No documents yet.
						</div>
					{:else}
						{#each documents as artifact (artifact.id)}
							<div class="rounded-[1.2rem] border border-border bg-surface-page px-4 py-4">
								<div class="flex items-start justify-between gap-3">
									<div>
										<div class="text-sm font-sans font-medium text-text-primary">{artifact.name}</div>
										<div class="mt-1 text-xs font-sans uppercase tracking-[0.08em] text-text-muted">{artifact.type}</div>
									</div>
									{#if artifact.sizeBytes}
										<div class="text-xs font-sans text-text-muted">{Math.ceil(artifact.sizeBytes / 1024)} KB</div>
									{/if}
								</div>
								{#if artifact.summary}
									<p class="mt-3 text-sm font-serif leading-[1.45] text-text-secondary">{artifact.summary}</p>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			</section>

			<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
				<div class="flex items-center justify-between">
					<h2 class="text-lg font-sans font-semibold text-text-primary">Results</h2>
					<span class="text-xs font-sans uppercase tracking-[0.08em] text-text-muted">{results.length}</span>
				</div>
				<div class="mt-4 grid gap-3 md:grid-cols-2">
					{#if results.length === 0}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm text-text-muted">
							No saved results yet.
						</div>
					{:else}
						{#each results as artifact (artifact.id)}
							<div class="rounded-[1.2rem] border border-border bg-surface-page px-4 py-4">
								<div class="text-sm font-sans font-medium text-text-primary">{artifact.name}</div>
								{#if artifact.summary}
									<p class="mt-3 text-sm font-serif leading-[1.45] text-text-secondary">{artifact.summary}</p>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			</section>

			<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
				<div class="flex items-center justify-between">
					<h2 class="text-lg font-sans font-semibold text-text-primary">Workflows</h2>
					<span class="text-xs font-sans uppercase tracking-[0.08em] text-text-muted">{workflows.length}</span>
				</div>
				<div class="mt-4 space-y-3">
					{#if workflows.length === 0}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm text-text-muted">
							No workflow capsules yet.
						</div>
					{:else}
						{#each workflows as capsule (capsule.artifact.id)}
							<div class="rounded-[1.2rem] border border-border bg-surface-page px-4 py-4">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<div>
										<div class="text-sm font-sans font-medium text-text-primary">{capsule.artifact.name}</div>
										{#if capsule.taskSummary}
											<p class="mt-2 text-sm font-serif leading-[1.45] text-text-secondary">{capsule.taskSummary}</p>
										{/if}
									</div>
									<div class="text-xs font-sans uppercase tracking-[0.08em] text-text-muted">
										{capsule.sourceArtifactIds.length} docs / {capsule.outputArtifactIds.length} outputs
									</div>
								</div>
								{#if capsule.workflowSummary}
									<p class="mt-3 text-sm font-serif leading-[1.45] text-text-secondary">{capsule.workflowSummary}</p>
								{/if}
								{#if capsule.reusablePatterns.length > 0}
									<div class="mt-3 flex flex-wrap gap-2">
										{#each capsule.reusablePatterns as pattern}
											<span class="rounded-full border border-border px-3 py-1 text-xs font-sans text-text-secondary">
												{pattern}
											</span>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			</section>
		{:else}
			<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
				<div class="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
					<div class="rounded-[1.3rem] border border-border bg-surface-page px-5 py-5">
						<div class="flex flex-wrap items-center gap-2">
							<span class="rounded-full border border-border px-3 py-1 text-[0.7rem] font-sans uppercase tracking-[0.1em] text-text-muted">
								Honcho user memory
							</span>
							<span class="rounded-full border border-border px-3 py-1 text-[0.7rem] font-sans uppercase tracking-[0.1em] text-text-muted">
								{honchoEnabled ? 'Live' : 'Unavailable'}
							</span>
						</div>
						<h2 class="mt-4 text-[1.75rem] font-serif tracking-[-0.04em] text-text-primary">
							What Honcho currently knows about you
						</h2>
						{#if honchoOverview}
							<p class="mt-4 text-base font-serif leading-[1.65] text-text-secondary">
								{honchoOverview}
							</p>
						{:else if honchoEnabled}
							<p class="mt-4 text-sm font-sans leading-[1.6] text-text-muted">
								Honcho memory is enabled, but there is not enough durable user memory yet to render a useful summary.
							</p>
						{:else}
							<p class="mt-4 text-sm font-sans leading-[1.6] text-text-muted">
								Honcho is disabled in this deployment, so the live memory overview is not available.
							</p>
						{/if}
					</div>

					<div class="space-y-4">
						<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
							<div class="text-[0.7rem] font-sans uppercase tracking-[0.12em] text-text-muted">
								What feeds this
							</div>
							<p class="mt-3 text-sm font-sans leading-[1.6] text-text-secondary">
								Recent chats, durable conclusions, saved workflow capsules, and linked knowledge artifacts all contribute to this memory view.
							</p>
						</div>

						<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
							<div class="text-[0.7rem] font-sans uppercase tracking-[0.12em] text-text-muted">
								How it is used
							</div>
							<p class="mt-3 text-sm font-sans leading-[1.6] text-text-secondary">
								This overview is not pasted into every prompt verbatim. It is used as a compact recall layer so the assistant can keep continuity without bloating the main context window.
							</p>
						</div>
					</div>
				</div>

				<div class="mt-4 grid gap-3 md:grid-cols-2">
					{#if honchoHighlights.length > 0}
						{#each honchoHighlights as highlight}
							<div class="rounded-[1.2rem] border border-border bg-surface-page px-4 py-4">
								<div class="text-[0.7rem] font-sans uppercase tracking-[0.12em] text-text-muted">
									Memory signal
								</div>
								<p class="mt-3 text-sm font-serif leading-[1.55] text-text-secondary">{highlight}</p>
							</div>
						{/each}
					{:else}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm text-text-muted md:col-span-2">
							As you work across conversations, this tab will surface a clearer Honcho-generated picture of your preferences, context, and recurring patterns.
						</div>
					{/if}
				</div>
			</section>
		{/if}
	</div>
</div>
