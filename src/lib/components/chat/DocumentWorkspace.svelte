<script lang="ts">
	import FilePreview from '$lib/components/knowledge/FilePreview.svelte';
	import type { DocumentWorkspaceItem } from '$lib/types';

	let {
		open = false,
		documents = [],
		availableDocuments = [],
		activeDocumentId = null,
		onSelectDocument,
		onOpenDocument = undefined,
		onCloseDocument,
		onCloseWorkspace,
	}: {
		open?: boolean;
		documents?: DocumentWorkspaceItem[];
		availableDocuments?: DocumentWorkspaceItem[];
		activeDocumentId?: string | null;
		onSelectDocument: (documentId: string) => void;
		onOpenDocument?: ((document: DocumentWorkspaceItem) => void) | undefined;
		onCloseDocument: (documentId: string) => void;
		onCloseWorkspace: () => void;
	} = $props();

	let activeDocument = $derived.by(() => {
		if (documents.length === 0) return null;
		return documents.find((document) => document.id === activeDocumentId) ?? documents[0] ?? null;
	});

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

</script>

{#if open && activeDocument}
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
				<FilePreview
					open={true}
					variant="embedded"
					showHeader={false}
					artifactId={activeDocument.artifactId ?? null}
					previewUrl={activeDocument.previewUrl ?? null}
					filename={activeDocument.filename}
					mimeType={activeDocument.mimeType}
					onClose={onCloseWorkspace}
				/>
			</div>
		</section>
	</div>

	<!-- Desktop / tablet side pane -->
	<aside class="workspace-shell workspace-shell-desktop" aria-label="Document workspace">
		<div class="workspace-header">
			<div class="workspace-heading">
				<div class="workspace-eyebrow">Working Document</div>
				<div class="workspace-title">{getDocumentTitle(activeDocument)}</div>
				{#if getDocumentSubtitle(activeDocument)}
					<div class="workspace-subtitle">{getDocumentSubtitle(activeDocument)}</div>
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
			<FilePreview
				open={true}
				variant="embedded"
				showHeader={false}
				artifactId={activeDocument.artifactId ?? null}
				previewUrl={activeDocument.previewUrl ?? null}
				filename={activeDocument.filename}
				mimeType={activeDocument.mimeType}
				onClose={onCloseWorkspace}
			/>
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
		}

		.workspace-mobile-backdrop {
			display: none;
		}
	}
</style>
