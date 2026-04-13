<script lang="ts">
	import { browser } from '$app/environment';
	import {
		determinePreviewFileType,
		getPreviewLanguage,
		type PreviewFileType,
	} from '$lib/utils/file-preview';
	import { sanitizeHtml } from '$lib/utils/html-sanitizer';

	type MarkdownModule = typeof import('$lib/services/markdown');

	let {
		open,
		artifactId,
		previewUrl = null,
		filename,
		mimeType,
		variant = 'modal',
		showHeader = true,
		onClose,
		currentPage = $bindable(1),
		totalPages = $bindable(0),
	}: {
		open: boolean;
		artifactId: string | null;
		previewUrl?: string | null;
		filename: string;
		mimeType: string | null;
		variant?: 'modal' | 'embedded';
		showHeader?: boolean;
		onClose: () => void;
		currentPage?: number;
		totalPages?: number;
	} = $props();

	let content = $state<Blob | null>(null);
	let textContent = $state<string | null>(null);
	let highlightedTextHtml = $state<string | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let htmlContent = $state<string | null>(null);
	let fileType = $state<PreviewFileType>('unsupported');
	let objectUrl = $state<string | null>(null);

	// PDF.js state (loaded dynamically to avoid SSR issues)
	let pdfjsLib: typeof import('pdfjs-dist') | null = null;
	let pdfDoc = $state<any>(null);
	let lastObservedPage = $state(1);
	let zoom = $state(1.0);
	let baseScale = $state(1.0);
	let canvasRefs = $state<(HTMLCanvasElement | null)[]>([]);
	let scrollContainerRef = $state<HTMLDivElement | null>(null);
	let isRendering = $state(false);
	let isEmbedded = $derived(variant === 'embedded');
	let titleElementId = $derived(`file-preview-title-${artifactId ?? filename.replaceAll(/[^a-zA-Z0-9_-]/g, '-')}`);
	let markdownModulePromise: Promise<MarkdownModule> | null = null;
	let pdfWorkerUrlPromise: Promise<string> | null = null;
	let pageObserver: IntersectionObserver | null = null;
	let isProgrammaticScroll = $state(false);
	let programmaticScrollResetTimeout: ReturnType<typeof setTimeout> | null = null;

	// PDF render concurrency tracking
	let pdfRenderVersion = 0;
	let activeRenderTasks = new Map<number, { cancel: () => void }>();

	const fileTypeIcons: Record<string, string> = {
		pdf: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10 13v-1a2 2 0 0 1 2-2h4"/><path d="M10 13v-1a2 2 0 0 0-2-2H4"/><line x1="10" y1="13" x2="10" y2="18"/></svg>`,
		docx: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
		xlsx: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>`,
		pptx: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="12" width="8" height="6" rx="1"/></svg>`,
		odt: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8"/><path d="M8 17h6"/></svg>`,
		image: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
		text: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
		unsupported: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`,
	};

	$effect(() => {
		if (open && (artifactId || previewUrl)) {
			fileType = determinePreviewFileType(mimeType, filename);
			void fetchFile();
		}
	});

	$effect(() => {
		if (!(fileType === 'image' && content)) {
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

	// PDF.js rendering effect
	$effect(() => {
		if (fileType === 'pdf' && content) {
			renderPdf(content);
		}
	});

	// Re-render all pages when zoom changes
	$effect(() => {
		if (fileType === 'pdf' && pdfDoc && canvasRefs.length > 0) {
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
		if (fileType === 'pdf' && canvasRefs.length > 0 && currentPage !== lastObservedPage && browser) {
			const targetPage = Math.max(1, Math.min(currentPage, totalPages));
			const canvas = canvasRefs[targetPage - 1];
			if (canvas && canvas.parentElement) {
				if (programmaticScrollResetTimeout) {
					clearTimeout(programmaticScrollResetTimeout);
					programmaticScrollResetTimeout = null;
				}
				isProgrammaticScroll = true;
				canvas.parentElement.scrollIntoView({ behavior: 'auto', block: 'start' });
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
		if (fileType === 'pdf' && scrollContainerRef && canvasRefs.length > 0 && browser) {
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

	async function loadMarkdownModule() {
		if (!markdownModulePromise) {
			markdownModulePromise = import('$lib/services/markdown');
		}

		return markdownModulePromise;
	}

	async function renderHighlightedPreviewText(content: string) {
		const { renderHighlightedText } = await loadMarkdownModule();
		return renderHighlightedText(
			content,
			getPreviewLanguage(mimeType, filename),
			browser ? document?.documentElement?.classList.contains('dark') ?? false : false
		);
	}

	async function loadPdfWorkerUrl() {
		if (!pdfWorkerUrlPromise) {
			pdfWorkerUrlPromise = import('pdfjs-dist/build/pdf.worker.min.mjs?url').then(
				(module) => module.default
			);
		}

		return pdfWorkerUrlPromise;
	}

	async function fetchFile() {
		isLoading = true;
		error = null;
		content = null;
		textContent = null;
		highlightedTextHtml = null;
		htmlContent = null;
		pdfDoc = null;
		currentPage = 1;
		totalPages = 0;
		zoom = 1.0;
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
				previewUrl ?? (artifactId ? `/api/knowledge/${artifactId}/preview` : null);
			if (!resolvedPreviewUrl) {
				throw new Error('Preview not available');
			}
			const response = await fetch(resolvedPreviewUrl);
			
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error('File not found');
				}
				throw new Error('Failed to load file');
			}

			const blob = await response.blob();
			content = blob;

			if (fileType === 'text') {
				textContent = await blob.text();
				highlightedTextHtml = await renderHighlightedPreviewText(textContent);
			} else if (fileType === 'docx') {
				await renderDocx(blob);
			} else if (fileType === 'xlsx') {
				await renderXlsx(blob);
			} else if (fileType === 'pptx') {
				await renderPptx(blob);
			} else if (fileType === 'odt') {
				await renderOdt(blob);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load file';
		} finally {
			isLoading = false;
		}
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

			// Load PDF.js dynamically (avoids SSR issues)
			if (!pdfjsLib) {
				pdfjsLib = await import('pdfjs-dist');
				pdfjsLib.GlobalWorkerOptions.workerSrc = await loadPdfWorkerUrl();
			}

			// Bail if a newer render cycle started during async loading
			if (pdfRenderVersion !== currentVersion) return;

			const arrayBuffer = await blob.arrayBuffer();
			pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
			totalPages = pdfDoc.numPages;
			currentPage = 1;
			lastObservedPage = 1;

			// Bail if a newer render cycle started during document loading
			if (pdfRenderVersion !== currentVersion) return;

			// Set zoom to "fit to width" based on container and first page
			if (scrollContainerRef && totalPages > 0) {
				const page = await pdfDoc.getPage(1);
				// Bail if stale
				if (pdfRenderVersion !== currentVersion) return;

				const unscaledViewport = page.getViewport({ scale: 1.0 });
				const containerWidth = scrollContainerRef.clientWidth - 48; // 1.5rem padding * 2
				if (containerWidth > 0 && unscaledViewport.width > 0) {
					baseScale = containerWidth / unscaledViewport.width;
					zoom = 1.0;
				}
			}

			// Render all pages
			await renderAllPages(zoom, currentVersion);

		} catch (err) {
			error = 'Failed to render PDF file';
			console.error('PDF render error:', err);
		} finally {
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
			console.error('Pages render error:', err);
			isRendering = false;
		}
	}

	async function renderPage(
		pageNum: number,
		zoomLevel: number,
		canvas: HTMLCanvasElement,
		version: number
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
			const context = canvas.getContext('2d');

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
				(err.name === 'RenderingCancelledException' ||
					err.message?.includes('cancelled'))
			) {
				return;
			}
			console.error('Page render error:', err);
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
							(entry.target as HTMLElement).dataset.pageNum ?? '1',
							10
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
			}
		);
		
		// Observe all page containers
		canvasRefs.forEach((canvas, index) => {
			if (canvas) {
				const container = canvas.parentElement;
				if (container) {
					container.dataset.pageNum = String(index + 1);
					pageObserver!.observe(container);
				}
			}
		});
	}

	function zoomIn() {
		zoom = Math.min(zoom + 0.25, 3.0);
	}

	function zoomOut() {
		zoom = Math.max(zoom - 0.25, 0.5);
	}

	function resetZoom() {
		zoom = 1.0;
	}

	async function renderDocx(blob: Blob) {
		try {
			const mammoth = await import('mammoth');
			const arrayBuffer = await blob.arrayBuffer();
			const result = await mammoth.convertToHtml({ arrayBuffer });
			htmlContent = result.value;
		} catch (err) {
			error = 'Failed to render DOCX file';
		}
	}

	async function renderXlsx(blob: Blob) {
		try {
			const ExcelJS = await import('exceljs');
			const arrayBuffer = await blob.arrayBuffer();
			const workbook = new ExcelJS.Workbook();
			await workbook.xlsx.load(arrayBuffer);
			
			let html = '<div class="xlsx-container">';
			workbook.eachSheet((worksheet, sheetId) => {
				const sheetName = worksheet.name || `Sheet ${sheetId}`;
				html += `<div class="sheet"><h4>${sheetName}</h4><table class="xlsx-table">`;
				
				worksheet.eachRow((row) => {
					html += '<tr>';
					row.eachCell((cell) => {
						const value = cell.value ?? '';
						html += `<td>${value}</td>`;
					});
					html += '</tr>';
				});
				
				html += '</table></div>';
			});
			html += '</div>';
			htmlContent = html;
		} catch (err) {
			error = 'Failed to render XLSX file';
		}
	}

	async function renderPptx(blob: Blob) {
		try {
			const { PPTXViewer } = await import('pptxviewjs');
			const arrayBuffer = await blob.arrayBuffer();
			
			// Create a temporary canvas for rendering slides
			const canvas = document.createElement('canvas');
			canvas.width = 1280;
			canvas.height = 720;
			
			const viewer = new PPTXViewer({
				canvas,
				slideSizeMode: 'fit',
				backgroundColor: '#ffffff'
			});
			
			await viewer.loadFile(arrayBuffer);
			
			const slideCount = viewer.getSlideCount();
			let html = '<div class="pptx-container">';
			
			// Render each slide and convert to image
			for (let i = 0; i < slideCount; i++) {
				await viewer.goToSlide(i);
				await viewer.render();
				const dataUrl = canvas.toDataURL('image/png');
				html += `
					<div class="pptx-slide">
						<div class="pptx-slide-header">Slide ${i + 1} of ${slideCount}</div>
						<img src="${dataUrl}" alt="Slide ${i + 1}" class="pptx-slide-image" />
					</div>
				`;
			}
			
			html += '</div>';
			htmlContent = html;
			
			viewer.destroy();
		} catch (err) {
			error = 'Failed to render PPTX file';
		}
	}

	function escapeHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
	}

	function renderOdtTextNode(node: Node): string {
		if (node.nodeType === Node.TEXT_NODE) {
			return escapeHtml(node.textContent ?? '');
		}

		if (node.nodeType !== Node.ELEMENT_NODE) {
			return '';
		}

		const element = node as Element;
		const children = Array.from(element.childNodes).map(renderOdtTextNode).join('');

		switch (element.localName) {
			case 's': {
				const count = Number.parseInt(element.getAttribute('text:c') ?? '1', 10);
				return '&nbsp;'.repeat(Number.isFinite(count) && count > 0 ? count : 1);
			}
			case 'tab':
				return '&nbsp;&nbsp;&nbsp;&nbsp;';
			case 'line-break':
				return '<br />';
			case 'span':
				return children;
			default:
				return children;
		}
	}

	function renderOdtBlock(node: Node): string {
		if (node.nodeType !== Node.ELEMENT_NODE) {
			return '';
		}

		const element = node as Element;
		const children = Array.from(element.childNodes).map(renderOdtBlock).join('');
		const textChildren = Array.from(element.childNodes).map(renderOdtTextNode).join('');

		switch (element.localName) {
			case 'h': {
				const level = Math.min(
					Math.max(Number.parseInt(element.getAttribute('text:outline-level') ?? '2', 10), 1),
					6
				);
				return `<h${level}>${textChildren}</h${level}>`;
			}
			case 'p':
				return `<p>${textChildren}</p>`;
			case 'list':
				return `<ul>${children}</ul>`;
			case 'list-item':
				return `<li>${children || textChildren}</li>`;
			case 'table':
				return `<table>${children}</table>`;
			case 'table-row':
				return `<tr>${children}</tr>`;
			case 'table-cell':
				return `<td>${children || textChildren}</td>`;
			default:
				return children;
		}
	}

	async function renderOdt(blob: Blob) {
		try {
			const JSZip = (await import('jszip')).default;
			const arrayBuffer = await blob.arrayBuffer();
			const zip = await JSZip.loadAsync(arrayBuffer);
			const contentEntry = zip.file('content.xml');
			if (!contentEntry) {
				throw new Error('Missing ODT content.xml');
			}

			const xml = await contentEntry.async('string');
			const parsed = new DOMParser().parseFromString(xml, 'application/xml');
			if (parsed.querySelector('parsererror')) {
				throw new Error('Invalid ODT XML');
			}

			const officeNs = 'urn:oasis:names:tc:opendocument:xmlns:office:1.0';
			const officeTextRoot =
				parsed.getElementsByTagNameNS(officeNs, 'text')[0] ?? parsed.documentElement;
			const html = Array.from(officeTextRoot.childNodes).map(renderOdtBlock).join('');
			htmlContent =
				html.trim().length > 0
					? `<div class="odt-preview">${html}</div>`
					: '<div class="odt-preview"><p>Preview available, but the document contains no readable text.</p></div>';
		} catch (err) {
			error = 'Failed to render ODT file';
		}
	}

	function getObjectUrl(): string | null {
		return objectUrl;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && !isEmbedded) {
			onClose();
		}
	}

	function handleBackdropClick() {
		onClose();
	}

	function handleModalClick(event: MouseEvent) {
		event.stopPropagation();
	}

	function getFileIcon(): string {
		return fileTypeIcons[fileType] || fileTypeIcons.unsupported;
	}

	function downloadFile() {
		if (!content) return;
		const url = URL.createObjectURL(content);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	{#snippet PreviewPanel()}
		<div
			role={isEmbedded ? 'region' : 'dialog'}
			aria-modal={isEmbedded ? undefined : 'true'}
			aria-labelledby={isEmbedded ? undefined : titleElementId}
			aria-label={isEmbedded || showHeader ? undefined : filename}
			class:preview-panel={true}
			class:preview-panel-modal={!isEmbedded}
			class:preview-panel-embedded={isEmbedded}
			onclick={isEmbedded ? undefined : handleModalClick}
		>
			{#if showHeader}
				<div class="preview-header">
					<div class="flex items-center gap-3 min-w-0">
						<div class="flex-shrink-0 text-icon-muted">
							{@html getFileIcon()}
						</div>
						<div class="min-w-0">
							<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
								File Preview
							</div>
							<h3 id={titleElementId} class="mt-1 text-lg font-serif tracking-[-0.02em] text-text-primary truncate">
								{filename}
							</h3>
						</div>
					</div>
					<div class="flex items-center gap-2 flex-shrink-0">
						{#if content}
							<button
								type="button"
								class="preview-download-button"
								onclick={downloadFile}
								aria-label={`Download ${filename}`}
								title={`Download ${filename}`}
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
								</svg>
							</button>
						{/if}
						<button
							type="button"
							class="btn-icon-bare h-10 w-10 rounded-full text-icon-muted hover:text-text-primary"
							onclick={onClose}
							aria-label="Close file preview"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
								<line x1="18" x2="6" y1="6" y2="18" />
								<line x1="6" x2="18" y1="6" y2="18" />
							</svg>
						</button>
					</div>
				</div>
			{/if}

			<div class:preview-body={true} class:preview-body-modal={!isEmbedded} class:preview-body-embedded={isEmbedded}>
				{#if isLoading}
					<div class="flex flex-col items-center justify-center py-16 gap-4">
						<div class="spinner"></div>
						<p class="text-sm text-text-muted">Loading preview...</p>
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
							Retry
						</button>
					</div>
				{:else if fileType === 'unsupported'}
					<div class="m-6 rounded-[1.2rem] border border-dashed border-border bg-surface-page px-6 py-8 text-center">
						<svg class="mx-auto mb-3 text-icon-muted" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>
						</svg>
						<p class="text-sm text-text-muted mb-1">Preview not available for this file type</p>
						<p class="text-xs text-text-muted/70 mb-4">Download the file to view it</p>
						{#if content}
							<button
								type="button"
								class="btn-primary text-sm"
								onclick={downloadFile}
							>
								Download File
							</button>
						{/if}
					</div>
				{:else if fileType === 'pdf'}
					{#if content}
						<div class="pdf-viewer">
							<div class="pdf-toolbar">
								<div class="pdf-page-info">
									Page {currentPage} of {totalPages}
								</div>
								<div class="pdf-zoom">
									<button
										type="button"
										class="btn-icon-bare h-8 w-8"
										onclick={zoomOut}
										disabled={zoom <= 0.5}
										aria-label="Zoom out"
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>
										</svg>
									</button>
									<button
										type="button"
										class="btn-zoom-reset"
										onclick={resetZoom}
										aria-label="Reset zoom"
									>
										{Math.round(zoom * 100)}%
									</button>
									<button
										type="button"
										class="btn-icon-bare h-8 w-8"
										onclick={zoomIn}
										disabled={zoom >= 3.0}
										aria-label="Zoom in"
									>
										<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
										</svg>
									</button>
								</div>
							</div>
							<div class="pdf-canvas-container" bind:this={scrollContainerRef}>
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
						<div class="flex items-center justify-center p-6 bg-surface-page min-h-[50vh]">
							<img
								src={getObjectUrl()}
								alt={filename}
								class="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
							/>
						</div>
					{/if}
				{:else if fileType === 'text'}
					{#if content}
						<div class="p-6">
							<div class="file-text-preview">
								{@html highlightedTextHtml ?? ''}
							</div>
						</div>
					{/if}
				{:else if fileType === 'docx' || fileType === 'xlsx' || fileType === 'pptx' || fileType === 'odt'}
					{#if htmlContent}
						<div class="p-6 docx-preview">
							{@html sanitizeHtml(htmlContent)}
						</div>
					{/if}
				{:else}
					<div class="m-6 rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-center">
						<p class="text-sm text-text-muted">Preview not available</p>
					</div>
				{/if}
			</div>
		</div>
	{/snippet}

	{#if isEmbedded}
		<div class="preview-embedded-shell">
			{@render PreviewPanel()}
		</div>
	{:else}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			class="fixed inset-0 z-[120] flex items-center justify-center bg-surface-overlay/65 p-4 backdrop-blur-sm"
			role="presentation"
			onclick={handleBackdropClick}
		>
			{@render PreviewPanel()}
		</div>
	{/if}
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
	}

	:global(.pptx-slide) {
		margin-bottom: 2rem;
		background: var(--surface-elevated);
		border-radius: 0.75rem;
		border: 1px solid var(--border-default);
		overflow: hidden;
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

	.preview-embedded-shell {
		display: flex;
		height: 100%;
		min-height: 0;
		min-width: 0;
		background: var(--surface-page);
	}

	.preview-panel {
		display: flex;
		flex-direction: column;
		min-width: 0;
		background: var(--surface-elevated);
	}

	.preview-panel-modal {
		max-height: 90vh;
		width: 100%;
		max-width: 1000px;
		overflow: hidden;
		border: 1px solid var(--border-default);
		border-radius: 1.6rem;
		box-shadow: var(--shadow-lg);
	}

	.preview-panel-embedded {
		flex: 1 1 auto;
		height: 100%;
		border: none;
		background: var(--surface-page);
	}

	.preview-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid var(--border-default);
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--surface-elevated) 92%, transparent 8%), var(--surface-page));
	}

	.preview-body {
		min-height: 0;
		min-width: 0;
		overflow-y: auto;
	}

	.preview-body-modal {
		max-height: calc(90vh - 80px);
	}

	.preview-body-embedded {
		flex: 1 1 auto;
		height: 100%;
	}

	.preview-download-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: 1px solid color-mix(in srgb, var(--border-subtle) 72%, transparent 28%);
		border-radius: 9999px;
		background: color-mix(in srgb, var(--accent) 10%, var(--surface-page) 90%);
		color: color-mix(in srgb, var(--accent) 64%, var(--text-primary) 36%);
		cursor: pointer;
		transition:
			background var(--duration-standard) var(--ease-out),
			border-color var(--duration-standard) var(--ease-out),
			box-shadow var(--duration-standard) var(--ease-out);
	}

	.preview-download-button:hover {
		background: color-mix(in srgb, var(--accent) 16%, var(--surface-page) 84%);
		border-color: color-mix(in srgb, var(--border-default) 78%, transparent 22%);
	}

	.preview-download-button:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-ring) 82%, transparent 18%);
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
		min-height: 50vh;
	}

	.pdf-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: var(--surface-elevated);
		border-bottom: 1px solid var(--border-default);
		gap: 1rem;
		flex-wrap: wrap;
	}

	.pdf-page-info {
		font-size: 0.875rem;
		color: var(--text-muted);
		font-family: 'Nimbus Sans L', sans-serif;
		min-width: 100px;
		text-align: center;
	}

	.pdf-zoom {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.btn-zoom-reset {
		padding: 0.25rem 0.75rem;
		font-size: 0.875rem;
		color: var(--text-muted);
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: 0.375rem;
		cursor: pointer;
		font-family: 'Nimbus Sans L', sans-serif;
		min-width: 60px;
		text-align: center;
	}

	.btn-zoom-reset:hover {
		background: var(--surface-overlay);
		color: var(--text-primary);
	}

	.pdf-canvas-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 1.5rem;
		overflow-y: auto;
		min-height: 50vh;
		position: relative;
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
		width: 100%;
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
