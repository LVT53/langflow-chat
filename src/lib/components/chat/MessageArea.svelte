<script lang="ts">
	import { tick, onMount } from 'svelte';
	import type { ChatMessage } from '$lib/types';
	import MessageBubble from './MessageBubble.svelte';

	export let messages: ChatMessage[] = [];

	let scrollContainer: HTMLDivElement;
	let shouldAutoScroll = true;
	let lastMessageCount = 0;
	let lastMessageId: string | undefined = undefined;
	let hasInitialScrolled = false;

	onMount(() => {
		// Scroll to bottom on initial load when viewing existing chats
		if (scrollContainer && messages.length > 0 && !hasInitialScrolled) {
			scrollToBottom(false);
			hasInitialScrolled = true;
		}
	});

	function handleScroll() {
		if (!scrollContainer) return;
		const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
		const distanceToBottom = scrollHeight - scrollTop - clientHeight;
		shouldAutoScroll = distanceToBottom < 50;
	}

	// Detect if a new message was added (not just content updates)
	function hasNewMessage(currentMessages: ChatMessage[]): boolean {
		if (currentMessages.length > lastMessageCount) {
			return true;
		}
		// Check if the last message ID changed (new message vs updated)
		const currentLastId = currentMessages[currentMessages.length - 1]?.id;
		if (currentLastId !== lastMessageId) {
			return true;
		}
		return false;
	}

	$: if (messages && messages.length > 0) {
		const isNewMessage = hasNewMessage(messages);

		// Always smooth scroll when a new message is added (user sent message)
		// Otherwise only auto-scroll if user is already near bottom (streaming)
		if (isNewMessage) {
			scrollToBottom(true); // smooth scroll for new messages
		} else if (shouldAutoScroll) {
			scrollToBottom(false); // instant scroll for streaming updates
		}

		// Scroll to bottom on initial messages load (viewing existing chat)
		if (lastMessageCount === 0 && !hasInitialScrolled) {
			scrollToBottom(false);
			hasInitialScrolled = true;
		}

		// Update tracking state
		lastMessageCount = messages.length;
		lastMessageId = messages[messages.length - 1]?.id;
	}

	async function scrollToBottom(smooth = false) {
		await tick();
		if (scrollContainer) {
			scrollContainer.scrollTo({
				top: scrollContainer.scrollHeight,
				behavior: smooth ? 'smooth' : 'auto'
			});
		}
	}
</script>

<!-- Scrollable message list container - touch-action allows vertical scroll only -->
<div 
	bind:this={scrollContainer}
	on:scroll={handleScroll}
	class="h-full min-h-0 overflow-y-auto px-sm py-lg md:px-lg md:py-xl lg:px-xl"
	style="touch-action: pan-y;"
	aria-live="polite"
	aria-atomic="false"
>
	<div class="mx-auto flex min-h-full w-full max-w-[760px] flex-col gap-lg">
		{#if messages.length === 0}
			<div class="h-full"></div>
		{:else}
			{#each messages as message (message.id)}
				<MessageBubble {message} />
			{/each}
			<div class="scroll-clearance" aria-hidden="true"></div>
		{/if}
	</div>
</div>

<style>
	.scroll-clearance {
		height: 9rem;
		flex: 0 0 auto;
	}

	@media (min-width: 768px) {
		.scroll-clearance {
			height: 11rem;
		}
	}
</style>
