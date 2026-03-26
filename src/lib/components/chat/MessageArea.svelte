<script lang="ts">
	import { tick, createEventDispatcher } from 'svelte';
	import type { ChatMessage, ContextDebugState, TaskSteeringPayload } from '$lib/types';
	import MessageBubble from './MessageBubble.svelte';

	export let messages: ChatMessage[] = [];
	export let conversationId: string | null = null;
	export let isThinkingActive: boolean = false;
	export let contextDebug: ContextDebugState | null = null;

	const dispatch = createEventDispatcher<{
		regenerate: { messageId: string };
		edit: { messageId: string; newText: string };
		steer: TaskSteeringPayload;
	}>();

	let scrollContainer: HTMLDivElement;
	let shouldAutoScroll = true;
	let lastMessageCount = 0;
	let lastConversationId: string | null = null;
	let shouldJumpToConversationBottom = false;

	$: if (conversationId && conversationId !== lastConversationId) {
		lastConversationId = conversationId;
		shouldAutoScroll = true;
		lastMessageCount = 0;
		shouldJumpToConversationBottom = true;
	}

	function handleScroll() {
		if (!scrollContainer) return;
		const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
		const distanceToBottom = scrollHeight - scrollTop - clientHeight;
		shouldAutoScroll = distanceToBottom < 50;
	}

	// Detect if a new message was added (not just content updates or ID reconciliation on stream end)
	function hasNewMessage(currentMessages: ChatMessage[]): boolean {
		return currentMessages.length > lastMessageCount;
	}

	$: if (messages && messages.length > 0 && scrollContainer) {
		const isNewMessage = hasNewMessage(messages);

		if (shouldJumpToConversationBottom) {
			// Switching to another conversation should always reveal the latest response.
			alignToBottomAfterRender();
			shouldJumpToConversationBottom = false;
		} else if (isNewMessage) {
			// New message added: jump directly to the latest content.
			alignToBottomAfterRender();
		} else if (shouldAutoScroll && isThinkingActive) {
			// Only follow during thinking phase; stop once content streaming begins
			instantScrollToBottom();
		}

		// Update tracking state
		lastMessageCount = messages.length;
	}

	$: if (messages.length === 0 && shouldJumpToConversationBottom) {
		// Do not consume the first user send as an initial-load jump for empty conversations.
		shouldJumpToConversationBottom = false;
	}

	function instantScrollToBottom() {
		if (!scrollContainer) return;
		scrollContainer.scrollTop = scrollContainer.scrollHeight;
	}

	$: pinnedArtifactIds = contextDebug?.pinnedEvidence.map((evidence) => evidence.artifactId) ?? [];
	$: excludedArtifactIds = contextDebug?.excludedEvidence.map((evidence) => evidence.artifactId) ?? [];

	async function alignToBottomAfterRender() {
		if (!scrollContainer) return;
		await tick();
		requestAnimationFrame(() => {
			instantScrollToBottom();
			requestAnimationFrame(() => {
				instantScrollToBottom();
			});
		});
	}
</script>

<div
	bind:this={scrollContainer}
	on:scroll={handleScroll}
	class="scroll-container h-full min-h-0 overflow-x-hidden overflow-y-auto px-sm py-lg md:px-lg md:py-xl lg:px-xl"
	style="touch-action: pan-y;"
	aria-live="polite"
	aria-atomic="false"
>
	<div class="mx-auto flex min-h-full min-w-0 w-full max-w-[760px] flex-col gap-lg">
		{#if messages.length === 0}
			<div class="h-full"></div>
		{:else}
			{#each messages as message, i (message.renderKey ?? message.id)}
				<MessageBubble
					{message}
					isLast={i === messages.length - 1}
					{pinnedArtifactIds}
					{excludedArtifactIds}
					on:regenerate={(e) => dispatch('regenerate', e.detail)}
					on:edit={(e) => dispatch('edit', e.detail)}
					on:steer={(e) => dispatch('steer', e.detail)}
				/>
			{/each}
			<div class="scroll-clearance" aria-hidden="true"></div>
		{/if}
	</div>
</div>

<style>
	.scroll-container {
		/* Better momentum scrolling on mobile */
		-webkit-overflow-scrolling: touch;
		overflow-x: clip;
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
