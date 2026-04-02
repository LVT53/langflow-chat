<script lang="ts">
	import type { KnowledgeUploadResponse } from '$lib/types';
	import { uploadKnowledgeAttachment } from '$lib/client/api/knowledge';

	let {
		vaultId,
		conversationId,
		onUploadStart,
		onUploadSuccess,
		onUploadError,
	}: {
		vaultId: string;
		conversationId?: string | null;
		onUploadStart?: () => void;
		onUploadSuccess?: (response: KnowledgeUploadResponse) => void;
		onUploadError?: (error: string) => void;
	} = $props();

	let inputRef = $state<HTMLInputElement | undefined>(undefined);
	let isUploading = $state(false);
	let uploadProgress = $state(0);

	function handleClick() {
		inputRef?.click();
	}

	async function handleFileChange(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		isUploading = true;
		uploadProgress = 0;
		onUploadStart?.();

		try {
			const response = await uploadKnowledgeAttachment(file, conversationId, vaultId);
			uploadProgress = 100;
			onUploadSuccess?.(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Upload failed';
			onUploadError?.(message);
		} finally {
			isUploading = false;
			uploadProgress = 0;
			if (input) {
				input.value = '';
			}
		}
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();

		const file = event.dataTransfer?.files?.[0];
		if (!file) return;

		isUploading = true;
		uploadProgress = 0;
		onUploadStart?.();

		try {
			const response = await uploadKnowledgeAttachment(file, conversationId, vaultId);
			uploadProgress = 100;
			onUploadSuccess?.(response);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Upload failed';
			onUploadError?.(message);
		} finally {
			isUploading = false;
			uploadProgress = 0;
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		event.stopPropagation();
	}
</script>

<div
	class="vault-upload"
	role="button"
	tabindex="0"
	onclick={handleClick}
	onkeydown={(e) => e.key === 'Enter' && handleClick()}
	ondragover={handleDragOver}
	ondrop={handleDrop}
>
	<input
		type="file"
		bind:this={inputRef}
		onchange={handleFileChange}
		accept=".pdf,.doc,.docx,.txt,.md,.json,.csv,.xlsx,.xls,.pptx,.ppt,.html,.htm"
		class="hidden"
		data-testid="vault-file-input"
	/>

	{#if isUploading}
		<div class="upload-progress" data-testid="upload-progress">
			<div class="spinner"></div>
			<span class="text-[11px] text-text-muted">Uploading...</span>
		</div>
	{:else}
		<button
			type="button"
			class="upload-btn"
			data-testid="vault-upload-btn"
			aria-label="Upload file to vault"
		>
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
			>
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="17 8 12 3 7 8" />
				<line x1="12" y1="3" x2="12" y2="15" />
			</svg>
		</button>
	{/if}
</div>

<style>
	.vault-upload {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.upload-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border-radius: var(--radius-sm);
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--icon-muted);
		transition: color 0.15s ease, background-color 0.15s ease;
	}

	.upload-btn:hover {
		color: var(--icon-primary);
		background: var(--surface-elevated);
	}

	.upload-btn:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--accent);
	}

	.upload-progress {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.spinner {
		width: 12px;
		height: 12px;
		border: 2px solid var(--border-subtle);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.hidden {
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
</style>
