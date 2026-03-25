<script lang="ts">
	import type { ArtifactSummary } from '$lib/types';

	export let attachment: ArtifactSummary;
	export let removable: boolean = false;
	export let variant: 'compact' | 'pending' = 'compact';

	const dispatch = createEventDispatcher<{
		remove: { id: string };
	}>();

	import { createEventDispatcher } from 'svelte';

	function handleRemove() {
		dispatch('remove', { id: attachment.id });
	}
</script>

<div
	class="file-attachment"
	class:compact={variant === 'compact'}
	class:pending={variant === 'pending'}
	role="listitem"
>
	<svg
		class="file-icon"
		xmlns="http://www.w3.org/2000/svg"
		width="16"
		height="16"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
		<polyline points="14 2 14 8 20 8" />
		<line x1="16" x2="8" y1="13" y2="13" />
		<line x1="16" x2="8" y1="17" y2="17" />
		<line x1="10" x2="8" y1="9" y2="9" />
	</svg>
	<span class="filename">{attachment.name}</span>
	{#if removable}
		<button
			type="button"
			class="remove-button"
			on:click={handleRemove}
			aria-label={`Remove ${attachment.name}`}
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="14"
				height="14"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M18 6 6 18" />
				<path d="m6 6 12 12" />
			</svg>
		</button>
	{/if}
</div>

<style lang="postcss">
	.file-attachment {
		display: inline-flex;
		align-items: center;
		gap: var(--space-sm);
		max-width: 100%;
	}

	.compact {
		border-radius: 1.2rem;
		border: 1px solid var(--border-default);
		background-color: var(--surface-elevated);
		box-shadow: var(--shadow-sm);
		padding: var(--space-sm) var(--space-md);
	}

	.pending {
		border-radius: 1.2rem;
		border: 1px solid var(--border-default);
		background-color: var(--surface-elevated);
		box-shadow: var(--shadow-sm);
		padding: var(--space-sm) var(--space-md);
		animation: borderPulse 2s ease-in-out infinite;
	}

	@keyframes borderPulse {
		0%,
		100% {
			border-color: var(--border-default);
		}
		50% {
			border-color: color-mix(in srgb, var(--accent) 30%, var(--border-default) 70%);
		}
	}

	.file-icon {
		flex-shrink: 0;
		color: var(--icon-muted);
	}

	.filename {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.875rem; /* text-sm */
		line-height: 1.25;
		color: var(--text-primary);
		max-width: 180px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.remove-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 28px;
		height: 28px;
		min-width: 44px;
		min-height: 44px;
		padding: 0;
		margin: -8px;
		background-color: transparent;
		border: none;
		border-radius: var(--radius-md);
		color: var(--icon-muted);
		cursor: pointer;
		transition:
			color var(--duration-standard) var(--ease-out),
			background-color var(--duration-standard) var(--ease-out),
			transform var(--duration-standard) var(--ease-out);
		outline: none;
	}

	.remove-button:hover {
		color: var(--icon-primary);
		background-color: color-mix(in srgb, var(--surface-overlay) 50%, transparent);
	}

	.remove-button:focus-visible {
		box-shadow: 0 0 0 2px var(--focus-ring);
	}

	.remove-button:active {
		transform: scale(0.92);
	}

	@media (prefers-reduced-motion: reduce) {
		.pending {
			animation: none;
		}

		.remove-button {
			transition: none;
		}
	}
</style>
