<script lang="ts">
	import type { Vault } from '$lib/server/services/knowledge/store';
	import type { KnowledgeUploadResponse } from '$lib/types';
	import { uploadKnowledgeAttachment } from '$lib/client/api/knowledge';
	import CreateVaultModal from './CreateVaultModal.svelte';
	import DeleteVaultDialog from './DeleteVaultDialog.svelte';
	import VaultFileUpload from './VaultFileUpload.svelte';

	interface StorageQuota {
		totalStorageUsed: number;
		totalFiles: number;
		storageLimit: number;
		usagePercent: number;
		isWarning: boolean;
		warningThreshold: number;
		vaults: Array<{
			vaultId: string;
			vaultName: string;
			fileCount: number;
			storageUsed: number;
		}>;
	}

	let {
		vaults,
		activeVaultId = null,
		conversationId,
		quota = null,
		onSelect,
		onCreate,
		onRename,
		onDelete,
		onUpload,
	}: {
		vaults: Vault[];
		activeVaultId?: string | null;
		conversationId: string;
		quota?: StorageQuota | null;
		onSelect?: (payload: { id: string }) => void;
		onCreate?: (payload: { name: string; color: string }) => void;
		onRename?: (payload: { id: string; name: string }) => void;
		onDelete?: (payload: { id: string }) => void;
		onUpload?: (payload: { vaultId: string; response: KnowledgeUploadResponse }) => void;
	} = $props();

	let showCreateModal = $state(false);
	let editingVaultId = $state<string | null>(null);
	let editName = $state('');
	let editInputRef = $state<HTMLInputElement | undefined>(undefined);
	let deletingVault = $state<Vault | null>(null);
	let renameNotification = $state<{ finalName: string; originalName: string } | null>(null);
	let renameNotificationTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

	// Drag and drop state
	let dragActive = $state(false);
	let dragEnterCount = $state(0);
	let isUploading = $state(false);
	let uploadError = $state<string | null>(null);
	let uploadErrorTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
	let dropTargetVaultId = $state<string | null>(null);

	const PRESET_COLORS = [
		'#C15F3C',
		'#3B82F6',
		'#22C55E',
		'#EAB308',
		'#A855F7',
		'#EC4899',
		'#6B7280',
		'#1A1A1A',
	];

	function handleSelect(vault: Vault) {
		if (editingVaultId !== vault.id) {
			onSelect?.({ id: vault.id });
		}
	}

	function startCreate() {
		showCreateModal = true;
	}

	function handleCreate(name: string, color: string) {
		showCreateModal = false;
		onCreate?.({ name, color });
	}

	function closeCreateModal() {
		showCreateModal = false;
	}

	function startRename(vault: Vault) {
		editingVaultId = vault.id;
		editName = vault.name;
		setTimeout(() => {
			editInputRef?.focus();
			editInputRef?.select();
		}, 0);
	}

	function saveRename(vaultId: string) {
		const trimmed = editName.trim();
		const originalVault = vaults.find((v) => v.id === vaultId);

		if (trimmed && trimmed !== originalVault?.name) {
			onRename?.({ id: vaultId, name: trimmed });
		}
		editingVaultId = null;
	}

	function cancelRename() {
		editingVaultId = null;
	}

	function handleRenameKeydown(event: KeyboardEvent, vaultId: string) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveRename(vaultId);
		} else if (event.key === 'Escape') {
			cancelRename();
		}
	}

	function startDelete(vault: Vault) {
		deletingVault = vault;
	}

	function confirmDelete() {
		if (deletingVault) {
			onDelete?.({ id: deletingVault.id });
			deletingVault = null;
		}
	}

	function cancelDelete() {
		deletingVault = null;
	}

	function handleUpload(vaultId: string, response: KnowledgeUploadResponse) {
		if (response.renameInfo?.wasRenamed) {
			if (renameNotificationTimeout) {
				clearTimeout(renameNotificationTimeout);
			}
			renameNotification = {
				finalName: response.artifact.name,
				originalName: response.renameInfo.originalName,
			};
			renameNotificationTimeout = setTimeout(() => {
				renameNotification = null;
			}, 5000);
		}
		onUpload?.({ vaultId, response });
	}

	function getVaultColor(color: string | null): string {
		return color ?? PRESET_COLORS[6];
	}

	function formatStorage(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		const value = bytes / Math.pow(k, i);
		return `${value.toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
	}

	function getVaultFileCount(vaultId: string): number {
		if (!quota) return 0;
		const vaultQuota = quota.vaults.find((v) => v.vaultId === vaultId);
		return vaultQuota?.fileCount ?? 0;
	}

	const quotaDisplay = $derived(() => {
		if (!quota) return null;
		const used = formatStorage(quota.totalStorageUsed);
		const limit = formatStorage(quota.storageLimit);
		return { used, limit, percent: quota.usagePercent, isWarning: quota.isWarning };
	});

	// Drag and drop handlers
	function isOsFileDrop(event: DragEvent): boolean {
		const types = event.dataTransfer?.types;
		if (!types) return false;
		return types.includes('Files');
	}

	function handleDragEnter(event: DragEvent) {
		if (!isOsFileDrop(event)) return;
		event.preventDefault();
		dragEnterCount += 1;
		dragActive = true;
	}

	function handleDragOver(event: DragEvent) {
		if (!isOsFileDrop(event)) return;
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleDragLeave(event: DragEvent) {
		if (!isOsFileDrop(event)) return;
		dragEnterCount -= 1;
		if (dragEnterCount <= 0) {
			dragEnterCount = 0;
			dragActive = false;
			dropTargetVaultId = null;
		}
	}

	function handleVaultDragLeave(event: DragEvent) {
		dropTargetVaultId = null;
	}

	async function handleDrop(event: DragEvent, targetVaultId: string) {
		dragEnterCount = 0;
		dragActive = false;
		if (!isOsFileDrop(event)) return;
		event.preventDefault();
		event.stopPropagation();

		const files = event.dataTransfer?.files;
		if (!files || files.length === 0) return;

		// Auto-select the vault being dropped on
		onSelect?.({ id: targetVaultId });

		// Upload all dropped files to this vault
		isUploading = true;
		const uploadPromises: Promise<void>[] = [];

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			uploadPromises.push(
				uploadKnowledgeAttachment(file, conversationId, targetVaultId)
					.then((response) => {
						handleUpload(targetVaultId, response);
					})
					.catch((error) => {
						const message = error instanceof Error ? error.message : `Failed to upload ${file.name}`;
						showUploadError(message);
					})
			);
		}

		await Promise.all(uploadPromises);
		isUploading = false;
	}

	function handleVaultDragOver(event: DragEvent, vaultId: string) {
		if (!isOsFileDrop(event)) return;
		event.preventDefault();
		event.stopPropagation();
		dropTargetVaultId = vaultId;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	function showUploadError(message: string) {
		if (uploadErrorTimeout) {
			clearTimeout(uploadErrorTimeout);
		}
		uploadError = message;
		uploadErrorTimeout = setTimeout(() => {
			uploadError = null;
		}, 5000);
	}
</script>

<div
	class="vault-sidebar flex h-full flex-col gap-0 relative"
	role="region"
	aria-label="Vault sidebar"
	class:vault-sidebar-drag-active={dragActive}
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
>
	{#if dragActive}
		<div class="vault-drop-overlay" data-testid="vault-drop-overlay">
			<div class="vault-drop-content">
				<svg
					class="vault-drop-icon"
					xmlns="http://www.w3.org/2000/svg"
					width="32"
					height="32"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				<p class="vault-drop-text">Drop files to upload</p>
				{#if dropTargetVaultId}
					{@const vault = vaults.find((v) => v.id === dropTargetVaultId)}
					{#if vault}
						<p class="vault-drop-target">to "{vault.name}"</p>
					{/if}
				{/if}
			</div>
		</div>
	{/if}

	{#if isUploading}
		<div class="vault-upload-overlay" data-testid="vault-upload-progress">
			<div class="vault-upload-content">
				<div class="vault-upload-spinner"></div>
				<p class="vault-upload-text">Uploading...</p>
			</div>
		</div>
	{/if}

	{#if uploadError}
		<div
			class="mx-2 mt-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-text-secondary"
			role="alert"
			aria-live="polite"
			data-testid="upload-error"
		>
			<span class="font-medium text-danger">Error:</span>
			<span class="text-text-muted">{uploadError}</span>
		</div>
	{/if}

	<!-- Header -->
	<div class="group flex items-center justify-between px-2 py-1">
		<span class="text-[11px] font-medium uppercase tracking-wider text-text-muted">Vaults</span>
		<button
			type="button"
			class="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-icon-muted opacity-0 transition-opacity duration-100 hover:text-icon-primary group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
			title="New vault"
			aria-label="Create new vault"
			onclick={startCreate}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="13"
				height="13"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<line x1="12" x2="12" y1="5" y2="19" />
				<line x1="5" x2="19" y1="12" y2="12" />
			</svg>
		</button>
	</div>

	<!-- Vault List -->
	<div class="flex flex-col gap-px px-1">
		{#if vaults.length === 0}
			<!-- Empty state -->
			<button
				type="button"
				class="empty-vault-btn mx-1 mb-2 flex w-[calc(100%-0.5rem)] cursor-pointer items-center gap-2.5 rounded-lg border border-dashed px-3 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
				onclick={startCreate}
				aria-label="Create new vault"
			>
				<div
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-elevated text-icon-muted"
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
					>
						<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
						<line x1="12" y1="11" x2="12" y2="17" />
						<line x1="9" y1="14" x2="15" y2="14" />
					</svg>
				</div>
				<div>
					<p class="text-[12px] font-medium text-text-secondary">No vaults yet</p>
					<p class="text-[11px] text-text-muted">Create your first vault to organize files</p>
				</div>
			</button>
		{:else}
			{#each vaults as vault (vault.id)}
				<div
					data-testid="vault-item-{vault.id}"
					data-active={activeVaultId === vault.id}
					class="vault-item group relative flex min-h-[32px] cursor-pointer items-center justify-between rounded-lg border border-transparent transition-colors duration-150 hover:border-border-subtle hover:bg-surface-elevated focus-visible:bg-surface-elevated focus-visible:outline-none"
					class:vault-item-active={activeVaultId === vault.id}
					class:vault-item-drop-target={dropTargetVaultId === vault.id}
					style="padding: 0 2px 0 6px;"
					onclick={() => handleSelect(vault)}
					onkeydown={(event) => event.key === 'Enter' && handleSelect(vault)}
					ondragover={(event) => handleVaultDragOver(event, vault.id)}
					ondragleave={handleVaultDragLeave}
					ondrop={(event) => handleDrop(event, vault.id)}
					role="button"
					tabindex="0"
					aria-pressed={activeVaultId === vault.id}
				>
					<div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden pr-1">
						<!-- Color indicator -->
						<div
							data-testid="vault-color-indicator"
							class="h-2.5 w-2.5 shrink-0 rounded-full"
							style="background-color: {getVaultColor(vault.color)};"
						></div>

						{#if editingVaultId === vault.id}
							<input
								data-testid="vault-rename-input-{vault.id}"
								bind:this={editInputRef}
								bind:value={editName}
								onblur={() => saveRename(vault.id)}
								onkeydown={(event) => handleRenameKeydown(event, vault.id)}
								onclick={(event) => event.stopPropagation()}
								class="min-h-[28px] w-full rounded-sm border border-border bg-surface-page px-2 py-1 text-[13px] font-sans text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
							/>
						{:else}
						<span
							data-testid="vault-name-{vault.id}"
							class="truncate text-[13px] font-sans text-text-primary"
							onclick={(event) => {
								event.stopPropagation();
								startRename(vault);
							}}
							onkeydown={(event) => {
								if (event.key === 'Enter') {
									event.stopPropagation();
									startRename(vault);
								}
							}}
							role="button"
							tabindex="0"
						>
							{vault.name}
						</span>
						<span class="shrink-0 text-[11px] text-text-muted">({getVaultFileCount(vault.id)})</span>
						{/if}
					</div>

					<!-- Action buttons -->
					<div class="flex shrink-0 items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100" role="group">
						<!-- Upload button -->
						<div
							onclick={(event) => event.stopPropagation()}
							onkeydown={(event) => event.stopPropagation()}
							role="presentation"
						>
							<VaultFileUpload
								vaultId={vault.id}
								conversationId={conversationId}
								onUploadSuccess={(response) => handleUpload(vault.id, response)}
							/>
						</div>

						<!-- Delete button -->
						<button
							type="button"
							data-testid="vault-delete-btn-{vault.id}"
							class="vault-delete-btn flex h-6 w-6 shrink-0 items-center justify-center rounded text-icon-muted opacity-100 transition-colors duration-150 hover:text-danger focus-visible:outline-none md:opacity-0 md:group-hover:opacity-100"
							class:opacity-100={activeVaultId === vault.id}
							class:md:opacity-100={activeVaultId === vault.id}
							aria-label="Delete {vault.name} vault"
							onclick={(event) => {
								event.stopPropagation();
								startDelete(vault);
							}}
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
							>
								<path d="M3 6h18" />
								<path d="M8 6V4h8v2" />
								<path d="M19 6l-1 14H6L5 6" />
								<path d="M10 11v6" />
								<path d="M14 11v6" />
							</svg>
						</button>
					</div>
				</div>
			{/each}
		{/if}
	</div>

	{#if renameNotification}
		<div
			class="mx-2 mt-2 rounded-md border border-accent/30 bg-accent/10 px-3 py-2 text-[11px] text-text-secondary"
			role="status"
			aria-live="polite"
			data-testid="rename-notification"
		>
			<span class="font-medium text-text-primary">{renameNotification.finalName}</span>
			<span class="text-text-muted">(renamed from {renameNotification.originalName})</span>
		</div>
	{/if}

	{#if quota && quotaDisplay()}
		{@const display = quotaDisplay()}
		<div class="quota-section mt-auto border-t border-border-subtle px-3 py-3" data-testid="storage-quota">
			<div class="flex items-center justify-between text-[11px]">
				<span class="text-text-muted">Storage</span>
				<span class={display?.isWarning ? 'text-danger font-medium' : 'text-text-secondary'}>
					{display?.used} / {display?.limit}
				</span>
			</div>
			<div class="quota-bar mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
				<div
					class="quota-bar-fill h-full rounded-full transition-all duration-300"
					class:quota-bar-warning={display?.isWarning}
					style="width: {Math.min(display?.percent ?? 0, 100)}%;"
				></div>
			</div>
		</div>
	{/if}
</div>

{#if showCreateModal}
	<CreateVaultModal
		presetColors={PRESET_COLORS}
		onCreate={handleCreate}
		onCancel={closeCreateModal}
	/>
{/if}

{#if deletingVault}
	<DeleteVaultDialog
		vaultName={deletingVault.name}
		fileCount={getVaultFileCount(deletingVault.id)}
		onConfirm={confirmDelete}
		onCancel={cancelDelete}
	/>
{/if}

<style>
	.vault-item {
		pointer-events: auto;
	}

	.vault-item-active {
		background-color: var(--surface-elevated);
		border-color: var(--accent);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
	}

	.empty-vault-btn {
		border-color: color-mix(in srgb, var(--border-default) 50%, transparent 50%);
	}

	.empty-vault-btn:hover {
		background: color-mix(in srgb, var(--surface-elevated) 60%, var(--surface-overlay) 40%);
		border-color: var(--border-default);
	}

	.vault-delete-btn {
		cursor: pointer;
	}

	.quota-bar-fill {
		background-color: var(--accent);
	}

	.quota-bar-warning {
		background-color: var(--danger);
	}

	.vault-sidebar {
		position: relative;
	}

	.vault-sidebar-drag-active {
		outline: 2px dashed var(--accent);
		outline-offset: -2px;
	}

	.vault-item-drop-target {
		background-color: color-mix(in srgb, var(--accent) 8%, transparent);
		border-color: var(--accent);
	}

	.vault-drop-overlay {
		position: absolute;
		inset: 0;
		z-index: 50;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--surface-overlay) 95%, transparent 5%);
		backdrop-filter: blur(2px);
		border-radius: inherit;
	}

	.vault-drop-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 16px;
		text-align: center;
	}

	.vault-drop-icon {
		color: var(--accent);
	}

	.vault-drop-text {
		font-size: 13px;
		font-weight: 500;
		color: var(--text-primary);
		margin: 0;
	}

	.vault-drop-target {
		font-size: 11px;
		color: var(--text-muted);
		margin: 0;
	}

	.vault-upload-overlay {
		position: absolute;
		inset: 0;
		z-index: 60;
		display: flex;
		align-items: center;
		justify-content: center;
		background: color-mix(in srgb, var(--surface-overlay) 90%, transparent 10%);
		backdrop-filter: blur(2px);
		border-radius: inherit;
	}

	.vault-upload-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 16px;
	}

	.vault-upload-spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--border-subtle);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.vault-upload-text {
		font-size: 12px;
		color: var(--text-secondary);
		margin: 0;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
