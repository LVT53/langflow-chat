<script lang="ts">
	import { onMount } from 'svelte';
	import type { ArtifactSummary, ConversationContextStatus } from '$lib/types';

	export let contextStatus: ConversationContextStatus | null = null;
	export let attachedArtifacts: ArtifactSummary[] = [];

	let root: HTMLDivElement;
	let isOpen = false;
	let mobile = false;

	const size = 38;
	const strokeWidth = 3;
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;

	function detectMobile() {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
			mobile = false;
			return;
		}

		mobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
	}

	onMount(() => {
		detectMobile();
		window.addEventListener('resize', detectMobile);

		const handlePointerDown = (event: MouseEvent | TouchEvent) => {
			if (root && !root.contains(event.target as Node)) {
				isOpen = false;
			}
		};

		document.addEventListener('mousedown', handlePointerDown);
		document.addEventListener('touchstart', handlePointerDown, { passive: true });

		return () => {
			window.removeEventListener('resize', detectMobile);
			document.removeEventListener('mousedown', handlePointerDown);
			document.removeEventListener('touchstart', handlePointerDown);
		};
	});

	function handleClick() {
		if (mobile) {
			isOpen = !isOpen;
		}
	}

	function formatLayer(layer: string): string {
		return layer.replace(/_/g, ' ');
	}

	$: ratio = contextStatus
		? Math.max(0, Math.min(1, contextStatus.estimatedTokens / Math.max(contextStatus.maxContextTokens, 1)))
		: 0;
	$: dashOffset = circumference * (1 - ratio);
	$: percent = Math.round(ratio * 100);
	$: toneClass = !contextStatus
		? 'ring-button--idle'
		: ratio >= 0.9
			? 'ring-button--high'
			: ratio >= 0.7
				? 'ring-button--medium'
				: 'ring-button--normal';
</script>

<div
	bind:this={root}
	class="ring-root relative"
