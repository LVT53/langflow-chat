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
				duration: 40,
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
		background: linear-gradient(
			90deg,
			var(--text-muted)    0%,
			var(--text-muted)    30%,
			var(--accent)        45%,
			var(--text-primary)  50%,
			var(--accent)        55%,
			var(--text-muted)    70%,
			var(--text-muted)    100%
		);
		background-size: 300% 100%;
		background-clip: text;
		-webkit-background-clip: text;
		color: transparent;
		-webkit-text-fill-color: transparent;
		animation: shimmer-sweep 1.5s ease-out;
	}

	@keyframes shimmer-sweep {
		0%   { background-position: 100% center; }
		100% { background-position: -100% center; }
	}
</style>
