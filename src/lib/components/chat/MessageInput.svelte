<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { currentConversationId } from '$lib/stores/ui';

	export let disabled: boolean = false;
	export let maxLength: number = 10000;
	export let isGenerating: boolean = false;

	const dispatch = createEventDispatcher<{
		send: { message: string };
		stop: void;
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
		const minHeight = 90;
		textarea.style.height = `${minHeight}px`;
		const isMobile = window.innerWidth < 768;
		const maxHeight = isMobile ? 100 : 168;
		textarea.style.height = `${Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight))}px`;
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

	function stop() {
		dispatch('stop');
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
	<div class="message-composer flex min-h-[78px] flex-col rounded-[1.25rem] border border-border px-[10px] pt-[10px] pb-[4px] transition-all duration-150 focus-within:border-focus-ring">
		<textarea
			data-testid="message-input"
			bind:this={textarea}
			bind:value={message}
			on:input={handleInput}
			on:keydown={handleKeydown}
			placeholder="Type a message..."
			class="composer-textarea min-h-[90px] w-full resize-none overflow-y-auto border-0 bg-transparent px-[16px] py-[8px] text-left text-[16px] leading-[1.35] font-serif text-text-primary placeholder:font-sans placeholder:text-text-muted focus:outline-none focus:ring-0"
			rows="1"
			{disabled}
		></textarea>

		<div class="composer-actions flex items-center justify-between gap-3 pt-[4px] pb-[6px]">
			<button
				type="button"
				class="btn-icon-bare composer-icon flex-shrink-0 text-text-muted disabled:cursor-not-allowed disabled:opacity-40"
				disabled
				title="File uploads coming soon"
				aria-label="Attach file"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
				</svg>
			</button>

			<div class="action-button-container min-h-[50px] min-w-[50px] flex-shrink-0">
				{#if isGenerating}
					<button
						type="button"
						on:click={stop}
						aria-label="Stop generation"
						class="composer-stop-accent flex h-full w-full items-center justify-center rounded-[15px] shadow-sm animate-in"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
							<rect x="6" y="6" width="12" height="12" rx="2" />
						</svg>
					</button>
				{:else}
					<button
						data-testid="send-button"
						type="button"
						on:click={send}
						disabled={!canSend}
						aria-label="Send message"
						class="btn-primary composer-send flex h-full w-full items-center justify-center rounded-[15px] shadow-sm disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-elevated disabled:text-icon-muted animate-in"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="22" x2="11" y1="2" y2="13" />
							<polygon points="22 2 15 22 11 13 2 9 22 2" />
						</svg>
					</button>
				{/if}
			</div>
		</div>
	</div>

	{#if showCharCount}
		<div class="mt-1 flex justify-end px-2">
			<span class="text-[12px] font-sans {charCountColor}">
				{message.length}/{maxLength}
			</span>
		</div>
	{/if}
</div>

<style>
	.message-composer {
		background: color-mix(in srgb, var(--surface-elevated) 82%, var(--surface-page) 18%);
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--border-default) 88%, transparent 12%),
			0 14px 30px color-mix(in srgb, var(--accent) 7%, transparent 93%),
			var(--shadow-lg);
	}

	:global(.dark) .message-composer {
		background: color-mix(in srgb, var(--surface-overlay) 88%, #3a3a3a 12%);
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--border-default) 92%, transparent 8%),
			0 18px 38px rgba(0, 0, 0, 0.4),
			0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent 90%);
	}

	.composer-icon {
		align-self: center;
	}

	.composer-textarea {
		align-self: stretch;
	}

	.composer-actions {
		border-top: 1px solid color-mix(in srgb, var(--border-default) 72%, transparent 28%);
	}

	.composer-send {
		aspect-ratio: 1 / 1;
		align-self: center;
		overflow: hidden;
	}

	.action-button-container {
		aspect-ratio: 1 / 1;
		align-self: center;
		overflow: hidden;
	}

	.composer-stop {
		aspect-ratio: 1 / 1;
		align-self: center;
		overflow: hidden;
	}

	.composer-stop-accent {
		aspect-ratio: 1 / 1;
		align-self: center;
		overflow: hidden;
		background-color: var(--accent);
		color: white;
		border: 1px solid transparent;
		cursor: pointer;
		transition:
			background-color var(--duration-standard) var(--ease-out),
			transform var(--duration-standard) var(--ease-out);
	}

	.composer-stop-accent:hover {
		background-color: var(--accent-hover);
		transform: scale(1.02);
	}

	.composer-stop-accent:focus-visible {
		box-shadow: 0 0 0 2px var(--focus-ring);
	}

	.animate-in {
		animation: buttonFadeIn 200ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
	}

	@keyframes buttonFadeIn {
		from {
			opacity: 0;
			transform: scale(0.85) rotate(-8deg);
		}
		to {
			opacity: 1;
			transform: scale(1) rotate(0deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.animate-in {
			animation: none;
			opacity: 1;
		}
	}
</style>
