<script lang="ts">
	import type { Artifact } from '$lib/types';
	import { requestJson } from '$lib/client/api/http';

	let {
		open,
		artifactId,
		contentUrl = null,
		filename,
		eyebrowLabel = 'Attachment',
		emptyMessage = 'No extracted text available for this attachment.',
		errorMessage = 'Failed to load attachment content.',
		onClose,
	}: {
		open: boolean;
		artifactId: string | null;
		contentUrl?: string | null;
		filename: string;
		eyebrowLabel?: string;
		emptyMessage?: string;
		errorMessage?: string;
		onClose: () => void;
	} = $props();

	let content = $state<string | null>(null);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	// Fetch content when modal opens
	$effect(() => {
		if (open && (artifactId || contentUrl)) {
			fetchContent();
		}
	});

	async function fetchContent() {
		isLoading = true;
		error = null;
		content = null;

		try {
			if (contentUrl) {
				const payload = await requestJson<{ contentText: string | null }>(
					contentUrl,
					undefined,
					errorMessage
				);
				content = payload.contentText;
			} else if (artifactId) {
				const payload = await requestJson<{ artifact: Artifact }>(
					`/api/knowledge/${artifactId}`,
					undefined,
					errorMessage
				);
				content = payload.artifact.contentText;
			}
		} catch (err) {
			error = err instanceof Error ? err.message : errorMessage;
		} finally {
			isLoading = false;
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			onClose();
		}
	}

	function handleBackdropClick() {
		onClose();
	}

	function handleModalClick(event: MouseEvent) {
		event.stopPropagation();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-[120] flex items-center justify-center bg-surface-overlay/65 p-4 backdrop-blur-sm"
		role="presentation"
		onclick={handleBackdropClick}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			role="dialog"
			aria-modal="true"
			tabindex={-1}
			class="max-h-[88vh] w-full max-w-[900px] overflow-hidden rounded-[1.6rem] border border-border bg-surface-elevated shadow-2xl"
			onclick={handleModalClick}
		>
			<div class="flex items-start justify-between gap-4 border-b border-border px-5 py-4 md:px-6">
				<div>
					<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
						{eyebrowLabel}
					</div>
					<h3 class="mt-2 text-xl font-serif tracking-[-0.03em] text-text-primary">
						{filename}
					</h3>
				</div>
				<button
					type="button"
					class="btn-icon-bare h-10 w-10 rounded-full text-icon-muted hover:text-text-primary"
					onclick={onClose}
					aria-label="Close attachment viewer"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" x2="6" y1="6" y2="18" />
						<line x1="6" x2="18" y1="6" y2="18" />
					</svg>
				</button>
			</div>

			<div class="max-h-[calc(88vh-104px)] overflow-y-auto px-5 py-5 md:px-6">
				{#if isLoading}
					<div class="flex items-center justify-center py-12">
						<div class="spinner"></div>
					</div>
				{:else if error}
					<div class="rounded-[1rem] border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-sans text-danger">
						{error}
					</div>
				{:else if content === null}
					<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm text-text-muted">
						{emptyMessage}
					</div>
				{:else}
					<div class="rounded-[1.2rem] border border-border bg-surface-page p-4">
						<pre class="content-text font-mono text-sm leading-relaxed text-text-primary">{content}</pre>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style lang="postcss">
	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid color-mix(in srgb, var(--border-default) 50%, transparent);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.content-text {
		white-space: pre-wrap;
		word-break: break-word;
		overflow-wrap: break-word;
		max-width: 100%;
	}

	@media (prefers-reduced-motion: reduce) {
		.spinner {
			animation: none;
		}
	}
</style>
