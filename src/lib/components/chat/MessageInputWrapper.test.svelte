<script lang="ts">
	import MessageInput from './MessageInput.svelte';

	export let maxLength = 10000;
	export let disabled = false;

	export let onSend: (message: string) => void = () => {};

	function handleSend(event: CustomEvent<{ message: string }>) {
		onSend(event.detail.message);
	}
</script>

<MessageInput {maxLength} {disabled} on:send={handleSend} />
