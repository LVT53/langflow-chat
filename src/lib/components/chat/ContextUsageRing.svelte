<script lang="ts">
	import { onMount } from 'svelte';
	import type { ArtifactSummary, ConversationContextStatus, TaskState } from '$lib/types';

	export let contextStatus: ConversationContextStatus | null = null;
	export let attachedArtifacts: ArtifactSummary[] = [];
	export let taskState: TaskState | null = null;

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

	function formatCompactionMode(mode: ConversationContextStatus['compactionMode'] | undefined): string {
		switch (mode) {
			case 'deterministic':
				return 'Deterministic';
			case 'llm_fallback':
				return 'LLM fallback';
			default:
				return 'Not needed';
		}
	}

	$: promptBudget = contextStatus ? Math.max(contextStatus.targetTokens, 1) : 1;
	$: ratio = contextStatus
		? Math.max(0, Math.min(1, contextStatus.estimatedTokens / promptBudget))
		: 0;
	$: dashOffset = circumference * (1 - ratio);
	$: percent = Math.round(ratio * 100);
	$: toneClass = !contextStatus
		? 'ring-button--idle'
		: contextStatus.compactionMode === 'llm_fallback'
			? 'ring-button--compact'
			: contextStatus.compactionMode === 'deterministic'
				? 'ring-button--high'
				: ratio >= 0.9
					? 'ring-button--high'
					: ratio >= 0.75
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
		aria-label={contextStatus ? `Prompt budget usage ${percent}% (${contextStatus.estimatedTokens.toLocaleString()} tokens)` : 'No context yet'}
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

	<div
		class="ring-popover"
		class:ring-popover--mobile-visible={mobile && isOpen}
		role="status"
		aria-live="polite"
		aria-hidden={mobile ? !isOpen : undefined}
	>
		<div class="popover-section">
			<div class="popover-label">Context</div>
			{#if contextStatus}
				<div class="popover-stat">
					<span>Prompt budget</span>
					<span>{contextStatus.estimatedTokens.toLocaleString()} / {contextStatus.targetTokens.toLocaleString()}</span>
				</div>
				<div class="popover-stat">
					<span>Pressure threshold</span>
					<span>{contextStatus.thresholdTokens.toLocaleString()}</span>
				</div>
				<div class="popover-stat">
					<span>Compaction mode</span>
					<span class:compaction-active={contextStatus.compactionMode !== 'none'}>
						{formatCompactionMode(contextStatus.compactionMode)}
					</span>
				</div>
				<div class="popover-stat">
					<span>Recent turns</span>
					<span>{contextStatus.recentTurnCount}</span>
				</div>
				<div class="popover-stat">
					<span>Retrieved evidence</span>
					<span>{contextStatus.promptArtifactCount}</span>
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

		{#if taskState}
			<div class="popover-section">
				<div class="popover-label">Task State</div>
				<div class="popover-copy">{taskState.objective}</div>
				{#if taskState.nextSteps.length > 0}
					<div class="popover-sublist">
						{#each taskState.nextSteps.slice(0, 2) as step}
							<div class="popover-item">{step}</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if attachedArtifacts.length > 0}
			<div class="popover-section">
				<div class="popover-label">Working With</div>
				<div class="popover-list">
					{#each attachedArtifacts as artifact (artifact.id)}
						<div class="popover-item">{artifact.name}</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>
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
		color: color-mix(in srgb, var(--accent) 70%, #b88a2f 30%);
	}

	.ring-button--high {
		color: var(--danger);
	}

	.ring-button--compact {
		color: color-mix(in srgb, var(--accent) 62%, var(--danger) 38%);
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
		font-size: 9px;
		font-weight: 600;
		line-height: 1;
		color: var(--text-primary);
		text-transform: lowercase;
	}

	.ring-popover {
		position: absolute;
		left: 0;
		bottom: calc(100% + 10px);
		z-index: 40;
		width: min(22rem, calc(100vw - 2rem));
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
		margin-top: 0.55rem;
		font-size: 0.82rem;
		color: var(--text-primary);
	}

	.compaction-active {
		color: var(--accent);
	}

	.popover-copy {
		margin-top: 0.5rem;
		font-size: 0.84rem;
		line-height: 1.45;
		color: var(--text-primary);
	}

	.popover-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.65rem;
	}

	.popover-chip {
		border: 1px solid color-mix(in srgb, var(--border-default) 75%, transparent 25%);
		border-radius: 9999px;
		padding: 0.25rem 0.5rem;
		font-size: 0.7rem;
		text-transform: capitalize;
		color: var(--text-muted);
	}

	.popover-sublist,
	.popover-list {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin-top: 0.55rem;
	}

	.popover-item {
		font-size: 0.8rem;
		line-height: 1.4;
		color: var(--text-primary);
		word-break: break-word;
	}

	.popover-empty {
		margin-top: 0.5rem;
		font-size: 0.82rem;
		color: var(--text-muted);
	}
</style>
