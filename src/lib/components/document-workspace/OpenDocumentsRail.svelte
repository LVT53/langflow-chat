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

function getDocumentSourceLabel(document: DocumentWorkspaceItem): string {
	return document.source === "chat_generated_file"
		? $t("documentWorkspace.fromGeneratedFile")
		: $t("documentWorkspace.fromKnowledgeBase");
}

function getDocumentMetadata(document: DocumentWorkspaceItem): string {
	return (
		[
			getDocumentSourceLabel(document),
			determinePreviewFileType(document.mimeType, document.filename).toUpperCase(),
			formatRoleLabel(document.documentRole),
		]
			.filter(Boolean)
			.join(" • ")
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
		<div class="open-documents-rail-head">
			<span>{$t('documentWorkspace.openDocuments')}</span>
			<span>{$t('documentWorkspace.openDocumentsCount', { count: documents.length })}</span>
		</div>
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
						<span class="open-documents-rail-title-row">
							<span class="open-documents-rail-title">{getDocumentTitle(document)}</span>
							{#if getDocumentVersionLabel(document)}
								<span class="open-documents-rail-version">{getDocumentVersionLabel(document)}</span>
							{/if}
						</span>
						<span class="open-documents-rail-meta">{getDocumentMetadata(document)}</span>
						{#if document.documentFamilyStatus === "historical"}
							<span class="open-documents-rail-history">{$t('documentWorkspace.historical')}</span>
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
		flex: 0 0 clamp(13rem, 18vw, 17rem);
		flex-direction: column;
		gap: 0.42rem;
		width: clamp(13rem, 18vw, 17rem);
		min-height: 0;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 0.72rem 0.72rem 0.9rem;
		border-right: 1px solid var(--border-default);
		background: color-mix(in srgb, var(--surface-elevated) 48%, var(--surface-page) 52%);
		animation: rail-enter var(--duration-standard) ease-out;
	}

	.open-documents-rail-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0.1rem 0.2rem 0.4rem;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.66rem;
		font-weight: 650;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.open-documents-rail-head span:last-child {
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
	}

	.open-documents-rail-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: start;
		gap: 0.18rem;
		border: 1px solid transparent;
		border-radius: 0.5rem;
		background: transparent;
		transition:
			border-color var(--duration-fast) ease,
			background-color var(--duration-fast) ease;
	}

	.open-documents-rail-row-active {
		border-color: color-mix(in srgb, var(--text-primary) 14%, var(--border-default) 86%);
		background: color-mix(in srgb, var(--surface-page) 88%, var(--surface-elevated) 12%);
		box-shadow: inset 2px 0 0 color-mix(in srgb, var(--text-primary) 42%, transparent 58%);
	}

	.open-documents-rail-row:hover {
		border-color: var(--border-default);
		background: color-mix(in srgb, var(--surface-page) 76%, transparent 24%);
	}

	.open-documents-rail-tab {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: start;
		gap: 0.58rem;
		min-width: 0;
		padding: 0.58rem 0.28rem 0.58rem 0.62rem;
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
		margin-top: 0.08rem;
		color: var(--icon-muted);
	}

	.open-documents-rail-text {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.18rem;
	}

	.open-documents-rail-title-row {
		display: flex;
		align-items: flex-start;
		gap: 0.38rem;
		min-width: 0;
	}

	.open-documents-rail-title {
		display: -webkit-box;
		min-width: 0;
		flex: 1 1 auto;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		font-size: 0.82rem;
		line-height: 1.25;
	}

	.open-documents-rail-version,
	.open-documents-rail-history {
		display: inline-flex;
		align-items: center;
		flex: 0 0 auto;
		border: 1px solid var(--border-default);
		border-radius: 0.35rem;
		padding: 0.08rem 0.28rem;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.61rem;
		font-weight: 650;
		line-height: 1.15;
		color: var(--text-muted);
		background: var(--surface-page);
	}

	.open-documents-rail-history {
		align-self: flex-start;
		border-color: transparent;
		background: color-mix(in srgb, var(--surface-page) 74%, transparent 26%);
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
		width: 1.65rem;
		height: 1.65rem;
		margin-top: 0.38rem;
		margin-right: 0.25rem;
		border: none;
		border-radius: 0.35rem;
		background: transparent;
		color: var(--icon-muted);
		opacity: 0.56;
		transition:
			opacity var(--duration-fast) ease,
			background-color var(--duration-fast) ease,
			color var(--duration-fast) ease;
	}

	.open-documents-rail-row:hover .open-documents-rail-close,
	.open-documents-rail-close:focus-visible {
		opacity: 1;
	}

	.open-documents-rail-close:hover {
		background: color-mix(in srgb, var(--surface-page) 82%, transparent 18%);
		color: var(--text-primary);
	}

	@keyframes rail-enter {
		from {
			opacity: 0;
			transform: translateX(0.5rem);
		}
		to {
			opacity: 1;
			transform: translateX(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.open-documents-rail {
			animation: none;
		}
	}
</style>
