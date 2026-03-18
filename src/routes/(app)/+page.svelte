<script lang="ts">
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import { createNewConversation } from '$lib/stores/conversations';
	import { currentConversationId } from '$lib/stores/ui';
	import MessageInput from '$lib/components/chat/MessageInput.svelte';

	const PENDING_MESSAGE_PREFIX = 'pending-chat-message:';

	let hasStarted = false;
	let creating = false;
	let error: string | null = null;

async function handleSend(event: CustomEvent<{ message: string }>) {
		if (creating) return;
		const text = event.detail.message;

		hasStarted = true;
		creating = true;
		error = null;

		try {
			const id = await createNewConversation();
			currentConversationId.set(id);
			if (typeof window !== 'undefined') {
				window.sessionStorage.setItem(`${PENDING_MESSAGE_PREFIX}${id}`, text.trim());
			}
			await goto(`/chat/${id}`);
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

<div class="chat-page flex h-full min-w-0 flex-col bg-surface-page pb-2 md:pb-4 lg:pb-6">
	<div class="chat-stage relative flex min-h-0 flex-1 overflow-hidden rounded-lg">
		<div class="composer-layer">
			<div class="mx-auto flex w-full max-w-[780px] flex-col gap-4 px-1">
				{#if !hasStarted}
					<div class="intro-copy px-2 text-center" transition:fade={{ duration: 260 }}>
						<h1
							class="text-balance text-[2rem] font-serif font-medium tracking-[-0.05em] md:text-[3rem]"
							style="color: color-mix(in srgb, var(--text-primary) 60%, var(--accent) 40%); font-weight: 500;"
						>
							What can I help you with?
						</h1>
					</div>
				{/if}

				{#if error}
					<div class="w-full rounded-md border border-danger bg-surface-page p-md text-sm font-serif text-danger shadow-sm" role="alert">
						{error}
					</div>
				{/if}

				<MessageInput on:send={handleSend} disabled={creating} />
			</div>
		</div>
	</div>
</div>

<style>
	.chat-stage {
		padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
	}

	.composer-layer {
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		transform: translateY(-50%);
	}
</style>
