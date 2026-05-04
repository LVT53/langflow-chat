<script lang="ts">
import type { PDFDocumentProxy } from "pdfjs-dist";
import { browser } from "$app/environment";
import { tick } from "svelte";
import {
	determinePreviewFileType,
	getPreviewLanguage,
	type PreviewFileType,
} from "$lib/utils/file-preview";
import { escapeHtml, sanitizeHtml } from "$lib/utils/html-sanitizer";
import {
	renderHighlightedText,
	renderMarkdown,
} from "$lib/utils/markdown-loader";
import { t } from "$lib/i18n";
import DocumentPreviewToolbar from "./DocumentPreviewToolbar.svelte";

let {
	open,
	artifactId,
	previewUrl = null,
	filename,
	mimeType,
	onClose = () => undefined,
	currentPage = $bindable(1),
	totalPages = $bindable(0),
}: {
	open: boolean;
	artifactId: string | null;
	previewUrl?: string | null;
	filename: string;
	mimeType: string | null;
	onClose?: () => void;
	currentPage?: number;
	totalPages?: number;
} = $props();

let content = $state<Blob | null>(null);
let textContent = $state<string | null>(null);
let highlightedTextHtml = $state<string | null>(null);
let markdownHtml = $state<string | null>(null);
let csvTableHtml = $state<string | null>(null);
let isLoading = $state(false);
let error = $state<string | null>(null);
let htmlContent = $state<string | null>(null);
let htmlPreviewSrcdoc = $state<string | null>(null);
let fileType = $state<PreviewFileType>("unsupported");
let objectUrl = $state<string | null>(null);

// PDF.js state (loaded dynamically to avoid SSR issues)
let pdfjsLib: typeof import("pdfjs-dist") | null = null;
let pdfDoc = $state<PDFDocumentProxy | null>(null);
let lastObservedPage = $state(1);
let zoom = $state(1.0);
let baseScale = $state(1.0);
let imageZoom = $state(1.0);
let imagePanX = $state(0);
let imagePanY = $state(0);
let imageDragStartX = $state(0);
let imageDragStartY = $state(0);
let imageDragOriginX = $state(0);
let imageDragOriginY = $state(0);
let imageDragging = $state(false);
let pdfDragging = $state(false);
let pdfDragStartX = $state(0);
let pdfDragStartY = $state(0);
let pdfDragOriginLeft = $state(0);
let pdfDragOriginTop = $state(0);
let canvasRefs = $state<(HTMLCanvasElement | null)[]>([]);
let scrollContainerRef = $state<HTMLDivElement | null>(null);
let officePreviewRef = $state<HTMLDivElement | null>(null);
let isRendering = $state(false);
let pdfWorkerUrlPromise: Promise<string> | null = null;
let pageObserver: IntersectionObserver | null = null;
let isProgrammaticScroll = $state(false);
let programmaticScrollResetTimeout: ReturnType<typeof setTimeout> | null = null;
let pdfInitialRenderInProgress = false;
let suppressNextPdfRenderEffect = false;

// PDF render concurrency tracking
let pdfRenderVersion = 0;
let activeRenderTasks = new Map<number, { cancel: () => void }>();
let pinchZoomFrame: number | null = null;
let pendingPinchZoom = 1;

$effect(() => {
	if (open && (artifactId || previewUrl)) {
		fileType = determinePreviewFileType(mimeType, filename);
		void fetchFile();
	}
});

$effect(() => {
	if (!(fileType === "image" && content)) {
		if (objectUrl) {
			URL.revokeObjectURL(objectUrl);
			objectUrl = null;
		}
		return;
	}

	const nextObjectUrl = URL.createObjectURL(content);
	objectUrl = nextObjectUrl;

	return () => {
		URL.revokeObjectURL(nextObjectUrl);
		if (objectUrl === nextObjectUrl) {
			objectUrl = null;
		}
	};
});

$effect(() => {
	if (
		fileType !== "pptx" ||
		!htmlContent ||
		!officePreviewRef ||
		currentPage < 1 ||
		totalPages <= 0
	) {
		return;
	}

	const targetPage = Math.max(1, Math.min(currentPage, totalPages));
	void tick().then(() => {
		if (fileType !== "pptx" || !officePreviewRef || currentPage !== targetPage) {
			return;
		}
		const slide = officePreviewRef.querySelectorAll<HTMLElement>(".pptx-slide")[
			targetPage - 1
		];
		slide?.scrollIntoView?.({ behavior: "smooth", block: "start" });
	});
});

// PDF.js rendering effect
$effect(() => {
	if (fileType === "pdf" && content) {
		renderPdf(content);
	}
});

// Re-render all pages when zoom changes
$effect(() => {
	if (fileType === "pdf" && pdfDoc && canvasRefs.length > 0) {
		if (suppressNextPdfRenderEffect) {
			suppressNextPdfRenderEffect = false;
			return;
		}
		const activeZoom = zoom;
		void renderAllPages(activeZoom);
	}
});

// Cleanup PDF render tasks when file closes or changes
$effect(() => {
	if (!open) {
		cancelActivePdfRenderTasks();
		pdfRenderVersion++;
	}
});

// Scroll to page when currentPage changes externally
$effect(() => {
	if (
		fileType === "pdf" &&
		canvasRefs.length > 0 &&
		currentPage !== lastObservedPage &&
		browser
	) {
		const targetPage = Math.max(1, Math.min(currentPage, totalPages));
		const canvas = canvasRefs[targetPage - 1];
		if (canvas?.parentElement) {
			if (programmaticScrollResetTimeout) {
				clearTimeout(programmaticScrollResetTimeout);
				programmaticScrollResetTimeout = null;
			}
			isProgrammaticScroll = true;
			canvas.parentElement.scrollIntoView?.({
				behavior: "auto",
				block: "start",
			});
			lastObservedPage = targetPage;
			// Keep guard active long enough for observer callbacks
			programmaticScrollResetTimeout = setTimeout(() => {
				isProgrammaticScroll = false;
				programmaticScrollResetTimeout = null;
			}, 120);
		}
	}
});

