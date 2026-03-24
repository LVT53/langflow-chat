<script lang="ts">
	import { fade } from 'svelte/transition';

	export let text: string;
	export let delay: number = 0;
	export let speed: number = 6;

	let displayedChars: string[] = [];
	let isAnimating = false;
	let animationKey = 0;

	$: if (text) {
		// Reset and start animation
		animationKey += 1;
		displayedChars = [];
		isAnimating = true;

		const chars = text.split('');

		// Progressively add characters one by one
		// Use chars.slice() to avoid closure capture issues with displayedChars
		chars.forEach((_, i) => {
			setTimeout(() => {
				displayedChars = chars.slice(0, i + 1);
			}, delay + (i * speed));
		});

		// Stop animating after all characters have appeared
		const totalDuration = delay + (text.length * speed) + 200;
		setTimeout(() => {
			isAnimating = false;
		}, totalDuration);
	}
</script>

<span class="typewriter-text" class:animating={isAnimating}>
	{#each displayedChars as char, i (`${animationKey}-${i}`)}
		<span
			in:fade={{
				duration: 20,
				delay: delay + (i * speed)
			}}
			class="char"
			style="animation-delay: {delay + (i * speed)}ms"
		>
			{char === ' ' ? '\u00A0' : char}
		</span>
	{/each}
</span>

<style>
	.typewriter-text {
		display: inline;
	}

	.char {
		display: inline-block;
		will-change: transform, opacity;
		color: var(--text-primary);
		animation: shimmer-in 400ms ease-out forwards;
	}

	@keyframes shimmer-in {
		0% {
			color: var(--accent);
			text-shadow: 0 0 8px rgba(194, 166, 106, 0.6);
		}
		50% {
			color: color-mix(in srgb, var(--accent) 70%, var(--text-primary) 30%);
			text-shadow: 0 0 4px rgba(194, 166, 106, 0.3);
		}
		100% {
			color: var(--text-primary);
			text-shadow: none;
		}
	}
</style>
