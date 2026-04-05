<script lang="ts">
	import { browser } from '$app/environment';
	import {
		determinePreviewFileType,
		getPreviewLanguage,
	} from '$lib/utils/file-preview';
	import { summarizeTextComparison } from '$lib/utils/text-compare';
	import type { DocumentWorkspaceItem } from '$lib/types';

	type FilePreviewModule = typeof import('$lib/components/knowledge/FilePreview.svelte');
	type MarkdownModule = typeof import('$lib/services/markdown');

	let {
		open = false,
		documents = [],
		availableDocuments = [],
		activeDocumentId = null,
		onSelectDocument,
		onOpenDocument = undefined,
		onJumpToSource = undefined,
		onCloseDocument,
		onCloseWorkspace,
		onPageChange = undefined,
	}: {
		open?: boolean;
		documents?: DocumentWorkspaceItem[];
		availableDocuments?: DocumentWorkspaceItem[];
		activeDocumentId?: string | null;
		onSelectDocument: (documentId: string) => void;
		onOpenDocument?: ((document: DocumentWorkspaceItem) => void) | undefined;
		onJumpToSource?: ((document: DocumentWorkspaceItem) => void) | undefined;
		onCloseDocument: (documentId: string) => void;
		onCloseWorkspace: () => void;
		onPageChange?: ((page: number) => void) | undefined;
	} = $props();

	let activeDocument = $derived.by(() => {
		if (documents.length === 0) return null;
		return documents.find((document) => document.id === activeDocumentId) ?? documents[0] ?? null;
	});
	let compareMode = $state(false);
	let compareDocumentId = $state<string | null>(null);
	let compareCurrentTextHtml = $state<string | null>(null);
	let compareOtherTextHtml = $state<string | null>(null);
	let compareSummary = $state<ReturnType<typeof summarizeTextComparison> | null>(null);
	let compareLoading = $state(false);
	let compareError = $state<string | null>(null);
	let filePreviewModulePromise: Promise<FilePreviewModule> | null = null;
	let markdownModulePromise: Promise<MarkdownModule> | null = null;

	// Fade animation state
	let isVisible = $state(false);
	let shouldRender = $state(false);
	let closeAnimationTimer: ReturnType<typeof setTimeout> | null = null;

	// Page navigation state
	let currentPage = $state(1);
	let pageInputValue = $state('1');
	let pageInputError = $state<string | null>(null);
	let lastDocumentId = $state<string | null>(null);

	// Resize state
	let isResizing = $state(false);
	let resizeStartX = $state(0);
	let resizeStartWidth = $state(400);
	let workspaceWidth = $state(400);
	const MIN_WIDTH = 320;
	const MAX_WIDTH_RATIO = 0.42;

	$effect(() => {
		if (activeDocument && activeDocument.id !== lastDocumentId) {
			lastDocumentId = activeDocument.id;
			currentPage = activeDocument.currentPage ?? 1;
			pageInputValue = String(currentPage);
			pageInputError = null;
		}
	});

	$effect(() => {
		if (open && activeDocument) {
			if (closeAnimationTimer) {
				clearTimeout(closeAnimationTimer);
				closeAnimationTimer = null;
			}

			shouldRender = true;
			isVisible = false;
			const frame = requestAnimationFrame(() => {
				isVisible = true;
			});

			return () => cancelAnimationFrame(frame);
		}

		isVisible = false;
		if (shouldRender && !closeAnimationTimer) {
			closeAnimationTimer = setTimeout(() => {
				shouldRender = false;
				closeAnimationTimer = null;
			}, 150);
		}
	});

	function handlePageInputChange(event: Event) {
		const input = event.target as HTMLInputElement;
		pageInputValue = input.value;
		pageInputError = null;
	}

	function handlePageInputKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			validateAndJumpToPage();
		}
	}

	function validateAndJumpToPage() {
		const totalPages = activeDocument?.totalPages ?? 1;
		const pageNum = parseInt(pageInputValue, 10);

		if (isNaN(pageNum)) {
			pageInputError = 'Please enter a valid number';
			return;
		}

		if (pageNum < 1 || pageNum > totalPages) {
			pageInputError = `Invalid: page must be between 1 and ${totalPages}`;
			return;
		}

		pageInputError = null;
		currentPage = pageNum;
		onPageChange?.(pageNum);
	}

	function startResize(event: MouseEvent) {
		isResizing = true;
		resizeStartX = event.clientX ?? 0;
		const desktopShell = document.querySelector('.workspace-shell-desktop') as HTMLElement;
		if (desktopShell) {
			resizeStartWidth = desktopShell.offsetWidth;
		}
	}

	function handleResizeMove(event: MouseEvent) {
		if (!isResizing) return;
		
		const clientX = event.clientX ?? 0;
		const deltaX = resizeStartX - clientX;
		const newWidth = Math.max(MIN_WIDTH, Math.min(resizeStartWidth + deltaX, window.innerWidth * MAX_WIDTH_RATIO));
		workspaceWidth = newWidth;
	}

	function stopResize() {
		isResizing = false;
	}

	function formatRoleLabel(role: string | null | undefined): string | null {
		if (!role) return null;
		const normalized = role.trim();
		if (!normalized) return null;
		return normalized
			.split(/[_-\s]+/)
			.filter(Boolean)
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}

	function getDocumentTitle(document: DocumentWorkspaceItem): string {
		return document.documentLabel ?? document.title ?? document.filename;
	}

	function getDocumentVersionLabel(document: DocumentWorkspaceItem): string | null {
		return document.versionNumber && document.versionNumber > 0
			? `v${document.versionNumber}`
			: null;
	}

	function getDocumentSubtitle(document: DocumentWorkspaceItem): string | null {
		const roleLabel = formatRoleLabel(document.documentRole);
		const versionLabel = getDocumentVersionLabel(document);
		return [roleLabel, versionLabel].filter(Boolean).join(' • ') || null;
	}

	function getDocumentLifecycleLabel(document: DocumentWorkspaceItem): string | null {
		return document.documentFamilyStatus === 'historical' ? 'Historical' : null;
	}

	let familyDocuments = $derived.by(() => {
		if (!activeDocument?.documentFamilyId) return [];

		const mergedById = new Map<string, DocumentWorkspaceItem>();
		for (const document of [...availableDocuments, ...documents]) {
			if (document.documentFamilyId !== activeDocument.documentFamilyId) continue;
			const existing = mergedById.get(document.id);
			mergedById.set(document.id, existing ? { ...existing, ...document } : document);
		}

		return Array.from(mergedById.values()).sort((left, right) => {
			const leftVersion = left.versionNumber ?? 0;
			const rightVersion = right.versionNumber ?? 0;
			if (rightVersion !== leftVersion) return rightVersion - leftVersion;
			if (left.id === activeDocument.id) return -1;
			if (right.id === activeDocument.id) return 1;
			return getDocumentTitle(left).localeCompare(getDocumentTitle(right));
		});
	});

	function isCurrentFamilyDocument(document: DocumentWorkspaceItem): boolean {
		return document.id === activeDocument?.id;
	}

	function isLatestFamilyDocument(document: DocumentWorkspaceItem): boolean {
		return familyDocuments[0]?.id === document.id;
	}

	function handleFamilyDocumentOpen(document: DocumentWorkspaceItem) {
		if (documents.some((entry) => entry.id === document.id)) {
			onSelectDocument(document.id);
			return;
		}
		onOpenDocument?.(document);
	}

	function canJumpToSource(document: DocumentWorkspaceItem): boolean {
		return Boolean(document.originConversationId && document.originAssistantMessageId);
	}

	function isTextDocument(document: DocumentWorkspaceItem): boolean {
		return determinePreviewFileType(document.mimeType, document.filename) === 'text';
	}

	function isMultiPageDocument(document: DocumentWorkspaceItem | null): boolean {
		if (!document) return false;
		return (document.totalPages ?? 1) > 1;
	}

	function getDefaultCompareDocumentId(documentsInFamily: DocumentWorkspaceItem[]): string | null {
		if (!(activeDocument && documentsInFamily.length > 1)) return null;
		const currentIndex = documentsInFamily.findIndex((document) => document.id === activeDocument.id);
		if (currentIndex === -1) return documentsInFamily[0]?.id ?? null;
		if (currentIndex === 0) return documentsInFamily[1]?.id ?? null;
		return documentsInFamily[currentIndex - 1]?.id ?? null;
	}

	let canCompareActiveDocument = $derived(
		Boolean(activeDocument && isTextDocument(activeDocument) && familyDocuments.length > 1)
	);
	let comparedDocument = $derived(
		compareDocumentId
			? familyDocuments.find((document) => document.id === compareDocumentId) ?? null
			: null
	);

	$effect(() => {
		if (!canCompareActiveDocument) {
			compareMode = false;
			compareDocumentId = null;
			return;
		}

		const nextCompareId = getDefaultCompareDocumentId(familyDocuments);
		if (!compareDocumentId || !familyDocuments.some((document) => document.id === compareDocumentId)) {
			compareDocumentId = nextCompareId;
		}
	});

	function getDocumentPreviewUrl(document: DocumentWorkspaceItem): string | null {
		if (document.previewUrl) return document.previewUrl;
		if (document.artifactId) return `/api/knowledge/${document.artifactId}/preview`;
		return null;
	}

	async function loadComparePreview(document: DocumentWorkspaceItem): Promise<string> {
		const previewUrl = getDocumentPreviewUrl(document);
		if (!previewUrl) {
			throw new Error('Preview not available for comparison');
		}

		const response = await fetch(previewUrl);
		if (!response.ok) {
			throw new Error('Failed to load comparison preview');
		}

		const text = await response.text();
		return text;
	}

	async function ensureFilePreviewModule() {
		if (!filePreviewModulePromise) {
			filePreviewModulePromise = import('$lib/components/knowledge/FilePreview.svelte');
		}

		return filePreviewModulePromise;
	}

	async function renderHighlightedCompareText(document: DocumentWorkspaceItem, text: string) {
		if (!markdownModulePromise) {
			markdownModulePromise = import('$lib/services/markdown');
		}

		const { renderHighlightedText } = await markdownModulePromise;
		return renderHighlightedText(
			text,
			getPreviewLanguage(document.mimeType, document.filename),
			browser ? globalThis.document?.documentElement?.classList.contains('dark') ?? false : false
		);
	}

	$effect(() => {
		if (!(browser && compareMode && activeDocument && comparedDocument && canCompareActiveDocument)) {
			compareCurrentTextHtml = null;
			compareOtherTextHtml = null;
			compareSummary = null;
			compareLoading = false;
			compareError = null;
			return;
		}

		let cancelled = false;
		compareLoading = true;
		compareError = null;
		compareCurrentTextHtml = null;
		compareOtherTextHtml = null;
		compareSummary = null;

		void (async () => {
			try {
				const [currentText, otherText] = await Promise.all([
					loadComparePreview(activeDocument),
					loadComparePreview(comparedDocument),
				]);
				const [currentHtml, otherHtml] = await Promise.all([
					renderHighlightedCompareText(activeDocument, currentText),
					renderHighlightedCompareText(comparedDocument, otherText),
				]);

				if (cancelled) return;
				compareCurrentTextHtml = currentHtml;
				compareOtherTextHtml = otherHtml;
				compareSummary = summarizeTextComparison(currentText, otherText);
			} catch (error) {
				if (cancelled) return;
				compareError =
					error instanceof Error ? error.message : 'Failed to load comparison preview';
			} finally {
				if (!cancelled) {
					compareLoading = false;
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	});

</script>

{#if shouldRender && activeDocument}
	<!-- Mobile overlay -->
	<div class="workspace-mobile-backdrop md:hidden">
		<button
			type="button"
			class="workspace-mobile-dismiss"
			onclick={onCloseWorkspace}
			aria-label="Close document workspace"
		></button>
		<section class="workspace-shell workspace-shell-mobile" aria-label="Document workspace">
			<div class="workspace-header">
				<div class="workspace-heading">
					<div class="workspace-eyebrow">Working Document</div>
					<div class="workspace-title">{getDocumentTitle(activeDocument)}</div>
					{#if getDocumentSubtitle(activeDocument)}
						<div class="workspace-subtitle">{getDocumentSubtitle(activeDocument)}</div>
					{/if}
					{#if getDocumentLifecycleLabel(activeDocument)}
						<div class="workspace-status-row">
							<span class="workspace-status-badge">
								{getDocumentLifecycleLabel(activeDocument)}
							</span>
						</div>
					{/if}
				</div>
				<button
					type="button"
					class="btn-icon-bare workspace-close-button"
					onclick={onCloseWorkspace}
					aria-label="Close document workspace"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" x2="6" y1="6" y2="18" />
						<line x1="6" x2="18" y1="6" y2="18" />
					</svg>
				</button>
			</div>

			{#if canJumpToSource(activeDocument)}
				<div class="workspace-actions">
					{#if canCompareActiveDocument}
						<button
							type="button"
							class="workspace-source-button"
							onclick={() => {
								compareMode = !compareMode;
							}}
						>
							{compareMode ? 'Close compare' : 'Compare versions'}
						</button>
					{/if}
					<button
						type="button"
						class="workspace-source-button"
						onclick={() => onJumpToSource?.(activeDocument)}
					>
						View source message
					</button>
				</div>
			{/if}

			{#if !canJumpToSource(activeDocument) && canCompareActiveDocument}
				<div class="workspace-actions">
					<button
						type="button"
						class="workspace-source-button"
						onclick={() => {
							compareMode = !compareMode;
						}}
					>
						{compareMode ? 'Close compare' : 'Compare versions'}
					</button>
				</div>
			{/if}

			{#if documents.length > 1}
				<div class="workspace-tabs" role="tablist" aria-label="Open documents">
					{#each documents as document (document.id)}
						<div class="workspace-tab-wrapper">
							<button
								type="button"
								role="tab"
								class="workspace-tab"
								class:workspace-tab-active={document.id === activeDocument.id}
								aria-selected={document.id === activeDocument.id}
								onclick={() => onSelectDocument(document.id)}
							>
								<span class="workspace-tab-label">{getDocumentTitle(document)}</span>
								{#if getDocumentVersionLabel(document)}
									<span class="workspace-tab-version">{getDocumentVersionLabel(document)}</span>
								{/if}
							</button>
							<button
								type="button"
								class="btn-icon-bare workspace-tab-close"
								onclick={() => onCloseDocument(document.id)}
								aria-label={`Close ${getDocumentTitle(document)}`}
							>
								<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
									<line x1="18" x2="6" y1="6" y2="18" />
									<line x1="6" x2="18" y1="6" y2="18" />
								</svg>
							</button>
						</div>
					{/each}
				</div>
			{/if}

			{#if familyDocuments.length > 1}
				<div class="workspace-history" aria-label="Document version history">
					<div class="workspace-history-label">Version History</div>
					<div class="workspace-history-list">
						{#each familyDocuments as document (document.id)}
							<button
								type="button"
								class="workspace-history-item"
								class:workspace-history-item-current={isCurrentFamilyDocument(document)}
								onclick={() => handleFamilyDocumentOpen(document)}
							>
								<div class="workspace-history-topline">
									<span class="workspace-history-version">
										{getDocumentVersionLabel(document) ?? 'Version'}
									</span>
									{#if isLatestFamilyDocument(document)}
										<span class="workspace-history-badge">Latest</span>
									{/if}
									{#if isCurrentFamilyDocument(document)}
										<span class="workspace-history-badge workspace-history-badge-current">Current</span>
									{/if}
								</div>
								<div class="workspace-history-title">{getDocumentTitle(document)}</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<div class="workspace-body">
				{#if compareMode && comparedDocument}
					<div class="workspace-compare">
						<div class="workspace-compare-header">
							<div>
								<div class="workspace-compare-title">Compare Versions</div>
								{#if compareSummary}
									<div class="workspace-compare-summary">
										{compareSummary.changedLines} changed • {compareSummary.addedLines} added • {compareSummary.removedLines} removed
									</div>
								{/if}
							</div>
							<label class="workspace-compare-select-wrap">
								<span class="workspace-compare-select-label">Against</span>
								<select
									class="workspace-compare-select"
									bind:value={compareDocumentId}
								>
									{#each familyDocuments.filter((document) => document.id !== activeDocument.id) as document (document.id)}
										<option value={document.id}>
											{getDocumentVersionLabel(document) ?? getDocumentTitle(document)}
										</option>
									{/each}
								</select>
							</label>
						</div>

						{#if compareLoading}
							<div class="workspace-compare-state">Loading comparison…</div>
						{:else if compareError}
							<div class="workspace-compare-state workspace-compare-state-error">{compareError}</div>
						{:else if compareCurrentTextHtml && compareOtherTextHtml}
							<div class="workspace-compare-grid">
								<section class="workspace-compare-panel">
									<div class="workspace-compare-panel-head">
										<span class="workspace-compare-panel-label">Current</span>
										<span class="workspace-compare-panel-meta">{getDocumentTitle(activeDocument)} {getDocumentVersionLabel(activeDocument) ?? ''}</span>
									</div>
									<div class="workspace-compare-panel-body">
										{@html compareCurrentTextHtml}
									</div>
								</section>
								<section class="workspace-compare-panel">
									<div class="workspace-compare-panel-head">
										<span class="workspace-compare-panel-label">Compared</span>
										<span class="workspace-compare-panel-meta">{getDocumentTitle(comparedDocument)} {getDocumentVersionLabel(comparedDocument) ?? ''}</span>
									</div>
									<div class="workspace-compare-panel-body">
										{@html compareOtherTextHtml}
									</div>
								</section>
							</div>
						{/if}
					</div>
				{:else}
					{#await ensureFilePreviewModule() then { default: FilePreviewComponent }}
						<FilePreviewComponent
							open={true}
							variant="embedded"
							showHeader={false}
							artifactId={activeDocument.artifactId ?? null}
							previewUrl={activeDocument.previewUrl ?? null}
							filename={activeDocument.filename}
							mimeType={activeDocument.mimeType}
							onClose={onCloseWorkspace}
						/>
					{:catch}
						<div class="workspace-compare-state workspace-compare-state-error">
							Failed to load document preview.
						</div>
					{/await}
				{/if}
			</div>
		</section>
	</div>

	<!-- Desktop / tablet side pane -->
	<aside 
		class="workspace-shell workspace-shell-desktop transition fade"
		class:workspace-fade-in={isVisible}
		class:workspace-resizing={isResizing}
		style:width={workspaceWidth > 0 ? `${workspaceWidth}px` : undefined}
		style:transition="opacity 150ms ease-out, transform 150ms ease-out"
		style:opacity={isVisible ? '1' : '0'}
		style:transform={isVisible ? 'translateX(0)' : 'translateX(-20px)'}
		aria-label="Document workspace"
	>
		<div 
			class="workspace-resize-handle" 
			data-testid="resize-handle"
			onmousedown={startResize}
			role="slider"
			aria-label="Resize workspace panel"
			aria-valuemin={MIN_WIDTH}
			aria-valuemax={typeof window !== 'undefined' ? Math.floor(window.innerWidth * MAX_WIDTH_RATIO) : 800}
			aria-valuenow={workspaceWidth}
			tabindex="0"
		></div>
		<div class="workspace-header">
			<div class="workspace-heading">
				<div class="workspace-eyebrow">Working Document</div>
				<div class="workspace-title">{getDocumentTitle(activeDocument)}</div>
				{#if getDocumentSubtitle(activeDocument)}
					<div class="workspace-subtitle">{getDocumentSubtitle(activeDocument)}</div>
				{/if}
				{#if getDocumentLifecycleLabel(activeDocument)}
					<div class="workspace-status-row">
						<span class="workspace-status-badge">
							{getDocumentLifecycleLabel(activeDocument)}
						</span>
					</div>
				{/if}
			</div>
			<button
				type="button"
				class="btn-icon-bare workspace-close-button"
				onclick={onCloseWorkspace}
				aria-label="Close document workspace"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
					<line x1="18" x2="6" y1="6" y2="18" />
					<line x1="6" x2="18" y1="6" y2="18" />
				</svg>
			</button>
		</div>

		{#if canJumpToSource(activeDocument)}
			<div class="workspace-actions">
				{#if canCompareActiveDocument}
					<button
						type="button"
						class="workspace-source-button"
						onclick={() => {
							compareMode = !compareMode;
						}}
					>
						{compareMode ? 'Close compare' : 'Compare versions'}
					</button>
				{/if}
				<button
					type="button"
					class="workspace-source-button"
					onclick={() => onJumpToSource?.(activeDocument)}
				>
					View source message
				</button>
			</div>
		{/if}

		{#if !canJumpToSource(activeDocument) && canCompareActiveDocument}
			<div class="workspace-actions">
				<button
					type="button"
					class="workspace-source-button"
					onclick={() => {
						compareMode = !compareMode;
					}}
				>
					{compareMode ? 'Close compare' : 'Compare versions'}
				</button>
			</div>
		{/if}

		{#if documents.length > 1}
			<div class="workspace-tabs" role="tablist" aria-label="Open documents">
				{#each documents as document (document.id)}
					<div class="workspace-tab-wrapper">
						<button
							type="button"
							role="tab"
							class="workspace-tab"
							class:workspace-tab-active={document.id === activeDocument.id}
							aria-selected={document.id === activeDocument.id}
							onclick={() => onSelectDocument(document.id)}
						>
							<span class="workspace-tab-label">{getDocumentTitle(document)}</span>
							{#if getDocumentVersionLabel(document)}
								<span class="workspace-tab-version">{getDocumentVersionLabel(document)}</span>
							{/if}
						</button>
						<button
							type="button"
							class="btn-icon-bare workspace-tab-close"
							onclick={() => onCloseDocument(document.id)}
							aria-label={`Close ${getDocumentTitle(document)}`}
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
								<line x1="18" x2="6" y1="6" y2="18" />
								<line x1="6" x2="18" y1="6" y2="18" />
							</svg>
						</button>
					</div>
				{/each}
			</div>
		{/if}

		{#if familyDocuments.length > 1}
			<div class="workspace-history" aria-label="Document version history">
				<div class="workspace-history-label">Version History</div>
				<div class="workspace-history-list">
					{#each familyDocuments as document (document.id)}
						<button
							type="button"
							class="workspace-history-item"
							class:workspace-history-item-current={isCurrentFamilyDocument(document)}
							onclick={() => handleFamilyDocumentOpen(document)}
						>
							<div class="workspace-history-topline">
								<span class="workspace-history-version">
									{getDocumentVersionLabel(document) ?? 'Version'}
								</span>
								{#if isLatestFamilyDocument(document)}
									<span class="workspace-history-badge">Latest</span>
								{/if}
								{#if isCurrentFamilyDocument(document)}
									<span class="workspace-history-badge workspace-history-badge-current">Current</span>
								{/if}
							</div>
							<div class="workspace-history-title">{getDocumentTitle(document)}</div>
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<div class="workspace-body" data-testid="page-scroll-container">
			{#if isMultiPageDocument(activeDocument)}
				<div class="workspace-page-nav">
					<div class="workspace-page-input-wrap">
						<label class="workspace-page-input-label" for="page-input-desktop">Page</label>
						<input
							id="page-input-desktop"
							type="text"
							class="workspace-page-input"
							class:workspace-page-input-error={pageInputError !== null}
							bind:value={pageInputValue}
							onchange={handlePageInputChange}
							onkeydown={handlePageInputKeyDown}
							data-testid="page-input"
							aria-invalid={pageInputError !== null}
							aria-describedby={pageInputError ? 'page-input-error-desktop' : undefined}
						/>
						<span class="workspace-page-total">of {activeDocument?.totalPages ?? 1}</span>
					</div>
					{#if pageInputError}
						<span class="workspace-page-error" data-testid="page-input-error" id="page-input-error-desktop">
							{pageInputError}
						</span>
					{/if}
				</div>
			{/if}
			{#if compareMode && comparedDocument}
				<div class="workspace-compare">
					<div class="workspace-compare-header">
						<div>
							<div class="workspace-compare-title">Compare Versions</div>
							{#if compareSummary}
								<div class="workspace-compare-summary">
									{compareSummary.changedLines} changed • {compareSummary.addedLines} added • {compareSummary.removedLines} removed
								</div>
							{/if}
						</div>
						<label class="workspace-compare-select-wrap">
							<span class="workspace-compare-select-label">Against</span>
							<select class="workspace-compare-select" bind:value={compareDocumentId}>
								{#each familyDocuments.filter((document) => document.id !== activeDocument.id) as document (document.id)}
									<option value={document.id}>
										{getDocumentVersionLabel(document) ?? getDocumentTitle(document)}
									</option>
								{/each}
							</select>
						</label>
					</div>

					{#if compareLoading}
						<div class="workspace-compare-state">Loading comparison…</div>
					{:else if compareError}
						<div class="workspace-compare-state workspace-compare-state-error">{compareError}</div>
					{:else if compareCurrentTextHtml && compareOtherTextHtml}
						<div class="workspace-compare-grid">
							<section class="workspace-compare-panel">
								<div class="workspace-compare-panel-head">
									<span class="workspace-compare-panel-label">Current</span>
									<span class="workspace-compare-panel-meta">{getDocumentTitle(activeDocument)} {getDocumentVersionLabel(activeDocument) ?? ''}</span>
								</div>
								<div class="workspace-compare-panel-body">
									{@html compareCurrentTextHtml}
								</div>
							</section>
							<section class="workspace-compare-panel">
								<div class="workspace-compare-panel-head">
									<span class="workspace-compare-panel-label">Compared</span>
									<span class="workspace-compare-panel-meta">{getDocumentTitle(comparedDocument)} {getDocumentVersionLabel(comparedDocument) ?? ''}</span>
								</div>
								<div class="workspace-compare-panel-body">
									{@html compareOtherTextHtml}
								</div>
							</section>
						</div>
					{/if}
				</div>
			{:else}
				{#await ensureFilePreviewModule() then { default: FilePreviewComponent }}
					<FilePreviewComponent
						open={true}
						variant="embedded"
						showHeader={false}
						artifactId={activeDocument.artifactId ?? null}
						previewUrl={activeDocument.previewUrl ?? null}
						filename={activeDocument.filename}
						mimeType={activeDocument.mimeType}
						onClose={onCloseWorkspace}
					/>
				{:catch}
					<div class="workspace-compare-state workspace-compare-state-error">
						Failed to load document preview.
					</div>
				{/await}
			{/if}
		</div>
	</aside>
{/if}

<style>
	.workspace-mobile-backdrop {
		position: fixed;
		inset: 0;
		z-index: 95;
		display: flex;
		align-items: stretch;
		justify-content: stretch;
		background: color-mix(in srgb, var(--surface-overlay) 70%, transparent 30%);
		backdrop-filter: blur(10px);
	}

	.workspace-mobile-dismiss {
		position: absolute;
		inset: 0;
		border: none;
		padding: 0;
		background: transparent;
	}

	.workspace-shell {
		display: flex;
		flex-direction: column;
		min-width: 0;
		background: var(--surface-page);
	}

	.workspace-shell-mobile {
		height: 100%;
		width: 100%;
	}

	.workspace-shell-desktop {
		display: none;
		transition: opacity var(--duration-standard) ease-out, transform var(--duration-standard) ease-out;
		opacity: 0;
		transform: translateX(-20px);
	}

	.workspace-fade-in {
		opacity: 1;
		transform: translateX(0);
	}

	.workspace-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding: 0.95rem 1rem;
		border-left: 1px solid var(--border-default);
		border-bottom: 1px solid var(--border-default);
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--surface-elevated) 92%, transparent 8%), var(--surface-page));
	}

	.workspace-shell-mobile .workspace-header {
		border-left: none;
	}

	.workspace-heading {
		min-width: 0;
	}

	.workspace-eyebrow {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.workspace-title {
		margin-top: 0.25rem;
		font-family: 'Libre Baskerville', serif;
		font-size: 1rem;
		line-height: 1.35;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.workspace-subtitle {
		margin-top: 0.3rem;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.78rem;
		font-weight: 500;
		letter-spacing: 0.02em;
		color: var(--text-secondary);
	}

	.workspace-status-row {
		margin-top: 0.48rem;
	}

	.workspace-status-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.24rem 0.58rem;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--border-default) 76%, var(--accent) 24%);
		background: color-mix(in srgb, var(--surface-elevated) 70%, var(--accent) 30%);
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.workspace-close-button {
		flex-shrink: 0;
	}

	.workspace-tabs {
		display: flex;
		gap: 0.45rem;
		padding: 0.7rem 1rem 0.8rem;
		border-left: 1px solid var(--border-default);
		border-bottom: 1px solid var(--border-default);
		background: color-mix(in srgb, var(--surface-elevated) 82%, transparent 18%);
		overflow-x: auto;
	}

	.workspace-shell-mobile .workspace-tabs {
		border-left: none;
	}

	.workspace-actions {
		display: flex;
		justify-content: flex-start;
		padding: 0.7rem 1rem 0;
		border-left: 1px solid var(--border-default);
		background: color-mix(in srgb, var(--surface-page) 96%, transparent 4%);
	}

	.workspace-shell-mobile .workspace-actions {
		border-left: none;
	}

	.workspace-source-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.46rem 0.82rem;
		border: 1px solid var(--border-default);
		border-radius: 999px;
		background: var(--surface-elevated);
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.76rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--text-secondary);
		transition:
			border-color var(--duration-fast) ease,
			background-color var(--duration-fast) ease,
			color var(--duration-fast) ease;
	}

	.workspace-source-button:hover {
		border-color: var(--border-strong);
		background: color-mix(in srgb, var(--surface-elevated) 72%, var(--surface-page) 28%);
		color: var(--text-primary);
	}

	.workspace-tab-wrapper {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		min-width: 0;
		max-width: 18rem;
		padding-right: 0.15rem;
		border: 1px solid var(--border-default);
		border-radius: 999px;
		background: var(--surface-page);
	}

	.workspace-tab {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		min-width: 0;
		max-width: 100%;
		padding: 0.48rem 0.78rem 0.48rem 0.85rem;
		border: none;
		background: transparent;
		font-size: 0.82rem;
		color: var(--text-secondary);
	}

	.workspace-tab-active {
		color: var(--text-primary);
		font-weight: 600;
	}

	.workspace-tab-label {
		display: block;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.workspace-tab-version {
		flex: 0 0 auto;
		border: 1px solid var(--border-default);
		border-radius: 999px;
		padding: 0.08rem 0.38rem;
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
		background: color-mix(in srgb, var(--surface-elevated) 82%, transparent 18%);
	}

	.workspace-tab-close {
		flex-shrink: 0;
		width: 1.9rem;
		height: 1.9rem;
		color: var(--icon-muted);
	}

	.workspace-body {
		flex: 1 1 auto;
		min-height: 0;
		min-width: 0;
	}

	.workspace-compare {
		display: flex;
		flex: 1 1 auto;
		min-height: 0;
		flex-direction: column;
		background: var(--surface-page);
	}

	.workspace-compare-header {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: space-between;
		gap: 0.9rem;
		padding: 0.95rem 1rem 0.8rem;
		border-bottom: 1px solid var(--border-default);
		background: color-mix(in srgb, var(--surface-elevated) 72%, var(--surface-page) 28%);
	}

	.workspace-compare-title {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.workspace-compare-summary {
		margin-top: 0.2rem;
		font-size: 0.76rem;
		color: var(--text-secondary);
	}

	.workspace-compare-select-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.28rem;
	}

	.workspace-compare-select-label {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.workspace-compare-select {
		min-width: 9rem;
		padding: 0.45rem 0.72rem;
		border: 1px solid var(--border-default);
		border-radius: 0.75rem;
		background: var(--surface-page);
		font-size: 0.8rem;
		color: var(--text-primary);
	}

	.workspace-compare-state {
		padding: 1rem;
		font-size: 0.86rem;
		color: var(--text-secondary);
	}

	.workspace-compare-state-error {
		color: var(--danger);
	}

	.workspace-compare-grid {
		display: grid;
		flex: 1 1 auto;
		min-height: 0;
		grid-template-columns: 1fr;
	}

	.workspace-compare-panel {
		display: flex;
		min-height: 0;
		flex-direction: column;
		border-bottom: 1px solid var(--border-default);
	}

	.workspace-compare-panel:last-child {
		border-bottom: none;
	}

	.workspace-compare-panel-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.8rem 1rem;
		border-bottom: 1px solid var(--border-subtle);
		background: color-mix(in srgb, var(--surface-page) 90%, transparent 10%);
	}

	.workspace-compare-panel-label {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.workspace-compare-panel-meta {
		font-size: 0.78rem;
		color: var(--text-secondary);
	}

	.workspace-compare-panel-body {
		min-height: 0;
		flex: 1 1 auto;
		overflow: auto;
		padding: 1rem;
	}

	.workspace-compare-panel-body :global(pre) {
		margin: 0;
	}

	.workspace-history {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		padding: 0.75rem 1rem 0.85rem;
		border-left: 1px solid var(--border-default);
		border-bottom: 1px solid var(--border-default);
		background: color-mix(in srgb, var(--surface-page) 94%, transparent 6%);
	}

	.workspace-shell-mobile .workspace-history {
		border-left: none;
	}

	.workspace-history-label {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.workspace-history-list {
		display: flex;
		gap: 0.55rem;
		overflow-x: auto;
	}

	.workspace-history-item {
		display: flex;
		min-width: 10.5rem;
		max-width: 13rem;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.7rem 0.85rem;
		border: 1px solid var(--border-default);
		border-radius: 0.95rem;
		background: var(--surface-elevated);
		text-align: left;
		color: var(--text-secondary);
		transition:
			border-color var(--duration-fast) ease,
			background-color var(--duration-fast) ease,
			color var(--duration-fast) ease,
			transform var(--duration-fast) ease;
	}

	.workspace-history-item:hover {
		border-color: var(--border-strong);
		background: color-mix(in srgb, var(--surface-elevated) 86%, var(--surface-page) 14%);
		color: var(--text-primary);
		transform: translateY(-1px);
	}

	.workspace-history-item-current {
		border-color: color-mix(in srgb, var(--text-primary) 18%, var(--border-default) 82%);
		background: color-mix(in srgb, var(--surface-elevated) 78%, var(--surface-page) 22%);
		color: var(--text-primary);
	}

	.workspace-history-topline {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35rem;
	}

	.workspace-history-version,
	.workspace-history-badge {
		display: inline-flex;
		align-items: center;
		border-radius: 999px;
		padding: 0.12rem 0.42rem;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.64rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.workspace-history-version {
		border: 1px solid var(--border-default);
		color: var(--text-secondary);
		background: var(--surface-page);
	}

	.workspace-history-badge {
		color: var(--text-muted);
		background: color-mix(in srgb, var(--surface-page) 85%, transparent 15%);
	}

	.workspace-history-badge-current {
		color: var(--text-primary);
		background: color-mix(in srgb, var(--surface-page) 70%, var(--surface-elevated) 30%);
	}

	.workspace-history-title {
		font-family: 'Libre Baskerville', serif;
		font-size: 0.88rem;
		line-height: 1.35;
		color: inherit;
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		overflow: hidden;
	}

	@media (min-width: 768px) {
		.workspace-shell-desktop {
			display: flex;
			width: min(38vw, 34rem);
			max-width: 42%;
			min-width: 20rem;
			flex: 0 0 auto;
			border-left: 1px solid var(--border-subtle);
			background: var(--surface-page);
			transition: opacity var(--duration-standard) ease-out, transform var(--duration-standard) ease-out;
			opacity: 0;
			transform: translateX(-20px);
		}

		.workspace-fade-in {
			opacity: 1;
			transform: translateX(0);
		}

		.workspace-resizing {
			transition: none;
		}

		.workspace-resize-handle {
			position: absolute;
			left: 0;
			top: 0;
			bottom: 0;
			width: 4px;
			cursor: col-resize;
			background: transparent;
			z-index: 10;
		}

		.workspace-resize-handle:hover {
			background: var(--accent);
		}

		.workspace-compare-grid {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}

		.workspace-compare-panel {
			border-bottom: none;
		}

		.workspace-compare-panel + .workspace-compare-panel {
			border-left: 1px solid var(--border-default);
		}

		.workspace-mobile-backdrop {
			display: none;
		}
	}

	.workspace-page-input {
		width: 3rem;
		padding: 0.25rem 0.5rem;
		border: 1px solid var(--border-default);
		border-radius: 0.375rem;
		background: var(--surface-page);
		color: var(--text-primary);
		font-size: 0.78rem;
		text-align: center;
	}

	.workspace-page-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.workspace-page-input-error {
		border-color: var(--danger);
	}

	.workspace-page-total {
		color: var(--text-muted);
	}

	.workspace-page-error {
		display: block;
		color: var(--danger);
		font-size: 0.72rem;
		margin-top: 0.25rem;
	}

	.workspace-page-nav {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border-default);
		background: color-mix(in srgb, var(--surface-elevated) 72%, var(--surface-page) 28%);
	}

	.workspace-page-input-wrap {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.78rem;
		color: var(--text-secondary);
	}

	.workspace-page-input-label {
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
</style>
