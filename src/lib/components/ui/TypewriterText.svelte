<script lang="ts">
	import { fly } from 'svelte/transition';

	export let text: string;
	export let delay: number = 0;
	export let speed: number = 150;

	let displayedChars: string[] = [];
	let isAnimating = false;
	let animationKey = 0;

	$: if (text) {
		// Reset and start animation
		animationKey += 1;
		displayedChars = text.split('');
		isAnimating = true;

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
			in:fly={{
				duration: 200,
				delay: delay + (i * speed),
				y: 6
			}}
			class="char"
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
		animation: glowPulse 300ms ease-out;
	}

	@keyframes glowPulse {
		0% {
			text-shadow: 0 0 0 rgba(194, 166, 106, 0);
		}
		50% {
			text-shadow: 0 0 8px rgba(194, 166, 106, 0.8), 0 0 12px rgba(194, 166, 106, 0.4);
		}
		100% {
			text-shadow: 0 0 0 rgba(194, 166, 106, 0);
		}
	}
</style>
