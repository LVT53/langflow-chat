<script lang="ts">
	import type {
		DocumentWorkspaceItem,
		KnowledgeDocumentItem,
	} from '$lib/types';
	import {
		formatArtifactSize,
		formatDocumentKind,
		formatDocumentLifecycleStatus,
		formatMemoryTimestamp,
	} from '../_helpers';

	let {
		documents,
		onOpenLibraryModal,
		onOpenDocument = () => {},
	}: {
		documents: KnowledgeDocumentItem[];
		onOpenLibraryModal: (kind: 'documents') => void;
		onOpenDocument?: (document: DocumentWorkspaceItem) => void;
	} = $props();

	let searchQuery = $state('');
	let dragActive = $state(false);
	let dragEnterCount = $state(0);

	const normalizedSearchQuery = $derived(searchQuery.trim().toLowerCase());
	const filteredDocuments = $derived.by(() => {
		if (!normalizedSearchQuery) {
			return documents;
		}

		return documents.filter((document) => {
			return `${document.name}\n${document.summary ?? ''}`
				.toLowerCase()
				.includes(normalizedSearchQuery);
		});
	});

	function openAiView(document: KnowledgeDocumentItem) {
		onOpenDocument({
			id: `artifact:${document.promptArtifactId ?? document.displayArtifactId}`,
			source: 'knowledge_artifact',
			filename: document.name,
			title: document.documentLabel ?? document.name,
			documentFamilyId: document.documentFamilyId ?? null,
			documentFamilyStatus: document.documentFamilyStatus ?? null,
			documentLabel: document.documentLabel ?? null,
			documentRole: document.documentRole ?? null,
			versionNumber: document.versionNumber ?? null,
			originConversationId: document.originConversationId ?? null,
			originAssistantMessageId: document.originAssistantMessageId ?? null,
			sourceChatFileId: document.sourceChatFileId ?? null,
			mimeType: document.mimeType,
			artifactId: document.promptArtifactId ?? document.displayArtifactId,
			conversationId: document.conversationId,
		});
	}

	function isOsFileDrop(event: DragEvent): boolean {
		const types = event.dataTransfer?.types;
		return types ? types.includes('Files') : false;
	}

	function handleDragEnter(event: DragEvent) {
		if (!isOsFileDrop(event)) return;
		event.preventDefault();
		dragEnterCount += 1;
		dragActive = true;
	}

	function handleDragOver(event: DragEvent) {
		if (!isOsFileDrop(event)) return;
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleDragLeave(event: DragEvent) {
		if (!isOsFileDrop(event)) return;
		const currentTarget = event.currentTarget;
		const relatedTarget = event.relatedTarget;
		if (currentTarget instanceof HTMLElement && relatedTarget instanceof Node) {
			if (currentTarget.contains(relatedTarget)) return;
		}
		dragEnterCount -= 1;
		if (dragEnterCount <= 0) {
			dragEnterCount = 0;
			dragActive = false;
		}
	}

	function resetDragState() {
		dragEnterCount = 0;
		dragActive = false;
	}

	function handleDrop(event: DragEvent) {
		if (!isOsFileDrop(event)) return;
		event.preventDefault();
		event.stopPropagation();
		resetDragState();
		// File uploads now handled through the Manage documents modal
	}
</script>

<section class="rounded-[1.6rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
	<div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
		<div class="space-y-2">
			<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
				Library
			</div>
			<h2 class="text-[1.7rem] font-serif tracking-[-0.04em] text-text-primary md:text-[2.1rem]">
				All documents
			</h2>
			<p class="max-w-[760px] text-sm font-sans leading-[1.65] text-text-secondary">
				Browse uploaded files, filter by name or summary, and inspect the exact extracted text AlfyAI can read during retrieval.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				class="cursor-pointer rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-page"
				onclick={() => onOpenLibraryModal('documents')}
			>
				Manage documents
			</button>
		</div>
	</div>

	<div class="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
		<div
			class="library-panel relative rounded-[1.35rem] border border-border bg-surface-page px-4 py-4"
			role="region"
			aria-label="Documents"
			class:library-panel-drag-active={dragActive}
			ondragenter={handleDragEnter}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
		>
			{#if dragActive}
				<div class="library-drop-overlay" data-testid="library-drop-overlay">
					<div class="library-drop-content">
						<svg
							class="library-drop-icon"
							xmlns="http://www.w3.org/2000/svg"
							width="32"
							height="32"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
							<polyline points="17 8 12 3 7 8" />
							<line x1="12" y1="3" x2="12" y2="15" />
						</svg>
						<p class="library-drop-text">Drop files to upload</p>
						<p class="library-drop-hint">Use Manage documents for uploads</p>
					</div>
				</div>
			{/if}

			<div class="mt-4 border-t border-border pt-4">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
					Search files
				</div>
				<div class="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="shrink-0 text-icon-muted"
					>
						<circle cx="11" cy="11" r="7"></circle>
						<path d="m20 20-3.5-3.5"></path>
					</svg>
					<input
						bind:value={searchQuery}
						type="text"
						placeholder="Search all documents"
						class="h-9 w-full bg-transparent text-[15px] font-sans text-text-primary outline-none placeholder:text-text-muted"
					/>
					{#if searchQuery}
							<button
								type="button"
								class="btn-icon-bare h-8 w-8 cursor-pointer rounded-full text-icon-muted hover:text-icon-primary"
								onclick={() => (searchQuery = '')}
								aria-label="Clear search"
							>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="15"
								height="15"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<line x1="18" x2="6" y1="6" y2="18"></line>
								<line x1="6" x2="18" y1="6" y2="18"></line>
							</svg>
						</button>
					{/if}
				</div>
				<div class="mt-3 flex flex-wrap gap-2 text-[11px] font-sans text-text-muted">
					<span class="rounded-full border border-border px-3 py-1">
						Showing all documents
					</span>
					<span class="rounded-full border border-border px-3 py-1">
						{filteredDocuments.length} shown
					</span>
					{#if normalizedSearchQuery}
						<span class="rounded-full border border-border px-3 py-1">Filter active</span>
					{/if}
				</div>
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
			<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Total</div>
				<div class="mt-3 text-lg font-sans font-semibold text-text-primary">
					{documents.length}
				</div>
				<div class="mt-1 text-sm font-sans text-text-secondary">
					{documents.length === 1 ? 'file' : 'files'} in library
				</div>
			</div>
			<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">AI-ready files</div>
				<div class="mt-3 text-lg font-sans font-semibold text-text-primary">
					{documents.filter(d => d.normalizedAvailable).length}
				</div>
				<div class="mt-1 text-sm font-sans text-text-secondary">
					AI-readable files
				</div>
			</div>
		</div>
	</div>

	{#if documents.length === 0}
		<div class="mt-5 rounded-[1.3rem] border border-dashed border-border bg-surface-page px-5 py-6 text-sm font-sans text-text-muted">
			No documents available yet. Use "Manage documents" to upload files.
		</div>
	{:else if filteredDocuments.length === 0}
		<div class="mt-5 rounded-[1.3rem] border border-dashed border-border bg-surface-page px-5 py-6 text-sm font-sans text-text-muted">
			No documents match "{searchQuery.trim()}".
		</div>
	{:else}
		<div class="mt-5 overflow-x-auto rounded-[1.3rem] border border-border bg-surface-page">
			<table class="min-w-[960px] w-full border-collapse">
				<thead>
					<tr class="border-b border-border bg-surface-elevated/70 text-left">
						<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">File</th>
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
									{#if formatDocumentLifecycleStatus(document)}
										· {formatDocumentLifecycleStatus(document)}
									{/if}
								</div>
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
									class="cursor-pointer rounded-full border border-border px-3 py-1.5 text-xs font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
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

<style>
	.document-summary {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		overflow: hidden;
	}

	.library-panel {
		position: relative;
	}

	.library-panel-drag-active {
		outline: 2px dashed var(--accent);
		outline-offset: -2px;
	}

	.library-drop-overlay {
		position: absolute;
		inset: 0;
		z-index: 50;
		pointer-events: none;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--surface-overlay) 95%, transparent 5%);
		backdrop-filter: blur(2px);
		border-radius: inherit;
	}

	.library-drop-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem;
		text-align: center;
	}

	.library-drop-icon {
		color: var(--accent);
	}

	.library-drop-text {
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.library-drop-hint {
		margin: 0;
		font-size: 0.6875rem;
		color: var(--text-muted);
	}
</style>
