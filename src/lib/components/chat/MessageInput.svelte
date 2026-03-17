<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { currentConversationId } from '$lib/stores/ui';

	export let disabled: boolean = false;
	export let maxLength: number = 10000;

	const dispatch = createEventDispatcher<{
		send: { message: string };
	}>();

	let textarea: HTMLTextAreaElement;
	let message = '';
	
	$: isEmpty = message.trim().length === 0;
	$: isOverMaxLength = message.length > maxLength;
	$: showCharCount = message.length > maxLength * 0.8;
	$: charCountColor = isOverMaxLength ? 'text-danger' : 'text-text-muted';
	
	$: canSend = !isEmpty && !isOverMaxLength && !disabled;

	let lastConversationId = '';
	$: if ($currentConversationId && $currentConversationId !== lastConversationId && textarea) {
		lastConversationId = $currentConversationId;
		// Only clear if we actually switched conversations, not on initial load if it already has text
		if (!message) {
			message = '';
			adjustHeight();
			setTimeout(() => textarea.focus(), 0);
		}
	}

	function adjustHeight() {
		if (!textarea) return;
		textarea.style.height = 'auto';
		const isMobile = window.innerWidth < 768;
		const maxHeight = isMobile ? 120 : 200;
		textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
	}

	function handleInput() {
		message = textarea.value;
		adjustHeight();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			send();
		}
	}

	function send() {
		if (!canSend) return;
		dispatch('send', { message: message.trim() });
		message = '';
		adjustHeight();
		textarea.focus();
	}

	onMount(() => {
		if (textarea) {
			textarea.focus();
			adjustHeight();
		}
		window.addEventListener('resize', adjustHeight);
		return () => window.removeEventListener('resize', adjustHeight);
	});
</script>

<div class="relative flex w-full flex-col">
	<div class="flex items-end gap-xs rounded-lg border border-border bg-surface-elevated p-sm shadow-sm transition-shadow focus-within:border-focus-ring focus-within:ring-1 focus-within:ring-focus-ring">
		<button
			type="button"
			class="flex min-h-[44px] min-w-[44px] p-sm flex-shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-elevated hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-250 cursor-pointer"
			disabled
			title="File uploads coming soon"
			aria-label="Attach file"
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
			</svg>
		</button>

		<textarea
			data-testid="message-input"
			bind:this={textarea}
			bind:value={message}
			on:input={handleInput}
			on:keydown={handleKeydown}
			placeholder="Type a message..."
			class="min-h-[44px] w-full resize-none overflow-y-auto border-0 bg-transparent py-3 text-[16px] leading-[1.5] font-sans text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-0"
			rows="1"
			{disabled}
		></textarea>

<button
    data-testid="send-button"
    type="button"
    on:click={send}
    disabled={!canSend}
    aria-label="Send message"
    class="flex min-h-[44px] min-w-[44px] p-sm flex-shrink-0 items-center justify-center rounded-md bg-accent text-surface-page transition-colors duration-250 hover:bg-accent-hover disabled:bg-surface-page disabled:text-icon-muted disabled:border disabled:border-border disabled:cursor-not-allowed cursor-pointer"
>
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
</button>
	</div>

	{#if showCharCount}
		<div class="mt-1 flex justify-end px-2">
			<span class="text-[12px] font-sans {charCountColor}">
				{message.length}/{maxLength}
			</span>
		</div>
	{/if}
</div>
