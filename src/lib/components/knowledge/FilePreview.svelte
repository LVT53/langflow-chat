<script lang="ts">
	import { onMount } from 'svelte';
	import type { Artifact } from '$lib/types';

	let {
		open,
		artifactId,
		filename,
		mimeType,
		onClose,
	}: {
		open: boolean;
		artifactId: string | null;
		filename: string;
		mimeType: string | null;
		onClose: () => void;
	} = $props();

	let content = $state<Blob | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let htmlContent = $state<string | null>(null);
	let fileType = $state<'pdf' | 'docx' | 'xlsx' | 'pptx' | 'image' | 'text' | 'unsupported'>('unsupported');

	const fileTypeIcons: Record<string, string> = {
		pdf: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10 13v-1a2 2 0 0 1 2-2h4"/><path d="M10 13v-1a2 2 0 0 0-2-2H4"/><line x1="10" y1="13" x2="10" y2="18"/></svg>`,
		docx: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
		xlsx: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>`,
		pptx: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><rect x="8" y="12" width="8" height="6" rx="1"/></svg>`,
		image: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
		text: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>`,
		unsupported: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`,
	};

	function determineFileType(mime: string | null, name: string): typeof fileType {
		if (!mime) {
			const ext = name.split('.').pop()?.toLowerCase();
			if (ext === 'pdf') return 'pdf';
			if (ext === 'docx') return 'docx';
			if (ext === 'xlsx') return 'xlsx';
			if (ext === 'pptx') return 'pptx';
			if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) return 'image';
			if (['txt', 'md', 'json', 'csv'].includes(ext || '')) return 'text';
			return 'unsupported';
		}

		if (mime.includes('pdf')) return 'pdf';
		if (mime.includes('wordprocessingml')) return 'docx';
		if (mime.includes('spreadsheetml')) return 'xlsx';
		if (mime.includes('presentationml')) return 'pptx';
		if (mime.startsWith('image/')) return 'image';
		if (mime.startsWith('text/') || mime === 'application/json' || mime === 'application/csv') return 'text';
		
		return 'unsupported';
	}

	$effect(() => {
		if (open && artifactId) {
			fileType = determineFileType(mimeType, filename);
			fetchFile(artifactId);
		}
	});

	async function fetchFile(id: string) {
		isLoading = true;
		error = null;
		content = null;
		htmlContent = null;

		try {
			const response = await fetch(`/api/knowledge/${id}/preview`);
			
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error('File not found');
				}
				throw new Error('Failed to load file');
			}

			const blob = await response.blob();
			content = blob;

			if (fileType === 'docx') {
				await renderDocx(blob);
			} else if (fileType === 'xlsx') {
				await renderXlsx(blob);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load file';
		} finally {
			isLoading = false;
		}
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
			const XLSX = await import('xlsx');
			const arrayBuffer = await blob.arrayBuffer();
			const workbook = XLSX.read(arrayBuffer, { type: 'array' });
			
			let html = '<div class="xlsx-container">';
			workbook.SheetNames.forEach((sheetName) => {
				const worksheet = workbook.Sheets[sheetName];
				const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];
				
				html += `<div class="sheet"><h4>${sheetName}</h4><table class="xlsx-table">`;
				data.forEach((row) => {
					html += '<tr>';
					(row as unknown[]).forEach((cell) => {
						html += `<td>${cell ?? ''}</td>`;
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

	function getObjectUrl(): string | null {
		if (!content) return null;
		return URL.createObjectURL(content);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
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
		if (!content || !artifactId) return;
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
	<div
		class="fixed inset-0 z-[120] flex items-center justify-center bg-surface-overlay/65 p-4 backdrop-blur-sm"
		role="presentation"
		onclick={handleBackdropClick}
	>
		<div
			role="dialog"
			aria-modal="true"
			tabindex={-1}
			class="max-h-[90vh] w-full max-w-[1000px] overflow-hidden rounded-[1.6rem] border border-border bg-surface-elevated shadow-2xl"
			onclick={handleModalClick}
		>
			<div class="flex items-start justify-between gap-4 border-b border-border px-5 py-4 md:px-6">
				<div class="flex items-center gap-3 min-w-0">
					<div class="flex-shrink-0 text-icon-muted">
						{@html getFileIcon()}
					</div>
					<div class="min-w-0">
						<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
							File Preview
						</div>
						<h3 class="mt-1 text-lg font-serif tracking-[-0.02em] text-text-primary truncate">
							{filename}
						</h3>
					</div>
				</div>
				<div class="flex items-center gap-2 flex-shrink-0">
					{#if content}
						<button
							type="button"
							class="btn-secondary text-sm"
							onclick={downloadFile}
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
							</svg>
							Download
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

			<div class="max-h-[calc(90vh-80px)] overflow-y-auto">
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
							onclick={() => artifactId && fetchFile(artifactId)}
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
						<iframe
							src={getObjectUrl()}
							title={filename}
							class="w-full h-[70vh] border-0"
						></iframe>
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
							<pre class="rounded-[1rem] border border-border bg-surface-page p-4 font-mono text-sm text-text-primary overflow-x-auto whitespace-pre-wrap">{content ? (async () => { const text = await content.text(); return text; })() : ''}</pre>
						</div>
					{/if}
				{:else if fileType === 'docx' || fileType === 'xlsx'}
					{#if htmlContent}
						<div class="p-6 docx-preview">
							{@html htmlContent}
						</div>
					{/if}
				{:else}
					<div class="m-6 rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-center">
						<p class="text-sm text-text-muted">Preview not available</p>
					</div>
				{/if}
			</div>
		</div>
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

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
</style>
