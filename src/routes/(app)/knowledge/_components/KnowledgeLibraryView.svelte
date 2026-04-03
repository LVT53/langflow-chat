<script lang="ts">
	import AttachmentContentModal from '$lib/components/chat/AttachmentContentModal.svelte';
	import {
		uploadKnowledgeAttachment,
		type StorageQuota,
		type Vault,
	} from '$lib/client/api/knowledge';
	import type {
		ArtifactSummary,
		KnowledgeDocumentItem,
		KnowledgeUploadResponse,
		WorkCapsule,
	} from '$lib/types';
	import CreateVaultModal from './CreateVaultModal.svelte';
	import DeleteVaultDialog from './DeleteVaultDialog.svelte';
	import VaultFileUpload from './VaultFileUpload.svelte';
	import {
		formatArtifactSize,
		formatDocumentKind,
		formatMemoryTimestamp,
	} from '../_helpers';

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

	let {
		vaults,
		activeVaultId = null,
		documents,
		results,
		workflows,
		quota = null,
		onOpenLibraryModal,
		onSelectVault = () => {},
		onCreateVault = () => {},
		onRenameVault = () => {},
		onDeleteVault = () => {},
		onUploadToVault = () => {},
	}: {
		vaults: Vault[];
		activeVaultId?: string | null;
		documents: KnowledgeDocumentItem[];
		results: ArtifactSummary[];
		workflows: WorkCapsule[];
		quota?: StorageQuota | null;
		onOpenLibraryModal: (kind: 'documents' | 'results' | 'workflows') => void;
		onSelectVault?: (vaultId: string | null) => void;
		onCreateVault?: (payload: { name: string; color: string }) => void;
		onRenameVault?: (payload: { id: string; name: string }) => void;
		onDeleteVault?: (payload: { id: string }) => void;
		onUploadToVault?: (payload: { vaultId: string; response: KnowledgeUploadResponse }) => void;
	} = $props();

	let searchQuery = $state('');
	let previewArtifactId = $state<string | null>(null);
	let previewFilename = $state('');
	let showCreateModal = $state(false);
	let editingVaultId = $state<string | null>(null);
	let editName = $state('');
	let editInputRef = $state<HTMLInputElement | undefined>(undefined);
	let deletingVault = $state<Vault | null>(null);
	let renameNotification = $state<{ finalName: string; originalName: string } | null>(null);
	let renameNotificationTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
	let dragActive = $state(false);
	let dragEnterCount = $state(0);
	let isUploading = $state(false);
	let uploadError = $state<string | null>(null);
	let uploadErrorTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
	let dropTargetVaultId = $state<string | null>(null);

	const vaultNameById = $derived(Object.fromEntries(vaults.map((vault) => [vault.id, vault.name])));
	const selectedVault = $derived(
		activeVaultId ? vaults.find((vault) => vault.id === activeVaultId) ?? null : null
	);
	const vaultDocuments = $derived(
		documents.filter((document): document is KnowledgeDocumentItem & { vaultId: string } =>
			typeof document.vaultId === 'string' && document.vaultId.length > 0
		)
	);
	const scopedDocuments = $derived(
		activeVaultId
			? vaultDocuments.filter((document) => document.vaultId === activeVaultId)
			: vaultDocuments
	);
	const normalizedSearchQuery = $derived(searchQuery.trim().toLowerCase());
	const filteredDocuments = $derived.by(() => {
		if (!normalizedSearchQuery) {
			return scopedDocuments;
		}

		return scopedDocuments.filter((document) => {
			const vaultName = vaultNameById[document.vaultId] ?? '';
			return `${document.name}\n${document.summary ?? ''}\n${vaultName}`
				.toLowerCase()
				.includes(normalizedSearchQuery);
		});
	});
	const selectedVaultQuota = $derived(
		activeVaultId
			? quota?.vaults.find((vaultSummary) => vaultSummary.vaultId === activeVaultId) ?? null
			: null
	);

	function openAiView(document: KnowledgeDocumentItem) {
		previewArtifactId = document.promptArtifactId ?? document.displayArtifactId;
		previewFilename = document.name;
	}

	function closeAiView() {
		previewArtifactId = null;
		previewFilename = '';
	}

	function getVaultColor(color: string | null): string {
		return color ?? PRESET_COLORS[6];
	}

	function getVaultFileCount(vaultId: string): number {
		return quota?.vaults.find((vaultSummary) => vaultSummary.vaultId === vaultId)?.fileCount ?? 0;
	}

	function startCreate() {
		showCreateModal = true;
	}

	function closeCreateModal() {
		showCreateModal = false;
	}

	function handleCreate(name: string, color: string) {
		showCreateModal = false;
		onCreateVault({ name, color });
	}

	function handleSelectVault(vaultId: string | null) {
		if (editingVaultId) return;
		onSelectVault(vaultId);
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
		const originalVault = vaults.find((vault) => vault.id === vaultId);

		if (trimmed && trimmed !== originalVault?.name) {
			onRenameVault({ id: vaultId, name: trimmed });
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
		if (!deletingVault) return;
		onDeleteVault({ id: deletingVault.id });
		deletingVault = null;
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

		onUploadToVault({ vaultId, response });
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

	function isOsFileDrop(event: DragEvent): boolean {
		const types = event.dataTransfer?.types;
		return types ? types.includes('Files') : false;
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
		const currentTarget = event.currentTarget;
		const relatedTarget = event.relatedTarget;
		if (currentTarget instanceof HTMLElement && relatedTarget instanceof Node) {
			if (currentTarget.contains(relatedTarget)) return;
		}
		dragEnterCount -= 1;
		if (dragEnterCount <= 0) {
			dragEnterCount = 0;
			dragActive = false;
			dropTargetVaultId = null;
		}
	}

	function handleVaultDragEnter(event: DragEvent, vaultId: string) {
		if (!isOsFileDrop(event)) return;
		event.preventDefault();
		event.stopPropagation();
		dropTargetVaultId = vaultId;
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleVaultDragLeave(event: DragEvent) {
		const currentTarget = event.currentTarget;
		const relatedTarget = event.relatedTarget;
		if (currentTarget instanceof HTMLElement && relatedTarget instanceof Node) {
			if (currentTarget.contains(relatedTarget)) return;
		}
		dropTargetVaultId = null;
	}

	function handleVaultDragOver(event: DragEvent, vaultId: string) {
		if (!isOsFileDrop(event)) return;
		handleVaultDragEnter(event, vaultId);
	}

	function resetDragState() {
		dragEnterCount = 0;
		dragActive = false;
		dropTargetVaultId = null;
	}

	function resolveDropTargetVaultId(explicitVaultId?: string): string | null {
		return explicitVaultId ?? dropTargetVaultId ?? activeVaultId ?? vaults[0]?.id ?? null;
	}

	async function uploadFilesToVault(files: FileList | File[], targetVaultId: string) {
		onSelectVault(targetVaultId);
		isUploading = true;

		try {
			await Promise.all(
				Array.from(files).map(async (file) => {
					try {
						const response = await uploadKnowledgeAttachment(file, null, targetVaultId);
						handleUpload(targetVaultId, response);
					} catch (error) {
						const message =
							error instanceof Error ? error.message : `Failed to upload ${file.name}`;
						showUploadError(message);
					}
				})
			);
		} finally {
			isUploading = false;
		}
	}

	async function handleDrop(event: DragEvent, explicitVaultId?: string) {
		if (!isOsFileDrop(event)) return;
		event.preventDefault();
		event.stopPropagation();
		resetDragState();

		const files = event.dataTransfer?.files;
		if (!files || files.length === 0) return;

		const targetVaultId = resolveDropTargetVaultId(explicitVaultId);
		if (!targetVaultId) {
			showUploadError(
				vaults.length === 0
					? 'Create a vault before dropping files.'
					: 'Select a vault or drop directly on a vault row.'
			);
			return;
		}

		await uploadFilesToVault(files, targetVaultId);
	}
</script>

<section class="rounded-[1.6rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
	<div class="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
		<div class="space-y-2">
			<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
				Vault Explorer
			</div>
			<h2 class="text-[1.7rem] font-serif tracking-[-0.04em] text-text-primary md:text-[2.1rem]">
				{selectedVault ? selectedVault.name : 'All vault files'}
			</h2>
			<p class="max-w-[760px] text-sm font-sans leading-[1.65] text-text-secondary">
				Browse uploaded files in the current vault scope, filter by name or summary, and inspect the exact extracted text AlfyAI can read during retrieval.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				class="rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-page"
				onclick={startCreate}
			>
				New vault
			</button>
			<button
				type="button"
				class="rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-page"
				onclick={() => onOpenLibraryModal('documents')}
			>
				Manage documents
			</button>
		</div>
	</div>

	<div class="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px]">
		<div
			class="vault-panel relative rounded-[1.35rem] border border-border bg-surface-page px-4 py-4"
			role="region"
			aria-label="Vaults"
			class:vault-panel-drag-active={dragActive}
			ondragenter={handleDragEnter}
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={(event) => handleDrop(event)}
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
							{@const vault = vaults.find((item) => item.id === dropTargetVaultId)}
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

			<div class="flex items-center justify-between gap-3">
				<div>
					<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
						Vaults
					</div>
					<p class="mt-1 text-sm font-sans text-text-secondary">
						Choose a scope, drop files onto a vault row, or upload directly from the list.
					</p>
				</div>
				<span class="rounded-full border border-border px-3 py-1 text-[11px] font-sans text-text-muted">
					{vaults.length} vault{vaults.length === 1 ? '' : 's'}
				</span>
			</div>

			{#if uploadError}
				<div
					class="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-text-secondary"
					role="alert"
				>
					<span class="font-medium text-danger">Upload failed:</span>
					<span class="ml-1">{uploadError}</span>
				</div>
			{/if}

			{#if renameNotification}
				<div
					class="mt-4 rounded-xl border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-text-secondary"
					role="status"
				>
					<span class="font-medium text-text-primary">{renameNotification.finalName}</span>
					<span class="ml-1">(renamed from {renameNotification.originalName})</span>
				</div>
			{/if}

			<div class="mt-4 space-y-2">
				<button
					type="button"
					class={`vault-scope-btn ${
						activeVaultId === null ? 'vault-scope-btn-active' : ''
					}`}
					onclick={() => handleSelectVault(null)}
				>
					<span>
						<span class="block text-sm font-sans font-medium text-text-primary">All vaults</span>
						<span class="block text-xs font-sans text-text-muted">
							{vaultDocuments.length} file{vaultDocuments.length === 1 ? '' : 's'}
						</span>
					</span>
					<span class="rounded-full border border-border px-3 py-1 text-[11px] font-sans text-text-muted">
						Global scope
					</span>
				</button>

				{#if vaults.length === 0}
					<button
						type="button"
						class="empty-vault-btn flex w-full items-center gap-3 rounded-[1rem] border border-dashed px-4 py-4 text-left"
						onclick={startCreate}
					>
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-icon-muted">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
								<line x1="12" x2="12" y1="11" y2="17" />
								<line x1="9" x2="15" y1="14" y2="14" />
							</svg>
						</div>
						<div>
							<p class="text-sm font-sans font-medium text-text-primary">Create your first vault</p>
							<p class="mt-1 text-sm font-sans text-text-muted">
								The vault list lives here now, so start by creating a place for uploads.
							</p>
						</div>
					</button>
				{:else}
					<div class="max-h-[19rem] space-y-2 overflow-y-auto pr-1">
						{#each vaults as vault (vault.id)}
							<div
								class={`vault-row ${activeVaultId === vault.id ? 'vault-row-active' : ''} ${
									dropTargetVaultId === vault.id ? 'vault-row-drop-target' : ''
								}`}
								role="button"
								tabindex="0"
								aria-pressed={activeVaultId === vault.id}
								onclick={() => handleSelectVault(vault.id)}
								onkeydown={(event) => {
									if (event.key === 'Enter' || event.key === ' ') {
										event.preventDefault();
										handleSelectVault(vault.id);
									}
								}}
								ondragenter={(event) => handleVaultDragEnter(event, vault.id)}
								ondragover={(event) => handleVaultDragOver(event, vault.id)}
								ondragleave={handleVaultDragLeave}
								ondrop={(event) => handleDrop(event, vault.id)}
							>
								<div class="flex min-w-0 flex-1 items-center gap-3">
									<div
										class="h-2.5 w-2.5 shrink-0 rounded-full"
										style="background-color: {getVaultColor(vault.color)};"
									></div>
									<div class="min-w-0 flex-1">
										{#if editingVaultId === vault.id}
											<input
												bind:this={editInputRef}
												bind:value={editName}
												class="w-full rounded-lg border border-border bg-surface-elevated px-2 py-1.5 text-sm font-sans text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
												onblur={() => saveRename(vault.id)}
												onkeydown={(event) => handleRenameKeydown(event, vault.id)}
												onclick={(event) => event.stopPropagation()}
											/>
										{:else}
											<div class="truncate text-sm font-sans font-medium text-text-primary">
												{vault.name}
											</div>
											<div class="mt-1 text-xs font-sans text-text-muted">
												{getVaultFileCount(vault.id)} file{getVaultFileCount(vault.id) === 1 ? '' : 's'}
											</div>
										{/if}
									</div>
								</div>
								<div
									class="flex shrink-0 items-center gap-1"
									role="group"
									aria-label={`Actions for ${vault.name}`}
								>
									<button
										type="button"
										class="vault-action-btn"
										aria-label={`Rename ${vault.name} vault`}
										onclick={(event) => {
											event.stopPropagation();
											startRename(vault);
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
											<path d="M12 20h9" />
											<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
										</svg>
									</button>
									<div
										role="presentation"
										onclick={(event) => event.stopPropagation()}
										onkeydown={(event) => event.stopPropagation()}
									>
										<VaultFileUpload
											vaultId={vault.id}
											onUploadSuccess={(response) => handleUpload(vault.id, response)}
											onUploadError={showUploadError}
										/>
									</div>
									<button
										type="button"
										class="vault-action-btn vault-action-btn-danger"
										aria-label={`Delete ${vault.name} vault`}
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
					</div>
				{/if}
			</div>

			<div class="mt-4 border-t border-border pt-4">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
					Search visible files
				</div>
				<div class="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						class="shrink-0 text-icon-muted"
					>
						<circle cx="11" cy="11" r="7"></circle>
						<path d="m20 20-3.5-3.5"></path>
					</svg>
					<input
						bind:value={searchQuery}
						type="text"
						placeholder={selectedVault ? `Search ${selectedVault.name}` : 'Search all vault files'}
						class="h-9 w-full bg-transparent text-[15px] font-sans text-text-primary outline-none placeholder:text-text-muted"
					/>
					{#if searchQuery}
						<button
							type="button"
							class="btn-icon-bare h-8 w-8 rounded-full text-icon-muted hover:text-icon-primary"
							onclick={() => (searchQuery = '')}
							aria-label="Clear vault filter"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="15"
								height="15"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<line x1="18" x2="6" y1="6" y2="18"></line>
								<line x1="6" x2="18" y1="6" y2="18"></line>
							</svg>
						</button>
					{/if}
				</div>
				<div class="mt-3 flex flex-wrap gap-2 text-[11px] font-sans text-text-muted">
					<span class="rounded-full border border-border px-3 py-1">
						{selectedVault ? 'Scoped to selected vault' : 'Showing every vault'}
					</span>
					<span class="rounded-full border border-border px-3 py-1">
						{filteredDocuments.length} shown
					</span>
					{#if normalizedSearchQuery}
						<span class="rounded-full border border-border px-3 py-1">Local filter active</span>
					{/if}
				</div>
			</div>
		</div>

		<div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
			<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Scope</div>
				<div class="mt-3 text-lg font-sans font-semibold text-text-primary">
					{selectedVault ? selectedVault.name : 'All vaults'}
				</div>
				<div class="mt-1 text-sm font-sans text-text-secondary">
					{scopedDocuments.length} file{scopedDocuments.length === 1 ? '' : 's'}
				</div>
			</div>
			<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Indexed</div>
				<div class="mt-3 text-lg font-sans font-semibold text-text-primary">
					{scopedDocuments.filter((document) => document.normalizedAvailable).length}
				</div>
				<div class="mt-1 text-sm font-sans text-text-secondary">
					AI-readable files in scope
				</div>
			</div>
			<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Storage</div>
				<div class="mt-3 text-lg font-sans font-semibold text-text-primary">
					{selectedVaultQuota ? `${Math.ceil(selectedVaultQuota.storageUsed / 1024)} KB` : 'Tracked globally'}
				</div>
				<div class="mt-1 text-sm font-sans text-text-secondary">
					{selectedVaultQuota
						? `${selectedVaultQuota.fileCount} file${selectedVaultQuota.fileCount === 1 ? '' : 's'}`
						: 'Select a vault for storage detail'}
				</div>
			</div>
		</div>
	</div>

	{#if vaults.length === 0}
		<div class="mt-5 rounded-[1.3rem] border border-dashed border-border bg-surface-page px-5 py-6 text-sm font-sans text-text-muted">
			Create a vault to start organizing uploaded files and exposing them to retrieval.
		</div>
	{:else if scopedDocuments.length === 0}
		<div class="mt-5 rounded-[1.3rem] border border-dashed border-border bg-surface-page px-5 py-6 text-sm font-sans text-text-muted">
			{selectedVault
				? `No files are stored in ${selectedVault.name} yet. Upload into this vault from the vault list to start using it.`
				: 'No vault files are available yet.'}
		</div>
	{:else if filteredDocuments.length === 0}
		<div class="mt-5 rounded-[1.3rem] border border-dashed border-border bg-surface-page px-5 py-6 text-sm font-sans text-text-muted">
			No files in the current scope match "{searchQuery.trim()}".
		</div>
	{:else}
		<div class="mt-5 overflow-x-auto rounded-[1.3rem] border border-border bg-surface-page">
			<table class="min-w-[960px] w-full border-collapse">
				<thead>
					<tr class="border-b border-border bg-surface-elevated/70 text-left">
						<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">File</th>
						<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Vault</th>
						<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">AI text</th>
						<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Updated</th>
						<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Summary</th>
						<th class="px-4 py-3 text-right text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Action</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredDocuments as document (document.id)}
						<tr class="border-b border-border last:border-b-0">
							<td class="px-4 py-3 align-top">
								<div class="text-sm font-sans font-medium text-text-primary">{document.name}</div>
								<div class="mt-1 text-xs font-sans text-text-muted">
									{formatDocumentKind(document)} · {formatArtifactSize(document.sizeBytes)}
								</div>
							</td>
							<td class="px-4 py-3 align-top">
								<button
									type="button"
									class="rounded-full border border-border px-3 py-1 text-xs font-sans text-text-secondary transition hover:bg-surface-elevated hover:text-text-primary"
									onclick={() => onSelectVault(document.vaultId)}
								>
									{vaultNameById[document.vaultId] ?? 'Vault'}
								</button>
							</td>
							<td class="px-4 py-3 align-top">
								<span
									class={`inline-flex rounded-full border px-3 py-1 text-xs font-sans ${
										document.normalizedAvailable
											? 'border-accent/30 bg-accent/10 text-accent'
											: 'border-border text-text-muted'
									}`}
								>
									{document.normalizedAvailable ? 'Indexed' : 'Source only'}
								</span>
							</td>
							<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">
								{formatMemoryTimestamp(document.updatedAt)}
							</td>
							<td class="px-4 py-3 align-top">
								<div class="document-summary text-sm font-serif leading-[1.55] text-text-secondary">
									{document.summary ?? 'No summary stored.'}
								</div>
							</td>
							<td class="px-4 py-3 align-top text-right">
								<button
									type="button"
									class="rounded-full border border-border px-3 py-1.5 text-xs font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
									onclick={() => openAiView(document)}
								>
									AI view
								</button>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</section>

<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
	<div class="space-y-2">
		<h2 class="text-lg font-sans font-semibold text-text-primary">Collections</h2>
		<p class="max-w-[720px] text-sm font-sans leading-[1.6] text-text-secondary">
			Documents, saved results, and workflow capsules still open in dedicated table views for bulk maintenance.
		</p>
	</div>
	<div class="mt-5 grid gap-4 lg:grid-cols-3">
		<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
			<div class="flex items-center justify-between gap-3">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Documents</div>
				<span class="rounded-full border border-border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
					{documents.length}
				</span>
			</div>
			<p class="mt-4 text-sm font-sans leading-[1.6] text-text-secondary">
				Uploaded files are managed as single logical documents, while their extracted text stays available behind the scenes for retrieval.
			</p>
			<button
				type="button"
				class="mt-4 rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
				onclick={() => onOpenLibraryModal('documents')}
			>
				Manage documents
			</button>
		</div>

		<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
			<div class="flex items-center justify-between gap-3">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Results</div>
				<span class="rounded-full border border-border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
					{results.length}
				</span>
			</div>
			<p class="mt-4 text-sm font-sans leading-[1.6] text-text-secondary">
				Saved generated outputs that remain available for recall and later refinement.
			</p>
			<button
				type="button"
				class="mt-4 rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
				onclick={() => onOpenLibraryModal('results')}
			>
				Manage results
			</button>
		</div>

		<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
			<div class="flex items-center justify-between gap-3">
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Workflows</div>
				<span class="rounded-full border border-border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
					{workflows.length}
				</span>
			</div>
			<p class="mt-4 text-sm font-sans leading-[1.6] text-text-secondary">
				Reusable workflow capsules summarizing patterns, source inputs, and output history.
			</p>
			<button
				type="button"
				class="mt-4 rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
				onclick={() => onOpenLibraryModal('workflows')}
			>
				Manage workflows
			</button>
		</div>
	</div>
</section>

<AttachmentContentModal
	open={Boolean(previewArtifactId)}
	artifactId={previewArtifactId}
	filename={previewFilename}
	onClose={closeAiView}
/>

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
	.document-summary {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		overflow: hidden;
	}

	.vault-panel {
		position: relative;
	}

	.vault-panel-drag-active {
		outline: 2px dashed var(--accent);
		outline-offset: -2px;
	}

	.vault-scope-btn,
	.vault-row {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		border-radius: 1rem;
		border: 1px solid transparent;
		background: transparent;
		padding: 0.9rem 1rem;
		text-align: left;
		transition: border-color 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease;
	}

	.vault-scope-btn:hover,
	.vault-row:hover {
		background: var(--surface-elevated);
		border-color: var(--border-default);
	}

	.vault-scope-btn-active,
	.vault-row-active {
		background: var(--surface-elevated);
		border-color: var(--accent);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
	}

	.vault-row-drop-target {
		background-color: color-mix(in srgb, var(--accent) 8%, transparent);
		border-color: var(--accent);
	}

	.vault-action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--icon-muted);
		cursor: pointer;
		transition: color 0.15s ease, background-color 0.15s ease;
	}

	.vault-action-btn:hover {
		color: var(--icon-primary);
		background: var(--surface-page);
	}

	.vault-action-btn-danger:hover {
		color: var(--danger);
	}

	.empty-vault-btn {
		border-color: color-mix(in srgb, var(--border-default) 50%, transparent 50%);
	}

	.empty-vault-btn:hover {
		background: color-mix(in srgb, var(--surface-elevated) 60%, var(--surface-overlay) 40%);
		border-color: var(--border-default);
	}

	.vault-drop-overlay {
		position: absolute;
		inset: 0;
		z-index: 50;
		pointer-events: none;
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
		gap: 0.5rem;
		padding: 1rem;
		text-align: center;
	}

	.vault-drop-icon {
		color: var(--accent);
	}

	.vault-drop-text {
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-primary);
	}

	.vault-drop-target {
		margin: 0;
		font-size: 0.6875rem;
		color: var(--text-muted);
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
		gap: 0.5rem;
		padding: 1rem;
	}

	.vault-upload-spinner {
		width: 1.5rem;
		height: 1.5rem;
		border: 2px solid var(--border-subtle);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.vault-upload-text {
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
