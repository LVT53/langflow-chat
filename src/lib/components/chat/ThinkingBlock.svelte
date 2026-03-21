<script lang="ts">
	import type { ThinkingSegment } from '$lib/types';

	export let content: string = '';
	export let isStreaming: boolean = false;
	// True once thinking is definitively over: visible response text has started
	// arriving OR the whole message is done. Stays false between multi-burst
	// thinking phases so the label doesn't flip "Thinking"→"Thought"→"Thinking".
	export let thinkingIsDone: boolean = false;
	// Interleaved thinking text + tool call segments, built during streaming.
	// Falls back to flat `content` string when absent (e.g. DB-loaded messages).
	export let segments: ThinkingSegment[] = [];

	let expanded = false;

	// "Thought" only once we're sure thinking is over (response text started or done).
	$: label = thinkingIsDone ? 'Thought' : 'Thinking';

	// Shimmer while thinking is still possibly ongoing (between bursts or active).
	$: showShimmer = !thinkingIsDone;

	// Whether to render interleaved segments or fall back to flat content
	$: hasSegments = segments.length > 0;

	// Active tool: last running tool_call segment (shown in header when collapsed)
	$: activeTool = (() => {
		for (let i = segments.length - 1; i >= 0; i--) {
			const s = segments[i];
			if (s.type === 'tool_call' && s.status === 'running') return s;
		}
		return null;
	})();

	function formatToolCall(name: string, input: Record<string, unknown>): string {
		const n = name.toLowerCase();
		const firstVal = () => String(Object.values(input)[0] ?? '').slice(0, 60);
		if (n.includes('search') || n.includes('tavily')) {
			const q = input.query ?? input.q ?? Object.values(input)[0];
			return `Searching: "${String(q ?? '').slice(0, 60)}"`;
		}
		if (n.includes('fetch') || n.includes('url') || n.includes('web') || n.includes('browse')) {
			return `Fetching: ${firstVal()}`;
		}
		return firstVal() ? `${name}: ${firstVal()}` : name;
	}

	function toggle() {
		expanded = !expanded;
	}
</script>

<script context="module">
	import { slide } from 'svelte/transition';
</script>

<div class="thinking-block" class:is-streaming={showShimmer}>
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

	{#if activeTool}
		<div class="tool-call-active" transition:slide|local={{ duration: 150 }}>
			<span class="tool-dot"></span>
			<span class="tool-label-text">{formatToolCall(activeTool.name, activeTool.input)}</span>
		</div>
	{/if}

	{#if expanded}
		<div class="thinking-content" transition:slide|local>
			{#if hasSegments}
				{#each segments as seg}
					{#if seg.type === 'text'}
						<pre class="thinking-text">{seg.content}</pre>
					{:else}
						<div class="tool-call-item">
							{#if seg.status === 'done'}
								<svg class="check-icon" viewBox="0 0 12 12" fill="none">
									<path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5"
										stroke-linecap="round" stroke-linejoin="round"/>
								</svg>
							{:else}
								<span class="tool-dot-inline"></span>
							{/if}
							<span class="tool-item-label">{formatToolCall(seg.name, seg.input)}</span>
						</div>
					{/if}
				{/each}
			{:else}
				<pre class="thinking-text">{content}</pre>
			{/if}
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

	/* Active tool row — visible without expanding the block */
	.tool-call-active {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: var(--space-xs) var(--space-md);
		border-top: 1px solid var(--border-subtle);
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-size: 12px;
		color: var(--text-muted);
	}

	.tool-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
		flex-shrink: 0;
		animation: tool-pulse 1.5s ease-in-out infinite;
	}

	@keyframes tool-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.35; }
	}

	.tool-label-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
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

	/* Inline tool call rows between thinking text segments */
	.tool-call-item {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-size: 12px;
		color: var(--text-muted);
		margin: var(--space-xs) 0;
	}

	.tool-dot-inline {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent);
		flex-shrink: 0;
		opacity: 0.6;
		animation: tool-pulse 1.5s ease-in-out infinite;
	}

	.tool-item-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.check-icon {
		color: var(--success);
		width: 12px;
		height: 12px;
		flex-shrink: 0;
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

		.tool-dot,
		.tool-dot-inline {
			animation: none;
			opacity: 0.7;
		}
	}
</style>
