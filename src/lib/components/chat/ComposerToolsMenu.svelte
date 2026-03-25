<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import ModelSelector from './ModelSelector.svelte';
	import TranslationToggle from './TranslationToggle.svelte';

	export let canAttach: boolean = false;
	export let attachmentsEnabled: boolean = false;

	const dispatch = createEventDispatcher<{
		close: void;
		attach: void;
	}>();

	let root: HTMLDivElement;

	function closeMenu() {
		dispatch('close');
	}

	function handleAttach() {
		dispatch('attach');
		dispatch('close');
	}

	onMount(() => {
		const handlePointerDown = (event: MouseEvent | TouchEvent) => {
			if (root && !root.contains(event.target as Node)) {
				dispatch('close');
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				dispatch('close');
			}
		};

		document.addEventListener('mousedown', handlePointerDown);
		document.addEventListener('touchstart', handlePointerDown, { passive: true });
		window.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('mousedown', handlePointerDown);
			document.removeEventListener('touchstart', handlePointerDown);
			window.removeEventListener('keydown', handleKeyDown);
		};
	});
</script>

<div bind:this={root} class="tools-menu" role="menu" aria-label="Composer tools">
	<div class="menu-row">
		<div class="menu-copy">
			<div class="menu-label">Model</div>
			<div class="menu-help">Choose the response model.</div>
		</div>
		<ModelSelector on:select={closeMenu} />
	</div>

	<div class="menu-row">
		<div class="menu-copy">
			<div class="menu-label">Translate</div>
			<div class="menu-help">Toggle Hungarian translation.</div>
		</div>
		<TranslationToggle />
	</div>

	<button
		type="button"
		class="menu-row menu-row--button"
		on:click={handleAttach}
		disabled={!canAttach}
		title={attachmentsEnabled ? 'Attach file' : 'File uploads are unavailable'}
		aria-label="Attach file"
		role="menuitem"
	>
		<div class="menu-copy">
			<div class="menu-label">Attach file</div>
			<div class="menu-help">
				{#if attachmentsEnabled}
					Add a document to this conversation.
				{:else}
					File uploads are unavailable.
				{/if}
			</div>
		</div>
		<span class="menu-icon" aria-hidden="true">
			<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
			</svg>
		</span>
	</button>
</div>

<style>
	.tools-menu {
		position: absolute;
		left: 0;
		bottom: calc(100% + 10px);
		z-index: 40;
		width: min(21rem, calc(100vw - 2rem));
		border: 1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%);
		border-radius: 1rem;
		background: color-mix(in srgb, var(--surface-overlay) 92%, var(--surface-page) 8%);
		box-shadow: var(--shadow-lg);
		padding: 0.6rem;
		backdrop-filter: blur(14px);
	}

	.menu-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.9rem;
		border-radius: 0.85rem;
		padding: 0.6rem;
	}

	.menu-row + .menu-row {
		margin-top: 0.3rem;
	}

	.menu-row--button {
		width: 100%;
		border: 0;
		background: transparent;
		text-align: left;
		cursor: pointer;
		transition: background-color var(--duration-standard) var(--ease-out);
	}

	.menu-row--button:hover:not(:disabled),
	.menu-row--button:focus-visible {
		background: color-mix(in srgb, var(--surface-page) 78%, var(--surface-elevated) 22%);
		outline: none;
	}

	.menu-row--button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.menu-copy {
		min-width: 0;
		flex: 1;
	}

	.menu-label {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.92rem;
		color: var(--text-primary);
	}

	.menu-help {
		margin-top: 0.2rem;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.76rem;
		color: var(--text-muted);
	}

	.menu-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
	}
</style>
