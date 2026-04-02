<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade, scale } from 'svelte/transition';

	interface Vault {
		id: string;
		name: string;
		color: string | null;
	}

	let {
		vaults,
		filename,
		onSave,
		onCancel,
	}: {
		vaults: Vault[];
		filename: string;
		onSave: (vaultId: string) => void;
		onCancel: () => void;
	} = $props();

	let selectedVaultId = $state<string | null>(null);
	let dialogRef = $state<HTMLDivElement | undefined>(undefined);
	let previousFocus: HTMLElement | null = null;

	const canSubmit = $derived(selectedVaultId !== null);

	function handleSubmit() {
		if (!canSubmit || !selectedVaultId) return;
		onSave(selectedVaultId);
	}

	function handleCancel() {
		onCancel();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			handleCancel();
		} else if (event.key === 'Enter' && canSubmit) {
			event.preventDefault();
			handleSubmit();
		} else if (event.key === 'Tab') {
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
	data-testid="vault-picker-modal"
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
		aria-labelledby="vault-picker-title"
		class="relative w-full max-w-[420px] rounded-xl border border-border bg-surface-page p-6 shadow-lg"
		onclick={(event) => event.stopPropagation()}
		transition:scale={{ duration: 150, start: 0.95 }}
	>
		<h2 id="vault-picker-title" class="mb-2 text-lg font-semibold text-text-primary">
			Save to Vault
		</h2>

		<p class="mb-4 text-sm text-text-muted">
			Choose a vault to save <span class="font-medium text-text-primary">{filename}</span>
		</p>

		{#if vaults.length === 0}
			<div class="mb-6 rounded-lg border border-border bg-surface-elevated p-8 text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="48"
					height="48"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="mx-auto mb-3 text-text-muted"
					aria-hidden="true"
				>
					<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275Z" />
				</svg>
				<p class="text-sm text-text-muted">No vaults available</p>
				<p class="mt-1 text-xs text-text-muted">Create a vault in the Knowledge Base first</p>
			</div>
		{:else}
			<div class="mb-6 max-h-[280px] overflow-y-auto rounded-lg border border-border">
				{#each vaults as vault, index}
					<button
						type="button"
						data-testid="vault-option"
						class="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-surface-elevated"
						class:bg-surface-elevated={selectedVaultId === vault.id}
						onclick={() => selectedVaultId = vault.id}
						aria-pressed={selectedVaultId === vault.id}
					>
						<span
							class="h-4 w-4 rounded-full"
							style="background-color: {vault.color ?? '#6b7280'};"
							aria-hidden="true"
						></span>
						<span class="flex-1 text-sm font-medium text-text-primary">{vault.name}</span>
						{#if selectedVaultId === vault.id}
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="16"
								height="16"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="text-accent"
								aria-hidden="true"
							>
								<polyline points="20 6 9 17 4 12" />
							</svg>
						{/if}
					</button>
				{/each}
			</div>
		{/if}

		<div class="flex justify-end gap-3">
			<button
				type="button"
				data-testid="vault-picker-cancel"
				class="btn-secondary"
				onclick={handleCancel}
			>
				Cancel
			</button>
			<button
				type="button"
				data-testid="vault-picker-save"
				class="btn-primary"
				disabled={!canSubmit}
				onclick={handleSubmit}
			>
				Save
			</button>
		</div>
	</div>
</div>
