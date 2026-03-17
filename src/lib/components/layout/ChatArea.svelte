<script lang="ts">
	import { currentConversationId } from '$lib/stores/ui';
	import MessageArea from '../chat/MessageArea.svelte';
	import MessageInput from '../chat/MessageInput.svelte';
	import type { ChatMessage } from '$lib/types';

	// Placeholder messages for now (actual logic in Tasks 18 & 20)
	let messages: ChatMessage[] = [];

	function handleSend(event: CustomEvent<{ message: string }>) {
		const newMsg: ChatMessage = {
			id: crypto.randomUUID(),
			role: 'user',
			content: event.detail.message,
			timestamp: Date.now()
		};
		messages = [...messages, newMsg];
		
		// Optional: simulate an assistant loading state (for testing UI before Task 18)
		const assistantLoadingMsg: ChatMessage = {
			id: crypto.randomUUID(),
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			isStreaming: true
		};
		messages = [...messages, assistantLoadingMsg];
		
		setTimeout(() => {
			messages = messages.filter(m => m.id !== assistantLoadingMsg.id);
			messages = [...messages, {
				id: crypto.randomUUID(),
				role: 'assistant',
				content: 'Here is some code:\n\n```python\ndef test_horizontal_scroll_with_a_very_long_line_of_code_that_should_wrap_or_scroll_horizontally():\n    return "This string is exceptionally long and will definitely trigger horizontal scrolling on a small screen like the iPhone SE"\n```',
				timestamp: Date.now()
			}];
		}, 2000);
	}
</script>

<div class="flex h-full flex-col bg-primary relative">
	{#if $currentConversationId === null}
		<div class="flex flex-1 items-center justify-center p-4 text-center">
			<div class="flex flex-col items-center gap-[var(--space-md)]">
				<div
					class="flex h-16 w-16 items-center justify-center rounded-lg bg-secondary text-text-primary"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="32"
						height="32"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path
							d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
						></path>
					</svg>
				</div>
				<h2 class="text-2xl font-serif tracking-tight text-text-primary">
					Start a new conversation
				</h2>
				<p class="text-[14px] font-sans text-text-muted">
					Send a message to begin chatting with AlfyAI
				</p>
			</div>
		</div>
	{:else}
		<div class="flex-1 flex flex-col min-h-0 relative">
			<MessageArea {messages} />
			<div class="shrink-0 pt-md px-md pb-[calc(var(--space-md)+env(safe-area-inset-bottom))] md:px-2xl bg-primary">
				<div class="mx-auto w-full max-w-[720px]">
					<MessageInput on:send={handleSend} />
				</div>
			</div>
		</div>
	{/if}
</div>
