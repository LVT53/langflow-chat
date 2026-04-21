<script lang="ts">
	import type { KnowledgeDocumentItem, DocumentWorkspaceItem } from '$lib/types';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { clearKnowledgeWorkspaceParams, getKnowledgeWorkspaceDocumentFromUrl } from '$lib/client/document-workspace-navigation';
	import { recordDocumentWorkspaceOpen } from '$lib/client/api/knowledge';
	import { getWorkspaceMetadataForArtifact } from '../_helpers';
	import KnowledgeDocumentPreviewModal from './KnowledgeDocumentPreviewModal.svelte';

	let {
		documents,
		onJumpToSource,
	}: {
		documents: KnowledgeDocumentItem[];
		onJumpToSource?: (document: DocumentWorkspaceItem) => void | Promise<void>;
	} = $props();

	let activeDocument = $state<DocumentWorkspaceItem | null>(null);
	let modalOpen = $state(false);
	let lastHandoffKey = $state<string | null>(null);

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

	function openDocument(doc: DocumentWorkspaceItem) {
		activeDocument = doc;
		modalOpen = true;

		if (browser && doc.artifactId) {
			void recordDocumentWorkspaceOpen(doc.artifactId).catch(() => undefined);
		}
	}

	function closeDocument(documentId?: string) {
		if (documentId && activeDocument && activeDocument.id !== documentId) {
			return;
		}
		activeDocument = null;
		modalOpen = false;
	}

	function handleCloseDocument() {
		closeDocument();
	}

	function handleDownload(document: DocumentWorkspaceItem) {
		const artifactId = document.artifactId;
		if (!artifactId) return;
		const downloadUrl = `/api/knowledge/${artifactId}/download`;
		window.open(downloadUrl, '_blank');
	}

	// Expose openDocument for external callers (via bind:this)
	function handleOpenDocument(doc: DocumentWorkspaceItem) {
		openDocument(doc);
	}
</script>

<KnowledgeDocumentPreviewModal
	document={activeDocument}
	open={modalOpen}
	onClose={handleCloseDocument}
	onDownload={handleDownload}
	onJumpToSource={onJumpToSource}
/>
