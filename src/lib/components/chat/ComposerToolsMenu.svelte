<script lang="ts">
	import { onMount } from 'svelte';
	import ModelSelector from './ModelSelector.svelte';
	import { t } from '$lib/i18n';

	let {
		canAttach = false,
		attachmentsEnabled = false,
		onClose,
		onAttach,
		personalityProfiles = [],
		selectedPersonalityId = null,
		onPersonalityChange = undefined,
	}: {
		canAttach?: boolean;
		attachmentsEnabled?: boolean;
		onClose?: () => void;
		onAttach?: () => void;
		personalityProfiles?: Array<{ id: string; name: string; description: string }>;
		selectedPersonalityId?: string | null;
		onPersonalityChange?: ((id: string | null) => void) | undefined;
	} = $props();

	let root = $state<HTMLDivElement | undefined>(undefined);
	let styleOpen = $state(false);

	let selectedProfile = $derived(
		personalityProfiles.find((p) => p.id === selectedPersonalityId) ?? null,
	);

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
				styleOpen = false;
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

<div bind:this={root} class="tools-menu" role="menu" aria-label={$t('composerTools.menu')}>
	<div class="menu-row menu-row--static">
		<div class="menu-label">Model</div>
		<ModelSelector onSelect={closeMenu} />
	</div>

	{#if personalityProfiles.length > 0}
		<div class="menu-row menu-row--static">
			<div class="menu-label">Style</div>
			<div class="style-selector">
				<button
					type="button"
					class="style-selector__trigger"
					onclick={() => styleOpen = !styleOpen}
					aria-haspopup="listbox"
					aria-expanded={styleOpen}
				>
					<span class="style-selector__text">
						{selectedProfile?.name ?? 'AlfyAI'}
					</span>
					<svg
						class="style-selector__chevron"
						class:style-selector__chevron--open={styleOpen}
						xmlns="http://www.w3.org/2000/svg"
						width="14" height="14" viewBox="0 0 24 24"
						fill="none" stroke="currentColor"
						stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
				{#if styleOpen}
					<ul class="style-selector__dropdown" role="listbox">
						<li
							role="option"
							aria-selected={!selectedPersonalityId}
							class="style-selector__option"
							class:style-selector__option--selected={!selectedPersonalityId}
							onclick={() => { onPersonalityChange?.(null); styleOpen = false; closeMenu(); }}
							onkeydown={(e) => e.key === 'Enter' && (onPersonalityChange?.(null), styleOpen = false, closeMenu())}
							tabindex="0"
						>AlfyAI</li>
						{#each personalityProfiles as profile}
							<li
								role="option"
								aria-selected={selectedPersonalityId === profile.id}
								class="style-selector__option"
								class:style-selector__option--selected={selectedPersonalityId === profile.id}
								onclick={() => { onPersonalityChange?.(profile.id); styleOpen = false; closeMenu(); }}
								onkeydown={(e) => e.key === 'Enter' && (onPersonalityChange?.(profile.id), styleOpen = false, closeMenu())}
								tabindex="0"
							>{profile.name}</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>
	{/if}

	<div class="menu-row">
		<button
			type="button"
			class="menu-row menu-row--button"
			onclick={handleAttach}
			disabled={!canAttach}
			title={attachmentsEnabled ? $t('composerTools.attachFileMaxSize') : $t('composerTools.uploadsUnavailable')}
			aria-label={$t('composerTools.attachFile')}
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
		box-shadow: 0 0 0 2px var(--focus-ring);
	}

	.style-selector {
		position: relative;
		display: inline-block;
	}

	.style-selector__trigger {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0.35rem 0.55rem;
		background: transparent;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.82rem;
		font-weight: 400;
		cursor: pointer;
		transition: all 150ms ease-out;
		min-height: 32px;
	}

	.style-selector__trigger:hover {
		border-color: var(--accent);
	}

	.style-selector__trigger:focus-visible {
		outline: none;
		box-shadow: 0 0 0 2px var(--focus-ring);
	}

	.style-selector__text {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100px;
	}

	.style-selector__chevron {
		flex-shrink: 0;
		transition: transform 200ms ease-out;
		color: var(--text-secondary);
	}

	.style-selector__chevron--open {
		transform: rotate(180deg);
	}

	.style-selector__dropdown {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		z-index: 50;
		min-width: 140px;
		border: 1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%);
		border-radius: 0.72rem;
		background: color-mix(in srgb, var(--surface-overlay) 95%, var(--surface-page) 5%);
		box-shadow: var(--shadow-lg);
		padding: 0.35rem;
		list-style: none;
		margin: 0;
		backdrop-filter: blur(14px);
	}

	.style-selector__option {
		padding: 0.4rem 0.6rem;
		border-radius: 0.5rem;
		font-size: 0.82rem;
		color: var(--text-primary);
		cursor: pointer;
		transition: background 100ms ease-out;
	}

	.style-selector__option:hover {
		background: var(--surface-elevated);
	}

	.style-selector__option--selected {
		color: var(--accent);
		font-weight: 500;
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
