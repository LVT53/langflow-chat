<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { renderMarkdown } from '$lib/services/markdown';

	export let content: string = '';
	export let isDark: boolean = false;
	export let isStreaming: boolean = false;

	let container: HTMLDivElement;
	let lastContentLength = 0;
	let renderedChunks: Array<{ id: number; html: string; isNew: boolean }> = [];
	let chunkIdCounter = 0;

	// Split content into manageable chunks for animation
	// We split on paragraph boundaries for natural fade-in points
	function splitIntoChunks(text: string): string[] {
		if (!text) return [];
		// Split on double newlines (paragraphs) or single newlines for streaming chunks
		return text.split(/(?<=\n)/).filter((chunk) => chunk.length > 0);
	}

	async function updateChunks() {
		if (content.length === lastContentLength) return;

		const newContent = content.slice(lastContentLength);
		const newChunks = splitIntoChunks(newContent);

		if (newChunks.length > 0) {
			for (const chunk of newChunks) {
				// Skip if it's just whitespace
				if (!chunk.trim()) {
					// Append to previous chunk if exists
					if (renderedChunks.length > 0) {
						renderedChunks[renderedChunks.length - 1].html += chunk;
					}
					continue;
				}

				const html = renderMarkdown(chunk, isDark);
				renderedChunks = [
					...renderedChunks,
					{ id: chunkIdCounter++, html, isNew: isStreaming }
				];
			}

			// Mark old chunks as no longer new after animation
			if (isStreaming) {
				setTimeout(() => {
					renderedChunks = renderedChunks.map((c) => ({ ...c, isNew: false }));
				}, 300);
			} else {
				renderedChunks = renderedChunks.map((c) => ({ ...c, isNew: false }));
			}
		}

		lastContentLength = content.length;
	}

	$: if (content !== undefined) {
		updateChunks();
	}

	onMount(() => {
		// Mark all initial content as not new
		renderedChunks = renderedChunks.map((c) => ({ ...c, isNew: false }));
	});
</script>

<div
	bind:this={container}
	class="streaming-content"
	class:is-streaming={isStreaming}
	aria-live="polite"
>
	{#each renderedChunks as chunk (chunk.id)}
		<span class="chunk" class:fade-in={chunk.isNew}>
			{@html chunk.html}
		</span>
	{/each}
	{#if isStreaming}
		<span class="streaming-cursor">▌</span>
	{/if}
</div>

<style>
	.streaming-content {
		position: relative;
	}

	.chunk {
		display: inline;
		transition: opacity var(--duration-standard) var(--ease-out);
	}

	.chunk.fade-in {
		animation: fadeInChunk 250ms var(--ease-out) forwards;
	}

	@keyframes fadeInChunk {
		from {
			opacity: 0;
			transform: translateY(2px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.streaming-cursor {
		display: inline-block;
		animation: blink 1s step-start infinite;
		color: currentColor;
		user-select: none;
	}

	@keyframes blink {
		0%,
		50% {
			opacity: 1;
		}
		51%,
		100% {
			opacity: 0;
		}
	}

	/* Streaming mask effect for smooth appearance */
	.is-streaming::after {
		content: '';
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 3em;
		background: linear-gradient(
			to bottom,
			transparent 0%,
			var(--surface-page) 100%
		);
		pointer-events: none;
		opacity: 0.3;
		animation: maskPulse 2s ease-in-out infinite;
	}

	@keyframes maskPulse {
		0%,
		100% {
			opacity: 0.2;
		}
		50% {
			opacity: 0.4;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.chunk.fade-in {
			animation: none;
			opacity: 1;
		}

		.streaming-cursor {
			animation: none;
			opacity: 1;
		}

		.is-streaming::after {
			animation: none;
			opacity: 0.2;
		}
	}
</style>
