<script lang="ts">
	import MessageArea from '$lib/components/chat/MessageArea.svelte';
	import type { ChatGeneratedFileListItem, ChatMessage, ContextDebugState, TaskSteeringPayload } from '$lib/types';
	import type { MessageEditPayload, MessageRegeneratePayload } from '../_helpers';

	let {
		messages,
		conversationId,
		isThinkingActive,
		contextDebug,
		hasMessages,
		generatedFiles,
		onRegenerate,
		onEdit,
		onSteer,
	}: {
		messages: ChatMessage[];
		conversationId: string;
		isThinkingActive: boolean;
		contextDebug: ContextDebugState | null;
		hasMessages: boolean;
		generatedFiles: ChatGeneratedFileListItem[];
		onRegenerate: (payload: MessageRegeneratePayload) => void;
		onEdit: (payload: MessageEditPayload) => void;
		onSteer: (payload: TaskSteeringPayload) => void | Promise<void>;
	} = $props();
</script>

<div class="message-layer min-h-0 flex-1" class:message-layer-active={hasMessages}>
	<MessageArea
		{messages}
		{conversationId}
		{isThinkingActive}
		{contextDebug}
		{generatedFiles}
		{onRegenerate}
		{onEdit}
		{onSteer}
	/>
</div>

<style>
	.message-layer {
		opacity: 0;
		transform: translateY(18px);
		pointer-events: none;
		transition:
			opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
			transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.message-layer-active {
		opacity: 1;
		transform: translateY(0);
		pointer-events: auto;
	}
</style>
