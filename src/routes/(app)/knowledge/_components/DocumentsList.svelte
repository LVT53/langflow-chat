<script lang="ts">
	import type { KnowledgeDocumentItem } from '$lib/types';

	type DocumentFilter = 'all' | 'uploaded' | 'generated';

	interface DocumentsListProps {
		documents: KnowledgeDocumentItem[];
		loading?: boolean;
		filter?: DocumentFilter;
		paginationLimit?: 20 | 50 | 100;
		currentPage?: number;
		bulkDeleteSuccessVersion?: number;
		onFilterChange?: (filter: DocumentFilter) => void;
		onPaginationLimitChange?: (limit: number) => void;
		onPageChange?: (page: number) => void;
		onSelect?: (document: KnowledgeDocumentItem) => void;
		onDelete?: (documentId: string) => void;
		onBulkDelete?: (documentIds: string[]) => Promise<boolean>;
		onDownload?: (documentId: string) => void;
		onUpload?: (files: File[]) => void | Promise<void>;
	}

	let {
		documents,
		loading = false,
		filter = 'all',
		paginationLimit = 20,
		currentPage = 1,
		bulkDeleteSuccessVersion = 0,
		onFilterChange,
		onPaginationLimitChange,
		onPageChange,
		onSelect,
		onDelete,
		onBulkDelete,
		onDownload,
		onUpload,
	}: DocumentsListProps = $props();

	// Selection state
	let selectedIds = $state<Set<string>>(new Set());

	// Drag-drop state
	let isDragOver = $state(false);
	let dragCounter = $state(0);
	let fileInputRef = $state<HTMLInputElement | undefined>(undefined);
	let isUploading = $state(false);

	// Selection derived state
	const selectedCount = $derived(selectedIds.size);
	const isAllSelected = $derived.by(() => {
		if (paginatedDocuments.length === 0) return false;
		return paginatedDocuments.every((doc) => selectedIds.has(doc.id));
	});
	const isIndeterminate = $derived.by(() => {
		if (paginatedDocuments.length === 0) return false;
		const selectedOnPage = paginatedDocuments.filter((doc) => selectedIds.has(doc.id)).length;
		return selectedOnPage > 0 && selectedOnPage < paginatedDocuments.length;
	});
	const hasSelection = $derived(selectedIds.size > 0);

	// Clear selection when filter changes (explicit, non-looping)
	$effect(() => {
		const currentFilter = filter;
		return () => {
			if (currentFilter !== filter) {
				selectedIds = new Set();
			}
		};
	});

	// Clear selection when page changes (explicit, non-looping)
	$effect(() => {
		const currentPageValue = currentPage;
		return () => {
			if (currentPageValue !== currentPage) {
				selectedIds = new Set();
			}
		};
	});

	// Clamp currentPage to valid range when totalPages shrinks
	$effect(() => {
		if (totalPages > 0 && currentPage > totalPages) {
			onPageChange?.(totalPages);
		} else if (totalPages === 0 && currentPage > 1) {
			onPageChange?.(1);
		}
	});

	// Clear selection when bulk delete succeeds (parent signals via version increment)
	$effect(() => {
		const currentVersion = bulkDeleteSuccessVersion;
		return () => {
			if (currentVersion !== bulkDeleteSuccessVersion && bulkDeleteSuccessVersion > 0) {
				selectedIds = new Set();
			}
		};
	});

	// Accepted file types for upload
	const acceptedFileTypes = '.pdf,.doc,.docx,.txt,.md,.json,.csv,.xlsx,.xls,.pptx,.ppt,.html,.htm';

	function handleDragEnter(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		dragCounter += 1;
		if (event.dataTransfer?.types.includes('Files')) {
			isDragOver = true;
		}
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		dragCounter -= 1;
		if (dragCounter === 0) {
			isDragOver = false;
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
		isDragOver = false;
		dragCounter = 0;

		const files = event.dataTransfer?.files;
		if (!files || files.length === 0) return;

		const validFiles = Array.from(files).filter((file) => {
			// Basic file type validation
			const extension = file.name.split('.').pop()?.toLowerCase();
			const acceptedExtensions = acceptedFileTypes.split(',').map((t) => t.replace('.', ''));
			return extension && acceptedExtensions.includes(extension);
		});

		if (validFiles.length === 0) return;

		await processUpload(validFiles);
	}

	function handleUploadClick() {
		fileInputRef?.click();
	}

	async function handleFileSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;

		await processUpload(Array.from(files));

		// Reset input for reuse
		input.value = '';
	}

	async function processUpload(files: File[]) {
		if (!onUpload || files.length === 0) return;

		isUploading = true;
		try {
			await onUpload(files);
		} catch (error) {
			console.error('Upload failed:', error);
		} finally {
			isUploading = false;
		}
	}

	function UploadIcon() {
		return `
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
				<polyline points="17 8 12 3 7 8"></polyline>
				<line x1="12" y1="3" x2="12" y2="15"></line>
			</svg>
		`;
	}

	// Filter documents based on type
	const filteredDocuments = $derived.by(() => {
		if (filter === 'uploaded') {
			return documents.filter((doc) => 
				doc.documentOrigin === 'uploaded' || 
				doc.type === 'source_document' ||
				(doc.documentOrigin === undefined && doc.type !== 'generated_output')
			);
		}
		if (filter === 'generated') {
			return documents.filter((doc) => 
				doc.documentOrigin === 'generated' || 
				doc.type === 'generated_output'
			);
		}
		return documents;
	});

	// Sort documents: group by documentFamilyId, then by versionNumber
	const sortedDocuments = $derived.by(() => {
		const docs = [...filteredDocuments];
		
		// Group by documentFamilyId
		const groups = new Map<string | null, KnowledgeDocumentItem[]>();
		
		for (const doc of docs) {
			const familyId = doc.documentFamilyId ?? null;
			if (!groups.has(familyId)) {
				groups.set(familyId, []);
			}
			groups.get(familyId)!.push(doc);
		}
		
		// Sort each group by versionNumber
		for (const [, group] of groups) {
			group.sort((a, b) => (a.versionNumber ?? 0) - (b.versionNumber ?? 0));
		}
		
		// Flatten groups back into array (families with versions first, then ungrouped)
		const result: KnowledgeDocumentItem[] = [];
		const familyIds = Array.from(groups.keys()).sort((a, b) => {
			if (a === null) return 1;
			if (b === null) return -1;
			return a.localeCompare(b);
		});
		
		for (const familyId of familyIds) {
			result.push(...groups.get(familyId)!);
		}
		
		return result;
	});

	// Pagination
	const totalPages = $derived(Math.ceil(sortedDocuments.length / paginationLimit));
	const paginatedDocuments = $derived.by(() => {
		const start = (currentPage - 1) * paginationLimit;
		const end = start + paginationLimit;
		return sortedDocuments.slice(start, end);
	});

	const showingFrom = $derived((currentPage - 1) * paginationLimit + 1);
	const showingTo = $derived(Math.min(currentPage * paginationLimit, sortedDocuments.length));

	function formatFileSize(bytes: number | null | undefined): string {
		if (!bytes) return '0 B';
		if (bytes === 0) return '0 B';
		if (bytes >= 1024 ** 4) {
			return `${(bytes / (1024 ** 4)).toFixed(1)} TB`;
		}
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		const value = bytes / Math.pow(k, i);
		const formatted = value % 1 === 0 ? value.toString() : value.toFixed(1);
		return `${formatted} ${sizes[i]}`;
	}

	function formatDate(timestamp: number | null | undefined): string {
		if (timestamp == null || !isFinite(timestamp)) {
			return '—';
		}
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(timestamp);
	}

	function getFileIcon(mimeType: string | null): typeof GenericFileIcon {
		if (!mimeType) return GenericFileIcon;
		if (mimeType.startsWith('image/')) return ImageIcon;
		if (mimeType === 'application/pdf') return PdfIcon;
		if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) return SpreadsheetIcon;
		if (mimeType.includes('document') || mimeType.includes('word')) return DocumentIcon;
		if (mimeType.includes('code') || mimeType.includes('javascript') || mimeType.includes('typescript') || mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('html') || mimeType.includes('css')) return CodeIcon;
		if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) return ArchiveIcon;
		return GenericFileIcon;
	}

	function handleFilterChange(newFilter: DocumentFilter) {
		onFilterChange?.(newFilter);
		// Reset to page 1 when filter changes
		if (newFilter !== filter && onPageChange) {
			onPageChange(1);
		}
	}

	function handleRowClick(event: MouseEvent, document: KnowledgeDocumentItem) {
		// Don't trigger if clicking on action buttons
		if ((event.target as HTMLElement).closest('button')) return;
		onSelect?.(document);
	}

	function handleDeleteClick(event: MouseEvent, documentId: string) {
		event.stopPropagation();
		onDelete?.(documentId);
	}

	function handleDownloadClick(event: MouseEvent, documentId: string) {
		event.stopPropagation();
		onDownload?.(documentId);
	}

	// Selection handlers
	function toggleSelection(documentId: string) {
		const next = new Set(selectedIds);
		if (next.has(documentId)) {
			next.delete(documentId);
		} else {
			next.add(documentId);
		}
		selectedIds = next;
	}

	function toggleSelectAll() {
		if (isAllSelected) {
			// Deselect all on current page
			const next = new Set(selectedIds);
			for (const doc of paginatedDocuments) {
				next.delete(doc.id);
			}
			selectedIds = next;
		} else {
			// Select all on current page
			const next = new Set(selectedIds);
			for (const doc of paginatedDocuments) {
				next.add(doc.id);
			}
			selectedIds = next;
		}
	}

	function clearSelection() {
		selectedIds = new Set();
	}

	async function handleBulkDelete(): Promise<boolean> {
		if (selectedIds.size === 0) return false;
		if (!onBulkDelete) return false;

		const idsToDelete = Array.from(selectedIds);
		try {
			const success = await onBulkDelete(idsToDelete);
			// Only clear selection if delete was explicitly successful
			if (success === true) {
				clearSelection();
			}
			return success;
		} catch {
			// Keep selection on error so user can retry
			return false;
		}
	}

	// Icon components
	function GenericFileIcon() {
		return `
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
				<polyline points="14 2 14 8 20 8"></polyline>
			</svg>
		`;
	}

	function ImageIcon() {
		return `
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
				<circle cx="8.5" cy="8.5" r="1.5"></circle>
				<polyline points="21 15 16 10 5 21"></polyline>
			</svg>
		`;
	}

	function PdfIcon() {
		return `
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
				<polyline points="14 2 14 8 20 8"></polyline>
				<path d="M10 12h4"></path>
				<path d="M10 16h4"></path>
			</svg>
		`;
	}

	function SpreadsheetIcon() {
		return `
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
				<line x1="3" y1="9" x2="21" y2="9"></line>
				<line x1="3" y1="15" x2="21" y2="15"></line>
				<line x1="9" y1="3" x2="9" y2="21"></line>
				<line x1="15" y1="3" x2="15" y2="21"></line>
			</svg>
		`;
	}

	function DocumentIcon() {
		return `
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
				<polyline points="14 2 14 8 20 8"></polyline>
				<line x1="16" y1="13" x2="8" y2="13"></line>
				<line x1="16" y1="17" x2="8" y2="17"></line>
			</svg>
		`;
	}

	function CodeIcon() {
		return `
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="16 18 22 12 16 6"></polyline>
				<polyline points="8 6 2 12 8 18"></polyline>
			</svg>
		`;
	}

	function ArchiveIcon() {
		return `
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="21 8 21 21 3 21 3 8"></polyline>
				<rect x="1" y="3" width="22" height="5"></rect>
				<line x1="10" y1="12" x2="14" y2="12"></line>
			</svg>
		`;
	}
