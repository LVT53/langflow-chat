<script lang="ts">
	import type { ArtifactSummary, KnowledgeDocumentItem, WorkCapsule } from '$lib/types';

	let {
		documents,
		results,
		workflows,
		onOpenLibraryModal,
	}: {
		documents: KnowledgeDocumentItem[];
		results: ArtifactSummary[];
		workflows: WorkCapsule[];
		onOpenLibraryModal: (kind: 'documents' | 'results' | 'workflows') => void;
	} = $props();
</script>

<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
	<div class="space-y-2">
		<h2 class="text-lg font-sans font-semibold text-text-primary">Library</h2>
		<p class="max-w-[720px] text-sm font-sans leading-[1.6] text-text-secondary">
			Documents, saved results, and workflow capsules now open in dedicated table views so larger libraries stay easy to scan.
		</p>
	</div>
	<div class="mt-5 grid gap-4 lg:grid-cols-3">
		<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
			<div class="flex items-center justify-between gap-3">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Documents</div>
				<span class="rounded-full border border-border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
					{documents.length}
				</span>
			</div>
			<p class="mt-4 text-sm font-sans leading-[1.6] text-text-secondary">
				Uploaded files are managed as single logical documents, while their extracted text stays available behind the scenes for retrieval.
			</p>
			<button
				type="button"
				class="mt-4 rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
				onclick={() => onOpenLibraryModal('documents')}
			>
				Manage documents
			</button>
		</div>

		<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
			<div class="flex items-center justify-between gap-3">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Results</div>
				<span class="rounded-full border border-border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
					{results.length}
				</span>
			</div>
			<p class="mt-4 text-sm font-sans leading-[1.6] text-text-secondary">
				Saved generated outputs that remain available for recall and later refinement.
			</p>
			<button
				type="button"
				class="mt-4 rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
				onclick={() => onOpenLibraryModal('results')}
			>
				Manage results
			</button>
		</div>

		<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
			<div class="flex items-center justify-between gap-3">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Workflows</div>
				<span class="rounded-full border border-border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
					{workflows.length}
				</span>
			</div>
			<p class="mt-4 text-sm font-sans leading-[1.6] text-text-secondary">
				Reusable workflow capsules summarizing patterns, source inputs, and output history.
			</p>
			<button
				type="button"
				class="mt-4 rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
				onclick={() => onOpenLibraryModal('workflows')}
			>
				Manage workflows
			</button>
		</div>
	</div>
</section>
