<script lang="ts">
	import { onMount } from 'svelte';
	
	export let visible: boolean = true;
	export let label: string;

	let elapsed = 0;
	let intervalId: ReturnType<typeof setInterval>;

	onMount(() => {
		if (visible && label === undefined) {
			intervalId = setInterval(() => {
				elapsed += 1;
			}, 1000);
		}
		return () => {
			clearInterval(intervalId);
		};
	});

	$: message = label !== undefined ? label : elapsed < 30 ? 'Thinking...' : elapsed < 60 ? 'Still working...' : 'Almost there...';
</script>

{#if visible}
  <div class="flex items-center gap-2 py-4 text-text-muted dark:text-text-muted">
    <div class="flex items-center gap-1 h-4" aria-hidden="true">
      <div class="dot"></div>
      <div class="dot"></div>
      <div class="dot"></div>
    </div>
    <span class="text-xs font-medium">{message}</span>
  </div>
{/if}

<style>
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: currentColor;
    animation: bounce 1.4s infinite ease-in-out both;
  }
  .dot:nth-child(1) {
    animation-delay: -0.32s;
  }
  .dot:nth-child(2) {
    animation-delay: -0.16s;
  }

  @keyframes bounce {
    0%, 80%, 100% {
      transform: scale(0);
    }
    40% {
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
      transform: scale(1);
      opacity: 0.7;
    }
  }
</style>