</script>

<div
	class="documents-list-wrapper"
	class:drag-over={isDragOver}
	role="region"
	aria-label="Documents list with drag and drop upload"
	ondragenter={handleDragEnter}
	ondragleave={handleDragLeave}
	ondragover={handleDragOver}
	ondrop={handleDrop}
>
	<!-- Drop zone overlay - desktop only -->
	{#if isDragOver}
		<div class="drop-zone-overlay" data-testid="drop-zone-overlay">
			<div class="drop-zone-content">
				<div class="drop-zone-icon">
					{@html UploadIcon()}
				</div>
				<p class="drop-zone-text">Drop files here to upload</p>
			</div>
		</div>
	{/if}

	<div class="documents-list" class:loading>
	{#if documents.length === 0}
		<div class="empty-state">
			<div class="empty-icon">
				<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
					<polyline points="14 2 14 8 20 8"></polyline>
				</svg>
			</div>
			<p class="empty-title">No documents</p>
			<p class="empty-hint">Upload or generate documents to see them here</p>
		</div>
	{:else}
		<div class="filter-controls" role="radiogroup" aria-label="Document filter">
			<div class="filter-group">
				<label class="filter-option">
					<input
						type="radio"
						name="document-filter"
						value="all"
						checked={filter === 'all'}
						onchange={() => handleFilterChange('all')}
					/>
					<span>All</span>
				</label>
				<label class="filter-option">
					<input
						type="radio"
						name="document-filter"
						value="uploaded"
						checked={filter === 'uploaded'}
						onchange={() => handleFilterChange('uploaded')}
					/>
					<span>Uploaded</span>
				</label>
				<label class="filter-option">
					<input
						type="radio"
						name="document-filter"
						value="generated"
						checked={filter === 'generated'}
						onchange={() => handleFilterChange('generated')}
					/>
					<span>Generated</span>
				</label>
			</div>
		{#if onUpload}
			<input
				type="file"
				bind:this={fileInputRef}
				onchange={handleFileSelect}
				accept={acceptedFileTypes}
				multiple
				class="hidden-input"
				aria-hidden="true"
				data-testid="file-input"
			/>
			<button
				type="button"
				class="upload-btn"
				aria-label="Upload document"
				title="Upload document"
				disabled={isUploading}
				onclick={handleUploadClick}
			>
				{#if isUploading}
					<span class="upload-spinner"></span>
			{:else}
				{@html UploadIcon()}
			{/if}
		</button>
		{/if}
	</div>

	{#if filteredDocuments.length === 0}
			<div class="empty-state">
				<p class="empty-title">No documents match the current filter</p>
			</div>
		{:else}
			<div class="table-container">
				<table class="documents-table">
					<thead>
						<tr>
							<th class="col-checkbox">
								<label class="checkbox-label">
									<input
										type="checkbox"
										class="custom-checkbox"
										checked={isAllSelected}
										indeterminate={isIndeterminate}
										onchange={toggleSelectAll}
										aria-label="Select all documents on this page"
									/>
								</label>
							</th>
							<th class="col-icon"></th>
							<th class="col-name">Name</th>
							<th class="col-type">Type</th>
							<th class="col-size">Size</th>
							<th class="col-date">Date</th>
							<th class="col-actions">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each paginatedDocuments as document (document.id)}
							<tr
								class="document-row"
								class:selected={selectedIds.has(document.id)}
								onclick={(e) => handleRowClick(e, document)}
								tabindex="0"
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										onSelect?.(document);
									}
								}}
							>
								<td class="col-checkbox">
									<label class="checkbox-label">
										<input
											type="checkbox"
											class="custom-checkbox"
											checked={selectedIds.has(document.id)}
											onchange={() => toggleSelection(document.id)}
											onclick={(e) => e.stopPropagation()}
											aria-label="Select {document.name}"
										/>
									</label>
								</td>
								<td class="col-icon">
									<div class="file-icon" data-testid="file-icon">
										{@html getFileIcon(document.mimeType)()}
									</div>
								</td>
								<td class="col-name">
									<div class="document-name">
										{document.name}
										{#if document.isOriginal}
											<span class="original-badge">Original</span>
										{:else if document.versionNumber != null && document.documentFamilyId}
											<span class="version-badge">v{document.versionNumber}</span>
										{/if}
										{#if document.documentFamilyStatus === 'historical'}
											<span class="historical-badge">Historical</span>
										{/if}
									</div>
								</td>
								<td class="col-type">
									{#if document.documentOrigin === 'generated' || document.type === 'generated_output'}
										<span class="type-badge type-generated">Generated</span>
									{:else}
										<span class="type-badge type-uploaded">Uploaded</span>
									{/if}
								</td>
								<td class="col-size">
									{formatFileSize(document.sizeBytes)}
								</td>
								<td class="col-date">
									{formatDate(document.createdAt)}
								</td>
								<td class="col-actions">
									<div class="action-buttons">
										<button
											type="button"
											class="action-btn"
											aria-label="Download {document.name}"
											title="Download {document.name}"
											onclick={(e) => handleDownloadClick(e, document.id)}
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
												<polyline points="7 10 12 15 17 10"></polyline>
												<line x1="12" y1="15" x2="12" y2="3"></line>
											</svg>
										</button>
										<button
											type="button"
											class="action-btn action-btn-danger"
											aria-label="Delete {document.name}"
											title="Delete {document.name}"
											onclick={(e) => handleDeleteClick(e, document.id)}
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<polyline points="3 6 5 6 21 6"></polyline>
												<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
											</svg>
										</button>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>

			<!-- Bulk action bar -->
			{#if hasSelection}
				<div class="bulk-action-bar" role="toolbar" aria-label="Bulk actions">
					<div class="bulk-info">
						<span class="bulk-count">{selectedCount} selected</span>
					</div>
					<div class="bulk-actions">
						<button
							type="button"
							class="bulk-btn bulk-btn-danger"
							onclick={handleBulkDelete}
							disabled={!onBulkDelete}
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="3 6 5 6 21 6"></polyline>
								<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
							</svg>
							Delete Selected
						</button>
						<button
							type="button"
							class="bulk-btn bulk-btn-secondary"
							onclick={clearSelection}
						>
							Clear
						</button>
					</div>
				</div>
			{/if}

			{#if sortedDocuments.length > paginationLimit}
				<nav class="pagination" aria-label="Pagination">
					<div class="pagination-info">
						<span>Showing {showingFrom}-{showingTo} of {sortedDocuments.length}</span>
						<select
							class="page-size-select"
							aria-label="Items per page"
							value={paginationLimit}
							onchange={(e) => onPaginationLimitChange?.(parseInt((e.target as HTMLSelectElement).value))}
						>
							<option value={20}>20</option>
							<option value={50}>50</option>
							<option value={100}>100</option>
						</select>
					</div>
					<div class="pagination-controls">
						<span class="page-info">Page {currentPage} of {totalPages}</span>
						<button
							type="button"
							class="pagination-btn"
							aria-label="Previous page"
							disabled={currentPage <= 1}
							onclick={() => onPageChange?.(currentPage - 1)}
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="15 18 9 12 15 6"></polyline>
							</svg>
						</button>
						<button
							type="button"
							class="pagination-btn"
							aria-label="Next page"
							disabled={currentPage >= totalPages}
							onclick={() => onPageChange?.(currentPage + 1)}
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<polyline points="9 18 15 12 9 6"></polyline>
							</svg>
						</button>
					</div>
				</nav>
			{/if}
		{/if}
	{/if}
</div>
</div>

<style>
	.documents-list-wrapper {
		position: relative;
		display: flex;
		flex-direction: column;
		min-height: 200px;
	}

	/* Drop zone overlay - desktop only */
	.drop-zone-overlay {
		display: none;
		position: absolute;
		inset: 0;
		z-index: 100;
		background: color-mix(in srgb, var(--surface-elevated) 95%, transparent);
		border: 2px dashed var(--accent);
		border-radius: 1.2rem;
		backdrop-filter: blur(4px);
	}

	@media (min-width: 768px) {
		.drop-zone-overlay {
			display: flex;
			align-items: center;
			justify-content: center;
		}
	}

	.drop-zone-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-md);
		padding: var(--space-xl);
	}

	.drop-zone-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--accent) 15%, transparent);
		color: var(--accent);
	}

	.drop-zone-text {
		font-size: 1rem;
		font-weight: 500;
		color: var(--text-primary);
		margin: 0;
	}

	.documents-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--space-2xl) var(--space-lg);
		text-align: center;
		border-radius: 1.2rem;
		border: 1px dashed var(--border-default);
		background: var(--surface-elevated);
	}

	.empty-icon {
		color: var(--icon-muted);
		opacity: 0.5;
		margin-bottom: var(--space-md);
	}

	.empty-title {
		font-size: 1rem;
		font-weight: 500;
		color: var(--text-primary);
		margin: 0 0 var(--space-xs) 0;
	}

	.empty-hint {
		font-size: 0.875rem;
		color: var(--text-muted);
		margin: 0;
	}

	.filter-controls {
		display: flex;
		gap: var(--space-sm);
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
	}

	.filter-group {
		display: flex;
		gap: var(--space-sm);
		flex-wrap: wrap;
	}

	.filter-option {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-xs) var(--space-sm);
		border-radius: var(--radius-full);
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		font-size: 0.8125rem;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all var(--duration-standard) var(--ease-out);
	}

	.filter-option:has(input:checked) {
		background: var(--surface-page);
		border-color: var(--accent);
		color: var(--text-primary);
	}

	.filter-option input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
	}

	.hidden-input {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.upload-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: 1px solid var(--accent);
		border-radius: var(--radius-md);
		background: var(--accent);
		color: white;
		cursor: pointer;
		transition: all var(--duration-standard) var(--ease-out);
		flex-shrink: 0;
	}

	.upload-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--accent) 85%, black);
		border-color: color-mix(in srgb, var(--accent) 85%, black);
		color: white;
	}

	.upload-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.upload-spinner {
		display: inline-block;
		width: 16px;
		height: 16px;
		border: 2px solid var(--border-default);
		border-top-color: var(--icon-primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.table-container {
		max-height: 600px;
		overflow-y: auto;
		border-radius: 1.2rem;
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
	}

	.documents-table {
		width: 100%;
		border-collapse: collapse;
	}

	.documents-table thead {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--surface-elevated);
		border-bottom: 1px solid var(--border-default);
	}

	.documents-table th {
		padding: var(--space-md) var(--space-lg);
		text-align: left;
		font-size: 0.68rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-muted);
	}

	.documents-table td {
		padding: var(--space-md) var(--space-lg);
		border-bottom: 1px solid var(--border-subtle);
		vertical-align: middle;
	}

	.documents-table tbody tr:last-child td {
		border-bottom: none;
	}

	.document-row {
		cursor: pointer;
		transition: background-color var(--duration-standard) var(--ease-out);
	}

	.document-row:hover {
		background: var(--surface-elevated);
	}

	.document-row:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: -2px;
	}

	.col-icon {
		width: 40px;
	}

	.file-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--icon-muted);
	}

	.col-name {
		min-width: 200px;
	}

	.document-name {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		flex-wrap: wrap;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.version-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--accent) 15%, transparent);
		color: var(--accent);
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.original-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--success) 15%, transparent);
		color: var(--success);
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.historical-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.125rem 0.375rem;
		border-radius: var(--radius-sm);
		background: var(--surface-elevated);
		color: var(--text-muted);
		font-size: 0.6875rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.col-type {
		width: 100px;
	}

	.type-badge {
		display: inline-flex;
		align-items: center;
		padding: 0.25rem 0.625rem;
		border-radius: var(--radius-full);
		font-size: 0.6875rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.type-uploaded {
		background: color-mix(in srgb, var(--accent) 15%, transparent);
		color: var(--accent);
		border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
	}

	.type-generated {
		background: color-mix(in srgb, var(--text-muted) 15%, transparent);
		color: var(--text-muted);
		border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
	}

	.col-size {
		width: 80px;
		font-size: 0.8125rem;
		color: var(--text-secondary);
	}

	.col-date {
		width: 140px;
		font-size: 0.8125rem;
		color: var(--text-secondary);
	}

	.col-actions {
		width: 80px;
	}

	.action-buttons {
		display: flex;
		gap: var(--space-xs);
		justify-content: flex-end;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: none;
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--icon-muted);
		cursor: pointer;
		transition: all var(--duration-standard) var(--ease-out);
	}

	.action-btn:hover {
		background: var(--surface-elevated);
		color: var(--icon-primary);
	}

	.action-btn-danger:hover {
		background: color-mix(in srgb, var(--danger) 12%, transparent);
		color: var(--danger);
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-md) var(--space-lg);
		border-radius: 1.2rem;
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		flex-wrap: wrap;
		gap: var(--space-md);
	}

	.pagination-info {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		font-size: 0.8125rem;
		color: var(--text-secondary);
	}

	.page-size-select {
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		font-size: 0.8125rem;
		color: var(--text-primary);
		cursor: pointer;
	}

	.pagination-controls {
		display: flex;
		align-items: center;
		gap: var(--space-md);
	}

	.page-info {
		font-size: 0.8125rem;
		color: var(--text-secondary);
	}

	.pagination-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		background: var(--surface-page);
		color: var(--icon-muted);
		cursor: pointer;
		transition: all var(--duration-standard) var(--ease-out);
	}

	.pagination-btn:hover:not(:disabled) {
		background: var(--surface-page);
		color: var(--icon-primary);
		border-color: var(--accent);
	}

	.pagination-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.loading {
		opacity: 0.6;
		pointer-events: none;
	}

	/* Checkbox styles */
	.col-checkbox {
		width: 44px;
		text-align: center;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.custom-checkbox {
		appearance: none;
		width: 18px;
		height: 18px;
		border: 1.5px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-elevated);
		cursor: pointer;
		transition: all var(--duration-standard) var(--ease-out);
		position: relative;
	}

	.custom-checkbox:hover {
		border-color: var(--accent);
	}

	.custom-checkbox:checked {
		background: var(--accent);
		border-color: var(--accent);
	}

	.custom-checkbox:checked::after {
		content: '';
		position: absolute;
		left: 5px;
		top: 2px;
		width: 5px;
		height: 9px;
		border: solid white;
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
	}

	.custom-checkbox:focus-visible {
		outline: 2px solid var(--focus-ring);
		outline-offset: 2px;
	}

	/* Selected row highlight */
	.document-row.selected {
		background: color-mix(in srgb, var(--accent) 8%, transparent);
	}

	.document-row.selected:hover {
		background: color-mix(in srgb, var(--accent) 12%, transparent);
	}

	/* Bulk action bar */
	.bulk-action-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-md) var(--space-lg);
		margin-top: var(--space-md);
		border-radius: 1.2rem;
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		flex-wrap: wrap;
		gap: var(--space-md);
	}

	.bulk-info {
		display: flex;
		align-items: center;
	}

	.bulk-count {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.bulk-actions {
		display: flex;
		gap: var(--space-sm);
		align-items: center;
	}

	.bulk-btn {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-sm) var(--space-md);
		border-radius: var(--radius-md);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: all var(--duration-standard) var(--ease-out);
		border: 1px solid transparent;
	}

	.bulk-btn-danger {
		background: color-mix(in srgb, var(--danger) 12%, transparent);
		color: var(--danger);
		border-color: color-mix(in srgb, var(--danger) 30%, transparent);
	}

	.bulk-btn-danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--danger) 20%, transparent);
		border-color: var(--danger);
	}

	.bulk-btn-secondary {
		background: var(--surface-page);
		color: var(--text-secondary);
		border-color: var(--border-default);
	}

	.bulk-btn-secondary:hover {
		background: var(--surface-elevated);
		color: var(--text-primary);
		border-color: var(--accent);
	}

	.bulk-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
