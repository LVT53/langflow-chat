import { render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WORKSPACE_CONVERSATION_DELETED_EVENT } from "$lib/client/document-workspace-state";
import KnowledgeWorkspaceCoordinator from "./KnowledgeWorkspaceCoordinator.svelte";

const { replaceStateMock } = vi.hoisted(() => ({
	replaceStateMock: vi.fn(),
}));

vi.mock("$app/state", () => ({
	page: {
		url: new URL(
			"http://localhost/knowledge?open_artifact=artifact-1&open_filename=Notes.md&open_mime=text%2Fmarkdown",
		),
		state: {},
	},
}));

vi.mock("$app/navigation", () => ({
	replaceState: replaceStateMock,
}));

vi.mock("$app/environment", () => ({
	browser: true,
	building: false,
	dev: true,
	version: "test",
}));

vi.mock("$lib/client/api/knowledge", () => ({
	recordDocumentWorkspaceOpen: vi.fn().mockResolvedValue(undefined),
}));

describe("KnowledgeWorkspaceCoordinator", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn(() => new Promise(() => undefined)) as typeof fetch;
	});

	it("opens handoff documents in the expanded shared document workspace", async () => {
		render(KnowledgeWorkspaceCoordinator, {
			props: {
				documents: [
					{
						id: "doc-1",
						name: "Notes.md",
						type: "source_document",
						mimeType: "text/markdown",
						sizeBytes: 120,
						createdAt: 1,
						displayArtifactId: "artifact-1",
					},
				],
			},
		});

		await waitFor(() => {
			expect(
				screen.getByRole("complementary", { name: /document workspace/i }),
			).toHaveClass("workspace-shell-expanded");
		});

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		await waitFor(() => {
			expect(replaceStateMock).toHaveBeenCalled();
		});
	});

	it("shows the active document download action in the expanded workspace", async () => {
		render(KnowledgeWorkspaceCoordinator, {
			props: {
				documents: [
					{
						id: "doc-1",
						name: "Notes.md",
						type: "source_document",
						mimeType: "text/markdown",
						sizeBytes: 120,
						createdAt: 1,
						displayArtifactId: "artifact-1",
					},
				],
			},
		});

		const downloads = await screen.findAllByRole("link", {
			name: /download notes\.md/i,
		});

		expect(
			downloads.some(
				(download) =>
					download.getAttribute("href") ===
					"/api/knowledge/artifact-1/download",
			),
		).toBe(true);
	});

	it("resolves normalized handoff artifacts to the display artifact before previewing", async () => {
		render(KnowledgeWorkspaceCoordinator, {
			props: {
				documents: [
					{
						id: "doc-1",
						name: "Contract.docx",
						type: "source_document",
						mimeType:
							"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
						sizeBytes: 120,
						createdAt: 1,
						displayArtifactId: "display-docx-1",
						promptArtifactId: "artifact-1",
					},
				],
			},
		});

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledWith(
				"/api/knowledge/display-docx-1/preview",
			);
		});

		const downloads = await screen.findAllByRole("link", {
			name: /download contract\.docx/i,
		});
		expect(
			downloads.some(
				(download) =>
					download.getAttribute("href") ===
					"/api/knowledge/display-docx-1/download",
			),
		).toBe(true);
	});

	it("closes open workspace documents owned by a deleted conversation", async () => {
		render(KnowledgeWorkspaceCoordinator, {
			props: {
				documents: [
					{
						id: "doc-1",
						name: "Notes.md",
						type: "source_document",
						mimeType: "text/markdown",
						sizeBytes: 120,
						createdAt: 1,
						displayArtifactId: "artifact-1",
						conversationId: "deleted-conversation",
					},
				],
			},
		});

		await screen.findByRole("complementary", {
			name: /document workspace/i,
		});

		window.dispatchEvent(
			new CustomEvent(WORKSPACE_CONVERSATION_DELETED_EVENT, {
				detail: { conversationId: "deleted-conversation" },
			}),
		);

		await waitFor(() => {
			expect(
				screen.queryByRole("complementary", {
					name: /document workspace/i,
				}),
			).not.toBeInTheDocument();
		});
	});
});