>
	<button
		type="button"
		class={`ring-button ${toneClass}`}
		aria-label={contextStatus ? `Context usage ${percent}%` : 'No context yet'}
		aria-expanded={isOpen}
		on:click={handleClick}
	>
		<svg class="ring-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
			<circle
				class="ring-track"
				cx={size / 2}
				cy={size / 2}
				r={radius}
				stroke-width={strokeWidth}
			/>
			<circle
				class="ring-progress"
				cx={size / 2}
				cy={size / 2}
				r={radius}
				stroke-width={strokeWidth}
				stroke-dasharray={circumference}
				stroke-dashoffset={dashOffset}
			/>
		</svg>
		<span class="ring-value">{contextStatus ? `${percent}` : '0'}</span>
	</button>

	{#if isOpen}
		<div
			class="ring-popover"
			class:ring-popover--mobile-visible={mobile && isOpen}
			role="status"
			aria-live="polite"
		>
			<div class="popover-section">
				<div class="popover-label">Context</div>
				{#if contextStatus}
					<div class="popover-stat">
						<span>Usage</span>
						<span>{contextStatus.estimatedTokens.toLocaleString()} / {contextStatus.maxContextTokens.toLocaleString()}</span>
					</div>
					<div class="popover-stat">
						<span>Optimization</span>
						<span class={contextStatus.compactionApplied ? 'text-accent' : 'text-text-primary'}>
							{contextStatus.compactionApplied ? 'Applied' : 'Not needed'}
						</span>
					</div>
					{#if contextStatus.layersUsed.length > 0}
						<div class="popover-chips">
							{#each contextStatus.layersUsed as layer}
								<span class="popover-chip">{formatLayer(layer)}</span>
							{/each}
						</div>
					{/if}
				{:else}
					<div class="popover-empty">No context yet.</div>
				{/if}
			</div>

			{#if attachedArtifacts.length > 0}
				<div class="popover-section">
					<div class="popover-label">Working with</div>
					<div class="popover-list">
						{#each attachedArtifacts as artifact (artifact.id)}
							<div class="popover-item">{artifact.name}</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.ring-root {
		display: flex;
		align-items: center;
	}

	.ring-button {
		position: relative;
		display: flex;
		height: 44px;
		width: 44px;
		align-items: center;
		justify-content: center;
		border: 1px solid color-mix(in srgb, var(--border-default) 80%, transparent 20%);
		border-radius: 9999px;
		background: color-mix(in srgb, var(--surface-page) 76%, var(--surface-elevated) 24%);
		color: var(--text-muted);
		transition:
			border-color var(--duration-standard) var(--ease-out),
			background-color var(--duration-standard) var(--ease-out),
			transform var(--duration-standard) var(--ease-out);
	}

	.ring-button:hover,
	.ring-button:focus-visible {
		transform: translateY(-1px);
		outline: none;
	}

	.ring-button--normal {
		color: var(--accent);
	}

	.ring-button--medium {
		color: color-mix(in srgb, var(--accent) 72%, #b88a2f 28%);
	}

	.ring-button--high {
		color: var(--danger);
	}

	.ring-button--idle {
		color: var(--text-muted);
	}

	.ring-svg {
		transform: rotate(-90deg);
	}

	.ring-track,
	.ring-progress {
		fill: none;
	}

	.ring-track {
		stroke: color-mix(in srgb, var(--border-default) 72%, transparent 28%);
	}

	.ring-progress {
		stroke: currentColor;
		stroke-linecap: round;
		transition: stroke-dashoffset 180ms ease-out;
	}

	.ring-value {
		position: absolute;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 10px;
		font-weight: 600;
		line-height: 1;
		color: var(--text-primary);
	}

	.ring-popover {
		position: absolute;
		left: 0;
		bottom: calc(100% + 10px);
		z-index: 40;
		width: min(20rem, calc(100vw - 2rem));
		border: 1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%);
		border-radius: 1rem;
		background: color-mix(in srgb, var(--surface-overlay) 92%, var(--surface-page) 8%);
		box-shadow: var(--shadow-lg);
		padding: 0.9rem;
		backdrop-filter: blur(14px);
		opacity: 0;
		transform: translateY(6px);
		pointer-events: none;
		transition:
			opacity var(--duration-standard) var(--ease-out),
			transform var(--duration-standard) var(--ease-out);
	}

	.ring-root:hover .ring-popover,
	.ring-root:focus-within .ring-popover,
	.ring-popover--mobile-visible {
		opacity: 1;
		transform: translateY(0);
		pointer-events: auto;
	}

	.popover-section + .popover-section {
		margin-top: 0.85rem;
		padding-top: 0.85rem;
		border-top: 1px solid color-mix(in srgb, var(--border-default) 75%, transparent 25%);
	}

	.popover-label {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-muted);
	}

	.popover-stat {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 0.65rem;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.9rem;
		color: var(--text-secondary);
	}

	.popover-stat span:last-child {
		color: var(--text-primary);
		text-align: right;
	}

	.popover-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-top: 0.75rem;
	}

	.popover-chip {
		border: 1px solid var(--border-default);
		border-radius: 9999px;
		padding: 0.3rem 0.6rem;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.75rem;
		color: var(--text-secondary);
		background: color-mix(in srgb, var(--surface-page) 85%, var(--surface-elevated) 15%);
	}

	.popover-list {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin-top: 0.7rem;
		max-height: 12rem;
		overflow-y: auto;
	}

	.popover-item {
		border-radius: 0.8rem;
		padding: 0.55rem 0.7rem;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.86rem;
		color: var(--text-primary);
		background: color-mix(in srgb, var(--surface-page) 82%, var(--surface-elevated) 18%);
	}

	.popover-empty {
		margin-top: 0.65rem;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.86rem;
		color: var(--text-muted);
	}
 </style>
