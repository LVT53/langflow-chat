<script lang="ts">
	import type { ArtifactSummary, WorkCapsule } from '$lib/types';
	import type { PageData } from './$types';

	export let data: PageData;

	const documents = (data.documents ?? []) as ArtifactSummary[];
	const results = (data.results ?? []) as ArtifactSummary[];
	const workflows = (data.workflows ?? []) as WorkCapsule[];
</script>

<svelte:head>
	<title>Knowledge Base</title>
</svelte:head>

<div class="flex h-full min-h-0 flex-col overflow-y-auto bg-surface-page px-4 py-6 md:px-8">
	<div class="mx-auto flex w-full max-w-[920px] flex-col gap-8">
		<div class="rounded-[1.5rem] border border-border bg-surface-elevated px-5 py-5 shadow-sm md:px-6">
			<div class="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
				<div class="space-y-2">
					<h1 class="text-[2rem] font-serif tracking-[-0.05em] text-text-primary md:text-[2.75rem]">
						Knowledge Base
					</h1>
					<p class="max-w-[720px] text-sm font-sans leading-[1.5] text-text-secondary">
						Persistent documents, saved results, and workflow capsules captured automatically from your conversations.
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
		</div>

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
	</div>
</div>
