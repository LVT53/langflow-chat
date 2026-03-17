<script lang="ts">
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import { createNewConversation } from '$lib/stores/conversations';
	import { currentConversationId } from '$lib/stores/ui';
	import MessageInput from '$lib/components/chat/MessageInput.svelte';

	let hasStarted = false;
	let creating = false;
	let error: string | null = null;

	async function handleSend(event: CustomEvent<{ message: string }>) {
		if (creating) return;

		const { message } = event.detail;
		hasStarted = true;
		creating = true;
		error = null;

		try {
			const id = await createNewConversation();
			currentConversationId.set(id);
			// Navigate to chat page with the message as a query param
			await goto(`/chat/${id}?message=${encodeURIComponent(message)}`);
		} catch {
			error = 'Failed to create conversation. Please try again.';
			hasStarted = false;
		} finally {
			creating = false;
		}
	}
</script>

<svelte:head>
	<title>Alfy AI</title>
</svelte:head>

<div class="flex h-full flex-col items-center justify-center bg-surface-page px-4 py-12">
	<div class="flex w-full max-w-[640px] flex-col items-center gap-8">
		{#if !hasStarted}
			<div class="flex flex-col items-center gap-3 text-center" transition:fade={{ duration: 300 }}>
				<h1 class="text-4xl font-serif font-medium text-text-primary md:text-5xl">
					What can I help you with?
				</h1>
				<p class="text-lg font-serif text-text-muted">
					Ask me anything.
				</p>
			</div>
		{/if}

		{#if error}
			<div class="w-full rounded-md border border-danger bg-surface-page p-md text-sm font-serif text-danger" role="alert">
				{error}
			</div>
		{/if}

		<div class="w-full">
			<MessageInput on:send={handleSend} disabled={creating} />
		</div>
	</div>
</div>
