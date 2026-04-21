<script lang="ts">
	import { browser } from '$app/environment';
	import type { DocumentWorkspaceItem } from '$lib/types';

	interface Props {
		document: DocumentWorkspaceItem | null;
		open: boolean;
		onClose: () => void;
		onDownload?: (document: DocumentWorkspaceItem) => void;
		onJumpToSource?: (document: DocumentWorkspaceItem) => void;
	}

	let { document, open, onClose, onDownload, onJumpToSource }: Props = $props();

	type FilePreviewModule = typeof import('$lib/components/knowledge/FilePreview.svelte');

	let filePreviewModulePromise: Promise<FilePreviewModule> | null = null;
	let isVisible = $state(false);
	let shouldRender = $state(false);
	let closeAnimationTimer: ReturnType<typeof setTimeout> | null = null;
	let modalRef = $state<HTMLDivElement | null>(null);

	function ensureFilePreviewModule(): Promise<FilePreviewModule> {
		if (!filePreviewModulePromise) {
			filePreviewModulePromise = import('$lib/components/knowledge/FilePreview.svelte');
		}
		return filePreviewModulePromise;
	}

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

	function getDocumentTitle(doc: DocumentWorkspaceItem): string {
		return doc.title ?? doc.filename;
	}

	function getVersionLabel(doc: DocumentWorkspaceItem): string | null {
		return doc.versionNumber && doc.versionNumber > 0 ? `v${doc.versionNumber}` : null;
	}

	function getLifecycleLabel(doc: DocumentWorkspaceItem): string | null {
		return doc.documentFamilyStatus === 'historical' ? 'Historical' : null;
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}

	function handleEscape(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			event.preventDefault();
			onClose();
		}
	}

	$effect(() => {
		if (open && document) {
			if (closeAnimationTimer) {
				clearTimeout(closeAnimationTimer);
				closeAnimationTimer = null;
			}
			shouldRender = true;
			isVisible = false;
			const frame = requestAnimationFrame(() => {
				isVisible = true;
			});
			return () => cancelAnimationFrame(frame);
		}

		isVisible = false;
		if (shouldRender && !closeAnimationTimer) {
			closeAnimationTimer = setTimeout(() => {
				shouldRender = false;
				closeAnimationTimer = null;
			}, 250);
		}
	});

	$effect(() => {
		if (!browser) return;
		if (open && modalRef) {
			const focusable = modalRef.querySelector<HTMLElement>(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			focusable?.focus();
		}
	});
</script>

<svelte:window onkeydown={handleEscape} />

{#if shouldRender && document}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[120] flex items-center justify-center bg-surface-overlay/65 p-4 backdrop-blur-sm transition-opacity duration-200"
		class:opacity-0={!isVisible}
		class:opacity-100={isVisible}
		onclick={handleBackdropClick}
		role="presentation"
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			bind:this={modalRef}
			role="dialog"
			aria-modal="true"
			aria-labelledby="kb-preview-title"
			tabindex={-1}
			class="flex max-h-[90vh] w-full max-w-[1000px] flex-col overflow-hidden rounded-[1.6rem] border border-border bg-surface-elevated shadow-2xl transition-transform duration-200"
			class:scale-95={!isVisible}
			class:scale-100={isVisible}
			onclick={(event) => event.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex shrink-0 items-center justify-between gap-4 border-b border-border px-5 py-4 md:px-6">
				<div class="flex min-w-0 items-center gap-3">
					<h2
						id="kb-preview-title"
						class="truncate text-base font-sans font-semibold text-text-primary"
						title={getDocumentTitle(document)}
					>
						{getDocumentTitle(document)}
					</h2>
					<div class="flex shrink-0 items-center gap-1.5">
						{#if formatRoleLabel(document.documentRole)}
							<span class="rounded-full bg-surface-page px-2 py-0.5 text-[0.65rem] font-sans font-medium uppercase tracking-wider text-text-secondary border border-border">
								{formatRoleLabel(document.documentRole)}
							</span>
						{/if}
						{#if getVersionLabel(document)}
							<span class="rounded-full bg-surface-page px-2 py-0.5 text-[0.65rem] font-sans font-medium uppercase tracking-wider text-text-secondary border border-border">
								{getVersionLabel(document)}
							</span>
						{/if}
						{#if getLifecycleLabel(document)}
							<span class="rounded-full bg-surface-page px-2 py-0.5 text-[0.65rem] font-sans font-medium uppercase tracking-wider text-text-muted border border-border">
								{getLifecycleLabel(document)}
							</span>
						{/if}
					</div>
				</div>
				<div class="flex shrink-0 items-center gap-1">
					{#if onDownload}
						<button
							type="button"
							class="btn-icon-bare h-9 w-9 cursor-pointer rounded-full text-icon-muted hover:text-text-primary"
							onclick={() => onDownload(document)}
							aria-label="Download document"
							title="Download"
						>
							<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
								<polyline points="7 10 12 15 17 10" />
								<line x1="12" y1="15" x2="12" y2="3" />
							</svg>
						</button>
					{/if}
					<button
						type="button"
						class="btn-icon-bare h-9 w-9 cursor-pointer rounded-full text-icon-muted hover:text-text-primary"
						onclick={onClose}
						aria-label="Close preview"
						title="Close"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" x2="6" y1="6" y2="18" />
							<line x1="6" x2="18" y1="6" y2="18" />
						</svg>
					</button>
				</div>
			</div>

			<!-- Body -->
			<div class="flex flex-1 min-h-0 flex-col overflow-hidden">
				{#await ensureFilePreviewModule() then { default: FilePreviewComponent }}
					<FilePreviewComponent
						open={true}
						variant="embedded"
						showHeader={false}
						artifactId={document.artifactId ?? null}
						previewUrl={document.previewUrl ?? null}
						filename={document.filename}
						mimeType={document.mimeType}
						onClose={onClose}
					/>
				{:catch}
					<div class="flex h-full items-center justify-center text-sm font-sans text-text-secondary">
						Failed to load preview.
					</div>
				{/await}
			</div>

			<!-- Footer -->
			{#if document.originConversationId && onJumpToSource}
				<div class="shrink-0 border-t border-border px-5 py-3 md:px-6">
					<button
						type="button"
						class="text-sm font-sans text-text-secondary underline underline-offset-2 hover:text-text-primary"
						onclick={() => onJumpToSource(document)}
					>
						Open source conversation
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}
