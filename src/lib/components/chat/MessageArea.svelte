<script lang="ts">
	import { tick, onMount } from 'svelte';
	import type { ChatMessage } from '$lib/types';
	import MessageBubble from './MessageBubble.svelte';

	export let messages: ChatMessage[] = [];
	export let conversationId: string | null = null;

	let scrollContainer: HTMLDivElement;
	let shouldAutoScroll = true;
	let lastMessageCount = 0;
	let lastMessageId: string | undefined = undefined;
	let isSmoothScrolling = false;
	let lastConversationId: string | null = null;
	let shouldJumpToConversationBottom = false;

	onMount(() => {
		// Initial load: ensure we land at the latest message.
		if (messages.length > 0 && scrollContainer) {
			jumpToBottomAfterRender();
		}
	});

	$: if (conversationId && conversationId !== lastConversationId) {
		lastConversationId = conversationId;
		shouldAutoScroll = true;
		lastMessageCount = 0;
		lastMessageId = undefined;
		isSmoothScrolling = false;
		shouldJumpToConversationBottom = true;
	}

	function handleScroll() {
		if (!scrollContainer || isSmoothScrolling) return;
		const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
		const distanceToBottom = scrollHeight - scrollTop - clientHeight;
		shouldAutoScroll = distanceToBottom < 50;
	}

	// Detect if a new message was added (not just content updates)
	function hasNewMessage(currentMessages: ChatMessage[]): boolean {
		if (currentMessages.length > lastMessageCount) {
			return true;
		}
		const currentLastId = currentMessages[currentMessages.length - 1]?.id;
		if (currentLastId !== lastMessageId) {
			return true;
		}
		return false;
	}

	$: if (messages && messages.length > 0 && scrollContainer) {
		const isNewMessage = hasNewMessage(messages);

		if (shouldJumpToConversationBottom) {
			// Switching to another conversation should always reveal the latest response.
			jumpToBottomAfterRender();
			shouldJumpToConversationBottom = false;
		} else if (isNewMessage) {
			// New message added: smooth scroll with animation
			smoothScrollToBottom();
		} else if (shouldAutoScroll && !isSmoothScrolling) {
			// Streaming update: instant scroll if already at bottom
			instantScrollToBottom();
		}

		// Update tracking state
		lastMessageCount = messages.length;
		lastMessageId = messages[messages.length - 1]?.id;
	}

	$: if (messages.length === 0 && shouldJumpToConversationBottom) {
		// Do not consume the first user send as an initial-load jump for empty conversations.
		shouldJumpToConversationBottom = false;
	}

	function instantScrollToBottom() {
		if (!scrollContainer) return;
		const previousScrollBehavior = scrollContainer.style.scrollBehavior;
		scrollContainer.style.scrollBehavior = 'auto';
		scrollContainer.scrollTop = scrollContainer.scrollHeight;
		requestAnimationFrame(() => {
			if (scrollContainer) {
				scrollContainer.style.scrollBehavior = previousScrollBehavior;
			}
		});
	}

	async function jumpToBottomAfterRender() {
		if (!scrollContainer) return;
		await tick();
		requestAnimationFrame(() => {
			instantScrollToBottom();
			requestAnimationFrame(() => {
				instantScrollToBottom();
			});
		});
		setTimeout(() => {
			instantScrollToBottom();
		}, 360);
	}

	async function smoothScrollToBottom() {
		if (!scrollContainer) return;
		isSmoothScrolling = true;
		await tick();
		scrollContainer.scrollTo({
			top: scrollContainer.scrollHeight,
			behavior: 'smooth'
		});
		// Reset flag after animation completes (typical smooth scroll is ~300-500ms)
		setTimeout(() => {
			isSmoothScrolling = false;
		}, 500);
	}
</script>

<div
	bind:this={scrollContainer}
	on:scroll={handleScroll}
	class="scroll-container h-full min-h-0 overflow-y-auto px-sm py-lg md:px-lg md:py-xl lg:px-xl"
	style="touch-action: pan-y; scroll-behavior: smooth;"
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
	.scroll-container {
		/* Ensure smooth scrolling works */
		scroll-behavior: smooth;
		/* Better momentum scrolling on mobile */
		-webkit-overflow-scrolling: touch;
	}

	/* Disable smooth scroll for users who prefer reduced motion */
	@media (prefers-reduced-motion: reduce) {
		.scroll-container {
			scroll-behavior: auto !important;
		}
	}

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
