<script lang="ts">
	import { tick, onDestroy } from 'svelte';
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
	let pendingBottomAlignmentTimeout: ReturnType<typeof setTimeout> | null = null;
	let smoothScrollFrame: number | null = null;

	onDestroy(() => {
		cancelPendingBottomAlignment();
		cancelSmoothScroll();
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
		if (!shouldAutoScroll) {
			cancelPendingBottomAlignment();
		}
	}

	function handleUserScrollIntent() {
		shouldAutoScroll = false;
		cancelPendingBottomAlignment();
		cancelSmoothScroll();
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
		scrollContainer.scrollTop = scrollContainer.scrollHeight;
	}

	async function jumpToBottomAfterRender() {
		if (!scrollContainer) return;
		cancelPendingBottomAlignment();
		await tick();
		requestAnimationFrame(() => {
			instantScrollToBottom();
			requestAnimationFrame(() => {
				instantScrollToBottom();
			});
		});
		pendingBottomAlignmentTimeout = setTimeout(() => {
			if (shouldAutoScroll) {
				instantScrollToBottom();
			}
			pendingBottomAlignmentTimeout = null;
		}, 320);
	}

	async function smoothScrollToBottom() {
		if (!scrollContainer) return;
		cancelSmoothScroll();
		isSmoothScrolling = true;
		await tick();

		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
			instantScrollToBottom();
			isSmoothScrolling = false;
			return;
		}

		const startTop = scrollContainer.scrollTop;
		const startTime = performance.now();
		const duration = 280;

		const step = (timestamp: number) => {
			if (!scrollContainer) {
				cancelSmoothScroll();
				return;
			}

			const targetTop = scrollContainer.scrollHeight - scrollContainer.clientHeight;
			const progress = Math.min(1, (timestamp - startTime) / duration);
			const easedProgress = 1 - Math.pow(1 - progress, 3);
			scrollContainer.scrollTop = startTop + (targetTop - startTop) * easedProgress;

			if (progress < 1 && shouldAutoScroll) {
				smoothScrollFrame = requestAnimationFrame(step);
				return;
			}

			if (shouldAutoScroll) {
				scrollContainer.scrollTop = targetTop;
			}
			isSmoothScrolling = false;
			smoothScrollFrame = null;
		};

		smoothScrollFrame = requestAnimationFrame(step);
	}

	function cancelPendingBottomAlignment() {
		if (pendingBottomAlignmentTimeout !== null) {
			clearTimeout(pendingBottomAlignmentTimeout);
			pendingBottomAlignmentTimeout = null;
		}
	}

	function cancelSmoothScroll() {
		if (smoothScrollFrame !== null) {
			cancelAnimationFrame(smoothScrollFrame);
			smoothScrollFrame = null;
		}
		isSmoothScrolling = false;
	}
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
	bind:this={scrollContainer}
	on:scroll={handleScroll}
	on:wheel={handleUserScrollIntent}
	on:pointerdown={handleUserScrollIntent}
	on:touchstart={handleUserScrollIntent}
	class="scroll-container h-full min-h-0 overflow-y-auto px-sm py-lg md:px-lg md:py-xl lg:px-xl"
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
	.scroll-container {
		/* Better momentum scrolling on mobile */
		-webkit-overflow-scrolling: touch;
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
