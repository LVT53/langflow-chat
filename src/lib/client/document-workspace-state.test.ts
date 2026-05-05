import { describe, expect, it } from "vitest";
import type { DocumentWorkspaceItem } from "$lib/types";
import {
	loadPersistedWorkspaceDocumentState,
	reduceWorkspaceDocumentClose,
	reduceWorkspaceDocumentOpen,
	savePersistedWorkspaceDocumentState,
} from "./document-workspace-state";

function makeDocument(id: string, title = id): DocumentWorkspaceItem {
	return {
		id,
		source: "knowledge_artifact",
		filename: `${id}.md`,
		title,
		mimeType: "text/markdown",
		artifactId: id,
	};
}

describe("document workspace state", () => {
	it("opens a working document and selects it without duplicating an already-open document", () => {
		const first = makeDocument("doc-1", "Draft");
		const opened = reduceWorkspaceDocumentOpen([], first);

		expect(opened).toMatchObject({
			documents: [first],
			activeDocumentId: "doc-1",
			isOpen: true,
		});

		const refreshed = reduceWorkspaceDocumentOpen(opened.documents, {
			...first,
			title: "Updated draft",
		});

		expect(refreshed.documents).toHaveLength(1);
		expect(refreshed.documents[0].title).toBe("Updated draft");
		expect(refreshed.activeDocumentId).toBe("doc-1");
	});

	it("closes the active working document and falls back to the last remaining document", () => {
		const documents = [
			makeDocument("doc-1"),
			makeDocument("doc-2"),
			makeDocument("doc-3"),
		];

		const result = reduceWorkspaceDocumentClose(documents, "doc-3", "doc-3");

		expect(result.documents.map((document) => document.id)).toEqual([
			"doc-1",
			"doc-2",
		]);
		expect(result.activeDocumentId).toBe("doc-2");
		expect(result.isOpen).toBe(true);
	});

	it("persists an open workspace so chat navigation can restore the same rail", () => {
		const storage = new Map<string, string>();
		const storageAdapter = {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
			removeItem: (key: string) => storage.delete(key),
		};
		const documents = [makeDocument("doc-1"), makeDocument("doc-2")];

		savePersistedWorkspaceDocumentState(storageAdapter, {
			documents,
			activeDocumentId: "doc-2",
			isOpen: true,
			presentation: "expanded",
		});

		expect(loadPersistedWorkspaceDocumentState(storageAdapter)).toMatchObject({
			documents,
			activeDocumentId: "doc-2",
			isOpen: true,
			presentation: "expanded",
		});
	});

	it("drops empty or stale persisted workspace state", () => {
		const storage = new Map<string, string>();
		const storageAdapter = {
			getItem: (key: string) => storage.get(key) ?? null,
			setItem: (key: string, value: string) => storage.set(key, value),
			removeItem: (key: string) => storage.delete(key),
		};

		savePersistedWorkspaceDocumentState(
			storageAdapter,
			{
				documents: [makeDocument("doc-1")],
				activeDocumentId: "doc-1",
				isOpen: true,
				presentation: "docked",
			},
			1000,
		);

		expect(
			loadPersistedWorkspaceDocumentState(
				storageAdapter,
				1000 + 8 * 24 * 60 * 60 * 1000,
			),
		).toBeNull();

		savePersistedWorkspaceDocumentState(storageAdapter, {
			documents: [],
			activeDocumentId: null,
			isOpen: false,
			presentation: "docked",
		});

		expect(loadPersistedWorkspaceDocumentState(storageAdapter)).toBeNull();
	});
});
