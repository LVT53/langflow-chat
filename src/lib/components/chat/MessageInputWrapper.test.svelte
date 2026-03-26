<script lang="ts">
	import MessageInput from './MessageInput.svelte';
	import type { ContextDebugState, ConversationContextStatus, TaskSteeringPayload } from '$lib/types';

	export let maxLength = 10000;
	export let disabled = false;
	export let conversationId: string | null = null;
	export let attachmentsEnabled = false;
	export let contextStatus: ConversationContextStatus | null = null;
	export let contextDebug: ContextDebugState | null = null;

	export let onSend: (message: string) => void = () => {};
	export let onSteer: (payload: TaskSteeringPayload) => void = () => {};

	function handleSend(event: CustomEvent<{ message: string }>) {
		onSend(event.detail.message);
	}

	function handleSteer(event: CustomEvent<TaskSteeringPayload>) {
		onSteer(event.detail);
	}
</script>

<MessageInput
	{maxLength}
	{disabled}
	{conversationId}
	{attachmentsEnabled}
	{contextStatus}
	{contextDebug}
	on:send={handleSend}
	on:steer={handleSteer}
/>
