<script lang="ts">
	import { createEventDispatcher, onMount, onDestroy } from 'svelte';
	import { fade, scale } from 'svelte/transition';

	export let title: string;
	export let message: string;
	export let confirmText: string = 'Confirm';
	export let cancelText: string = 'Cancel';
	export let confirmVariant: 'primary' | 'danger' = 'primary';

	const dispatch = createEventDispatcher<{
		confirm: void;
		cancel: void;
	}>();

	let dialogRef: HTMLDivElement;
	let previousFocus: HTMLElement | null = null;
	let confirmBtnRef: HTMLButtonElement;

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			handleCancel();
		} else if (e.key === 'Tab') {
			// Basic focus trap
			const focusableElements = dialogRef?.querySelectorAll(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			if (!focusableElements || focusableElements.length === 0) return;

			const firstElement = focusableElements[0] as HTMLElement;
			const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

			if (e.shiftKey) {
				if (document.activeElement === firstElement) {
					lastElement.focus();
					e.preventDefault();
				}
			} else {
				if (document.activeElement === lastElement) {
					firstElement.focus();
					e.preventDefault();
				}
			}
		}
	}

	function handleConfirm() {
		dispatch('confirm');
	}

	function handleCancel() {
		dispatch('cancel');
	}

	onMount(() => {
		previousFocus = document.activeElement as HTMLElement;
		// Focus the confirm button by default for better UX on dialog open
		if (confirmBtnRef) {
			confirmBtnRef.focus();
		}
		document.body.style.overflow = 'hidden'; // Prevent background scrolling
	});

	onDestroy(() => {
		if (previousFocus) {
			previousFocus.focus();
		}
		document.body.style.overflow = '';
	});
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	class="fixed inset-0 z-50 flex items-center justify-center p-md"
	transition:fade={{ duration: 150 }}
>
	<div 
		class="absolute inset-0 bg-surface-page opacity-80 backdrop-blur-sm" 
		on:click={handleCancel}
	></div>

	<div
		bind:this={dialogRef}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
		aria-labelledby="dialog-title"
		aria-describedby="dialog-message"
		class="relative w-full max-w-[480px] rounded-lg bg-surface-overlay p-lg shadow-lg border border-border"
		on:click|stopPropagation
		transition:scale={{ duration: 150, start: 0.95 }}
	>
		<h2 id="dialog-title" class="mb-sm text-xl font-semibold text-text-primary">
			{title}
		</h2>
		
		<p id="dialog-message" class="mb-lg text-text-muted">
			{message}
		</p>

		<div class="flex justify-end gap-md">
<button
			type="button"
			class="rounded-md border border-border bg-transparent min-h-[44px] px-md py-sm text-sm font-medium text-text-muted transition-colors duration-250 hover:bg-surface-elevated hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 dark:focus:ring-offset-surface-page cursor-pointer"
			on:click={handleCancel}
		>
				{cancelText}
			</button>
<button
			data-testid="confirm-delete"
			bind:this={confirmBtnRef}
			type="button"
			class="rounded-md min-h-[44px] px-md py-sm text-sm font-medium text-surface-page transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-surface-page {confirmVariant === 'danger' ? 'bg-danger hover:bg-danger-hover focus:ring-danger' : 'bg-accent hover:bg-accent-hover focus:ring-focus-ring'} cursor-pointer"
			on:click={handleConfirm}
		>
				{confirmText}
			</button>
		</div>
	</div>
</div>
