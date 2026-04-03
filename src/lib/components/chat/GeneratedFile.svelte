<script lang="ts">
	import { fetchVaults, type Vault } from '$lib/client/api/knowledge';
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

<div class="generated-file-card" class:failed={status === 'failed'} class:generating={status === 'generating'}>
	<div class="file-header">
		<div class="file-icon-wrapper" class:generating={status === 'generating'}>
			{@render getFileIcon()()}
		</div>
		<div class="file-info">
			<div class="filename" title={filename}>{filename}</div>
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
				<div class="generating-progress" data-testid="generating-progress" aria-hidden="true"></div>
			{:else if status === 'failed'}
				<div class="error-text">{error || 'File generation failed'}</div>
			{/if}
			{#if saveError}
				<div class="save-error-text">{saveError}</div>
			{/if}
		</div>
	</div>

	{#if status === 'success'}
		<div class="file-actions">
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
	{/if}
</div>

<style lang="postcss">
	.generated-file-card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		padding: var(--space-md);
		border: 1px solid color-mix(in srgb, var(--border-subtle) 72%, transparent 28%);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-elevated) 52%, transparent 48%);
		max-width: 100%;
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

	.file-header {
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
	}

	.file-icon-wrapper {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
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
		gap: 2px;
		min-width: 0;
		flex: 1;
	}

	.filename {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--text-primary);
		word-break: break-word;
		overflow-wrap: break-word;
	}

	.file-size {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.saved-status {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.75rem;
		color: var(--success, #22c55e);
		margin-top: 2px;
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
		position: relative;
		margin-top: var(--space-xs);
		height: 0.35rem;
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
		font-size: 0.75rem;
		color: var(--danger);
		word-break: break-word;
	}

	.save-error-text {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.75rem;
		color: var(--danger);
		word-break: break-word;
		margin-top: 2px;
	}

	.file-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		padding-top: var(--space-sm);
		border-top: 1px solid color-mix(in srgb, var(--border-subtle) 50%, transparent 50%);
	}

	.action-button {
		display: inline-flex;
		align-items: center;
		gap: var(--space-xs);
		font-size: 0.8rem;
		padding: 0.25rem 0.6rem;
		min-height: 32px;
		text-decoration: none;
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
</style>
