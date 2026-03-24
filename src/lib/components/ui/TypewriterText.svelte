<script lang="ts">
	import { fade } from 'svelte/transition';

	export let text: string;
	export let delay: number = 0;
	export let speed: number = 25;

	let displayedChars: string[] = [];
	let isAnimating = false;
	let animationKey = 0;

	$: if (text) {
		// Reset and start animation
		animationKey += 1;
		displayedChars = text.split('');
		isAnimating = true;

		// Stop animating after all characters have appeared
		const totalDuration = delay + (text.length * speed) + 150;
		setTimeout(() => {
			isAnimating = false;
		}, totalDuration);
	}
</script>

<span class="typewriter-text" class:animating={isAnimating}>
	{#each displayedChars as char, i (i)}
		<span
			in:fade={{ duration: 150, delay: delay + (i * speed) }}
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
	}
</style>
