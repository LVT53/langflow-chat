<script lang="ts">
	import type { KnowledgeDocumentItem, DocumentWorkspaceItem } from '$lib/types';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { clearKnowledgeWorkspaceParams, getKnowledgeWorkspaceDocumentFromUrl } from '$lib/client/document-workspace-navigation';
	import { recordDocumentWorkspaceOpen } from '$lib/client/api/knowledge';
	import { getLibraryBulkAction, getLibraryBulkKey, getLibraryBulkConfirmation, toWorkspaceDocument, getWorkspaceMetadataForArtifact } from '../_helpers';
	import DocumentWorkspace from '$lib/components/chat/DocumentWorkspace.svelte';
	import KnowledgeLibraryModal from './KnowledgeLibraryModal.svelte';

	// Type alias for the library modal kind
	type LibraryModalKind = 'documents';

	let {
		documents,
		pendingKnowledgeActionKey,
		isKnowledgeActionPending,
		onJumpToSource,
		onRunKnowledgeAction,
		onOpenLibraryModal,
	}: {
		documents: KnowledgeDocumentItem[];
		pendingKnowledgeActionKey: string | null;
		isKnowledgeActionPending: (key: string) => boolean;
		onJumpToSource?: (document: DocumentWorkspaceItem) => void | Promise<void>;
		onRunKnowledgeAction?: () => void | Promise<void>;
		onOpenLibraryModal?: () => void;
	} = $props();

	// Workspace state
	let workspaceDocumentsState = $state<DocumentWorkspaceItem[]>([]);
	let activeDocumentIdState = $state<string | null>(null);
	let workspaceOpenState = $state(false);
	let lastHandoffKey = $state<string | null>(null);

	// Library modal state
	let libraryModalActive = $state(false);

	function openLibraryPanel() {
		libraryModalActive = true;
		onOpenLibraryModal?.();
	}

	function closeLibraryPanel() {
		libraryModalActive = false;
	}

	function handleLibraryBulk() {
		onRunKnowledgeAction?.();
	}

	// URL handoff effect
	$effect(() => {
		const handoffDoc = getKnowledgeWorkspaceDocumentFromUrl(page.url);
		if (!handoffDoc) return;

		const key = `${handoffDoc.artifactId ?? handoffDoc.id}|${handoffDoc.filename}`;
		if (lastHandoffKey === key) {
			replaceState(clearKnowledgeWorkspaceParams(page.url), page.state);
			return;
		}

		openDocument({
			...handoffDoc,
			...(handoffDoc.artifactId
				? getWorkspaceMetadataForArtifact(documents, handoffDoc.artifactId) ?? {}
				: {}),
		});
		lastHandoffKey = key;
		replaceState(clearKnowledgeWorkspaceParams(page.url), page.state);
	});

	// Document operations
	function openDocument(doc: DocumentWorkspaceItem) {
		const existing = workspaceDocumentsState.find(e => e.id === doc.id);
		if (existing) {
			workspaceDocumentsState = workspaceDocumentsState.map(e =>
				e.id === doc.id ? { ...e, ...doc } : e
			);
		} else {
			workspaceDocumentsState = [...workspaceDocumentsState, doc];
		}

		activeDocumentIdState = doc.id;
		workspaceOpenState = true;

		if (browser && doc.artifactId) {
			void recordDocumentWorkspaceOpen(doc.artifactId).catch(() => undefined);
		}
	}

	function selectDocument(docId: string) {
		activeDocumentIdState = docId;
		workspaceOpenState = true;
		const doc = workspaceDocumentsState.find(e => e.id === docId) ?? null;
		if (browser && doc?.artifactId) {
			void recordDocumentWorkspaceOpen(doc.artifactId).catch(() => undefined);
		}
	}

	function closeDocument(docId: string) {
		const remaining = workspaceDocumentsState.filter(d => d.id !== docId);
		workspaceDocumentsState = remaining;

		if (activeDocumentIdState === docId) {
			activeDocumentIdState = remaining.at(-1)?.id ?? null;
		}

		if (remaining.length === 0) {
			workspaceOpenState = false;
		}
	}

	function closeWorkspace() {
		workspaceOpenState = false;
	}

	let availableDocs = $derived(documents.map(d => toWorkspaceDocument(d)));

	// Expose openDocument for external callers (via bind:this)
	function handleOpenDocument(doc: DocumentWorkspaceItem) {
		openDocument(doc);
	}
</script>

<DocumentWorkspace
	open={workspaceOpenState}
	documents={workspaceDocumentsState}
	availableDocuments={availableDocs}
	activeDocumentId={activeDocumentIdState}
	onSelectDocument={selectDocument}
	onOpenDocument={handleOpenDocument}
	onJumpToSource={onJumpToSource}
	onCloseDocument={closeDocument}
	onCloseWorkspace={closeWorkspace}
/>

{#if libraryModalActive}
	<KnowledgeLibraryModal
		activeLibraryModal={'documents'}
		{documents}
		{pendingKnowledgeActionKey}
		{isKnowledgeActionPending}
		onUpload={undefined}
		onClose={closeLibraryPanel}
		onOpenDocument={handleOpenDocument}
		onRunKnowledgeAction={handleLibraryBulk}
		onRemoveArtifact={undefined}
	/>
{/if}