// Setup IntersectionObserver for page tracking
$effect(() => {
	if (
		fileType === "pdf" &&
		scrollContainerRef &&
		canvasRefs.length > 0 &&
		browser
	) {
		setupPageObserver();
	}
	return () => {
		if (pageObserver) {
			pageObserver.disconnect();
			pageObserver = null;
		}
		if (programmaticScrollResetTimeout) {
			clearTimeout(programmaticScrollResetTimeout);
			programmaticScrollResetTimeout = null;
		}
		isProgrammaticScroll = false;
	};
});

$effect(() => {
	if (!(browser && fileType === "pdf" && scrollContainerRef)) {
		if (pinchZoomFrame !== null) {
			cancelAnimationFrame(pinchZoomFrame);
			pinchZoomFrame = null;
		}
		return;
	}

	const node = scrollContainerRef;
	let pinchActive = false;
	let pinchStartDistance = 0;
	let pinchStartZoom = zoom;

	const flushPendingPinchZoom = () => {
		pinchZoomFrame = null;
		setZoomLevel(pendingPinchZoom);
	};

	const stopPinch = () => {
		pinchActive = false;
		pinchStartDistance = 0;
		pinchStartZoom = zoom;
	};

	const handleTouchStart = (event: TouchEvent) => {
		if (event.touches.length !== 2) return;
		pinchActive = true;
		pinchStartDistance = getTouchDistance(event.touches);
		pinchStartZoom = zoom;
		if (pinchZoomFrame !== null) {
			cancelAnimationFrame(pinchZoomFrame);
			pinchZoomFrame = null;
		}
	};

	const handleTouchMove = (event: TouchEvent) => {
		if (!pinchActive || event.touches.length !== 2 || pinchStartDistance <= 0) {
			return;
		}

		event.preventDefault();
		pendingPinchZoom =
			pinchStartZoom * (getTouchDistance(event.touches) / pinchStartDistance);

		if (pinchZoomFrame === null) {
			pinchZoomFrame = requestAnimationFrame(flushPendingPinchZoom);
		}
	};

	const handleTouchEnd = (event: TouchEvent) => {
		if (event.touches.length < 2) {
			stopPinch();
		}
	};

	node.addEventListener("touchstart", handleTouchStart, { passive: true });
	node.addEventListener("touchmove", handleTouchMove, { passive: false });
	node.addEventListener("touchend", handleTouchEnd);
	node.addEventListener("touchcancel", handleTouchEnd);

	return () => {
		node.removeEventListener("touchstart", handleTouchStart);
		node.removeEventListener("touchmove", handleTouchMove);
		node.removeEventListener("touchend", handleTouchEnd);
		node.removeEventListener("touchcancel", handleTouchEnd);
		stopPinch();
		if (pinchZoomFrame !== null) {
			cancelAnimationFrame(pinchZoomFrame);
			pinchZoomFrame = null;
		}
	};
});

async function renderHighlightedPreviewText(content: string) {
	return renderHighlightedText(
		content,
		getPreviewLanguage(mimeType, filename),
		browser
			? (document?.documentElement?.classList.contains("dark") ?? false)
			: false,
	);
}

async function loadPdfWorkerUrl() {
	if (!pdfWorkerUrlPromise) {
		pdfWorkerUrlPromise = import(
			"pdfjs-dist/build/pdf.worker.min.mjs?url"
		).then((module) => module.default);
	}

	return pdfWorkerUrlPromise;
}

async function fetchFile() {
	isLoading = true;
	error = null;
	content = null;
	textContent = null;
	highlightedTextHtml = null;
	markdownHtml = null;
	csvTableHtml = null;
	htmlContent = null;
	htmlPreviewSrcdoc = null;
	pdfDoc = null;
	currentPage = 1;
	totalPages = 0;
	zoom = 1.0;
	imageZoom = 1.0;
	imagePanX = 0;
	imagePanY = 0;
	imageDragging = false;
	canvasRefs = [];

	// Cancel any in-progress PDF renders
	cancelActivePdfRenderTasks();
	pdfRenderVersion++;

	// Disconnect observer
	if (pageObserver) {
		pageObserver.disconnect();
		pageObserver = null;
	}

	try {
		const resolvedPreviewUrl =
			previewUrl ??
			(artifactId ? `/api/knowledge/${artifactId}/preview` : null);
		if (!resolvedPreviewUrl) {
			throw new Error("Preview not available");
		}
		const response = await fetch(resolvedPreviewUrl);

		if (!response.ok) {
			if (response.status === 404) {
				throw new Error("File not found");
			}
			throw new Error("Failed to load file");
		}

		const blob = await response.blob();
		content = blob;

		// Defensive override: re-derive fileType from actual filename when MIME is generic or missing
		const mime = mimeType?.toLowerCase() ?? "";
		if (
			!mime ||
			mime === "application/octet-stream" ||
			mime === "application/download"
		) {
			fileType = determinePreviewFileType(null, filename);
		}

		// Defensive override: if text branch was chosen, check blob magic for binary formats
		if (fileType === "text") {
			const peekBuffer = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
			const peekStr = new TextDecoder("utf-8").decode(peekBuffer);
			if (peekStr.startsWith("%PDF-")) {
				fileType = "pdf";
			} else if (
				peekBuffer[0] === 0x50 &&
				peekBuffer[1] === 0x4b &&
				peekBuffer[2] === 0x03 &&
				peekBuffer[3] === 0x04 &&
				filename.toLowerCase().endsWith(".pptx")
			) {
				fileType = "pptx";
			}
		}

		if (fileType === "text") {
			textContent = await blob.text();
			if (mimeType === "text/csv" || filename.toLowerCase().endsWith(".csv")) {
				csvTableHtml = parseCsvToHtmlTable(textContent);
			} else if (isMarkdownPreview()) {
				markdownHtml = await renderMarkdownPreview(textContent);
			} else {
				highlightedTextHtml = await renderHighlightedPreviewText(textContent);
			}
		} else if (fileType === "docx") {
			await renderDocx(blob);
		} else if (fileType === "xlsx") {
			await renderXlsx(blob);
		} else if (fileType === "pptx") {
			await renderPptx(blob);
		} else if (fileType === "odt") {
			await renderOdt(blob);
		} else if (fileType === "html") {
			textContent = await blob.text();
			htmlPreviewSrcdoc = buildStaticHtmlPreview(textContent);
		}
	} catch (err) {
		error = err instanceof Error ? err.message : "Failed to load file";
	} finally {
		isLoading = false;
	}
}

