<script lang="ts">
	import { isDark } from '$lib/stores/theme';
	import type { ChatMessage } from '$lib/types';
	import MarkdownRenderer from './MarkdownRenderer.svelte';
	import MessageLoading from './MessageLoading.svelte';
	import ThinkingBlock from './ThinkingBlock.svelte';

	export let message: ChatMessage;

	let copied = false;
	let copyTimeout: ReturnType<typeof setTimeout>;

	$: isUser = message.role === 'user';
	$: hasThinking = Boolean(message.thinking?.trim());

	function getClipboardText(content: string) {
		return content
			.replace(/<\/?preserve>/gi, '')
			.replace(/^\[Translation unavailable\]\s*/i, '')
			.trim();
	}

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(getClipboardText(message.content));
			copied = true;
			clearTimeout(copyTimeout);
			copyTimeout = setTimeout(() => {
				copied = false;
			}, 2000);
		} catch (err) {
			console.error('Failed to copy text: ', err);
		}
	}
</script>

<div class="group flex w-full flex-col {isUser ? 'items-end' : 'items-start'} gap-md py-md fade-in">
	<div
		data-testid={isUser ? 'user-message' : 'assistant-message'}
		class="relative flex flex-col font-serif
		{isUser
			? 'max-w-[85%] rounded-md border border-border-subtle bg-surface-elevated p-sm text-text-primary shadow-sm md:max-w-[80%]'
			: 'w-full max-w-full rounded-none bg-surface-page p-sm text-text-primary'}"
	>
		{#if !isUser && hasThinking}
			<ThinkingBlock
				content={message.thinking ?? ''}
				isStreaming={Boolean(message.isThinkingStreaming)}
				isCollapsed={true}
			/>
		{/if}
		{#if message.isStreaming && !message.content}
			<MessageLoading label="Generating..." />
		{:else if isUser}
			<div class="whitespace-pre-wrap break-words text-[16px] leading-[1.6]">
				{message.content}
			</div>
		{:else}
			<div class="prose-container w-full overflow-hidden text-[16px] leading-[1.6]">
				<MarkdownRenderer
					content={message.content}
					isDark={$isDark}
					isStreaming={Boolean(message.isStreaming)}
				/>
			</div>
		{/if}

	</div>

	{#if !message.isStreaming}
		<div
			class="copy-action-row flex w-full opacity-0 transition-opacity duration-[var(--duration-micro)] group-hover:opacity-100"
			class:justify-end={isUser}
			class:justify-start={!isUser}
		>
			<button
				type="button"
				class="btn-icon-bare sm:!min-h-[36px] sm:!min-w-[36px]"
				on:click={copyToClipboard}
				title="Copy message"
				aria-label="Copy message"
			>
				{#if copied}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-icon-primary">
						<polyline points="20 6 9 17 4 12"></polyline>
					</svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
						<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
					</svg>
				{/if}
			</button>
		</div>
	{/if}
</div>

<style lang="postcss">
	.prose-container :global(p) {
		margin-top: 0;
		margin-bottom: var(--space-md);
	}
	.prose-container :global(p:last-child) {
		margin-bottom: 0;
	}
	.fade-in {
		animation: fadeIn var(--duration-micro) var(--ease-out) forwards;
	}
	.copy-action-row {
		margin-top: calc(var(--space-sm) * -1);
	}
	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>
