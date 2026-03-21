<script lang="ts">
	export let content: string = '';
	export let isStreaming: boolean = false;
	// True once the entire message (not just thinking) has finished generating.
	// Used to auto-collapse the block after the user has been reading it live.
	export let isDone: boolean = false;

	let expanded = false;

	// Show "Thinking" while any part of the message is still streaming;
	// only flip to "Thought" once the complete response is done.
	// This prevents the label from toggling between bursts of thinking.
	$: label = isDone ? 'Thought' : 'Thinking';

	// Show shimmer animation whenever the message is still generating,
	// not just when thinking tokens are actively arriving.
	$: showShimmer = !isDone;

	function toggle() {
		expanded = !expanded;
	}
</script>

<script context="module">
	import { slide } from 'svelte/transition';
</script>

<div class="thinking-block" class:is-streaming={isStreaming}>
	<button
		type="button"
		class="thinking-header"
		on:click={toggle}
		aria-expanded={expanded}
	>
		<div class="thinking-indicator">
			<span class="thinking-label">{label}</span>
			{#if showShimmer}
				<span class="shimmer-container">
					<span class="shimmer"></span>
				</span>
			{/if}
		</div>
		<svg
			class="chevron"
			class:expanded
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<polyline points="6 9 12 15 18 9" />
		</svg>
	</button>

	{#if expanded}
		<div class="thinking-content" transition:slide|local>
			<pre class="thinking-text">{content}</pre>
		</div>
	{/if}
</div>

<style>
	.thinking-block {
		margin-bottom: var(--space-md);
		border-radius: var(--radius-md);
		background: var(--surface-elevated);
		border: 1px solid var(--border-subtle);
		overflow: hidden;
	}

	.thinking-block.is-streaming {
		border-color: color-mix(in srgb, var(--accent) 30%, var(--border-subtle) 70%);
	}

	.thinking-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: var(--space-sm) var(--space-md);
		background: transparent;
		border: none;
		cursor: pointer;
		transition: background-color var(--duration-standard) var(--ease-out);
	}

	.thinking-header:hover {
		background: color-mix(in srgb, var(--surface-page) 50%, transparent 50%);
	}

	.thinking-header:focus-visible {
		outline: none;
		box-shadow: inset 0 0 0 2px var(--focus-ring);
	}

	.thinking-indicator {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.thinking-label {
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-size: 14px;
		font-weight: 500;
		color: var(--text-muted);
	}

	.shimmer-container {
		position: relative;
		width: 60px;
		height: 14px;
		overflow: hidden;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--accent) 15%, var(--surface-elevated) 85%);
	}

	.shimmer {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			90deg,
			transparent 0%,
			color-mix(in srgb, var(--accent) 60%, transparent 40%) 50%,
			transparent 100%
		);
		animation: shimmer-slide 1.5s ease-in-out infinite;
	}

	@keyframes shimmer-slide {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}

	.chevron {
		color: var(--icon-muted);
		transition: transform var(--duration-standard) var(--ease-out);
	}

	.chevron.expanded {
		transform: rotate(180deg);
	}

	.thinking-content {
		padding: 0 var(--space-md) var(--space-md);
	}

	.thinking-text {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-size: 13px;
		line-height: 1.5;
		color: var(--text-muted);
		white-space: pre-wrap;
		word-break: break-word;
	}

	@media (prefers-reduced-motion: reduce) {
		.shimmer {
			animation: none;
			background: color-mix(in srgb, var(--accent) 30%, transparent 70%);
			opacity: 0.5;
		}

		.chevron {
			transition: none;
		}
	}
</style>
