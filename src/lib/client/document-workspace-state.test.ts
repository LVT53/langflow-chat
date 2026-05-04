import { describe, expect, it } from "vitest";
import type { DocumentWorkspaceItem } from "$lib/types";
import {
	reduceWorkspaceDocumentClose,
	reduceWorkspaceDocumentOpen,
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
});
