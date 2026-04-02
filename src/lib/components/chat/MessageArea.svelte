<script lang="ts">
	import { tick } from 'svelte';
	import type { ChatGeneratedFile, ChatMessage, ContextDebugState, TaskSteeringPayload } from '$lib/types';
	import MessageBubble from './MessageBubble.svelte';
	import GeneratedFile from './GeneratedFile.svelte';

	let {
		messages = [],
		conversationId = null,
		isThinkingActive = false,
		contextDebug = null,
		generatedFiles = [],
		onRegenerate = undefined,
		onEdit = undefined,
		onSteer = undefined,
	}: {
		messages?: ChatMessage[];
		conversationId?: string | null;
		isThinkingActive?: boolean;
		contextDebug?: ContextDebugState | null;
		generatedFiles?: ChatGeneratedFile[];
		onRegenerate?: ((payload: { messageId: string }) => void) | undefined;
		onEdit?: ((payload: { messageId: string; newText: string }) => void) | undefined;
		onSteer?: ((payload: TaskSteeringPayload) => void) | undefined;
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
			// Generated files render after the message list, so keep them visible when the user stayed near the bottom.
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
			{#if generatedFiles.length > 0 && conversationId}
				<div class="generated-files-section">
					<div class="generated-files-header">Generated Files</div>
					<p class="generated-files-description">
						Created in this chat. Download them here or move them into a vault.
					</p>
					<div class="generated-files-list">
						{#each generatedFiles as file (file.id)}
							<GeneratedFile
								fileId={file.id}
								{conversationId}
								filename={file.filename}
								size={file.sizeBytes}
								mimeType={file.mimeType ?? 'application/octet-stream'}
								downloadUrl={`/api/chat/files/${file.id}/download`}
								status="success"
							/>
						{/each}
					</div>
				</div>
			{/if}
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

	.generated-files-section {
		margin-top: var(--space-lg);
		padding-top: var(--space-lg);
		border-top: 1px solid color-mix(in srgb, var(--border-subtle) 50%, transparent 50%);
	}

	.generated-files-header {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: var(--space-md);
	}

	.generated-files-description {
		margin: 0 0 var(--space-md);
		font-size: 0.92rem;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.generated-files-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
	}

	@media (min-width: 768px) {
		.scroll-clearance {
			height: 11rem;
		}
	}
</style>
