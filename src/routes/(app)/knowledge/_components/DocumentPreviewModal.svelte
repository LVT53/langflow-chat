<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import type { KnowledgeDocumentItem } from '$lib/types';

	interface DocumentPreviewModalProps {
		document: KnowledgeDocumentItem | null;
		open: boolean;
		onClose: () => void;
		onDownload?: (documentId: string) => void;
		onDelete?: (documentId: string) => void;
	}

	let {
		document,
		open,
		onClose,
		onDownload,
		onDelete,
	}: DocumentPreviewModalProps = $props();

	let dialogRef = $state<HTMLDivElement | undefined>(undefined);
	let previousFocus: HTMLElement | null = null;
	let content = $state<string | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	function formatFileSize(bytes: number | null | undefined): string {
		if (!bytes) return '0 B';
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		const value = bytes / Math.pow(k, i);
		const formatted = value % 1 === 0 ? value.toString() : value.toFixed(1);
		return `${formatted} ${sizes[i]}`;
	}

	function formatDate(timestamp: number): string {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(timestamp);
	}

	function getTypeBadgeLabel(doc: KnowledgeDocumentItem): string {
		if (doc.documentOrigin === 'generated' || doc.type === 'generated_output') {
			return 'Generated';
		}
		return 'Uploaded';
	}

	function getTypeBadgeClass(doc: KnowledgeDocumentItem): string {
		if (doc.documentOrigin === 'generated' || doc.type === 'generated_output') {
			return 'type-generated';
		}
		return 'type-uploaded';
	}

	async function fetchDocumentContent() {
		if (!document) return;

		isLoading = true;
		error = null;
		content = null;

		try {
			// Use the prompt artifact ID if available (normalized content), otherwise display artifact
			const artifactId = document.promptArtifactId ?? document.displayArtifactId;
			const response = await fetch(`/api/knowledge/${artifactId}/preview`);

			if (!response.ok) {
				if (response.status === 404) {
					throw new Error('Document content not found');
				}
				throw new Error('Failed to load document content');
			}

			const text = await response.text();
			content = text;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load document content';
		} finally {
			isLoading = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (!open) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			onClose();
		} else if (event.key === 'Tab') {
			// Focus trap
			const focusableElements = dialogRef?.querySelectorAll(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			if (!focusableElements || focusableElements.length === 0) return;

			const firstElement = focusableElements[0] as HTMLElement;
			const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

			if (event.shiftKey) {
				if (globalThis.document.activeElement === firstElement) {
					lastElement.focus();
					event.preventDefault();
				}
			} else {
				if (globalThis.document.activeElement === lastElement) {
					firstElement.focus();
					event.preventDefault();
				}
			}
		}
	}

	function handleBackdropClick() {
		onClose();
	}

	function handleModalClick(event: MouseEvent) {
		event.stopPropagation();
	}

	function handleDownload() {
		if (document && onDownload) {
			onDownload(document.id);
		}
	}

	function handleDelete() {
		if (document && onDelete) {
			onDelete(document.id);
		}
	}

	$effect(() => {
		if (open && document) {
			void fetchDocumentContent();
		}
	});

	onMount(() => {
		const body = globalThis.document?.body;
		if (!body) return;
		previousFocus = globalThis.document.activeElement as HTMLElement;
		body.style.overflow = 'hidden';
	});

	onDestroy(() => {
		if (previousFocus) {
			previousFocus.focus();
		}
		const body = globalThis.document?.body;
		if (!body) return;
		body.style.overflow = '';
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && document}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		data-testid="document-preview-modal"
		class="fixed inset-0 z-50 flex items-center justify-center p-4"
		transition:fade={{ duration: 150 }}
	>
		<div
			class="absolute inset-0 bg-surface-page opacity-80 backdrop-blur-sm"
			onclick={handleBackdropClick}
		></div>

		<div
			bind:this={dialogRef}
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-labelledby="document-preview-title"
			class="relative w-full max-w-[800px] max-h-[90vh] rounded-xl border border-border bg-surface-page shadow-lg flex flex-col overflow-hidden"
			onclick={handleModalClick}
			transition:scale={{ duration: 150, start: 0.95 }}
		>
			<div class="preview-header">
				<div class="flex items-center gap-3 min-w-0">
					<div class="flex-shrink-0 text-icon-muted">
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
							<polyline points="14 2 14 8 20 8"></polyline>
						</svg>
					</div>
					<div class="min-w-0">
						<div class="flex items-center gap-2 mb-1">
							<span class="type-badge {getTypeBadgeClass(document)}">
								{getTypeBadgeLabel(document)}
							</span>
							{#if document.versionNumber != null && document.documentFamilyId}
								<span class="version-badge">v{document.versionNumber}</span>
							{/if}
							{#if document.documentFamilyStatus === 'historical'}
								<span class="historical-badge">Historical</span>
							{/if}
						</div>
						<h2 id="document-preview-title" class="text-lg font-semibold text-text-primary truncate">
							{document.name}
						</h2>
					</div>
				</div>
				<button
					type="button"
					class="btn-icon-bare h-10 w-10 rounded-full text-icon-muted hover:text-text-primary flex-shrink-0"
					onclick={onClose}
					aria-label="Close document preview"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" x2="6" y1="6" y2="18" />
						<line x1="6" x2="18" y1="6" y2="18" />
					</svg>
				</button>
			</div>

			<div class="metadata-section">
				<div class="metadata-grid">
					<div class="metadata-item">
						<span class="metadata-label">Size</span>
						<span class="metadata-value">{formatFileSize(document.sizeBytes)}</span>
					</div>
					<div class="metadata-item">
						<span class="metadata-label">Created</span>
						<span class="metadata-value">{formatDate(document.createdAt)}</span>
					</div>
					<div class="metadata-item">
						<span class="metadata-label">Updated</span>
						<span class="metadata-value">{formatDate(document.updatedAt)}</span>
					</div>
					{#if document.originConversationId}
						<div class="metadata-item">
							<span class="metadata-label">Source Chat</span>
							<a
								href="/chat/{document.originConversationId}"
								class="metadata-link"
								target="_blank"
								rel="noopener noreferrer"
							>
								View conversation
								<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
									<polyline points="15 3 21 3 21 9"></polyline>
									<line x1="10" y1="14" x2="21" y2="3"></line>
								</svg>
							</a>
						</div>
					{/if}
				</div>
			</div>

			<div class="preview-body">
				{#if isLoading}
					<div class="loading-state">
						<div class="spinner"></div>
						<p class="text-sm text-text-muted">Loading document content...</p>
					</div>
				{:else if error}
					<div class="error-state">
						<svg class="mx-auto mb-3 text-danger" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
						</svg>
						<p class="text-sm font-sans text-danger mb-2">{error}</p>
						<button
							type="button"
							class="btn-secondary text-sm mt-2"
							onclick={() => void fetchDocumentContent()}
						>
							Retry
						</button>
					</div>
				{:else if content}
					<div class="content-container">
						<pre class="content-text">{content}</pre>
					</div>
				{:else}
					<div class="empty-content">
						<svg class="mx-auto mb-3 text-icon-muted" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
							<polyline points="14 2 14 8 20 8"></polyline>
						</svg>
						<p class="text-sm text-text-muted">No preview content available</p>
					</div>
				{/if}
			</div>

			<div class="preview-footer">
				<button
					type="button"
					class="btn-secondary cursor-pointer"
					onclick={handleDownload}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
						<polyline points="7 10 12 15 17 10"></polyline>
						<line x1="12" y1="15" x2="12" y2="3"></line>
					</svg>
					Download
				</button>
				<button
					type="button"
					class="btn-danger cursor-pointer"
					onclick={handleDelete}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<polyline points="3 6 5 6 21 6"></polyline>
						<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
					</svg>
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
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
		background: color-mix(in srgb, #3B82F6 15%, transparent);
		color: #3B82F6;
		border: 1px solid color-mix(in srgb, #3B82F6 30%, transparent);
	}

	.type-generated {
		background: color-mix(in srgb, #8B5CF6 15%, transparent);
		color: #8B5CF6;
		border: 1px solid color-mix(in srgb, #8B5CF6 30%, transparent);
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

	.metadata-section {
		padding: 0.75rem 1.25rem;
		border-bottom: 1px solid var(--border-subtle);
		background: var(--surface-page);
	}

	.metadata-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.75rem;
	}

	.metadata-item {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.metadata-label {
		font-size: 0.68rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-muted);
	}

	.metadata-value {
		font-size: 0.8125rem;
		color: var(--text-primary);
	}

	.metadata-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.8125rem;
		color: var(--accent);
		text-decoration: none;
		transition: color var(--duration-standard) var(--ease-out);
	}

	.metadata-link:hover {
		color: color-mix(in srgb, var(--accent) 80%, var(--text-primary) 20%);
	}

	.preview-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 1rem;
	}

	.loading-state,
	.error-state,
	.empty-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		text-align: center;
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid color-mix(in srgb, var(--border-default) 50%, transparent);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin-bottom: 0.75rem;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.content-container {
		border-radius: 0.75rem;
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		overflow: hidden;
	}

	.content-text {
		margin: 0;
		padding: 1rem;
		font-family: var(--font-mono, 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace);
		font-size: 0.8125rem;
		line-height: 1.6;
		color: var(--text-primary);
		white-space: pre-wrap;
		word-break: break-word;
		overflow-x: auto;
	}

	.preview-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid var(--border-default);
		background: var(--surface-page);
	}

	.btn-secondary {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-default);
		background: var(--surface-elevated);
		color: var(--text-primary);
		font-size: 0.875rem;
		font-weight: 500;
		transition: all var(--duration-standard) var(--ease-out);
	}

	.btn-secondary:hover {
		background: var(--surface-overlay);
		border-color: var(--border-focus);
	}

	.btn-danger {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border-radius: var(--radius-md);
		border: 1px solid color-mix(in srgb, var(--danger) 30%, transparent);
		background: color-mix(in srgb, var(--danger) 10%, transparent);
		color: var(--danger);
		font-size: 0.875rem;
		font-weight: 500;
		transition: all var(--duration-standard) var(--ease-out);
	}

	.btn-danger:hover {
		background: color-mix(in srgb, var(--danger) 20%, transparent);
		border-color: color-mix(in srgb, var(--danger) 50%, transparent);
	}

	:global(.btn-icon-bare) {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		border: none;
		border-radius: 9999px;
		background: transparent;
		cursor: pointer;
		transition: all var(--duration-standard) var(--ease-out);
	}

	:global(.btn-icon-bare:hover) {
		background: var(--surface-elevated);
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
</style>
