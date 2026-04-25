<script lang="ts">
	import { onMount } from 'svelte';
	import ModelSelector from './ModelSelector.svelte';

	let {
		canAttach = false,
		attachmentsEnabled = false,
		onClose,
		onAttach
	}: {
		canAttach?: boolean;
		attachmentsEnabled?: boolean;
		onClose?: () => void;
		onAttach?: () => void;
	} = $props();

	let root = $state<HTMLDivElement | undefined>(undefined);

	function closeMenu() {
		onClose?.();
	}

	function handleAttach() {
		onAttach?.();
		onClose?.();
	}

	onMount(() => {
		const handlePointerDown = (event: MouseEvent | TouchEvent) => {
			if (root && !root.contains(event.target as Node)) {
				onClose?.();
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose?.();
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
		<ModelSelector onSelect={closeMenu} />
	</div>

	<div class="menu-row">
		<button
			type="button"
			class="menu-row menu-row--button"
			onclick={handleAttach}
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