function buildStaticHtmlPreview(content: string): string {
	const { html, css } = extractLocalStyleBlocks(content);
	const safeHtml = sanitizeHtml(html, {
		allowStyleAttributes: true,
	});
	const safeCss = sanitizeLocalCss(css);
	const styleBlock = safeCss ? `<style>${safeCss}</style>` : "";
	return `<!doctype html><html><head><base target="_blank"><meta charset="utf-8">${styleBlock}</head><body>${safeHtml}</body></html>`;
}

function extractLocalStyleBlocks(content: string): { html: string; css: string } {
	let css = "";
	const html = content.replace(
		/<style\b[^>]*>([\s\S]*?)<\/style>/gi,
		(_match, styleContent: string) => {
			css += `\n${styleContent}`;
			return "";
		},
	);
	return { html, css };
}

function sanitizeLocalCss(css: string): string {
	return css
		.replace(/@import[^;]+;?/gi, "")
		.replace(/url\s*\([^)]*\)/gi, "none")
		.replace(/expression\s*\([^)]*\)/gi, "")
		.replace(/javascript:/gi, "")
		.replace(/[<>]/g, "")
		.trim();
}

function isMarkdownPreview(): boolean {
	return mimeType === "text/markdown" || filename.toLowerCase().endsWith(".md");
}

async function renderMarkdownPreview(content: string) {
	return renderMarkdown(
		content,
		browser
			? (document?.documentElement?.classList.contains("dark") ?? false)
			: false,
	);
}

/**
 * Cancel all active PDF render tasks to prevent canvas reuse errors.
 */
function cancelActivePdfRenderTasks() {
	for (const [pageNum, task] of activeRenderTasks) {
		try {
			task.cancel();
		} catch {
			// Ignore cancellation errors
		}
	}
	activeRenderTasks.clear();
}

async function renderPdf(blob: Blob) {
	if (!browser) return;

	// Cancel any in-progress renders and increment version
	cancelActivePdfRenderTasks();
	pdfRenderVersion++;
	const currentVersion = pdfRenderVersion;

	try {
		isRendering = true;
		pdfInitialRenderInProgress = true;

		// Load PDF.js dynamically (avoids SSR issues)
		if (!pdfjsLib) {
			pdfjsLib = await import("pdfjs-dist");
			pdfjsLib.GlobalWorkerOptions.workerSrc = await loadPdfWorkerUrl();
		}

		// Bail if a newer render cycle started during async loading
		if (pdfRenderVersion !== currentVersion) return;

		const arrayBuffer = await blob.arrayBuffer();
		suppressNextPdfRenderEffect = true;
		pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
		totalPages = pdfDoc.numPages;
		// Pre-size canvasRefs so Svelte 5 array reactivity fires before template render
		canvasRefs = new Array(totalPages).fill(null);
		currentPage = 1;
		lastObservedPage = 1;

		// Bail if a newer render cycle started during document loading
		if (pdfRenderVersion !== currentVersion) return;

		await tick();
		// Allow flex layout to settle before measuring container width
		await new Promise((resolve) => requestAnimationFrame(resolve));
		if (pdfRenderVersion !== currentVersion) return;

		// Set zoom to "fit to width" based on container and first page
		if (scrollContainerRef && totalPages > 0) {
			const page = await pdfDoc.getPage(1);
			const unscaledViewport = page.getViewport({ scale: 1.0 });
			const containerWidth = scrollContainerRef.clientWidth - 48; // 1.5rem padding * 2
			if (containerWidth > 0 && unscaledViewport.width > 0) {
				baseScale = containerWidth / unscaledViewport.width;
			} else {
				baseScale = 1.0;
			}
			zoom = 1.0;
		}

		const firstCanvas = canvasRefs[0];
		if (firstCanvas) {
			await renderPage(1, zoom, firstCanvas, currentVersion);
		}
		if (pdfRenderVersion !== currentVersion) return;
		isRendering = false;
		pdfInitialRenderInProgress = false;
		void renderRemainingPages(2, zoom, currentVersion);
	} catch (err) {
		error = "Failed to render PDF file";
		console.error("PDF render error:", err);
	} finally {
		pdfInitialRenderInProgress = false;
		if (pdfRenderVersion === currentVersion) {
			isRendering = false;
		}
	}
}

async function renderAllPages(zoomLevel = zoom, version?: number) {
	if (!pdfDoc) return;

	let currentVersion: number;

	if (version !== undefined) {
		currentVersion = version;
	} else {
		cancelActivePdfRenderTasks();
		pdfInitialRenderInProgress = false;
		pdfRenderVersion++;
		currentVersion = pdfRenderVersion;
	}

	try {
		isRendering = true;

		// Render each page
		for (let i = 0; i < totalPages; i++) {
			// Bail if a newer render cycle started
			if (pdfRenderVersion !== currentVersion) return;

			const canvas = canvasRefs[i];
			if (canvas) {
				await renderPage(i + 1, zoomLevel, canvas, currentVersion);
			}
		}

		isRendering = false;
	} catch (err) {
		console.error("Pages render error:", err);
		isRendering = false;
	}
}

