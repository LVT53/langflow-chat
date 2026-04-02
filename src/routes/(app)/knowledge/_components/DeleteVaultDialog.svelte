<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade, scale } from 'svelte/transition';

	let {
		vaultName,
		fileCount,
		onConfirm,
		onCancel,
	}: {
		vaultName: string;
		fileCount: number;
		onConfirm: () => void;
		onCancel: () => void;
	} = $props();

	let dialogRef = $state<HTMLDivElement | undefined>(undefined);
	let confirmBtnRef = $state<HTMLButtonElement | undefined>(undefined);
	let previousFocus: HTMLElement | null = null;

	function handleConfirm() {
		onConfirm();
	}

	function handleCancel() {
		onCancel();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			handleCancel();
		} else if (event.key === 'Tab') {
			// Focus trap
			const focusableElements = dialogRef?.querySelectorAll(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			if (!focusableElements || focusableElements.length === 0) return;

			const firstElement = focusableElements[0] as HTMLElement;
			const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

			if (event.shiftKey) {
				if (document.activeElement === firstElement) {
					lastElement.focus();
					event.preventDefault();
				}
			} else {
				if (document.activeElement === lastElement) {
					firstElement.focus();
					event.preventDefault();
				}
			}
		}
	}

	onMount(() => {
		previousFocus = document.activeElement as HTMLElement;
		document.body.style.overflow = 'hidden';
		// Focus confirm button by default for better UX
		setTimeout(() => confirmBtnRef?.focus(), 0);
	});

	onDestroy(() => {
		if (previousFocus) {
			previousFocus.focus();
		}
		document.body.style.overflow = '';
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	data-testid="delete-vault-dialog"
	class="fixed inset-0 z-50 flex items-center justify-center p-4"
	transition:fade={{ duration: 150 }}
>
	<div
		class="absolute inset-0 bg-surface-page opacity-80 backdrop-blur-sm"
		onclick={handleCancel}
	></div>

	<div
		bind:this={dialogRef}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		aria-labelledby="delete-vault-title"
		aria-describedby="delete-vault-message"
		class="relative w-full max-w-[420px] rounded-xl border border-border bg-surface-page p-6 shadow-lg"
		onclick={(event) => event.stopPropagation()}
		transition:scale={{ duration: 150, start: 0.95 }}
	>
		<h2 id="delete-vault-title" class="mb-2 text-lg font-semibold text-text-primary">
			Delete vault?
		</h2>

		<p id="delete-vault-message" class="mb-4 text-text-muted">
			Are you sure you want to delete "<span class="font-medium text-text-primary">{vaultName}</span>"?
			This action cannot be undone.
		</p>

		{#if fileCount > 0}
			<div class="mb-4 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2">
				<p class="text-sm text-danger">
					<span class="font-medium">Warning:</span>
					This vault contains {fileCount} file{fileCount === 1 ? '' : 's'} that will also be deleted.
				</p>
			</div>
		{:else}
			<p class="mb-4 text-sm text-text-muted">This vault contains 0 files.</p>
		{/if}

		<div class="flex justify-end gap-3">
			<button
				type="button"
				data-testid="delete-vault-cancel"
				class="btn-secondary"
				onclick={handleCancel}
			>
				Cancel
			</button>
			<button
				type="button"
				data-testid="delete-vault-confirm"
				bind:this={confirmBtnRef}
				class="btn-danger"
				onclick={handleConfirm}
			>
				Delete
			</button>
		</div>
	</div>
</div>
