<script lang="ts">
	import AttachmentContentModal from '$lib/components/chat/AttachmentContentModal.svelte';
	import type { StorageQuota, Vault } from '$lib/client/api/knowledge';
	import type { ArtifactSummary, KnowledgeDocumentItem, WorkCapsule } from '$lib/types';
	import {
		formatArtifactSize,
		formatDocumentKind,
		formatMemoryTimestamp,
	} from '../_helpers';

	let {
		vaults,
		activeVaultId = null,
		documents,
		results,
		workflows,
		quota = null,
		onOpenLibraryModal,
		onSelectVault = () => {},
	}: {
		vaults: Vault[];
		activeVaultId?: string | null;
		documents: KnowledgeDocumentItem[];
		results: ArtifactSummary[];
		workflows: WorkCapsule[];
		quota?: StorageQuota | null;
		onOpenLibraryModal: (kind: 'documents' | 'results' | 'workflows') => void;
		onSelectVault?: (vaultId: string | null) => void;
	} = $props();

	let searchQuery = $state('');
	let previewArtifactId = $state<string | null>(null);
	let previewFilename = $state('');

	const vaultNameById = $derived(Object.fromEntries(vaults.map((vault) => [vault.id, vault.name])));
	const selectedVault = $derived(
		activeVaultId ? vaults.find((vault) => vault.id === activeVaultId) ?? null : null
	);
	const vaultDocuments = $derived(
		documents.filter((document): document is KnowledgeDocumentItem & { vaultId: string } =>
			typeof document.vaultId === 'string' && document.vaultId.length > 0
		)
	);
	const scopedDocuments = $derived(
		activeVaultId
			? vaultDocuments.filter((document) => document.vaultId === activeVaultId)
			: vaultDocuments
	);
	const normalizedSearchQuery = $derived(searchQuery.trim().toLowerCase());
	const filteredDocuments = $derived.by(() => {
		if (!normalizedSearchQuery) {
			return scopedDocuments;
		}

		return scopedDocuments.filter((document) => {
			const vaultName = vaultNameById[document.vaultId] ?? '';
			return `${document.name}\n${document.summary ?? ''}\n${vaultName}`
				.toLowerCase()
				.includes(normalizedSearchQuery);
		});
	});
	const selectedVaultQuota = $derived(
		activeVaultId
			? quota?.vaults.find((vaultSummary) => vaultSummary.vaultId === activeVaultId) ?? null
			: null
	);

	function openAiView(document: KnowledgeDocumentItem) {
		previewArtifactId = document.promptArtifactId ?? document.displayArtifactId;
		previewFilename = document.name;
	}

	function closeAiView() {
		previewArtifactId = null;
		previewFilename = '';
	}
</script>

