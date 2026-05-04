<script lang="ts">
import type { DocumentWorkspaceItem } from "$lib/types";
import FileTypeIcon from "$lib/components/ui/FileTypeIcon.svelte";
import { determinePreviewFileType } from "$lib/utils/file-preview";
import { t } from "$lib/i18n";

let {
	documents,
	activeDocumentId,
	onSelectDocument,
	onCloseDocument,
}: {
	documents: DocumentWorkspaceItem[];
	activeDocumentId: string | null;
	onSelectDocument: (documentId: string) => void;
	onCloseDocument: (documentId: string) => void;
} = $props();

function formatRoleLabel(role: string | null | undefined): string | null {
	if (!role) return null;
	const normalized = role.trim();
	if (!normalized) return null;
	return normalized
		.split(/[_-\s]+/)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function getDocumentTitle(document: DocumentWorkspaceItem): string {
	return document.documentLabel ?? document.title ?? document.filename;
}

function getDocumentVersionLabel(
	document: DocumentWorkspaceItem,
): string | null {
	return document.versionNumber && document.versionNumber > 0
		? `v${document.versionNumber}`
		: null;
}

function getDocumentMetadata(document: DocumentWorkspaceItem): string | null {
	return (
		[formatRoleLabel(document.documentRole), getDocumentVersionLabel(document)]
			.filter(Boolean)
			.join(" • ") || null
	);
}
</script>

{#if documents.length > 1}
	<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
	<nav
		class="open-documents-rail"
		role="tablist"
		aria-label={$t('documentWorkspace.openDocuments')}
		data-testid="open-documents-rail"
	>
		{#each documents as document (document.id)}
			<div class="open-documents-rail-row" class:open-documents-rail-row-active={document.id === activeDocumentId}>
				<button
					type="button"
					role="tab"
					class="open-documents-rail-tab"
					aria-selected={document.id === activeDocumentId}
					onclick={() => onSelectDocument(document.id)}
				>
					<span class="open-documents-rail-icon">
						<FileTypeIcon type={determinePreviewFileType(document.mimeType, document.filename)} />
					</span>
					<span class="open-documents-rail-text">
						<span class="open-documents-rail-title">{getDocumentTitle(document)}</span>
						{#if getDocumentMetadata(document)}
							<span class="open-documents-rail-meta">{getDocumentMetadata(document)}</span>
						{/if}
					</span>
				</button>
				<button
					type="button"
					class="open-documents-rail-close"
					onclick={() => onCloseDocument(document.id)}
					aria-label={$t('documentWorkspace.closeDocumentLabel', { title: getDocumentTitle(document) })}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" x2="6" y1="6" y2="18" />
						<line x1="6" x2="18" y1="6" y2="18" />
					</svg>
				</button>
			</div>
		{/each}
	</nav>
{/if}

<style>
	.open-documents-rail {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-height: min(18rem, 34vh);
		overflow-y: auto;
		overflow-x: hidden;
		padding: 0.65rem 0.75rem;
		border-left: 1px solid var(--border-default);
		border-bottom: 1px solid var(--border-default);
		background: color-mix(in srgb, var(--surface-elevated) 72%, var(--surface-page) 28%);
		animation: rail-enter var(--duration-standard) ease-out;
	}

	.open-documents-rail-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 0.25rem;
		border: 1px solid transparent;
		border-radius: 0.45rem;
		background: transparent;
	}

	.open-documents-rail-row-active {
		border-color: var(--border-default);
		background: color-mix(in srgb, var(--surface-page) 86%, transparent 14%);
	}

	.open-documents-rail-tab {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
		padding: 0.55rem 0.35rem 0.55rem 0.55rem;
		border: none;
		background: transparent;
		text-align: left;
		color: var(--text-secondary);
	}

	.open-documents-rail-row-active .open-documents-rail-tab {
		color: var(--text-primary);
	}

	.open-documents-rail-icon {
		display: inline-flex;
		color: var(--icon-muted);
	}

	.open-documents-rail-text {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.12rem;
	}

	.open-documents-rail-title {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-size: 0.82rem;
		line-height: 1.25;
	}

	.open-documents-rail-meta {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.68rem;
		color: var(--text-muted);
	}

	.open-documents-rail-close {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.8rem;
		height: 1.8rem;
		border: none;
		border-radius: 999px;
		background: transparent;
		color: var(--icon-muted);
	}

	.open-documents-rail-close:hover {
		background: color-mix(in srgb, var(--surface-page) 82%, transparent 18%);
		color: var(--text-primary);
	}

	@keyframes rail-enter {
		from {
			opacity: 0;
			transform: translateX(0.75rem);
			max-height: 0;
		}
		to {
			opacity: 1;
			transform: translateX(0);
			max-height: min(18rem, 34vh);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.open-documents-rail {
			animation: none;
		}
	}
</style>
