import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/svelte";
import { tick } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DocumentWorkspace from "./DocumentWorkspace.svelte";

vi.mock("$lib/services/markdown", () => ({
	renderHighlightedText: vi.fn(
		async (content: string) => `<pre><code>${content}</code></pre>`,
	),
}));

describe("DocumentWorkspace", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	describe("Multi-page document navigation", () => {
		it("renders scrollable page container for multi-page documents", async () => {
			render(DocumentWorkspace, {
				props: {
					open: true,
					documents: [
						{
							id: "doc-pdf",
							source: "knowledge_artifact",
							filename: "report.pdf",
							title: "Annual Report",
							documentFamilyId: "family-report",
							documentLabel: "Annual Report",
							documentRole: "report",
							versionNumber: 1,
							mimeType: "application/pdf",
							artifactId: "artifact-pdf",
							totalPages: 10,
							currentPage: 1,
						},
					],
					availableDocuments: [],
					activeDocumentId: "doc-pdf",
					onSelectDocument: vi.fn(),
					onOpenDocument: vi.fn(),
					onCloseDocument: vi.fn(),
					onCloseWorkspace: vi.fn(),
				},
			});

			const desktopWorkspace = screen.getByRole("complementary", {
				name: /document workspace/i,
			});

			expect(
				within(desktopWorkspace).queryByTestId("page-scroll-container"),
			).toBeInTheDocument();

			const prevArrow =
				within(desktopWorkspace).queryByLabelText(/previous page/i);
			const nextArrow = within(desktopWorkspace).queryByLabelText(/next page/i);
			expect(prevArrow).not.toBeInTheDocument();
			expect(nextArrow).not.toBeInTheDocument();
		});

		it("renders page input that accepts numeric input and jumps to valid page", async () => {
			const onPageChange = vi.fn();

			render(DocumentWorkspace, {
				props: {
					open: true,
					documents: [
						{
							id: "doc-pdf",
							source: "knowledge_artifact",
							filename: "report.pdf",
							title: "Annual Report",
							documentFamilyId: "family-report",
							documentLabel: "Annual Report",
							documentRole: "report",
							versionNumber: 1,
							mimeType: "application/pdf",
							artifactId: "artifact-pdf",
							totalPages: 10,
							currentPage: 1,
						},
					],
					availableDocuments: [],
					activeDocumentId: "doc-pdf",
					onSelectDocument: vi.fn(),
					onOpenDocument: vi.fn(),
					onCloseDocument: vi.fn(),
					onCloseWorkspace: vi.fn(),
					onPageChange,
				},
			});

			const desktopWorkspace = screen.getByRole("complementary", {
				name: /document workspace/i,
			});
			const pageInput = within(desktopWorkspace).getByTestId(
				"page-input",
			) as HTMLInputElement;

			// Directly set the value and dispatch input event for Svelte 5 bind:value
			pageInput.value = "5";
			await fireEvent.input(pageInput);
			await tick();
			await fireEvent.keyDown(pageInput, { key: "Enter" });
			await tick();

			expect(onPageChange).toHaveBeenCalledWith(5);
		});

		it("shows error state for invalid page number input", async () => {
			const onPageChange = vi.fn();

			render(DocumentWorkspace, {
				props: {
					open: true,
					documents: [
						{
							id: "doc-pdf",
							source: "knowledge_artifact",
							filename: "report.pdf",
							title: "Annual Report",
							documentFamilyId: "family-report",
							documentLabel: "Annual Report",
							documentRole: "report",
							versionNumber: 1,
							mimeType: "application/pdf",
							artifactId: "artifact-pdf",
							totalPages: 10,
							currentPage: 1,
						},
					],
					availableDocuments: [],
					activeDocumentId: "doc-pdf",
					onSelectDocument: vi.fn(),
					onOpenDocument: vi.fn(),
					onCloseDocument: vi.fn(),
					onCloseWorkspace: vi.fn(),
					onPageChange,
				},
			});

			const desktopWorkspace = screen.getByRole("complementary", {
				name: /document workspace/i,
			});
			const pageInput = within(desktopWorkspace).getByTestId(
				"page-input",
			) as HTMLInputElement;

			// Directly set the value and dispatch input event for Svelte 5 bind:value
			pageInput.value = "15";
			await fireEvent.input(pageInput);
			await tick();
			await fireEvent.keyDown(pageInput, { key: "Enter" });
			await tick();

			const errorMessage =
				within(desktopWorkspace).queryByTestId("page-input-error");
			expect(errorMessage).toBeInTheDocument();
			expect(errorMessage).toHaveTextContent(/invalid|number/i);

			expect(onPageChange).not.toHaveBeenCalled();
		});

		it("shows error for non-numeric page input", async () => {
			const onPageChange = vi.fn();

			render(DocumentWorkspace, {
				props: {
					open: true,
					documents: [
						{
							id: "doc-pdf",
							source: "knowledge_artifact",
							filename: "report.pdf",
							title: "Annual Report",
							documentFamilyId: "family-report",
							documentLabel: "Annual Report",
							documentRole: "report",
							versionNumber: 1,
							mimeType: "application/pdf",
							artifactId: "artifact-pdf",
							totalPages: 10,
							currentPage: 1,
						},
					],
					availableDocuments: [],
					activeDocumentId: "doc-pdf",
					onSelectDocument: vi.fn(),
					onOpenDocument: vi.fn(),
					onCloseDocument: vi.fn(),
					onCloseWorkspace: vi.fn(),
					onPageChange,
				},
			});

			const desktopWorkspace = screen.getByRole("complementary", {
				name: /document workspace/i,
			});
			const pageInput = within(desktopWorkspace).getByTestId(
				"page-input",
			) as HTMLInputElement;

			// Directly set the value and dispatch input event for Svelte 5 bind:value
			pageInput.value = "abc";
			await fireEvent.input(pageInput);
			await tick();
			await fireEvent.keyDown(pageInput, { key: "Enter" });
			await tick();

			const errorMessage =
				within(desktopWorkspace).queryByTestId("page-input-error");
			expect(errorMessage).toBeInTheDocument();
			expect(errorMessage).toHaveTextContent(/invalid|number/i);

			expect(onPageChange).not.toHaveBeenCalled();
		});
	});

	describe("Resizable panel", () => {
		it("can be dragged to resize to a new width", async () => {
			render(DocumentWorkspace, {
				props: {
					open: true,
					documents: [
						{
							id: "doc-1",
							source: "knowledge_artifact",
							filename: "document.pdf",
							title: "Document",
							mimeType: "application/pdf",
							artifactId: null,
						},
					],
					availableDocuments: [],
					activeDocumentId: "doc-1",
					onSelectDocument: vi.fn(),
					onOpenDocument: vi.fn(),
					onCloseDocument: vi.fn(),
					onCloseWorkspace: vi.fn(),
				},
			});

			const desktopWorkspace = screen.getByRole("complementary", {
				name: /document workspace/i,
			});
			const resizeHandle =
				within(desktopWorkspace).getByTestId("resize-handle");

			Object.defineProperty(desktopWorkspace, "offsetWidth", {
				value: 500,
				configurable: true,
			});

			await fireEvent.mouseDown(resizeHandle, { clientX: 500 });
			document.dispatchEvent(
				new MouseEvent("mousemove", { clientX: 400, bubbles: true }),
			);
			await tick();
			document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
			await tick();

			expect(desktopWorkspace.style.width).toMatch(/\d+px/);
		});

		it("respects minimum width constraint during resize", async () => {
			render(DocumentWorkspace, {
				props: {
					open: true,
					documents: [
						{
							id: "doc-1",
							source: "knowledge_artifact",
							filename: "document.pdf",
							title: "Document",
							mimeType: "application/pdf",
							artifactId: null,
						},
					],
					availableDocuments: [],
					activeDocumentId: "doc-1",
					onSelectDocument: vi.fn(),
					onOpenDocument: vi.fn(),
					onCloseDocument: vi.fn(),
					onCloseWorkspace: vi.fn(),
				},
			});

			const desktopWorkspace = screen.getByRole("complementary", {
				name: /document workspace/i,
			});
			const resizeHandle =
				within(desktopWorkspace).getByTestId("resize-handle");

			Object.defineProperty(desktopWorkspace, "offsetWidth", {
				value: 500,
				configurable: true,
			});

			await fireEvent.mouseDown(resizeHandle, { clientX: 500 });
			document.dispatchEvent(
				new MouseEvent("mousemove", { clientX: 1000, bubbles: true }),
			);
			await tick();
			document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
			await tick();

			const width = parseInt(desktopWorkspace.style.width, 10);
			expect(width).toBeGreaterThanOrEqual(320);
		});

		it("respects maximum width constraint during resize", async () => {
			render(DocumentWorkspace, {
				props: {
					open: true,
					documents: [
						{
							id: "doc-1",
							source: "knowledge_artifact",
							filename: "document.pdf",
							title: "Document",
							mimeType: "application/pdf",
							artifactId: null,
						},
					],
					availableDocuments: [],
					activeDocumentId: "doc-1",
					onSelectDocument: vi.fn(),
					onOpenDocument: vi.fn(),
					onCloseDocument: vi.fn(),
					onCloseWorkspace: vi.fn(),
				},
			});

			const desktopWorkspace = screen.getByRole("complementary", {
				name: /document workspace/i,
			});
			const resizeHandle =
				within(desktopWorkspace).getByTestId("resize-handle");

			Object.defineProperty(desktopWorkspace, "offsetWidth", {
				value: 500,
				configurable: true,
			});

			await fireEvent.mouseDown(resizeHandle, { clientX: 500 });
			document.dispatchEvent(
				new MouseEvent("mousemove", { clientX: 0, bubbles: true }),
			);
			await tick();
			document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
			await tick();

			const width = parseInt(desktopWorkspace.style.width, 10);
			const maxWidth = window.innerWidth * 0.42;
			expect(width).toBeLessThanOrEqual(Math.ceil(maxWidth));
		});
	});

	describe("Fade animation", () => {
		it("has transition class for opacity/transform when opening/closing", async () => {
			const { rerender } = render(DocumentWorkspace, {
				props: {
					open: false,
					documents: [
						{
							id: "doc-1",
							source: "knowledge_artifact",
							filename: "document.pdf",
							title: "Document",
							mimeType: "application/pdf",
							artifactId: null,
						},
					],
					availableDocuments: [],
					activeDocumentId: "doc-1",
					onSelectDocument: vi.fn(),
					onOpenDocument: vi.fn(),
					onCloseDocument: vi.fn(),
					onCloseWorkspace: vi.fn(),
				},
			});

			expect(screen.queryByRole("complementary")).not.toBeInTheDocument();

			await rerender({ open: true });

			const desktopWorkspace = screen.getByRole("complementary", {
				name: /document workspace/i,
			});

			const classList = desktopWorkspace.className;
			const hasTransition =
				classList.includes("transition") ||
				classList.includes("fade") ||
				classList.includes("opacity");
			expect(hasTransition).toBe(true);
		});

		it("applies fade-in animation when opening", async () => {
			const { rerender } = render(DocumentWorkspace, {
				props: {
					open: false,
					documents: [
						{
							id: "doc-1",
							source: "knowledge_artifact",
							filename: "document.pdf",
							title: "Document",
							mimeType: "application/pdf",
							artifactId: null,
						},
					],
					availableDocuments: [],
					activeDocumentId: "doc-1",
					onSelectDocument: vi.fn(),
					onOpenDocument: vi.fn(),
					onCloseDocument: vi.fn(),
					onCloseWorkspace: vi.fn(),
				},
			});

			await rerender({ open: true });

			const desktopWorkspace = screen.getByRole("complementary", {
				name: /document workspace/i,
			});

			const style = window.getComputedStyle(desktopWorkspace);
			expect(style.transition).toMatch(/opacity|transform/);
		});
	});

	// Existing tests below...
	it("shows version history for the active document family and switches to an open version", async () => {
		const onSelectDocument = vi.fn();
		const onOpenDocument = vi.fn();

		render(DocumentWorkspace, {
			props: {
				open: true,
				documents: [
					{
						id: "doc-v2",
						source: "knowledge_artifact",
						filename: "brief-v2.pdf",
						title: "Client Brief",
						documentFamilyId: "family-brief",
						documentFamilyStatus: "historical",
						documentLabel: "Client Brief",
						documentRole: "brief",
						versionNumber: 2,
						mimeType: "application/pdf",
						artifactId: null,
					},
					{
						id: "doc-v1",
						source: "knowledge_artifact",
						filename: "brief-v1.pdf",
						title: "Client Brief",
						documentFamilyId: "family-brief",
						documentLabel: "Client Brief",
						documentRole: "brief",
						versionNumber: 1,
						mimeType: "application/pdf",
						artifactId: null,
					},
				],
				availableDocuments: [],
				activeDocumentId: "doc-v2",
				onSelectDocument,
				onOpenDocument,
				onCloseDocument: vi.fn(),
				onCloseWorkspace: vi.fn(),
			},
		});

		const desktopWorkspace = screen.getByRole("complementary", {
			name: /document workspace/i,
		});
		expect(
			within(desktopWorkspace).getByText("Version History"),
		).toBeInTheDocument();
		expect(
			within(desktopWorkspace).getByText("Brief • v2"),
		).toBeInTheDocument();
		expect(
			within(desktopWorkspace).getByText("Historical"),
		).toBeInTheDocument();
		expect(within(desktopWorkspace).getByText("Latest")).toBeInTheDocument();
		expect(within(desktopWorkspace).getByText("Current")).toBeInTheDocument();

		await fireEvent.click(
			within(desktopWorkspace).getByRole("button", { name: /v1/i }),
		);

		expect(onSelectDocument).toHaveBeenCalledWith("doc-v1");
		expect(onOpenDocument).not.toHaveBeenCalled();
	});

	it("opens a related family version that is not already tabbed", async () => {
		const onSelectDocument = vi.fn();
		const onOpenDocument = vi.fn();

		render(DocumentWorkspace, {
			props: {
				open: true,
				documents: [
					{
						id: "doc-v2",
						source: "knowledge_artifact",
						filename: "brief-v2.pdf",
						title: "Client Brief",
						documentFamilyId: "family-brief",
						documentLabel: "Client Brief",
						documentRole: "brief",
						versionNumber: 2,
						mimeType: "application/pdf",
						artifactId: null,
					},
				],
				availableDocuments: [
					{
						id: "doc-v3",
						source: "knowledge_artifact",
						filename: "brief-v3.pdf",
						title: "Client Brief",
						documentFamilyId: "family-brief",
						documentLabel: "Client Brief",
						documentRole: "brief",
						versionNumber: 3,
						mimeType: "application/pdf",
						artifactId: "artifact-v3",
					},
				],
				activeDocumentId: "doc-v2",
				onSelectDocument,
				onOpenDocument,
				onCloseDocument: vi.fn(),
				onCloseWorkspace: vi.fn(),
			},
		});

		const desktopWorkspace = screen.getByRole("complementary", {
			name: /document workspace/i,
		});
		await fireEvent.click(
			within(desktopWorkspace).getByRole("button", { name: /v3/i }),
		);

		expect(onOpenDocument).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "doc-v3",
				documentFamilyId: "family-brief",
				versionNumber: 3,
			}),
		);
		expect(onSelectDocument).not.toHaveBeenCalled();
	});

	it("renders a source-message action for documents with origin metadata", async () => {
		const onJumpToSource = vi.fn();

		render(DocumentWorkspace, {
			props: {
				open: true,
				documents: [
					{
						id: "doc-v2",
						source: "knowledge_artifact",
						filename: "brief-v2.pdf",
						title: "Client Brief",
						documentFamilyId: "family-brief",
						documentLabel: "Client Brief",
						documentRole: "brief",
						versionNumber: 2,
						originConversationId: "conv-1",
						originAssistantMessageId: "assistant-1",
						mimeType: "application/pdf",
						artifactId: null,
					},
				],
				availableDocuments: [],
				activeDocumentId: "doc-v2",
				onSelectDocument: vi.fn(),
				onOpenDocument: vi.fn(),
				onJumpToSource,
				onCloseDocument: vi.fn(),
				onCloseWorkspace: vi.fn(),
			},
		});

		const desktopWorkspace = screen.getByRole("complementary", {
			name: /document workspace/i,
		});
		await fireEvent.click(
			within(desktopWorkspace).getByRole("button", {
				name: /view source message/i,
			}),
		);

		expect(onJumpToSource).toHaveBeenCalledWith(
			expect.objectContaining({
				id: "doc-v2",
				originConversationId: "conv-1",
				originAssistantMessageId: "assistant-1",
			}),
		);
	});

	it("renders compare mode for text family documents and loads both versions", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
			async (input: string | URL | Request) => {
				const url =
					typeof input === "string"
						? input
						: input instanceof URL
							? input.toString()
							: input.url;
				if (url.includes("artifact-v2")) {
					return {
						ok: true,
						text: () => Promise.resolve("Title\nCurrent draft\nShared ending"),
					};
				}
				if (url.includes("artifact-v1")) {
					return {
						ok: true,
						text: () => Promise.resolve("Title\nPrevious draft\nShared ending"),
					};
				}

				throw new Error(`Unexpected fetch: ${url}`);
			},
		);

		render(DocumentWorkspace, {
			props: {
				open: true,
				documents: [
					{
						id: "doc-v2",
						source: "knowledge_artifact",
						filename: "brief-v2.md",
						title: "Client Brief",
						documentFamilyId: "family-brief",
						documentLabel: "Client Brief",
						documentRole: "brief",
						versionNumber: 2,
						mimeType: "text/markdown",
						artifactId: "artifact-v2",
					},
				],
				availableDocuments: [
					{
						id: "doc-v1",
						source: "knowledge_artifact",
						filename: "brief-v1.md",
						title: "Client Brief",
						documentFamilyId: "family-brief",
						documentLabel: "Client Brief",
						documentRole: "brief",
						versionNumber: 1,
						mimeType: "text/markdown",
						artifactId: "artifact-v1",
					},
				],
				activeDocumentId: "doc-v2",
				onSelectDocument: vi.fn(),
				onOpenDocument: vi.fn(),
				onCloseDocument: vi.fn(),
				onCloseWorkspace: vi.fn(),
			},
		});

		const desktopWorkspace = screen.getByRole("complementary", {
			name: /document workspace/i,
		});
		await fireEvent.click(
			within(desktopWorkspace).getByRole("button", {
				name: /compare versions/i,
			}),
		);

		await waitFor(() => {
			expect(
				within(desktopWorkspace).getByText("Compare Versions"),
			).toBeInTheDocument();
			expect(
				within(desktopWorkspace).getByText(/1 changed.*0 added.*0 removed/i),
			).toBeInTheDocument();
			expect(
				within(desktopWorkspace).getAllByText("Current").length,
			).toBeGreaterThan(0);
			expect(
				within(desktopWorkspace).getByText("Compared"),
			).toBeInTheDocument();
		});

		expect(global.fetch).toHaveBeenCalledWith(
			"/api/knowledge/artifact-v2/preview",
		);
		expect(global.fetch).toHaveBeenCalledWith(
			"/api/knowledge/artifact-v1/preview",
		);
	});

	it("keeps mobile workspace taps inside the workspace and only closes on backdrop taps", async () => {
		const onCloseWorkspace = vi.fn();
		const { container } = render(DocumentWorkspace, {
			props: {
				open: true,
				documents: [
					{
						id: "doc-1",
						source: "knowledge_artifact",
						filename: "notes.txt",
						title: "Notes",
						mimeType: "text/plain",
						artifactId: null,
					},
				],
				availableDocuments: [],
				activeDocumentId: "doc-1",
				onSelectDocument: vi.fn(),
				onOpenDocument: vi.fn(),
				onCloseDocument: vi.fn(),
				onCloseWorkspace,
			},
		});

		const mobileBackdrop = container.querySelector(
			".workspace-mobile-backdrop",
		);
		const mobileWorkspace = container.querySelector(".workspace-shell-mobile");

		expect(mobileBackdrop).toBeInTheDocument();
		expect(mobileWorkspace).toBeInTheDocument();

		if (!mobileBackdrop || !mobileWorkspace) {
			throw new Error("Expected mobile workspace overlay");
		}

		await fireEvent.click(mobileWorkspace);
		expect(onCloseWorkspace).not.toHaveBeenCalled();

		await fireEvent.click(mobileBackdrop);
		expect(onCloseWorkspace).toHaveBeenCalledTimes(1);
	});
});
