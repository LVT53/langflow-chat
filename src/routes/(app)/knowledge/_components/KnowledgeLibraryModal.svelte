<script lang="ts">
	import type {
		DocumentWorkspaceItem,
		KnowledgeDocumentItem,
	} from '$lib/types';
	import type { LibraryModal } from '../_helpers';
	import {
		formatArtifactSize,
		formatDocumentKind,
		getLibraryBulkKey,
		getLibraryBulkLabel,
		getLibraryItemCount,
	} from '../_helpers';
	import { isPreviewableFile } from '$lib/utils/file-preview';
	import DocumentsList from './DocumentsList.svelte';

	let {
		activeLibraryModal,
		documents,
		pendingKnowledgeActionKey,
		deletingArtifactCount,
		isKnowledgeActionPending,
		isDeletingArtifact,
		onUpload,
		onClose,
		onOpenDocument,
		onRunKnowledgeAction,
		onRemoveArtifact,
	}: {
		activeLibraryModal: Exclude<LibraryModal, null>;
		documents: KnowledgeDocumentItem[];
		pendingKnowledgeActionKey: string | null;
		deletingArtifactCount: number;
		isKnowledgeActionPending: (key: string) => boolean;
		isDeletingArtifact: (id: string) => boolean;
		onUpload?: (files: File[]) => void | Promise<void>;
		onClose: () => void;
		onOpenDocument: (document: DocumentWorkspaceItem) => void;
		onRunKnowledgeAction: (kind: Exclude<LibraryModal, null>) => void | Promise<void>;
		onRemoveArtifact: (id: string, label: string) => void | Promise<void>;
	} = $props();

	let itemCount = $derived(
		getLibraryItemCount(activeLibraryModal, { documents })
	);
	let bulkKey = $derived(getLibraryBulkKey(activeLibraryModal));

	function openPreview(document: KnowledgeDocumentItem) {
		const artifactId = document.promptArtifactId ?? document.displayArtifactId;
		onOpenDocument({
			id: `artifact:${artifactId}`,
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
			artifactId,
			conversationId: document.conversationId,
		});
		onClose();
	}

	function handleTableSelect(document: KnowledgeDocumentItem) {
		if (isPreviewableFile(document.mimeType, document.name)) {
			openPreview(document);
		}
	}

	function handleTableDelete(documentId: string) {
		const artifact = documents.find((entry) => entry.id === documentId);
		if (!artifact) return;
		void onRemoveArtifact(artifact.id, artifact.name);
	}

	function handleTableDownload(): void {
		return;
	}

	async function handleTableUpload(files: File[]): Promise<void> {
		if (!onUpload || files.length === 0) return;
		await onUpload(files);
	}
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-[120] flex items-center justify-center bg-surface-overlay/65 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={onClose}
>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		role="dialog"
		aria-modal="true"
		tabindex={-1}
		class="max-h-[88vh] w-full max-w-[1180px] overflow-hidden rounded-[1.6rem] border border-border bg-surface-elevated shadow-2xl"
		onclick={(event) => event.stopPropagation()}
	>
		<div class="flex items-start justify-between gap-4 border-b border-border px-5 py-4 md:px-6">
			<div>
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
					Documents
				</div>
				<h3 class="mt-2 text-xl font-serif tracking-[-0.03em] text-text-primary">
					Manage documents
				</h3>
			</div>
			<div class="flex shrink-0 items-center gap-2">
				{#if itemCount > 0}
					<button
						type="button"
						class="cursor-pointer rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
						onclick={() => onRunKnowledgeAction(activeLibraryModal)}
						disabled={isKnowledgeActionPending(bulkKey)}
					>
						{isKnowledgeActionPending(bulkKey) ? 'Removing…' : getLibraryBulkLabel(activeLibraryModal)}
					</button>
				{/if}
				<button
					type="button"
					class="btn-icon-bare h-10 w-10 cursor-pointer rounded-full text-icon-muted hover:text-text-primary"
					onclick={onClose}
					aria-label="Close library manager"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" x2="6" y1="6" y2="18" />
						<line x1="6" x2="18" y1="6" y2="18" />
					</svg>
				</button>
			</div>
		</div>

		<div class="max-h-[calc(88vh-104px)] overflow-y-auto px-5 py-5 md:px-6">
			{#if pendingKnowledgeActionKey}
				<div
					class="mb-4 rounded-[1rem] border border-border bg-surface-page px-4 py-3 text-sm font-sans text-text-secondary shadow-sm"
					role="status"
					aria-live="polite"
				>
					Updating the Knowledge Base…
				</div>
			{/if}
			{#if deletingArtifactCount > 0}
				<div
					class="mb-4 rounded-[1rem] border border-border bg-surface-page px-4 py-3 text-sm font-sans text-text-secondary shadow-sm"
					role="status"
					aria-live="polite"
				>
					Removing {deletingArtifactCount} item{deletingArtifactCount === 1 ? '' : 's'} from the Knowledge Base…
				</div>
			{/if}
			{#if documents.length === 0}
				<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm text-text-muted">
					No documents yet.
				</div>
			{:else}
				<DocumentsList
					documents={documents}
					paginationLimit={20}
					currentPage={1}
					onSelect={handleTableSelect}
					onDelete={handleTableDelete}
					onDownload={handleTableDownload}
					onUpload={handleTableUpload}
				/>
		{/if}
	</div>
</div>
</div>
