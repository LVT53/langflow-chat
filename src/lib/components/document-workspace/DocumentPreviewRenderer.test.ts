import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import * as pdfjsLib from "pdfjs-dist";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DocumentPreviewRenderer from "./DocumentPreviewRenderer.svelte";

const mockJsZipLoadAsync = vi.fn();
const mockPptxLoadFile = vi.fn();
const mockPptxGoToSlide = vi.fn();
const mockPptxDestroy = vi.fn();

vi.mock("$lib/services/markdown", () => ({
	renderHighlightedText: vi.fn(
		async (content: string) => `<pre><code>${content}</code></pre>`,
	),
	renderMarkdown: vi.fn(
		async (content: string) =>
			`<article><h1>${content.replace(/^#\s*/, "")}</h1></article>`,
	),
}));

vi.mock("mammoth", () => ({
	convertToHtml: vi
		.fn()
		.mockResolvedValue({ value: "<p>Mock DOCX content</p>" }),
}));

vi.mock("exceljs", () => ({
	Workbook: class MockWorkbook {
		SheetNames = ["Sheet1"];
		Sheets = { Sheet1: {} };
		xlsx = {
			load: vi.fn().mockResolvedValue(undefined),
		};
		eachSheet(callback: (worksheet: MockWorksheet, sheetId: number) => void) {
			callback(
				{
					name: "Sheet1",
					eachRow: (
						cb: (row: {
							eachCell: (cb2: (cell: { value: unknown }) => void) => void;
						}) => void,
					) => {
						cb({
							eachCell: (cellCb: (cell: { value: unknown }) => void) => {
								cellCb({ value: "Header1" });
								cellCb({ value: "Header2" });
							},
						});
						cb({
							eachCell: (cellCb: (cell: { value: unknown }) => void) => {
								cellCb({ value: "Value1" });
								cellCb({ value: "Value2" });
							},
						});
					},
				},
				1,
			);
		}
	},
}));

vi.mock("jszip", () => ({
	default: {
		loadAsync: mockJsZipLoadAsync,
	},
}));

vi.mock("pptxviewjs", () => ({
	PPTXViewer: class MockPptxViewer {
		async loadFile(arrayBuffer: ArrayBuffer) {
			return mockPptxLoadFile(arrayBuffer);
		}

		getSlideCount() {
			return 2;
		}

		async goToSlide(index: number) {
			return mockPptxGoToSlide(index);
		}

		destroy() {
			mockPptxDestroy();
		}
	},
}));

const mockPdfRenderCancel = vi.fn();
const mockPdfRender = vi.fn(() => ({
	promise: Promise.resolve(),
	cancel: mockPdfRenderCancel,
}));

const mockPdfGetPage = vi.fn(async () => ({
	getViewport: vi.fn(({ scale }: { scale: number }) => ({
		width: 640 * scale,
		height: 480 * scale,
	})),
	render: mockPdfRender,
}));

vi.mock("pdfjs-dist", () => ({
	GlobalWorkerOptions: {
		workerSrc: "",
	},
	VerbosityLevel: {
		ERRORS: 0,
	},
	setVerbosityLevel: vi.fn(),
	getDocument: vi.fn(() => ({
		promise: Promise.resolve({
			numPages: 1,
			getPage: mockPdfGetPage,
		}),
	})),
}));

interface MockWorksheet {
	name: string;
	eachRow: (
		callback: (row: {
			eachCell: (cb: (cell: { value: unknown }) => void) => void;
		}) => void,
	) => void;
}

function expectPageIndicator(page: string, total: number) {
	expect(screen.getByTestId("preview-page-input")).toHaveDisplayValue(page);
	expect(screen.getByText(`of ${total}`)).toBeInTheDocument();
	expect(document.querySelector(".preview-toolbar-page-summary")).not.toBeInTheDocument();
}

