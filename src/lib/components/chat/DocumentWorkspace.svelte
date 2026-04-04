<script lang="ts">
	import FilePreview from '$lib/components/knowledge/FilePreview.svelte';
	import type { DocumentWorkspaceItem } from '$lib/types';

	let {
		open = false,
		documents = [],
		activeDocumentId = null,
		onSelectDocument,
		onCloseDocument,
		onCloseWorkspace,
	}: {
		open?: boolean;
		documents?: DocumentWorkspaceItem[];
		activeDocumentId?: string | null;
		onSelectDocument: (documentId: string) => void;
		onCloseDocument: (documentId: string) => void;
		onCloseWorkspace: () => void;
	} = $props();

	let activeDocument = $derived.by(() => {
		if (documents.length === 0) return null;
		return documents.find((document) => document.id === activeDocumentId) ?? documents[0] ?? null;
	});

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
					<div class="workspace-title">{activeDocument.title}</div>
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
								<span class="workspace-tab-label">{document.title}</span>
							</button>
							<button
								type="button"
								class="btn-icon-bare workspace-tab-close"
								onclick={() => onCloseDocument(document.id)}
								aria-label={`Close ${document.title}`}
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
				<div class="workspace-title">{activeDocument.title}</div>
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
							<span class="workspace-tab-label">{document.title}</span>
						</button>
						<button
							type="button"
							class="btn-icon-bare workspace-tab-close"
							onclick={() => onCloseDocument(document.id)}
							aria-label={`Close ${document.title}`}
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
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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
