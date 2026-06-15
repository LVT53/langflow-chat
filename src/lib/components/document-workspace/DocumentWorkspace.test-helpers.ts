import { render } from "@testing-library/svelte";
import { vi } from "vitest";
import type { DocumentWorkspaceItem } from "$lib/types";
import DocumentWorkspace from "./DocumentWorkspace.svelte";

type WorkspaceCallbacks = {
	onSelectDocument: ReturnType<typeof vi.fn>;
	onOpenDocument: ReturnType<typeof vi.fn>;
	onCloseDocument: ReturnType<typeof vi.fn>;
	onCloseWorkspace: ReturnType<typeof vi.fn>;
	onJumpToSource: ReturnType<typeof vi.fn>;
	onPresentationChange: ReturnType<typeof vi.fn>;
};

type WorkspaceRenderOptions = {
	open?: boolean;
	presentation?: "docked" | "expanded";
	returnToDockedOnExpandedClose?: boolean;
	documents?: DocumentWorkspaceItem[];
	availableDocuments?: DocumentWorkspaceItem[];
	activeDocumentId?: string | null;
	onSelectDocument?: WorkspaceCallbacks["onSelectDocument"];
	onOpenDocument?: WorkspaceCallbacks["onOpenDocument"];
	onCloseDocument?: WorkspaceCallbacks["onCloseDocument"];
	onCloseWorkspace?: WorkspaceCallbacks["onCloseWorkspace"];
	onJumpToSource?: WorkspaceCallbacks["onJumpToSource"];
	onPresentationChange?: WorkspaceCallbacks["onPresentationChange"];
};

export function makeWorkspaceDocument(
	overrides: Partial<DocumentWorkspaceItem>,
): DocumentWorkspaceItem {
	return {
		id: "doc-1",
		source: "knowledge_artifact",
		filename: "document.pdf",
		title: "Document",
		mimeType: "application/pdf",
		artifactId: null,
		...overrides,
	};
}

export function renderWorkspace(options: WorkspaceRenderOptions = {}) {
	const onSelectDocument = options.onSelectDocument ?? vi.fn();
	const onOpenDocument = options.onOpenDocument ?? vi.fn();
	const onCloseDocument = options.onCloseDocument ?? vi.fn();
	const onCloseWorkspace = options.onCloseWorkspace ?? vi.fn();
	const onJumpToSource = options.onJumpToSource ?? vi.fn();
	const onPresentationChange = options.onPresentationChange ?? vi.fn();

	const result = render(DocumentWorkspace, {
		props: {
			open: true,
			documents: [],
			availableDocuments: [],
			activeDocumentId: null,
			...options,
			onSelectDocument,
			onOpenDocument,
			onCloseDocument,
			onCloseWorkspace,
			onJumpToSource,
			onPresentationChange,
		},
	});

	return {
		...result,
		onSelectDocument,
		onOpenDocument,
		onCloseDocument,
		onCloseWorkspace,
		onJumpToSource,
		onPresentationChange,
	};
}