<section class="rounded-[1.6rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
	<div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
		<div class="space-y-2">
			<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
				Vault Explorer
			</div>
			<h2 class="text-[1.7rem] font-serif tracking-[-0.04em] text-text-primary md:text-[2.1rem]">
				{selectedVault ? selectedVault.name : 'All vault files'}
			</h2>
			<p class="max-w-[760px] text-sm font-sans leading-[1.65] text-text-secondary">
				Browse uploaded files in the current vault scope, filter by name or summary, and inspect the exact extracted text AlfyAI can read during retrieval.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			{#if activeVaultId}
				<button
					type="button"
					class="rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-secondary transition hover:bg-surface-page hover:text-text-primary"
					onclick={() => onSelectVault(null)}
				>
					Show all vaults
				</button>
			{/if}
			<button
				type="button"
				class="rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-page"
				onclick={() => onOpenLibraryModal('documents')}
			>
				Manage documents
			</button>
		</div>
	</div>

	<div class="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
		<div class="rounded-[1.35rem] border border-border bg-surface-page px-4 py-4">
			<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
				Filter current scope
			</div>
			<div class="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-icon-muted">
					<circle cx="11" cy="11" r="7"></circle>
					<path d="m20 20-3.5-3.5"></path>
				</svg>
				<input
					bind:value={searchQuery}
					type="text"
					placeholder={selectedVault ? `Search ${selectedVault.name}` : 'Search all vault files'}
					class="h-9 w-full bg-transparent text-[15px] font-sans text-text-primary outline-none placeholder:text-text-muted"
				/>
				{#if searchQuery}
					<button
						type="button"
						class="btn-icon-bare h-8 w-8 rounded-full text-icon-muted hover:text-icon-primary"
						onclick={() => (searchQuery = '')}
						aria-label="Clear vault filter"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" x2="6" y1="6" y2="18"></line>
							<line x1="6" x2="18" y1="6" y2="18"></line>
						</svg>
					</button>
				{/if}
			</div>
			<div class="mt-3 flex flex-wrap gap-2 text-[11px] font-sans text-text-muted">
				<span class="rounded-full border border-border px-3 py-1">
					{selectedVault ? 'Scoped to selected vault' : 'Showing every vault'}
				</span>
				<span class="rounded-full border border-border px-3 py-1">
					{filteredDocuments.length} shown
				</span>
				{#if normalizedSearchQuery}
					<span class="rounded-full border border-border px-3 py-1">Local filter active</span>
				{/if}
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
			<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Scope</div>
				<div class="mt-3 text-lg font-sans font-semibold text-text-primary">
					{selectedVault ? selectedVault.name : 'All vaults'}
				</div>
				<div class="mt-1 text-sm font-sans text-text-secondary">
					{scopedDocuments.length} file{scopedDocuments.length === 1 ? '' : 's'}
				</div>
			</div>
			<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Indexed</div>
				<div class="mt-3 text-lg font-sans font-semibold text-text-primary">
					{scopedDocuments.filter((document) => document.normalizedAvailable).length}
				</div>
				<div class="mt-1 text-sm font-sans text-text-secondary">
					AI-readable files in scope
				</div>
			</div>
			<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Storage</div>
				<div class="mt-3 text-lg font-sans font-semibold text-text-primary">
					{selectedVaultQuota ? `${Math.ceil(selectedVaultQuota.storageUsed / 1024)} KB` : 'Tracked globally'}
				</div>
				<div class="mt-1 text-sm font-sans text-text-secondary">
					{selectedVaultQuota
						? `${selectedVaultQuota.fileCount} file${selectedVaultQuota.fileCount === 1 ? '' : 's'}`
						: 'Select a vault for storage detail'}
				</div>
			</div>
		</div>
	</div>

	{#if vaults.length === 0}
		<div class="mt-5 rounded-[1.3rem] border border-dashed border-border bg-surface-page px-5 py-6 text-sm font-sans text-text-muted">
			Create a vault to start organizing uploaded files and exposing them to retrieval.
		</div>
	{:else if scopedDocuments.length === 0}
		<div class="mt-5 rounded-[1.3rem] border border-dashed border-border bg-surface-page px-5 py-6 text-sm font-sans text-text-muted">
			{selectedVault
				? `No files are stored in ${selectedVault.name} yet. Upload into this vault from the sidebar.`
				: 'No vault files are available yet.'}
		</div>
	{:else if filteredDocuments.length === 0}
		<div class="mt-5 rounded-[1.3rem] border border-dashed border-border bg-surface-page px-5 py-6 text-sm font-sans text-text-muted">
			No files in the current scope match "{searchQuery.trim()}".
		</div>
	{:else}
		<div class="mt-5 overflow-x-auto rounded-[1.3rem] border border-border bg-surface-page">
			<table class="min-w-[960px] w-full border-collapse">
				<thead>
					<tr class="border-b border-border bg-surface-elevated/70 text-left">
						<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">File</th>
						<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Vault</th>
						<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">AI text</th>
						<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Updated</th>
						<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Summary</th>
						<th class="px-4 py-3 text-right text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredDocuments as document (document.id)}
						<tr class="border-b border-border last:border-b-0">
							<td class="px-4 py-3 align-top">
								<div class="text-sm font-sans font-medium text-text-primary">{document.name}</div>
								<div class="mt-1 text-xs font-sans text-text-muted">
									{formatDocumentKind(document)} · {formatArtifactSize(document.sizeBytes)}
								</div>
							</td>
							<td class="px-4 py-3 align-top">
								<button
									type="button"
									class="rounded-full border border-border px-3 py-1 text-xs font-sans text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
									onclick={() => onSelectVault(document.vaultId)}
								>
									{vaultNameById[document.vaultId] ?? 'Vault'}
								</button>
							</td>
							<td class="px-4 py-3 align-top">
								<span
									class={`inline-flex rounded-full border px-3 py-1 text-xs font-sans ${
										document.normalizedAvailable
											? 'border-accent/30 bg-accent/10 text-accent'
											: 'border-border text-text-muted'
									}`}
								>
									{document.normalizedAvailable ? 'Indexed' : 'Source only'}
								</span>
							</td>
							<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">
								{formatMemoryTimestamp(document.updatedAt)}
							</td>
							<td class="px-4 py-3 align-top">
								<div class="document-summary text-sm font-serif leading-[1.55] text-text-secondary">
									{document.summary ?? 'No summary stored.'}
								</div>
							</td>
							<td class="px-4 py-3 align-top text-right">
								<button
									type="button"
									class="rounded-full border border-border px-3 py-1.5 text-xs font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
									onclick={() => openAiView(document)}
								>
									AI view
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
	<div class="space-y-2">
		<h2 class="text-lg font-sans font-semibold text-text-primary">Collections</h2>
		<p class="max-w-[720px] text-sm font-sans leading-[1.6] text-text-secondary">
			Documents, saved results, and workflow capsules still open in dedicated table views for bulk maintenance.
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

<AttachmentContentModal
	open={Boolean(previewArtifactId)}
	artifactId={previewArtifactId}
	filename={previewFilename}
	onClose={closeAiView}
/>

<style>
	.document-summary {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		overflow: hidden;
	}
</style>
