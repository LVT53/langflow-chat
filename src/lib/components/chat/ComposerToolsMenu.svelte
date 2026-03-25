<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import ModelSelector from './ModelSelector.svelte';
	import { translationState, toggleTranslationState } from '$lib/stores/settings';

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

	function handleTranslateToggle() {
		toggleTranslationState();
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
	<div class="menu-row menu-row--static">
		<div class="menu-label">Model</div>
		<ModelSelector on:select={closeMenu} />
	</div>

	<div class="menu-row">
		<button
			type="button"
			class="menu-row menu-row--button"
			on:click={handleTranslateToggle}
			aria-label={$translationState === 'enabled' ? 'Disable translation' : 'Enable translation'}
			aria-checked={$translationState === 'enabled'}
			role="menuitemcheckbox"
		>
			<span class="menu-label">Translate</span>
			<span class={`menu-badge ${$translationState === 'enabled' ? 'menu-badge--active' : ''}`} aria-hidden="true">
				HU
			</span>
		</button>
	</div>

	<div class="menu-row">
		<button
			type="button"
			class="menu-row menu-row--button"
			on:click={handleAttach}
			disabled={!canAttach}
			title={attachmentsEnabled ? 'Attach file' : 'File uploads are unavailable'}
			aria-label="Attach file"
			role="menuitem"
		>
			<span class="menu-label">Attach file</span>
			<span class="menu-icon" aria-hidden="true">
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
				</svg>
			</span>
		</button>
	</div>
</div>

<style>
	.tools-menu {
		position: absolute;
		left: 0;
		bottom: calc(100% + 10px);
		z-index: 40;
		width: min(17rem, calc(100vw - 2rem));
		border: 1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%);
		border-radius: 0.9rem;
		background: color-mix(in srgb, var(--surface-overlay) 92%, var(--surface-page) 8%);
		box-shadow: var(--shadow-lg);
		padding: 0.45rem;
		backdrop-filter: blur(14px);
		animation: menuFadeIn 140ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.menu-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		border-radius: 0.72rem;
		padding: 0.08rem;
	}

	.menu-row + .menu-row {
		margin-top: 0.08rem;
	}

	.menu-row--static {
		padding: 0.5rem 0.62rem;
	}

	.menu-row--button {
		display: flex;
		width: 100%;
		align-items: center;
		justify-content: space-between;
		border: 0;
		background: transparent;
		text-align: left;
		cursor: pointer;
		padding: 0.5rem 0.62rem;
		transition:
			background-color var(--duration-standard) var(--ease-out),
			color var(--duration-standard) var(--ease-out);
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

	.menu-label {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.88rem;
		color: var(--text-primary);
	}

	.menu-row :global(.model-selector__trigger) {
		min-height: 32px;
		padding: 0.35rem 0.55rem;
	}

	.menu-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--text-secondary);
	}

	.menu-badge {
		display: inline-flex;
		min-width: 2rem;
		justify-content: center;
		border: 1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%);
		border-radius: 9999px;
		padding: 0.25rem 0.45rem;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		background: color-mix(in srgb, var(--surface-page) 82%, var(--surface-elevated) 18%);
	}

	.menu-badge--active {
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 35%, var(--border-default) 65%);
		background: color-mix(in srgb, var(--accent) 12%, var(--surface-page) 88%);
	}

	@keyframes menuFadeIn {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.tools-menu {
			animation: none;
		}
	}
</style>
