<script lang="ts">
	import MessageInput from './MessageInput.svelte';
	import type { ContextDebugState, ConversationContextStatus, TaskSteeringPayload } from '$lib/types';

	let {
		maxLength = 10000,
		disabled = false,
		conversationId = null,
		attachmentsEnabled = false,
		contextStatus = null,
		contextDebug = null,
		ensureConversation = null,
		onSend = () => {},
		onSteer = () => {},
		onDraftChange = () => {}
	}: {
		maxLength?: number;
		disabled?: boolean;
		conversationId?: string | null;
		attachmentsEnabled?: boolean;
		contextStatus?: ConversationContextStatus | null;
		contextDebug?: ContextDebugState | null;
		ensureConversation?: (() => Promise<string>) | null;
		onSend?: (message: string) => void;
		onSteer?: (payload: TaskSteeringPayload) => void;
		onDraftChange?: (payload: {
			conversationId: string | null;
			draftText: string;
			selectedAttachmentIds: string[];
		}) => void;
	} = $props();

	function handleSend(payload: { message: string }) {
		onSend(payload.message);
	}

	function handleSteer(payload: TaskSteeringPayload) {
		onSteer(payload);
	}

	function handleDraftChange(payload: {
		conversationId: string | null;
		draftText: string;
		selectedAttachmentIds: string[];
	}) {
		onDraftChange(payload);
	}
</script>

<MessageInput
	{maxLength}
	{disabled}
	{conversationId}
	{attachmentsEnabled}
	{ensureConversation}
	{contextStatus}
	{contextDebug}
	onSend={handleSend}
	onSteer={handleSteer}
	onDraftChange={handleDraftChange}
/>