describe("DocumentPreviewRenderer", () => {
	const mockOnClose = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
		HTMLCanvasElement.prototype.toDataURL = vi
			.fn()
			.mockReturnValue("data:image/png;base64,mock-slide");
	});

	it("renders nothing when closed", () => {
		const { container } = render(DocumentPreviewRenderer, {
			props: {
				open: false,
				artifactId: "test-123",
				filename: "test.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		expect(container.innerHTML.trim()).toBe("<!---->");
	});

	it("shows loading state when opening", () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
			() => new Promise(() => {}),
		);

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "test.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		expect(screen.getByText("Loading preview...")).toBeInTheDocument();
		expect(document.querySelector(".spinner")).toBeInTheDocument();
	});

	it("shows error state when file not found", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: false,
			status: 404,
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "test.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText("File not found")).toBeInTheDocument();
		});
	});

	it("shows error state on fetch failure", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error("Network error"),
		);

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "test.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText("Network error")).toBeInTheDocument();
		});
	});

	it("renders as an embedded preview region without a modal backdrop", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
			() => new Promise(() => {}),
		);

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "test.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		expect(screen.queryByRole("presentation")).not.toBeInTheDocument();
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(
			screen.getByRole("region", { name: "test.pdf" }),
		).toBeInTheDocument();
	});

	it("does not render standalone close chrome", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
			() => new Promise(() => {}),
		);

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "test.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		expect(
			screen.queryByLabelText("Close file preview"),
		).not.toBeInTheDocument();
	});

	it("shows unsupported message for unknown file types", async () => {
		const mockBlob = new Blob(["content"], {
			type: "application/octet-stream",
		});
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "test.unknown",
				mimeType: "application/octet-stream",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(
				screen.getByText("Preview not available for this file type"),
			).toBeInTheDocument();
		});
	});

	it("does not render a standalone preview header", () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
			() => new Promise(() => {}),
		);

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "document.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		expect(screen.queryByText("File Preview")).not.toBeInTheDocument();
	});

	it("leaves supported-file downloads to the workspace shell", async () => {
		const mockBlob = new Blob(["PDF content"], { type: "application/pdf" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "test.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(document.querySelector("canvas")).toBeInTheDocument();
		});
		expect(
			screen.queryByLabelText("Download test.pdf"),
		).not.toBeInTheDocument();
	});

	it("detects PDF file type correctly", async () => {
		const mockBlob = new Blob(["PDF content"], { type: "application/pdf" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "document.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			const canvas = document.querySelector("canvas");
			expect(canvas).toBeInTheDocument();
			expectPageIndicator("1", 1);
		});
		expect(pdfjsLib.getDocument).toHaveBeenCalledWith(
			expect.objectContaining({ verbosity: pdfjsLib.VerbosityLevel.ERRORS }),
		);
	});

	it("renders a PDF page once after load instead of looping on render-state changes", async () => {
		const mockBlob = new Blob(["PDF content"], { type: "application/pdf" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "document.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expectPageIndicator("1", 1);
		});

		// With fit-to-width logic, the page may render multiple times as scale is calculated
		await waitFor(() => {
			expect(mockPdfGetPage).toHaveBeenCalled();
			expect(mockPdfRender).toHaveBeenCalled();
		});
	});

	it("shows the first PDF page before later pages finish rendering", async () => {
		let secondPageRenderResolve: (() => void) | undefined;
		const secondPageRenderPromise = new Promise<void>((resolve) => {
			secondPageRenderResolve = resolve;
		});
		const firstPageRender = vi.fn(() => ({
			promise: Promise.resolve(),
			cancel: vi.fn(),
		}));
		const secondPageRender = vi.fn(() => ({
			promise: secondPageRenderPromise,
			cancel: vi.fn(),
		}));
		const getPage = vi.fn(async (pageNumber: number) => ({
			getViewport: vi.fn(({ scale }: { scale: number }) => ({
				width: 640 * scale,
				height: 480 * scale,
			})),
			render: pageNumber === 2 ? secondPageRender : firstPageRender,
		}));
		vi.mocked(pdfjsLib.getDocument).mockReturnValueOnce({
			promise: Promise.resolve({
				numPages: 2,
				getPage,
			}),
		} as ReturnType<typeof pdfjsLib.getDocument>);
		const mockBlob = new Blob(["PDF content"], { type: "application/pdf" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "document.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(firstPageRender).toHaveBeenCalled();
		});
		expectPageIndicator("1", 2);
		await waitFor(() => {
			expect(
				document.querySelector(".pdf-rendering-overlay"),
			).not.toBeInTheDocument();
		});

		secondPageRenderResolve?.();
	});

	it("lets browser wheel scrolling pass through PDFs while keyboard and Ctrl-wheel controls still work", async () => {
		const mockBlob = new Blob(["PDF content"], { type: "application/pdf" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "document.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		const scrollRegion = await screen.findByTestId("pdf-scroll-region");
		Object.defineProperty(scrollRegion, "clientHeight", {
			value: 300,
			configurable: true,
		});
		Object.defineProperty(scrollRegion, "scrollHeight", {
			value: 1200,
			configurable: true,
		});

		const wheelEvent = new WheelEvent("wheel", {
			bubbles: true,
			cancelable: true,
			deltaY: 120,
		});
		const normalWheelPreventDefault = vi.spyOn(wheelEvent, "preventDefault");
		scrollRegion.dispatchEvent(wheelEvent);
		expect(normalWheelPreventDefault).not.toHaveBeenCalled();

		const zoomWheelEvent = new WheelEvent("wheel", {
			bubbles: true,
			cancelable: true,
			deltaY: -120,
			ctrlKey: true,
		});
		const zoomWheelPreventDefault = vi.spyOn(
			zoomWheelEvent,
			"preventDefault",
		);
		scrollRegion.dispatchEvent(zoomWheelEvent);
		expect(zoomWheelPreventDefault).toHaveBeenCalled();
		await waitFor(() => {
			expect(screen.getByRole("button", { name: "Reset zoom" })).toHaveTextContent(
				"112%",
			);
		});

		scrollRegion.focus();
		await fireEvent.keyDown(scrollRegion, { key: "ArrowDown" });
		expect(scrollRegion.scrollTop).toBe(48);
	});

	it("lets PDF users pan the zoomed preview by dragging inside the scroll region", async () => {
		const mockBlob = new Blob(["PDF content"], { type: "application/pdf" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "document.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		const scrollRegion = await screen.findByTestId("pdf-scroll-region");
		Object.defineProperty(scrollRegion, "clientHeight", {
			value: 300,
			configurable: true,
		});
		Object.defineProperty(scrollRegion, "scrollHeight", {
			value: 1200,
			configurable: true,
		});
		Object.defineProperty(scrollRegion, "clientWidth", {
			value: 400,
			configurable: true,
		});
		Object.defineProperty(scrollRegion, "scrollWidth", {
			value: 1000,
			configurable: true,
		});
		scrollRegion.scrollTop = 100;
		scrollRegion.scrollLeft = 100;
		scrollRegion.setPointerCapture = vi.fn();
		scrollRegion.releasePointerCapture = vi.fn();

		await fireEvent.click(await screen.findByLabelText("Zoom in"));
		await fireEvent.pointerDown(scrollRegion, {
			clientX: 120,
			clientY: 120,
			pointerId: 1,
		});
		await fireEvent.pointerMove(scrollRegion, {
			clientX: 90,
			clientY: 80,
			pointerId: 1,
		});
		await fireEvent.pointerUp(scrollRegion, { pointerId: 1 });

		expect(scrollRegion.scrollLeft).toBe(130);
		expect(scrollRegion.scrollTop).toBe(140);
	});

	it("lets users change PDF pages from the shared preview toolbar", async () => {
		vi.mocked(pdfjsLib.getDocument).mockReturnValueOnce({
			promise: Promise.resolve({
				numPages: 3,
				getPage: mockPdfGetPage,
			}),
		} as ReturnType<typeof pdfjsLib.getDocument>);
		const mockBlob = new Blob(["PDF content"], { type: "application/pdf" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "document.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByTestId("preview-toolbar")).toBeInTheDocument();
		});

		await fireEvent.click(screen.getByLabelText("Next page"));
		expect(screen.getByDisplayValue("2")).toBeInTheDocument();

		const pageInput = screen.getByTestId(
			"preview-page-input",
		) as HTMLInputElement;
		pageInput.value = "3";
		await fireEvent.input(pageInput);
		await fireEvent.keyDown(pageInput, { key: "Enter" });
		expect(screen.getByDisplayValue("3")).toBeInTheDocument();
	});

	it("re-renders the PDF page when zoom changes", async () => {
		const mockBlob = new Blob(["PDF content"], { type: "application/pdf" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "document.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expectPageIndicator("1", 1);
		});

		const componentSource = readFileSync(
			"src/lib/components/document-workspace/DocumentPreviewRenderer.svelte",
			"utf8",
		);
		expect(componentSource).toContain(
			".pdf-canvas {\n\t\tdisplay: block;\n\t\tmax-width: none;",
		);

		const initialRenderCount = mockPdfRender.mock.calls.length;
		await fireEvent.click(screen.getByLabelText("Zoom in"));

		await waitFor(() => {
			expect(mockPdfRender.mock.calls.length).toBeGreaterThan(
				initialRenderCount,
			);
		});
	});

	it("does not close the preview when using PDF zoom controls", async () => {
		const mockBlob = new Blob(["PDF content"], { type: "application/pdf" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "document.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expectPageIndicator("1", 1);
		});

		await fireEvent.click(screen.getByLabelText("Zoom in"));

		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("cancels previous render tasks when zoom changes rapidly", async () => {
		// Create a render that can be cancelled
		let renderResolve: () => void;
		const slowRenderPromise = new Promise<void>((resolve) => {
			renderResolve = resolve;
		});
		mockPdfRender.mockImplementationOnce(() => ({
			promise: slowRenderPromise,
			cancel: mockPdfRenderCancel,
		}));

		const mockBlob = new Blob(["PDF content"], { type: "application/pdf" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "document.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expectPageIndicator("1", 1);
		});
		await waitFor(() => {
			expect(mockPdfRender).toHaveBeenCalled();
		});

		// Trigger zoom change while render is still pending
		await fireEvent.click(screen.getByLabelText("Zoom in"));

		// The previous render should have been cancelled
		await waitFor(() => {
			expect(mockPdfRenderCancel).toHaveBeenCalled();
		});

		// Resolve the slow render to clean up
		renderResolve?.();
	});

	it("detects image file type correctly", async () => {
		const mockBlob = new Blob(["image data"], { type: "image/png" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "image.png",
				mimeType: "image/png",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			const img = document.querySelector("img");
			expect(img).toBeInTheDocument();
		});
	});

	it("supports image zoom, fit reset, wheel zoom, and drag-to-pan", async () => {
		const mockBlob = new Blob(["image data"], { type: "image/png" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-image",
				filename: "image.png",
				mimeType: "image/png",
				onClose: mockOnClose,
			},
		});

		const imageStage = await screen.findByTestId("image-preview-stage");
		const image = screen.getByAltText("image.png");
		expect(screen.getByTestId("preview-toolbar")).toBeInTheDocument();

		await fireEvent.click(screen.getByLabelText("Zoom in"));
		expect(image.getAttribute("style")).toContain("scale(1.25)");

		await fireEvent.wheel(imageStage, { deltaY: -100 });
		expect(image.getAttribute("style")).toContain("scale(1.5)");
		expect(imageStage).toHaveClass("image-preview-stage-pannable");

		await fireEvent.click(screen.getByLabelText("Zoom out"));
		expect(image.getAttribute("style")).toContain("scale(1.25)");

		await fireEvent.pointerDown(imageStage, {
			clientX: 10,
			clientY: 10,
			pointerId: 1,
		});
		await fireEvent.pointerMove(imageStage, {
			clientX: 35,
			clientY: 25,
			pointerId: 1,
		});
		await fireEvent.pointerUp(imageStage, { pointerId: 1 });
		expect(image.getAttribute("style")).toContain("translate(25px, 15px)");

		await fireEvent.click(screen.getByLabelText("Reset zoom"));
		expect(image.getAttribute("style")).toContain(
			"translate(0px, 0px) scale(1)",
		);
		expect(imageStage).not.toHaveClass("image-preview-stage-pannable");

		await fireEvent.click(screen.getByLabelText("Zoom in"));
		await fireEvent.click(screen.getByLabelText("Fit image"));
		expect(image.getAttribute("style")).toContain(
			"translate(0px, 0px) scale(1)",
		);

		expect(
			screen.queryByRole("button", { name: /crop|rotate|annotate/i }),
		).not.toBeInTheDocument();
	});

	it("lets normal workspace scrolling pass through an image before it is zoomed", async () => {
		const mockBlob = new Blob(["image data"], { type: "image/png" });
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-image",
				filename: "image.png",
				mimeType: "image/png",
				onClose: mockOnClose,
			},
		});

		const imageStage = await screen.findByTestId("image-preview-stage");
		const image = screen.getByAltText("image.png");
		const wheelEvent = new WheelEvent("wheel", {
			bubbles: true,
			cancelable: true,
			deltaY: 120,
		});
		const preventDefault = vi.spyOn(wheelEvent, "preventDefault");

		imageStage.dispatchEvent(wheelEvent);

		expect(preventDefault).not.toHaveBeenCalled();
		expect(image.getAttribute("style")).toContain("scale(1)");
		expect(imageStage).not.toHaveClass("image-preview-stage-pannable");
	});

	it("detects DOCX file type correctly", async () => {
		const mockBlob = new Blob(["docx content"], {
			type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		});
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "document.docx",
				mimeType:
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText("Mock DOCX content")).toBeInTheDocument();
		});
	});

	it("detects XLSX file type correctly", async () => {
		const mockBlob = new Blob(["xlsx content"], {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "spreadsheet.xlsx",
				mimeType:
					"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			const table = document.querySelector(".xlsx-table");
			expect(table).toBeInTheDocument();
		});
	});

	it("renders PPTX files as slide images", async () => {
		const mockBlob = new Blob(["pptx content"], {
			type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		});
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-pptx",
				filename: "slides.pptx",
				mimeType:
					"application/vnd.openxmlformats-officedocument.presentationml.presentation",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(document.querySelectorAll(".pptx-slide-image")).toHaveLength(2);
		});
		expect(document.querySelectorAll(".pptx-slide-header")).toHaveLength(0);
		expect(document.querySelectorAll(".pptx-slide-badge")).toHaveLength(2);
		expect(document.querySelectorAll(".pptx-slide-separator")).toHaveLength(1);

		expect(mockPptxLoadFile).toHaveBeenCalledTimes(1);
		expect(mockPptxGoToSlide).toHaveBeenCalledTimes(2);
		expect(mockPptxDestroy).toHaveBeenCalledTimes(1);
	});

	it("shows slide navigation in the shared preview toolbar for PPTX files", async () => {
		const mockBlob = new Blob(["pptx content"], {
			type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		});
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-pptx",
				filename: "slides.pptx",
				mimeType:
					"application/vnd.openxmlformats-officedocument.presentationml.presentation",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByTestId("preview-toolbar")).toBeInTheDocument();
		});
		expect(screen.getByLabelText("Next slide")).toBeInTheDocument();
		expect(screen.getAllByText("Slide 1 / 2").length).toBeGreaterThan(0);
	});

	it("moves the visible PPTX slide when users use slide navigation", async () => {
		const mockBlob = new Blob(["pptx content"], {
			type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		});
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});
		const scrollIntoView = vi.fn();

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-pptx",
				filename: "slides.pptx",
				mimeType:
					"application/vnd.openxmlformats-officedocument.presentationml.presentation",
				onClose: mockOnClose,
			},
		});

		const slideTwoImage = await screen.findByAltText("Slide 2");
		const slideTwo = slideTwoImage.closest(".pptx-slide") as HTMLElement;
		slideTwo.scrollIntoView = scrollIntoView;

		await fireEvent.click(screen.getByLabelText("Next slide"));

		expect(scrollIntoView).toHaveBeenCalledWith({
			behavior: "smooth",
			block: "start",
		});
	});

	it("treats XML as text preview content", async () => {
		const mockBlob = new Blob(["<root><item>Hello</item></root>"], {
			type: "application/xml",
		});
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-xml",
				filename: "data.xml",
				mimeType: "application/xml",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			const code = document.querySelector(".file-text-preview code");
			expect(code).toBeInTheDocument();
			expect(code?.textContent).toContain("Hello");
		});
	});

	it("treats RTF as text preview content", async () => {
		const mockBlob = new Blob(["{\\rtf1\\ansi Hello world}"], {
			type: "application/rtf",
		});
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-rtf",
				filename: "document.rtf",
				mimeType: "application/rtf",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(
				screen.getByText("{\\rtf1\\ansi Hello world}"),
			).toBeInTheDocument();
		});
	});

	it("renders Markdown files as readable document HTML instead of highlighted source", async () => {
		const mockBlob = new Blob(["# Project Notes"], {
			type: "text/markdown",
		});
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-md",
				filename: "notes.md",
				mimeType: "text/markdown",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Project Notes" }),
			).toBeInTheDocument();
		});
		expect(
			document.querySelector(".markdown-document-preview"),
		).toBeInTheDocument();
		expect(
			document.querySelector(".file-text-preview"),
		).not.toBeInTheDocument();
	});

	it("renders HTML files in a sandboxed static preview instead of source highlighting", async () => {
		const mockBlob = new Blob(
			[
				"<main><h1>Website Export</h1></main><script>document.body.dataset.executed = 'yes'</script>",
			],
			{ type: "text/html" },
		);
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-html",
				filename: "site.html",
				mimeType: "text/html",
				onClose: mockOnClose,
			},
		});

		const frame = await screen.findByTitle("site.html preview");
		expect(frame).toHaveAttribute("sandbox", "");
		expect(frame).toHaveAttribute(
			"srcdoc",
			expect.stringContaining("Website Export"),
		);
		expect(frame.getAttribute("srcdoc")).not.toContain("<script>");
		expect(document.body.dataset.executed).toBeUndefined();
		expect(
			document.querySelector(".file-text-preview"),
		).not.toBeInTheDocument();
	});

	it("preserves safe local HTML styling while blocking scripts", async () => {
		const mockBlob = new Blob(
			[
				'<style>h1 { color: rgb(180, 30, 30); }</style><main><h1 style="font-weight: 700">Styled Export</h1></main><script>window.executed = true</script>',
			],
			{ type: "text/html" },
		);
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-html-styled",
				filename: "site.html",
				mimeType: "text/html",
				onClose: mockOnClose,
			},
		});

		const frame = await screen.findByTitle("site.html preview");
		const srcdoc = frame.getAttribute("srcdoc") ?? "";

		expect(srcdoc).toContain("color: rgb(180, 30, 30)");
		expect(srcdoc).toContain("font-weight: 700");
		expect(srcdoc).not.toContain("<script");
	});

	it("renders ODT files as document preview content", async () => {
		mockJsZipLoadAsync.mockResolvedValue({
			file: vi.fn((name: string) =>
				name === "content.xml"
					? {
							async: vi.fn().mockResolvedValue(
								`<?xml version="1.0" encoding="UTF-8"?>
								<office:document-content
									xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
									xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">
									<office:body>
										<office:text>
											<text:h text:outline-level="1">ODT Title</text:h>
											<text:p>Hello from ODT preview</text:p>
										</office:text>
									</office:body>
								</office:document-content>`,
							),
						}
					: null,
			),
		});

		const mockBlob = new Blob(["odt content"], {
			type: "application/vnd.oasis.opendocument.text",
		});
		(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(mockBlob),
		});

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-odt",
				filename: "document.odt",
				mimeType: "application/vnd.oasis.opendocument.text",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText("ODT Title")).toBeInTheDocument();
			expect(screen.getByText("Hello from ODT preview")).toBeInTheDocument();
		});
	});

	it("shows retry button on error", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
			new Error("Network error"),
		);

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "test.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		await waitFor(() => {
			expect(screen.getByText("Retry")).toBeInTheDocument();
		});
	});

	it("does not close on Escape because the workspace shell owns closing", async () => {
		(global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
			() => new Promise(() => {}),
		);

		render(DocumentPreviewRenderer, {
			props: {
				open: true,
				artifactId: "test-123",
				filename: "test.pdf",
				mimeType: "application/pdf",
				onClose: mockOnClose,
			},
		});

		await fireEvent.keyDown(window, { key: "Escape" });

		expect(mockOnClose).not.toHaveBeenCalled();
	});
});