async function renderRemainingPages(
	startPage: number,
	zoomLevel: number,
	version: number,
) {
	if (!pdfDoc) return;

	for (let pageNumber = startPage; pageNumber <= totalPages; pageNumber += 1) {
		if (pdfRenderVersion !== version) return;
		const canvas = canvasRefs[pageNumber - 1];
		if (canvas) {
			await renderPage(pageNumber, zoomLevel, canvas, version);
		}
	}
}

async function renderPage(
	pageNum: number,
	zoomLevel: number,
	canvas: HTMLCanvasElement,
	version: number,
) {
	if (!pdfDoc) return;

	// Bail early if stale
	if (pdfRenderVersion !== version) return;

	let renderTask: { promise: Promise<void>; cancel: () => void } | null = null;

	try {
		const page = await pdfDoc.getPage(pageNum);

		// Bail if stale after async getPage
		if (pdfRenderVersion !== version) return;

		// Apply baseScale * zoom to fit container at 100% zoom
		const actualScale = baseScale * zoomLevel;
		const viewport = page.getViewport({ scale: actualScale });
		const context = canvas.getContext("2d");

		if (!context) return;

		canvas.width = viewport.width;
		canvas.height = viewport.height;

		// Create and register render task
		renderTask = page.render({
			canvasContext: context,
			viewport: viewport,
		});
		activeRenderTasks.set(pageNum, renderTask);

		await renderTask.promise;
	} catch (err) {
		// Ignore cancellation errors - these are expected when zooming rapidly
		if (
			err instanceof Error &&
			(err.name === "RenderingCancelledException" ||
				err.message?.includes("cancelled"))
		) {
			return;
		}
		console.error("Page render error:", err);
	} finally {
		// Always cleanup the task registration
		if (renderTask) {
			activeRenderTasks.delete(pageNum);
		}
	}
}

function setupPageObserver() {
	if (!scrollContainerRef || !browser) return;

	// Disconnect existing observer
	if (pageObserver) {
		pageObserver.disconnect();
	}

	// Create new observer
	pageObserver = new IntersectionObserver(
		(entries) => {
			// Skip observer updates during programmatic scroll to prevent loops
			if (isProgrammaticScroll) return;

			// Find the most visible page
			let mostVisiblePage = 1;
			let maxVisibility = 0;

			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					const pageNum = Number.parseInt(
						(entry.target as HTMLElement).dataset.pageNum ?? "1",
						10,
					);
					const visibility = entry.intersectionRatio;

					if (visibility > maxVisibility) {
						maxVisibility = visibility;
						mostVisiblePage = pageNum;
					}
				}
			});

			if (maxVisibility > 0) {
				if (currentPage !== mostVisiblePage) {
					lastObservedPage = mostVisiblePage;
					currentPage = mostVisiblePage;
				}
			}
		},
		{
			root: scrollContainerRef,
			threshold: [0, 0.25, 0.5, 0.75, 1.0],
		},
	);

	// Observe all page containers
	canvasRefs.forEach((canvas, index) => {
		if (canvas) {
			const container = canvas.parentElement;
			if (container) {
				container.dataset.pageNum = String(index + 1);
				pageObserver?.observe(container);
			}
		}
	});
}

function clampZoomLevel(nextZoom: number): number {
	return Math.min(3.0, Math.max(0.5, Number.parseFloat(nextZoom.toFixed(2))));
}

function setZoomLevel(nextZoom: number) {
	const clampedZoom = clampZoomLevel(nextZoom);
	if (Math.abs(clampedZoom - zoom) < 0.01) return;
	zoom = clampedZoom;
	if (
		fileType === "pdf" &&
		pdfDoc &&
		canvasRefs.length > 0 &&
		pdfInitialRenderInProgress
	) {
		suppressNextPdfRenderEffect = false;
		void renderAllPages(clampedZoom);
	}
}

function getTouchDistance(touches: TouchList): number {
	if (touches.length < 2) return 0;
	const deltaX = touches[0].clientX - touches[1].clientX;
	const deltaY = touches[0].clientY - touches[1].clientY;
	return Math.hypot(deltaX, deltaY);
}

function zoomIn() {
	setZoomLevel(zoom + 0.25);
}

function zoomOut() {
	setZoomLevel(zoom - 0.25);
}

function resetZoom() {
	setZoomLevel(1.0);
}

function clampImageZoom(nextZoom: number): number {
	return Math.min(4, Math.max(0.5, Number.parseFloat(nextZoom.toFixed(2))));
}

function setImageZoomLevel(nextZoom: number) {
	imageZoom = clampImageZoom(nextZoom);
	if (imageZoom <= 1) {
		imagePanX = 0;
		imagePanY = 0;
	}
}

function zoomImageIn() {
	setImageZoomLevel(imageZoom + 0.25);
}

function zoomImageOut() {
	setImageZoomLevel(imageZoom - 0.25);
}

function fitImage() {
	imageZoom = 1;
	imagePanX = 0;
	imagePanY = 0;
}

function handleImageWheel(event: WheelEvent) {
	if (imageZoom <= 1 && !event.ctrlKey && !event.metaKey) return;
	event.preventDefault();
	setImageZoomLevel(imageZoom + (event.deltaY < 0 ? 0.25 : -0.25));
}

