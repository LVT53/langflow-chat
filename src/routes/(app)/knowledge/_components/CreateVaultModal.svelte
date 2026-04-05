<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade, scale } from 'svelte/transition';

	let {
		presetColors,
		onCreate,
		onCancel,
	}: {
		presetColors: string[];
		onCreate: (name: string, color: string) => void;
		onCancel: () => void;
	} = $props();

	let vaultName = $state('');
	let selectedColorIndex = $state(0);
	let customColor = $state('');
	let useCustomColor = $state(false);

	const DEFAULT_COLOR = '#C15F3C';
	const selectedColor = $derived(useCustomColor && isValidHex ? customColor : (presetColors[selectedColorIndex] ?? DEFAULT_COLOR));
	let dialogRef = $state<HTMLDivElement | undefined>(undefined);
	let nameInputRef = $state<HTMLInputElement | undefined>(undefined);
	let previousFocus: HTMLElement | null = null;

	const isValidHex = $derived(/^#[0-9A-Fa-f]{6}$/.test(customColor));
	const canSubmit = $derived(vaultName.trim().length > 0 && (!useCustomColor || isValidHex));

	function handleSubmit() {
		if (!canSubmit) return;
		onCreate(vaultName.trim(), selectedColor);
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

	function selectPresetColor(index: number) {
		selectedColorIndex = index;
		useCustomColor = false;
	}

	function handleCustomColorInput(event: Event) {
		const target = event.target as HTMLInputElement;
		let value = target.value;
		// Auto-add # if not present
		if (value && !value.startsWith('#')) {
			value = '#' + value;
		}
		// Limit to 7 chars (# + 6 hex)
		if (value.length > 7) {
			value = value.slice(0, 7);
		}
		customColor = value;
		useCustomColor = true;
	}

	onMount(() => {
		previousFocus = document.activeElement as HTMLElement;
		document.body.style.overflow = 'hidden';
		// Focus name input on open
		setTimeout(() => nameInputRef?.focus(), 0);
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
	data-testid="create-vault-modal"
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
		aria-labelledby="create-vault-title"
		class="relative w-full max-w-[420px] rounded-xl border border-border bg-surface-page p-6 shadow-lg"
		onclick={(event) => event.stopPropagation()}
		transition:scale={{ duration: 150, start: 0.95 }}
	>
		<h2 id="create-vault-title" class="mb-4 text-lg font-semibold text-text-primary">
			Create New Vault
		</h2>

		<form onsubmit={(event) => { event.preventDefault(); handleSubmit(); }}>
			<!-- Vault Name -->
			<div class="mb-4">
				<label for="vault-name" class="mb-1.5 block text-sm font-medium text-text-primary">
					Vault name
				</label>
				<input
					id="vault-name"
					bind:this={nameInputRef}
					bind:value={vaultName}
					type="text"
					placeholder="Enter vault name"
					maxlength="100"
					class="w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-accent"
				/>
			</div>

			<!-- Color Picker -->
			<div class="mb-6">
				<span class="mb-2 block text-sm font-medium text-text-primary">Color</span>

				<!-- Preset Colors -->
				<div class="mb-3 flex flex-wrap gap-2">
					{#each presetColors as color, index}
						<button
							type="button"
							data-testid="color-option"
							class="h-8 w-8 cursor-pointer rounded-full border-2 transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
							class:border-border={selectedColorIndex !== index || useCustomColor}
							class:border-text-primary={selectedColorIndex === index && !useCustomColor}
							class:ring-2={selectedColorIndex === index && !useCustomColor}
							class:ring-accent={selectedColorIndex === index && !useCustomColor}
							style="background-color: {color};"
							onclick={() => selectPresetColor(index)}
							aria-label="Select color {color}"
							aria-pressed={selectedColorIndex === index && !useCustomColor}
						></button>
					{/each}
				</div>

				<!-- Custom Color Input -->
				<div class="flex items-center gap-2">
					<label for="custom-color" class="text-sm text-text-muted">Custom color (hex)</label>
					<input
						id="custom-color"
						type="text"
						value={customColor}
						oninput={handleCustomColorInput}
						placeholder="#RRGGBB"
						maxlength="7"
						class="w-24 rounded-lg border border-border bg-surface-elevated px-2 py-1.5 text-sm font-mono text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-accent"
						class:border-danger={useCustomColor && customColor && !isValidHex}
					/>
					{#if useCustomColor && customColor && !isValidHex}
						<span class="text-xs text-danger">Invalid hex</span>
					{/if}
				</div>
			</div>

			<!-- Actions -->
			<div class="flex justify-end gap-3">
				<button
					type="button"
					data-testid="create-vault-cancel"
					class="btn-secondary cursor-pointer"
					onclick={handleCancel}
				>
					Cancel
				</button>
				<button
					type="submit"
					data-testid="create-vault-submit"
					class="btn-primary cursor-pointer"
					disabled={!canSubmit}
				>
					Create
				</button>
			</div>
		</form>
	</div>
</div>
