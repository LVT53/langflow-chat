<script lang="ts">
import type { KnowledgeDocumentItem, DocumentWorkspaceItem } from "$lib/types";
import { page } from "$app/state";
import { replaceState } from "$app/navigation";
import { browser } from "$app/environment";
import {
	clearKnowledgeWorkspaceParams,
	getKnowledgeWorkspaceDocumentFromUrl,
} from "$lib/client/document-workspace-navigation";
import {
	reduceWorkspaceDocumentClose,
	reduceWorkspaceDocumentOpen,
} from "$lib/client/document-workspace-state";
import { recordDocumentWorkspaceOpen } from "$lib/client/api/knowledge";
import DocumentWorkspace from "$lib/components/document-workspace/DocumentWorkspace.svelte";
import { getWorkspaceDocumentForArtifact } from "../_helpers";
import { toWorkspaceDocument } from "../_helpers";

let {
	documents,
	onJumpToSource,
}: {
	documents: KnowledgeDocumentItem[];
	onJumpToSource?: (document: DocumentWorkspaceItem) => void | Promise<void>;
} = $props();

let workspaceDocuments = $state<DocumentWorkspaceItem[]>([]);
let activeWorkspaceDocumentId = $state<string | null>(null);
let workspaceOpen = $state(false);
let lastHandoffKey = $state<string | null>(null);

let availableWorkspaceDocuments = $derived(documents.map(toWorkspaceDocument));

// URL handoff effect
$effect(() => {
	const handoffDoc = getKnowledgeWorkspaceDocumentFromUrl(page.url);
	if (!handoffDoc) return;

	const key = `${handoffDoc.artifactId ?? handoffDoc.id}|${handoffDoc.filename}`;
	if (lastHandoffKey === key) {
		if (browser) {
			requestAnimationFrame(() => {
				replaceState(clearKnowledgeWorkspaceParams(page.url), page.state);
			});
		}
		return;
	}

	openDocument(
		handoffDoc.artifactId
			? (getWorkspaceDocumentForArtifact(documents, handoffDoc.artifactId) ??
				handoffDoc)
			: handoffDoc,
	);
	lastHandoffKey = key;
	if (browser) {
		requestAnimationFrame(() => {
			replaceState(clearKnowledgeWorkspaceParams(page.url), page.state);
		});
	}
});

function openDocument(doc: DocumentWorkspaceItem) {
	const result = reduceWorkspaceDocumentOpen(workspaceDocuments, doc);
	workspaceDocuments = result.documents;
	activeWorkspaceDocumentId = result.activeDocumentId;
	workspaceOpen = result.isOpen;

	if (browser && doc.artifactId) {
		void recordDocumentWorkspaceOpen(doc.artifactId).catch(() => undefined);
	}
}

export function closeDocument(documentId?: string) {
	if (!documentId) {
		workspaceOpen = false;
		return;
	}

	const result = reduceWorkspaceDocumentClose(
		workspaceDocuments,
		documentId,
		activeWorkspaceDocumentId,
	);
	workspaceDocuments = result.documents;
	activeWorkspaceDocumentId = result.activeDocumentId;
	workspaceOpen = result.isOpen;
}

function selectWorkspaceDocument(documentId: string) {
	activeWorkspaceDocumentId = documentId;
	workspaceOpen = true;
	const document = workspaceDocuments.find((entry) => entry.id === documentId);
	if (browser && document?.artifactId) {
		void recordDocumentWorkspaceOpen(document.artifactId).catch(
			() => undefined,
		);
	}
}

function closeWorkspace() {
	workspaceOpen = false;
}

// Expose openDocument for external callers (via bind:this)
export function handleOpenDocument(doc: DocumentWorkspaceItem) {
	openDocument(doc);
}
</script>

<DocumentWorkspace
	open={workspaceOpen}
	presentation="expanded"
	returnToDockedOnExpandedClose={false}
	documents={workspaceDocuments}
	availableDocuments={availableWorkspaceDocuments}
	activeDocumentId={activeWorkspaceDocumentId}
	onSelectDocument={selectWorkspaceDocument}
	onOpenDocument={openDocument}
	onJumpToSource={onJumpToSource}
	onCloseDocument={closeDocument}
	onCloseWorkspace={closeWorkspace}
/>
