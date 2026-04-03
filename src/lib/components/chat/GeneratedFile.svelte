<script lang="ts">
	import { fetchVaults, type Vault } from '$lib/client/api/knowledge';
	import AttachmentContentModal from './AttachmentContentModal.svelte';
	import VaultPickerModal from './VaultPickerModal.svelte';

	interface GeneratedFileProps {
		fileId: string;
		conversationId: string;
		filename: string;
		size: number;
		mimeType: string;
		downloadUrl: string;
		status: 'generating' | 'success' | 'failed';
		error?: string;
		vaults?: Vault[];
		savedVaultName?: string | null;
	}

	let {
		fileId,
		conversationId,
		filename,
		size,
		mimeType,
		downloadUrl,
		status,
		error,
		vaults = [],
		savedVaultName = null,
	}: GeneratedFileProps = $props();

	let showVaultPicker = $state(false);
	let showPreview = $state(false);
	let isSaving = $state(false);
	let isLoadingVaults = $state(false);
	let saveError = $state<string | null>(null);
	let currentSavedVaultName = $state<string | null>(null);
	let availableVaults = $state<Vault[]>([]);

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

	$effect(() => {
		if (currentSavedVaultName === null && savedVaultName) {
			currentSavedVaultName = savedVaultName;
		}
		if (vaults.length > 0) {
			availableVaults = vaults;
		}
	});

	async function handleSaveToVault() {
		if (currentSavedVaultName) return;
		saveError = null;

		if (availableVaults.length === 0) {
			isLoadingVaults = true;
			try {
				availableVaults = await fetchVaults();
			} catch (err) {
				saveError = err instanceof Error ? err.message : 'Failed to load vaults';
				return;
			} finally {
				isLoadingVaults = false;
			}
		}

		showVaultPicker = true;
	}

	function handleVaultPickerCancel() {
		showVaultPicker = false;
	}

	function handlePreviewOpen() {
		showPreview = true;
	}

	function handlePreviewClose() {
		showPreview = false;
	}

	async function handleVaultPickerSave(vaultId: string) {
		isSaving = true;
		saveError = null;

		try {
			const response = await fetch(`/api/chat/files/${fileId}/save-to-vault`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ conversationId, vaultId }),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to save to vault');
			}

			const data = await response.json();
			currentSavedVaultName = data.vaultName;
			showVaultPicker = false;
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Failed to save to vault';
		} finally {
			isSaving = false;
		}
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

{#if showVaultPicker}
	<VaultPickerModal
		vaults={availableVaults}
		{filename}
		onSave={handleVaultPickerSave}
		onCancel={handleVaultPickerCancel}
	/>
{/if}

<AttachmentContentModal
	open={showPreview}
	artifactId={null}
	contentUrl={`/api/chat/files/${fileId}/preview`}
	filename={filename}
	eyebrowLabel="Generated file"
	emptyMessage="No extracted preview is available for this file."
	errorMessage="Failed to load generated file preview."
	onClose={handlePreviewClose}
/>

<div class="generated-file-card" class:failed={status === 'failed'} class:generating={status === 'generating'}>
	<div class="file-main">
		<div class="file-icon-wrapper" class:generating={status === 'generating'}>
			{@render getFileIcon()()}
		</div>
		<div class="file-info">
			<div class="filename" title={filename}>{filename}</div>
			<div class="file-meta-row">
				{#if status === 'success'}
					<div class="file-size">{formatFileSize(size)}</div>
					{#if currentSavedVaultName}
						<div class="saved-status">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								aria-hidden="true"
							>
								<polyline points="20 6 9 17 4 12" />
							</svg>
							<span>Saved to Vault: {currentSavedVaultName}</span>
						</div>
					{/if}
				{:else if status === 'generating'}
					<div class="generating-text">
						{@render SpinnerIcon()}
						<span>Generating...</span>
					</div>
				{:else if status === 'failed'}
					<div class="error-text">{error || 'File generation failed'}</div>
				{/if}
				{#if saveError}
					<div class="save-error-text">{saveError}</div>
				{/if}
			</div>
		</div>
	</div>

	{#if status === 'success'}
		<div class="file-actions">
			<button
				type="button"
				class="btn-secondary action-button"
				onclick={handlePreviewOpen}
				aria-label={`Preview ${filename}`}
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
					<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
					<circle cx="12" cy="12" r="3" />
				</svg>
				<span>Preview</span>
			</button>

			<a
				href={downloadUrl}
				class="btn-secondary action-button"
				download={filename}
				aria-label={`Download ${filename}`}
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
				<span>Download</span>
			</a>

			<button
				type="button"
				class="btn-secondary action-button"
				class:saved={currentSavedVaultName}
				onclick={handleSaveToVault}
				disabled={isSaving || isLoadingVaults || !!currentSavedVaultName}
				aria-label={currentSavedVaultName ? `Saved to ${currentSavedVaultName}` : `Save ${filename} to vault`}
			>
				{#if isSaving || isLoadingVaults}
					{@render SpinnerIcon()}
					<span>{isSaving ? 'Saving...' : 'Loading vaults...'}</span>
				{:else}
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
						<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z" />
					</svg>
					<span>{currentSavedVaultName ? 'Saved' : 'Save to Vault'}</span>
				{/if}
			</button>
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

	.saved-status {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.75rem;
		color: var(--success, #22c55e);
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

	.save-error-text {
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
	}

	.action-button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: 0.77rem;
		padding: 0.2rem 0.55rem;
		min-height: 28px;
		text-decoration: none;
		white-space: nowrap;
	}

	.action-button.saved {
		color: var(--success, #22c55e);
		cursor: default;
	}

	.action-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
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
