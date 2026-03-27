<script lang="ts">
	import { tick } from 'svelte';
	import type { ChatMessage, ContextDebugState, TaskSteeringPayload } from '$lib/types';
	import MessageBubble from './MessageBubble.svelte';

	let {
		messages = [],
		conversationId = null,
		isThinkingActive = false,
		contextDebug = null,
		onRegenerate = undefined,
		onEdit = undefined,
		onSteer = undefined,
	}: {
		messages?: ChatMessage[];
		conversationId?: string | null;
		isThinkingActive?: boolean;
		contextDebug?: ContextDebugState | null;
		onRegenerate?: ((payload: { messageId: string }) => void) | undefined;
		onEdit?: ((payload: { messageId: string; newText: string }) => void) | undefined;
		onSteer?: ((payload: TaskSteeringPayload) => void) | undefined;
	} = $props();

	let scrollContainer = $state<HTMLDivElement | null>(null);
	let shouldAutoScroll = true;
	let lastMessageCount = 0;
	let lastConversationId: string | null = null;
	let shouldJumpToConversationBottom = false;

	$effect(() => {
		if (conversationId && conversationId !== lastConversationId) {
			lastConversationId = conversationId;
			shouldAutoScroll = true;
			lastMessageCount = 0;
			shouldJumpToConversationBottom = true;
		}
	});

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

	$effect.pre(() => {
		messages;
		scrollContainer;
		isThinkingActive;

		if (!scrollContainer) return;

		if (messages.length === 0) {
			if (shouldJumpToConversationBottom) {
				// Do not consume the first user send as an initial-load jump for empty conversations.
				shouldJumpToConversationBottom = false;
			}
			lastMessageCount = 0;
			return;
		}

		const isNewMessage = hasNewMessage(messages);

		if (shouldJumpToConversationBottom) {
			// Switching to another conversation should always reveal the latest response.
			void alignToBottomAfterRender();
			shouldJumpToConversationBottom = false;
		} else if (isNewMessage) {
			// New message added: jump directly to the latest content.
			void alignToBottomAfterRender();
		} else if (shouldAutoScroll && isThinkingActive) {
			// Only follow during thinking phase; stop once content streaming begins.
			instantScrollToBottom();
		}

		lastMessageCount = messages.length;
	});

	function instantScrollToBottom() {
		if (!scrollContainer) return;
		scrollContainer.scrollTop = scrollContainer.scrollHeight;
	}

	let pinnedArtifactIds = $derived(
		contextDebug?.pinnedEvidence.map((evidence) => evidence.artifactId) ?? []
	);
	let excludedArtifactIds = $derived(
		contextDebug?.excludedEvidence.map((evidence) => evidence.artifactId) ?? []
	);

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
	onscroll={handleScroll}
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
					{onRegenerate}
					{onEdit}
					{onSteer}
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
