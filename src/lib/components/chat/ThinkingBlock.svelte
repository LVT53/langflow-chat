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

	// Whether there are any segments at all (drives expanded-view rendering)
	$: hasSegments = segments.length > 0;
	// True when segments came from streaming (contain interleaved text+tool_call).
	// False when loaded from DB (only tool_call entries, no text segments).
	$: hasTextSegments = segments.some((s) => s.type === 'text');

	// All tool calls accumulated during this thinking phase — shown as a stacked
	// list in the collapsed header so every tool is readable regardless of speed.
	// The list slides away as a unit when thinkingIsDone becomes true.
	$: visibleTools = thinkingIsDone
		? []
		: (segments.filter((s): s is ThinkingSegment & { type: 'tool_call' } => s.type === 'tool_call'));

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

	{#if visibleTools.length > 0}
		<div class="tool-call-stack" transition:slide|local={{ duration: 200 }}>
			{#each visibleTools as tool (tool.name + JSON.stringify(tool.input))}
				<div class="tool-call-row" class:is-running={tool.status === 'running'}>
					{#if tool.status === 'running'}
						<span class="tool-dot"></span>
					{:else}
						<svg class="check-icon-header" viewBox="0 0 12 12" fill="none">
							<path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.5"
								stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					{/if}
					<span class="tool-label-text">{formatToolCall(tool.name, tool.input)}</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if expanded}
		<div class="thinking-content" transition:slide|local>
			{#if hasSegments}
				{#if !hasTextSegments}
					<!-- DB-loaded: no interleaving positions stored, show flat thinking text first -->
					<pre class="thinking-text">{content}</pre>
				{/if}
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

	/* Tool call stack — accumulates all tool rows, visible without expanding */
	.tool-call-stack {
		border-top: 1px solid var(--border-subtle);
		padding: var(--space-xs) 0;
	}

	.tool-call-row {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		padding: 3px var(--space-md);
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-size: 12px;
		color: var(--text-muted);
	}

	.tool-call-row.is-running {
		color: var(--text-secondary);
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

	.check-icon-header {
		color: var(--success);
		width: 12px;
		height: 12px;
		flex-shrink: 0;
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
