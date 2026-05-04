import type { DocumentWorkspaceItem } from "$lib/types";

export type WorkspaceDocumentState = {
	documents: DocumentWorkspaceItem[];
	activeDocumentId: string | null;
	isOpen: boolean;
};

export function reduceWorkspaceDocumentOpen(
	documents: DocumentWorkspaceItem[],
	document: DocumentWorkspaceItem,
): WorkspaceDocumentState {
	const alreadyOpen = documents.some((entry) => entry.id === document.id);
	const updatedDocuments = alreadyOpen
		? documents.map((entry) =>
				entry.id === document.id ? { ...entry, ...document } : entry,
			)
		: [...documents, document];

	return {
		documents: updatedDocuments,
		activeDocumentId: document.id,
		isOpen: true,
	};
}

export function reduceWorkspaceDocumentClose(
	documents: DocumentWorkspaceItem[],
	documentId: string,
	activeWorkspaceDocumentId: string | null,
): WorkspaceDocumentState {
	const remainingDocuments = documents.filter(
		(document) => document.id !== documentId,
	);
	let nextActiveId = activeWorkspaceDocumentId;

	if (activeWorkspaceDocumentId === documentId) {
		nextActiveId = remainingDocuments.at(-1)?.id ?? null;
	}

	return {
		documents: remainingDocuments,
		activeDocumentId: nextActiveId,
		isOpen: remainingDocuments.length > 0,
	};
}
