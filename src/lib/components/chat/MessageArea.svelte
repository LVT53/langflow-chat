<script lang="ts">
	import { tick } from 'svelte';
	import type {
		ChatGeneratedFileListItem,
		ChatMessage,
		ContextDebugState,
		DocumentWorkspaceItem,
		TaskSteeringPayload,
	} from '$lib/types';
	import MessageBubble from './MessageBubble.svelte';

	let {
		messages = [],
		conversationId = null,
		isThinkingActive = false,
		contextDebug = null,
		generatedFiles = [],
		onRegenerate = undefined,
		onEdit = undefined,
		onSteer = undefined,
		onOpenGeneratedFile = undefined,
	}: {
		messages?: ChatMessage[];
		conversationId?: string | null;
		isThinkingActive?: boolean;
		contextDebug?: ContextDebugState | null;
		generatedFiles?: ChatGeneratedFileListItem[];
		onRegenerate?: ((payload: { messageId: string }) => void) | undefined;
		onEdit?: ((payload: { messageId: string; newText: string }) => void) | undefined;
		onSteer?: ((payload: TaskSteeringPayload) => void) | undefined;
		onOpenGeneratedFile?: ((document: DocumentWorkspaceItem) => void) | undefined;
	} = $props();

	let scrollContainer = $state<HTMLDivElement | null>(null);
	let shouldAutoScroll = true;
	let lastMessageCount = 0;
	let lastGeneratedFileCount = 0;
	let lastConversationId: string | null = null;
	let shouldJumpToConversationBottom = false;

	$effect(() => {
		if (conversationId && conversationId !== lastConversationId) {
			lastConversationId = conversationId;
			shouldAutoScroll = true;
			lastMessageCount = 0;
			lastGeneratedFileCount = 0;
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

	function getGeneratedFilesForMessage(messageId: string): ChatGeneratedFileListItem[] {
		return generatedFiles.filter((file) => file.assistantMessageId === messageId);
	}

	$effect.pre(() => {
		messages;
		scrollContainer;
		isThinkingActive;
		generatedFiles.length;

		if (!scrollContainer) return;

		if (messages.length === 0) {
			if (shouldJumpToConversationBottom) {
				// Do not consume the first user send as an initial-load jump for empty conversations.
				shouldJumpToConversationBottom = false;
			}
			lastMessageCount = 0;
			lastGeneratedFileCount = generatedFiles.length;
			return;
		}

		const isNewMessage = hasNewMessage(messages);
		const hasNewGeneratedFiles = generatedFiles.length > lastGeneratedFileCount;

		if (shouldJumpToConversationBottom) {
			// Switching to another conversation should always reveal the latest response.
			void alignToBottomAfterRender();
			shouldJumpToConversationBottom = false;
		} else if (isNewMessage) {
			// New message added: jump directly to the latest content.
			void alignToBottomAfterRender();
		} else if (hasNewGeneratedFiles && shouldAutoScroll) {
			// Generated files render inside the latest assistant message; keep that expanded area visible.
			void alignToBottomAfterRender();
		} else if (shouldAutoScroll && isThinkingActive) {
			// Only follow during thinking phase; stop once content streaming begins.
			instantScrollToBottom();
		}

		lastMessageCount = messages.length;
		lastGeneratedFileCount = generatedFiles.length;
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
			<div class="conversation-empty-state">
				<div class="conversation-empty-eyebrow">Conversation Ready</div>
				<p class="conversation-empty-copy">
					Your messages and generated files will appear here.
				</p>
			</div>
		{:else}
			{#each messages as message, i (message.renderKey ?? message.id)}
				<MessageBubble
					{message}
					isLast={i === messages.length - 1}
					{pinnedArtifactIds}
					{excludedArtifactIds}
					generatedFiles={getGeneratedFilesForMessage(message.id)}
					{conversationId}
					{onRegenerate}
					{onEdit}
					{onSteer}
					{onOpenGeneratedFile}
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

	.conversation-empty-state {
		display: flex;
		min-height: 100%;
		flex: 1 1 auto;
		flex-direction: column;
		justify-content: center;
		gap: var(--space-sm);
		padding: 0 var(--space-sm) 10rem;
		text-align: center;
	}

	.conversation-empty-eyebrow {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.78rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.conversation-empty-copy {
		margin: 0 auto;
		max-width: 34rem;
		font-size: 0.98rem;
		line-height: 1.6;
		color: var(--text-secondary);
	}

	@media (min-width: 768px) {
		.scroll-clearance {
			height: 11rem;
		}
	}
</style>
