<script lang="ts">
	import type { DocumentWorkspaceItem } from '$lib/types';

	type FilePreviewModule = typeof import('$lib/components/knowledge/FilePreview.svelte');

	interface GeneratedFileProps {
		fileId: string;
		conversationId: string;
		artifactId?: string | null;
		documentFamilyId?: string | null;
		documentFamilyStatus?: 'active' | 'historical' | null;
		documentLabel?: string | null;
		documentRole?: string | null;
		versionNumber?: number | null;
		originConversationId?: string | null;
		originAssistantMessageId?: string | null;
		sourceChatFileId?: string | null;
		filename: string;
		size: number;
		mimeType: string;
		downloadUrl: string;
		status: 'generating' | 'success' | 'failed';
		error?: string;
		onOpen?: ((document: DocumentWorkspaceItem) => void) | undefined;
	}

	let {
		fileId,
		conversationId,
		artifactId = null,
		documentFamilyId = null,
		documentFamilyStatus = null,
		documentLabel = null,
		documentRole = null,
		versionNumber = null,
		originConversationId = null,
		originAssistantMessageId = null,
		sourceChatFileId = null,
		filename,
		size,
		mimeType,
		downloadUrl,
		status,
		error,
		onOpen = undefined,
	}: GeneratedFileProps = $props();

	let showPreview = $state(false);
	let canPreview = $derived(status === 'success');
	let filePreviewModulePromise: Promise<FilePreviewModule> | null = null;

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		const value = bytes / Math.pow(k, i);
		return `${value.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
	}

	function getFileIcon() {
		if (mimeType.startsWith('image/')) {
			return ImageIcon;
		}
		if (mimeType === 'application/pdf') {
			return PdfIcon;
		}
		if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
			return SpreadsheetIcon;
		}
		if (mimeType.includes('document') || mimeType.includes('word')) {
			return DocumentIcon;
		}
		if (mimeType.includes('code') || mimeType.includes('javascript') || mimeType.includes('typescript') || mimeType.includes('json') || mimeType.includes('xml') || mimeType.includes('html') || mimeType.includes('css')) {
			return CodeIcon;
		}
		if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) {
			return ArchiveIcon;
		}
		return GenericFileIcon;
	}

	function handlePreviewOpen() {
		if (!canPreview) return;
		if (onOpen) {
			onOpen({
				id: fileId,
				source: 'chat_generated_file',
				filename,
				title: documentLabel ?? filename,
				documentFamilyId,
				documentFamilyStatus,
				documentLabel,
				documentRole,
				versionNumber,
				originConversationId,
				originAssistantMessageId,
				sourceChatFileId,
				mimeType,
				previewUrl: `/api/chat/files/${fileId}/preview`,
				artifactId,
				conversationId,
				downloadUrl,
			});
			return;
		}
		showPreview = true;
	}

	function handlePreviewClose() {
		showPreview = false;
	}

	async function ensureFilePreviewModule() {
		if (!filePreviewModulePromise) {
			filePreviewModulePromise = import('$lib/components/knowledge/FilePreview.svelte');
		}

		return filePreviewModulePromise;
	}

	function stopActionPropagation(event: MouseEvent) {
		event.stopPropagation();
	}

</script>

{#snippet GenericFileIcon()}
	<svg
		data-testid="file-icon"
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
		<polyline points="14 2 14 8 20 8" />
		<line x1="16" x2="8" y1="13" y2="13" />
		<line x1="16" x2="8" y1="17" y2="17" />
		<line x1="10" x2="8" y1="9" y2="9" />
	</svg>
{/snippet}

{#snippet PdfIcon()}
	<svg
		data-testid="file-icon"
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
		<polyline points="14 2 14 8 20 8" />
		<path d="M8 12h8" />
		<path d="M8 16h8" />
		<path d="M10 8h4" />
	</svg>
{/snippet}

{#snippet ImageIcon()}
	<svg
		data-testid="file-icon"
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
		<circle cx="9" cy="9" r="2" />
		<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
	</svg>
{/snippet}

{#snippet SpreadsheetIcon()}
	<svg
		data-testid="file-icon"
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
		<polyline points="14 2 14 8 20 8" />
		<path d="M8 13h2" />
		<path d="M8 17h2" />
		<path d="M14 13h2" />
		<path d="M14 17h2" />
	</svg>
{/snippet}

{#snippet DocumentIcon()}
	<svg
		data-testid="file-icon"
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
		<polyline points="14 2 14 8 20 8" />
		<line x1="16" x2="8" y1="13" y2="13" />
		<line x1="16" x2="8" y1="17" y2="17" />
		<line x1="10" x2="8" y1="9" y2="9" />
	</svg>
{/snippet}

{#snippet CodeIcon()}
	<svg
		data-testid="file-icon"
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<polyline points="16 18 22 12 16 6" />
		<polyline points="8 6 2 12 8 18" />
	</svg>
{/snippet}

{#snippet ArchiveIcon()}
	<svg
		data-testid="file-icon"
		xmlns="http://www.w3.org/2000/svg"
		width="20"
		height="20"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M4 4v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4" />
		<rect x="8" y="10" width="8" height="8" rx="1" />
		<path d="M8 10V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3" />
	</svg>
{/snippet}

{#snippet SpinnerIcon()}
	<svg
		data-testid="generating-spinner"
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		class="spinner"
	>
		<path d="M21 12a9 9 0 1 1-6.219-8.56" />
	</svg>
{/snippet}

{#if showPreview}
	{#await ensureFilePreviewModule() then { default: FilePreviewComponent }}
		<FilePreviewComponent
			open={showPreview}
			artifactId={null}
			previewUrl={`/api/chat/files/${fileId}/preview`}
			filename={filename}
			{mimeType}
			onClose={handlePreviewClose}
		/>
	{:catch}
		<div class="save-error-text">Failed to load preview.</div>
	{/await}
{/if}

<div
	class="generated-file-card"
	class:clickable={canPreview}
	class:failed={status === 'failed'}
	class:generating={status === 'generating'}
	data-testid="generated-file-card"
>
	{#if canPreview}
		<button
			type="button"
			class="preview-trigger"
			aria-label={`Preview ${filename}`}
			onclick={handlePreviewOpen}
		></button>
	{/if}
	<div class="file-main">
		<div class="file-icon-wrapper" class:generating={status === 'generating'}>
			{@render getFileIcon()()}
		</div>
		<div class="file-info">
			<div class="filename" title={filename}>{filename}</div>
			<div class="file-meta-row">
				{#if status === 'success'}
					<div class="file-size">{formatFileSize(size)}</div>
				{:else if status === 'generating'}
					<div class="generating-text">
						{@render SpinnerIcon()}
						<span>Generating...</span>
					</div>
				{:else if status === 'failed'}
					<div class="error-text">{error || 'File generation failed'}</div>
				{/if}
			</div>
		</div>
	</div>

	{#if status === 'success'}
		<div class="file-actions">
			<a
				href={downloadUrl}
				class="btn-secondary action-button"
				class:action-button--download={true}
				download={filename}
				aria-label={`Download ${filename}`}
				title={`Download ${filename}`}
				onclick={stopActionPropagation}
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="14"
					height="14"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="7 10 12 15 17 10" />
					<line x1="12" x2="12" y1="15" y2="3" />
				</svg>
			</a>
		</div>
	{:else if status === 'generating'}
		<div class="generating-progress" data-testid="generating-progress" aria-hidden="true"></div>
	{/if}
</div>

<style lang="postcss">
	.generated-file-card {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding: 0.7rem 0.85rem;
		border: 1px solid color-mix(in srgb, var(--border-subtle) 72%, transparent 28%);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-elevated) 52%, transparent 48%);
		max-width: 100%;
		min-height: 3.5rem;
	}

	.generated-file-card.clickable {
		cursor: pointer;
		transition:
			border-color var(--duration-standard) var(--ease-out),
			background var(--duration-standard) var(--ease-out),
			box-shadow var(--duration-standard) var(--ease-out);
	}

	.generated-file-card.clickable:hover {
		border-color: color-mix(in srgb, var(--accent) 28%, var(--border-subtle) 72%);
		background: color-mix(in srgb, var(--surface-elevated) 70%, var(--accent) 8%);
		box-shadow: var(--shadow-sm);
	}

	.generated-file-card.clickable:focus-visible {
		outline: none;
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--focus-ring) 82%, transparent 18%),
			var(--shadow-sm);
	}

	.generated-file-card.generating {
		overflow: hidden;
	}

	.generated-file-card.generating::after {
		content: '';
		position: absolute;
		inset: 0;
		pointer-events: none;
		background: linear-gradient(
			100deg,
			transparent 0%,
			color-mix(in srgb, var(--accent) 14%, transparent 86%) 42%,
			transparent 72%
		);
		transform: translateX(-140%);
		animation: generated-file-shimmer 1.6s ease-in-out infinite;
	}

	.generated-file-card.failed {
		border-color: color-mix(in srgb, var(--danger) 30%, var(--border-subtle) 70%);
		background: color-mix(in srgb, var(--danger) 5%, var(--surface-elevated) 95%);
	}

	.file-main {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
		min-width: 0;
		flex: 1 1 auto;
		position: relative;
		z-index: 1;
		pointer-events: none;
	}

	.file-icon-wrapper {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 34px;
		height: 34px;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--surface-page) 70%, var(--surface-elevated) 30%);
		color: var(--icon-muted);
	}

	.file-icon-wrapper.generating {
		color: var(--accent);
	}

	.file-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		flex: 1 1 auto;
	}

	.filename {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.86rem;
		font-weight: 600;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.file-meta-row {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.35rem 0.5rem;
	}

	.file-size {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.generating-text {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.75rem;
		color: var(--accent);
	}

	.generating-progress {
		position: absolute;
		left: 0.85rem;
		right: 0.85rem;
		bottom: 0.45rem;
		height: 0.18rem;
		border-radius: 999px;
		overflow: hidden;
		background: color-mix(in srgb, var(--accent) 12%, var(--surface-page) 88%);
	}

	.generating-progress::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			90deg,
			transparent 0%,
			color-mix(in srgb, var(--accent) 72%, white 28%) 50%,
			transparent 100%
		);
		transform: translateX(-100%);
		animation: generated-file-shimmer 1.3s linear infinite;
	}

	.error-text {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.72rem;
		color: var(--danger);
	}

	.file-actions {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.4rem;
		flex: 0 0 auto;
		position: relative;
		z-index: 1;
	}

	.preview-trigger {
		position: absolute;
		inset: 0;
		border: 0;
		border-radius: inherit;
		background: transparent;
		cursor: pointer;
	}

	.preview-trigger:focus-visible {
		outline: none;
		box-shadow:
			0 0 0 2px color-mix(in srgb, var(--focus-ring) 82%, transparent 18%),
			var(--shadow-sm);
	}

	.action-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border-radius: 9999px;
		text-decoration: none;
		color: var(--icon-secondary);
		background: color-mix(in srgb, var(--surface-page) 64%, var(--surface-elevated) 36%);
		border-color: color-mix(in srgb, var(--border-subtle) 72%, transparent 28%);
	}

	.action-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.action-button--download {
		color: color-mix(in srgb, var(--accent) 64%, var(--text-primary) 36%);
		background: color-mix(in srgb, var(--accent) 10%, var(--surface-page) 90%);
	}

	.action-button:not(:disabled):hover {
		background: color-mix(in srgb, var(--surface-page) 42%, var(--surface-elevated) 58%);
		border-color: color-mix(in srgb, var(--border-default) 78%, transparent 22%);
	}

	.action-button--download:not(:disabled):hover {
		background: color-mix(in srgb, var(--accent) 16%, var(--surface-page) 84%);
	}

	.spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	@keyframes generated-file-shimmer {
		from {
			transform: translateX(-120%);
		}

		to {
			transform: translateX(120%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}

		.generated-file-card.generating::after,
		.generating-progress::after {
			animation: none;
			transform: none;
		}
	}

	@media (max-width: 720px) {
		.generated-file-card {
			flex-wrap: wrap;
			align-items: flex-start;
		}

		.file-actions {
			width: 100%;
			justify-content: flex-start;
		}
	}
</style>
