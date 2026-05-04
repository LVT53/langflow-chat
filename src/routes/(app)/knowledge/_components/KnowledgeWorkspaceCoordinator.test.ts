import { render, screen, waitFor } from "@testing-library/svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