function handleImagePointerDown(event: PointerEvent) {
	if (imageZoom <= 1) return;
	event.preventDefault();
	imageDragging = true;
	imageDragStartX = event.clientX;
	imageDragStartY = event.clientY;
	imageDragOriginX = imagePanX;
	imageDragOriginY = imagePanY;
	(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function handleImagePointerMove(event: PointerEvent) {
	if (!imageDragging) return;
	event.preventDefault();
	imagePanX = imageDragOriginX + event.clientX - imageDragStartX;
	imagePanY = imageDragOriginY + event.clientY - imageDragStartY;
}

function handleImagePointerUp(event: PointerEvent) {
	imageDragging = false;
	(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
}

function clampPdfScrollTop(nextScrollTop: number): number {
	if (!scrollContainerRef) return nextScrollTop;
	const maxScrollTop = Math.max(
		0,
		scrollContainerRef.scrollHeight - scrollContainerRef.clientHeight,
	);
	return Math.min(maxScrollTop, Math.max(0, nextScrollTop));
}

function clampPdfScrollLeft(nextScrollLeft: number): number {
	if (!scrollContainerRef) return nextScrollLeft;
	const maxScrollLeft = Math.max(
		0,
		scrollContainerRef.scrollWidth - scrollContainerRef.clientWidth,
	);
	return Math.min(maxScrollLeft, Math.max(0, nextScrollLeft));
}

function scrollPdfBy(deltaY: number) {
	if (!scrollContainerRef || deltaY === 0) return;
	scrollContainerRef.scrollTop = clampPdfScrollTop(
		scrollContainerRef.scrollTop + deltaY,
	);
}

function handlePdfWheel(event: WheelEvent) {
	if (!scrollContainerRef || Math.abs(event.deltaY) <= Math.abs(event.deltaX))
		return;
	event.preventDefault();
	scrollPdfBy(event.deltaY);
}

function handlePdfScrollKeydown(event: KeyboardEvent) {
	if (!scrollContainerRef) return;
	const pageStep = Math.max(120, scrollContainerRef.clientHeight * 0.86);
	const keyDeltas: Record<string, number> = {
		ArrowDown: 48,
		ArrowUp: -48,
		PageDown: pageStep,
		PageUp: -pageStep,
	};
	if (event.key === "Home") {
		event.preventDefault();
		scrollContainerRef.scrollTop = 0;
		return;
	}
	if (event.key === "End") {
		event.preventDefault();
		scrollContainerRef.scrollTop = clampPdfScrollTop(Number.POSITIVE_INFINITY);
		return;
	}
	const delta = keyDeltas[event.key];
	if (delta === undefined) return;
	event.preventDefault();
	scrollPdfBy(delta);
}

function handlePdfPointerDown(event: PointerEvent) {
	if (!scrollContainerRef || zoom <= 1) return;
	pdfDragging = true;
	pdfDragStartX = event.clientX;
	pdfDragStartY = event.clientY;
	pdfDragOriginLeft = scrollContainerRef.scrollLeft;
	pdfDragOriginTop = scrollContainerRef.scrollTop;
	(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
}

function handlePdfPointerMove(event: PointerEvent) {
	if (!scrollContainerRef || !pdfDragging) return;
	event.preventDefault();
	scrollContainerRef.scrollLeft = clampPdfScrollLeft(
		pdfDragOriginLeft + pdfDragStartX - event.clientX,
	);
	scrollContainerRef.scrollTop = clampPdfScrollTop(
		pdfDragOriginTop + pdfDragStartY - event.clientY,
	);
}

function handlePdfPointerUp(event: PointerEvent) {
	pdfDragging = false;
	(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
}

async function renderDocx(blob: Blob) {
	try {
		const mammoth = await import("mammoth");
		const arrayBuffer = await blob.arrayBuffer();
		const result = await mammoth.convertToHtml({ arrayBuffer });
		htmlContent = result.value;
	} catch (err) {
		error = "Failed to render DOCX file";
	}
}

async function renderXlsx(blob: Blob) {
	try {
		const ExcelJS = await import("exceljs");
		const arrayBuffer = await blob.arrayBuffer();
		const workbook = new ExcelJS.Workbook();
		await workbook.xlsx.load(arrayBuffer);

		let html = '<div class="xlsx-container">';
		workbook.eachSheet((worksheet, sheetId) => {
			const sheetName = worksheet.name || `Sheet ${sheetId}`;
			html += `<div class="sheet"><h4>${sheetName}</h4><table class="xlsx-table">`;

			worksheet.eachRow((row) => {
				html += "<tr>";
				row.eachCell((cell) => {
					const value = cell.value ?? "";
					html += `<td>${value}</td>`;
				});
				html += "</tr>";
			});

			html += "</table></div>";
		});
		html += "</div>";
		htmlContent = html;
	} catch (err) {
		error = "Failed to render XLSX file";
	}
}

async function renderPptx(blob: Blob) {
	try {
		const { PPTXViewer } = await import("pptxviewjs");
		const arrayBuffer = await blob.arrayBuffer();

		// Create a temporary canvas for rendering slides
		const canvas = document.createElement("canvas");
		canvas.width = 1280;
		canvas.height = 720;

		const viewer = new PPTXViewer({
			canvas,
			slideSizeMode: "fit",
			backgroundColor: "#ffffff",
			// Disable the post-load chart re-render timeout; it fires after we call
			// destroy() and throws an uncaught "No PPTX loaded" error.
			autoChartRerenderDelayMs: 0,
		});

		await viewer.loadFile(arrayBuffer);

		const slideCount = viewer.getSlideCount();
		totalPages = slideCount;
		currentPage = 1;
		let html = '<div class="pptx-container">';

		// Render each slide and convert to image
		for (let i = 0; i < slideCount; i++) {
			// goToSlide already calls render() internally; do not call render() again
			await viewer.goToSlide(i);
			const dataUrl = canvas.toDataURL("image/png");
			html += `
					<div class="pptx-slide">
						<div class="pptx-slide-header">Slide ${i + 1} of ${slideCount}</div>
						<img src="${dataUrl}" alt="Slide ${i + 1}" class="pptx-slide-image" />
					</div>
				`;
		}

		html += "</div>";
		htmlContent = html;

		viewer.destroy();
	} catch (err) {
		error = "Failed to render PPTX file";
		console.error("PPTX render error:", err);
	}
}

function renderOdtTextNode(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) {
		return escapeHtml(node.textContent ?? "");
	}

	if (node.nodeType !== Node.ELEMENT_NODE) {
		return "";
	}

	const element = node as Element;
	const children = Array.from(element.childNodes)
		.map(renderOdtTextNode)
		.join("");

	switch (element.localName) {
		case "s": {
			const count = Number.parseInt(element.getAttribute("text:c") ?? "1", 10);
			return "&nbsp;".repeat(Number.isFinite(count) && count > 0 ? count : 1);
		}
		case "tab":
			return "&nbsp;&nbsp;&nbsp;&nbsp;";
		case "line-break":
			return "<br />";
		case "span":
			return children;
		default:
			return children;
	}
}

function renderOdtBlock(node: Node): string {
	if (node.nodeType !== Node.ELEMENT_NODE) {
		return "";
	}

	const element = node as Element;
	const children = Array.from(element.childNodes).map(renderOdtBlock).join("");
	const textChildren = Array.from(element.childNodes)
		.map(renderOdtTextNode)
		.join("");

	switch (element.localName) {
		case "h": {
			const level = Math.min(
				Math.max(
					Number.parseInt(
						element.getAttribute("text:outline-level") ?? "2",
						10,
					),
					1,
				),
				6,
			);
			return `<h${level}>${textChildren}</h${level}>`;
		}
		case "p":
			return `<p>${textChildren}</p>`;
		case "list":
			return `<ul>${children}</ul>`;
		case "list-item":
			return `<li>${children || textChildren}</li>`;
		case "table":
			return `<table>${children}</table>`;
		case "table-row":
			return `<tr>${children}</tr>`;
		case "table-cell":
			return `<td>${children || textChildren}</td>`;
		default:
			return children;
	}
}

async function renderOdt(blob: Blob) {
	try {
		const JSZip = (await import("jszip")).default;
		const arrayBuffer = await blob.arrayBuffer();
		const zip = await JSZip.loadAsync(arrayBuffer);
		const contentEntry = zip.file("content.xml");
		if (!contentEntry) {
			throw new Error("Missing ODT content.xml");
		}

		const xml = await contentEntry.async("string");
		const parsed = new DOMParser().parseFromString(xml, "application/xml");
		if (parsed.querySelector("parsererror")) {
			throw new Error("Invalid ODT XML");
		}

		const officeNs = "urn:oasis:names:tc:opendocument:xmlns:office:1.0";
		const officeTextRoot =
			parsed.getElementsByTagNameNS(officeNs, "text")[0] ??
			parsed.documentElement;
		const html = Array.from(officeTextRoot.childNodes)
			.map(renderOdtBlock)
			.join("");
		htmlContent =
			html.trim().length > 0
				? `<div class="odt-preview">${html}</div>`
				: '<div class="odt-preview"><p>Preview available, but the document contains no readable text.</p></div>';
	} catch (err) {
		error = "Failed to render ODT file";
	}
}

function getObjectUrl(): string | null {
	return objectUrl;
}

function parseCsvToHtmlTable(csvText: string): string {
	const rows: string[][] = [];
	let currentRow: string[] = [];
	let currentCell = "";
	let inQuotes = false;

	for (let i = 0; i < csvText.length; i++) {
		const char = csvText[i];
		const nextChar = csvText[i + 1];

		if (inQuotes) {
			if (char === '"' && nextChar === '"') {
				currentCell += '"';
				i++;
			} else if (char === '"') {
				inQuotes = false;
			} else {
				currentCell += char;
			}
		} else {
			if (char === '"') {
				inQuotes = true;
			} else if (char === ",") {
				currentRow.push(currentCell);
				currentCell = "";
			} else if (char === "\r" && nextChar === "\n") {
				currentRow.push(currentCell);
				rows.push(currentRow);
				currentRow = [];
				currentCell = "";
				i++;
			} else if (char === "\n" || char === "\r") {
				currentRow.push(currentCell);
				rows.push(currentRow);
				currentRow = [];
				currentCell = "";
			} else {
				currentCell += char;
			}
		}
	}

	currentRow.push(currentCell);
	if (currentRow.length > 1 || currentRow[0] !== "" || rows.length === 0) {
		rows.push(currentRow);
	}

	let html = '<table class="csv-table">';
	for (const row of rows) {
		html += "<tr>";
		for (const cell of row) {
			html += `<td>${escapeHtml(cell)}</td>`;
		}
		html += "</tr>";
	}
	html += "</table>";
	return html;
}
function downloadFile() {
	if (!content) return;
	const url = URL.createObjectURL(content);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
</script>

{#if open}
	{#snippet PreviewPanel()}
		<div
			role="region"
			aria-label={filename}
			class:preview-panel={true}
			class:preview-panel-embedded={true}
		>
			<div class:preview-body={true} class:preview-body-embedded={true}>
				{#if isLoading}
					<div class="flex flex-col items-center justify-center py-16 gap-4">
						<div class="spinner"></div>
						<p class="text-sm text-text-muted">{$t('filePreview.loading')}</p>
					</div>
				{:else if error}
					<div class="m-6 rounded-[1rem] border border-danger/30 bg-danger/10 px-4 py-6 text-center">
						<svg class="mx-auto mb-3 text-danger" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
						</svg>
						<p class="text-sm font-sans text-danger mb-2">{error}</p>
						<button
							type="button"
							class="btn-secondary text-sm mt-2"
							onclick={() => void fetchFile()}
						>
							{$t('filePreview.retry')}
						</button>
					</div>
				{:else if fileType === 'unsupported'}
					<div class="m-6 rounded-[1.2rem] border border-dashed border-border bg-surface-page px-6 py-8 text-center">
						<svg class="mx-auto mb-3 text-icon-muted" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>
						</svg>
						<p class="text-sm text-text-muted mb-1">{$t('filePreview.notAvailableType')}</p>
						<p class="text-xs text-text-muted/70 mb-4">{$t('filePreview.downloadToView')}</p>
						{#if content}
							<button
								type="button"
								class="btn-primary text-sm"
								onclick={downloadFile}
							>
								{$t('filePreview.downloadFile')}
							</button>
						{/if}
					</div>
				{:else if fileType === 'pdf'}
					{#if content}
						<div class="pdf-viewer">
							{#if totalPages > 0}
								<DocumentPreviewToolbar
									pageKind="page"
									bind:currentPage
									{totalPages}
									{zoom}
									onZoomIn={zoomIn}
									onZoomOut={zoomOut}
									onResetZoom={resetZoom}
								/>
							{/if}
							<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
							<div
								class="pdf-canvas-container"
								class:pdf-canvas-container-pannable={zoom > 1}
								class:pdf-canvas-container-panning={pdfDragging}
								bind:this={scrollContainerRef}
								role="region"
								tabindex="0"
								aria-label={$t('filePreview.pdfPagesRegion')}
								data-testid="pdf-scroll-region"
								onwheel={handlePdfWheel}
								onkeydown={handlePdfScrollKeydown}
								onpointerdown={handlePdfPointerDown}
								onpointermove={handlePdfPointerMove}
								onpointerup={handlePdfPointerUp}
								onpointercancel={handlePdfPointerUp}
							>
								{#if isRendering}
									<div class="pdf-rendering-overlay">
										<div class="spinner-sm"></div>
									</div>
								{/if}
								<div class="pdf-pages-scroll">
									{#if pdfDoc && totalPages > 0}
										{#each Array(totalPages) as _, i}
											<div class="pdf-page-wrapper">
												<canvas
													bind:this={canvasRefs[i]}
													class="pdf-canvas"
													data-page={i + 1}
												></canvas>
											</div>
										{/each}
									{/if}
								</div>
							</div>
						</div>
					{/if}
				{:else if fileType === 'image'}
					{#if content}
						<DocumentPreviewToolbar
							zoom={imageZoom}
							onZoomIn={zoomImageIn}
							onZoomOut={zoomImageOut}
							onResetZoom={fitImage}
							onFit={fitImage}
						/>
						<div
							class="image-preview-stage"
							class:image-preview-stage-pannable={imageZoom > 1}
							class:image-preview-stage-panning={imageDragging}
							data-testid="image-preview-stage"
							role="region"
							aria-label={`${filename} image preview`}
							onwheel={handleImageWheel}
							onpointerdown={handleImagePointerDown}
							onpointermove={handleImagePointerMove}
							onpointerup={handleImagePointerUp}
							onpointercancel={handleImagePointerUp}
						>
							<img
								src={getObjectUrl()}
								alt={filename}
								class="image-preview-img"
								style:transform={`translate(${imagePanX}px, ${imagePanY}px) scale(${imageZoom})`}
							/>
						</div>
					{/if}
				{:else if fileType === 'text'}
					{#if content}
						<div class="p-6">
							{#if csvTableHtml}
								<div class="csv-table-container">
									{@html sanitizeHtml(csvTableHtml)}
								</div>
							{:else if markdownHtml}
								<div class="markdown-document-preview">
									{@html markdownHtml}
								</div>
							{:else}
								<div class="file-text-preview">
									{@html highlightedTextHtml ?? ''}
								</div>
							{/if}
						</div>
					{/if}
				{:else if fileType === 'html'}
					{#if htmlPreviewSrcdoc}
						<div class="html-preview-shell">
							<iframe
								class="html-preview-frame"
								title={`${filename} preview`}
								sandbox=""
								srcdoc={htmlPreviewSrcdoc}
							></iframe>
						</div>
					{/if}
				{:else if fileType === 'docx' || fileType === 'xlsx' || fileType === 'pptx' || fileType === 'odt'}
					{#if htmlContent}
						{#if fileType === 'pptx' && totalPages > 0}
							<DocumentPreviewToolbar
								pageKind="slide"
								bind:currentPage
								{totalPages}
							/>
						{/if}
						<div class="p-6 docx-preview" bind:this={officePreviewRef}>
							{@html sanitizeHtml(htmlContent)}
						</div>
					{/if}
				{:else}
					<div class="m-6 rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-center">
						<p class="text-sm text-text-muted">{$t('filePreview.notAvailable')}</p>
					</div>
				{/if}
			</div>
		</div>
	{/snippet}

	<div class="preview-embedded-shell">
		{@render PreviewPanel()}
	</div>
{/if}

<style>
	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid color-mix(in srgb, var(--border-default) 50%, transparent);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	:global(.docx-preview) {
		font-family: 'Libre Baskerville', serif;
		line-height: 1.6;
		color: var(--text-primary);
	}

	:global(.docx-preview h1),
	:global(.docx-preview h2),
	:global(.docx-preview h3),
	:global(.docx-preview h4) {
		font-family: 'Nimbus Sans L', sans-serif;
		margin-top: 1.5em;
		margin-bottom: 0.5em;
	}

	:global(.docx-preview p) {
		margin-bottom: 1em;
	}

	:global(.docx-preview ul) {
		margin: 1em 0;
		padding-left: 1.25rem;
		list-style: disc;
	}

	:global(.docx-preview table) {
		width: 100%;
		border-collapse: collapse;
		margin: 1em 0;
	}

	:global(.docx-preview td),
	:global(.docx-preview th) {
		border: 1px solid var(--border-default);
		padding: 0.5em;
		text-align: left;
	}

	:global(.xlsx-container) {
		font-family: 'Nimbus Sans L', sans-serif;
	}

	:global(.xlsx-container .sheet) {
		margin-bottom: 2em;
	}

	:global(.xlsx-container .sheet h4) {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 0.5em;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	:global(.xlsx-table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	:global(.xlsx-table td),
	:global(.xlsx-table th) {
		border: 1px solid var(--border-default);
		padding: 0.5rem 0.75rem;
		text-align: left;
	}

	:global(.xlsx-table tr:first-child td) {
		background: var(--surface-overlay);
		font-weight: 600;
	}

	:global(.xlsx-table tr:nth-child(even)) {
		background: color-mix(in srgb, var(--surface-page) 50%, transparent);
	}

	:global(.pptx-container) {
		font-family: 'Nimbus Sans L', sans-serif;
		min-width: 0;
	}

	:global(.pptx-slide) {
		margin-bottom: 2rem;
		background: var(--surface-elevated);
		border-radius: 0.75rem;
		border: 1px solid var(--border-default);
		overflow: hidden;
		min-width: 0;
	}

	:global(.pptx-slide-header) {
		padding: 0.75rem 1rem;
		background: var(--surface-overlay);
		border-bottom: 1px solid var(--border-default);
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	:global(.pptx-slide-image) {
		display: block;
		width: 100%;
		height: auto;
		background: #ffffff;
	}

	:global(.file-text-preview .shiki),
	:global(.file-text-preview pre) {
		margin: 0;
		border: 1px solid var(--border-default);
		border-radius: 1rem;
		padding: 1rem;
		overflow-x: hidden;
		font-size: 0.875rem;
		line-height: 1.6;
		white-space: pre-wrap;
		overflow-wrap: break-word;
		word-break: break-word;
	}

	:global(.file-text-preview code) {
		font-family: var(--font-mono, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace);
		white-space: pre-wrap;
		overflow-wrap: break-word;
		word-break: break-word;
	}

	:global(.csv-table-container) {
		font-family: 'Nimbus Sans L', sans-serif;
		overflow-x: auto;
	}
	:global(.csv-table) {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}
	:global(.csv-table td),
	:global(.csv-table th) {
		border: 1px solid var(--border-default);
		padding: 0.5rem 0.75rem;
		text-align: left;
	}
	:global(.csv-table tr:first-child td) {
		background: var(--surface-overlay);
		font-weight: 600;
	}
	:global(.csv-table tr:nth-child(even)) {
		background: color-mix(in srgb, var(--surface-page) 50%, transparent);
	}

	.html-preview-shell {
		display: flex;
		min-height: 0;
		flex: 1 1 auto;
		padding: 1rem;
		background: var(--surface-page);
	}

	.html-preview-frame {
		min-height: 62vh;
		width: 100%;
		border: 1px solid var(--border-default);
		border-radius: 0.5rem;
		background: #ffffff;
	}

	.image-preview-stage {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 52vh;
		overflow: hidden;
		padding: 1rem;
		background: var(--surface-page);
		cursor: default;
		touch-action: pan-y;
	}

	.image-preview-stage-pannable {
		cursor: grab;
		touch-action: none;
	}

	.image-preview-stage-panning {
		cursor: grabbing;
		user-select: none;
	}

	.image-preview-img {
		display: block;
		max-width: 100%;
		max-height: 72vh;
		object-fit: contain;
		border-radius: 0.5rem;
		box-shadow: var(--shadow-md);
		transform-origin: center center;
		transition: transform var(--duration-fast) ease;
	}

	/* The embedded variant participates in a flex layout chain.
	   Do NOT add height: 100% here or in .preview-panel-embedded /
	   .preview-body-embedded. Percentage height requires an ancestor
	   with an explicit height property; flexbox-computed heights do
	   not count, so the percentage collapses to auto and overflow
	   never triggers scrollbars. Use flex: 1 1 auto throughout. */
	.preview-embedded-shell {
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
		min-width: 0;
		background: var(--surface-page);
	}

	.preview-panel {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
		background: var(--surface-elevated);
	}

	.preview-panel-embedded {
		flex: 1 1 auto;
		border: none;
		background: var(--surface-page);
		min-height: 0;
	}

	.preview-body {
		min-height: 0;
		min-width: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
	}

	.preview-body-embedded {
		flex: 1 1 auto;
		overflow-y: auto;
		touch-action: pan-y;
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}

	/* PDF Viewer Styles */
	.pdf-viewer {
		display: flex;
		flex-direction: column;
		background: var(--surface-page);
		flex: 1 1 auto;
		min-height: 0;
		min-width: 0;
	}

	.pdf-canvas-container {
		flex: 1 1 auto;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		width: 100%;
		padding: 1rem;
		overflow: auto;
		min-height: 0;
		position: relative;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		touch-action: pan-y;
	}

	.pdf-canvas-container-pannable {
		cursor: grab;
		touch-action: none;
	}

	.pdf-canvas-container-panning {
		cursor: grabbing;
		user-select: none;
	}

	.pdf-canvas-container:focus {
		outline: none;
	}

	.pdf-canvas-container:focus-visible {
		box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--focus-ring) 74%, transparent 26%);
	}

	.pdf-pages-scroll {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		width: 100%;
	}

	.pdf-page-wrapper {
		display: flex;
		justify-content: center;
		width: fit-content;
		min-width: 100%;
	}

	.pdf-canvas {
		display: block;
		max-width: none;
		width: auto;
		height: auto;
		box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
		background: white;
	}

	.pdf-rendering-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.8);
		z-index: 10;
	}

	.spinner-sm {
		width: 24px;
		height: 24px;
		border: 2px solid color-mix(in srgb, var(--border-default) 50%, transparent);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	:global(.btn-icon-bare:disabled) {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
