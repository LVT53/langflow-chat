<script lang="ts">
	import { tick } from 'svelte';
	import type { ChatMessage } from '$lib/types';
	import MessageBubble from './MessageBubble.svelte';

	export let messages: ChatMessage[] = [];

	let scrollContainer: HTMLDivElement;
	let shouldAutoScroll = true;

	function handleScroll() {
		if (!scrollContainer) return;
		const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
		const distanceToBottom = scrollHeight - scrollTop - clientHeight;
		shouldAutoScroll = distanceToBottom < 50;
	}

	$: if (messages && messages.length > 0) {
		if (shouldAutoScroll) {
			scrollToBottom();
		}
	}

	async function scrollToBottom() {
		await tick();
		if (scrollContainer) {
			scrollContainer.scrollTop = scrollContainer.scrollHeight;
		}
	}
</script>

<!-- Scrollable message list container - touch-action allows vertical scroll only -->
<div 
	bind:this={scrollContainer}
	on:scroll={handleScroll}
	class="flex-1 overflow-y-auto px-sm py-lg md:px-lg md:py-xl lg:px-xl"
	style="touch-action: pan-y;"
	aria-live="polite"
	aria-atomic="false"
>
	<div class="mx-auto flex w-full max-w-[760px] flex-col gap-lg pb-6">
		{#if messages.length === 0}
			<div class="h-full"></div>
		{:else}
			{#each messages as message (message.id)}
				<MessageBubble {message} />
			{/each}
		{/if}
	</div>
</div>
