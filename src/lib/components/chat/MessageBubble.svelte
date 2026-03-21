<script lang="ts">
	import { isDark } from '$lib/stores/theme';
	import type { ChatMessage } from '$lib/types';
	import MarkdownRenderer from './MarkdownRenderer.svelte';
	import ThinkingBlock from './ThinkingBlock.svelte';

	export let message: ChatMessage;

	let copied = false;
	let copyTimeout: ReturnType<typeof setTimeout>;

	function estimateTokenCount(text: string) {
		const trimmed = text.trim();
		if (!trimmed) return 0;

		const segments = trimmed.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]+/gu) ?? [];
		let estimated = 0;

		for (const segment of segments) {
			if (/^[\p{L}\p{N}]+$/u.test(segment)) {
				const isAscii = /^[\x00-\x7F]+$/.test(segment);
				estimated += Math.max(1, Math.ceil(segment.length / (isAscii ? 4 : 2)));
				continue;
			}

			estimated += segment.length;
		}

		return estimated;
	}

	$: isUser = message.role === 'user';
	$: hasThinking = Boolean(message.thinking?.trim());
	$: thinkingTokenCount = hasThinking ? estimateTokenCount(message.thinking ?? '') : 0;
	$: responseTokenCount = estimateTokenCount(message.content);
	$: totalTokenCount = thinkingTokenCount + responseTokenCount;
	$: hasTokenInfo = hasThinking || responseTokenCount > 0;

	// Thinking is definitively done once visible response text has started streaming
	// OR the whole message is complete. This keeps the label as "Thinking" between
	// multi-burst thinking phases (isThinkingStreaming briefly false, but no content yet).
	$: isDone = !message.isStreaming && !message.isThinkingStreaming;
	$: thinkingIsDone = hasThinking && !message.isThinkingStreaming &&
		(message.content.trim().length > 0 || isDone);

	function getClipboardText(content: string) {
		return content
			.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
			.replace(/<\/?thinking>/gi, '')
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
				thinkingIsDone={thinkingIsDone}
			/>
		{/if}
		{#if isUser}
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
			class="copy-action-row flex w-full items-center gap-0.5 opacity-100 transition-opacity duration-[var(--duration-micro)] md:opacity-0 md:group-hover:opacity-100"
			class:justify-end={isUser}
			class:justify-start={!isUser}
		>
			{#if !isUser && hasTokenInfo}
				<div class="info-container">
					<button
						type="button"
						class="btn-icon-bare info-button sm:!min-h-[36px] sm:!min-w-[36px]"
						aria-label="Message info"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10"></circle>
							<line x1="12" y1="16" x2="12" y2="12"></line>
							<line x1="12" y1="8" x2="12.01" y2="8"></line>
						</svg>
					</button>
					<div class="info-tooltip">
						<div class="tooltip-content">
							{#if hasThinking}
								<div class="tooltip-row">
									<span class="tooltip-label">Thinking tokens</span>
									<span class="tooltip-value">{thinkingTokenCount.toLocaleString()}</span>
								</div>
							{/if}
							{#if responseTokenCount > 0}
								<div class="tooltip-row">
									<span class="tooltip-label">Response tokens</span>
									<span class="tooltip-value">{responseTokenCount.toLocaleString()}</span>
								</div>
							{/if}
							{#if totalTokenCount > 0}
								<div class="tooltip-row">
									<span class="tooltip-label">Total tokens</span>
									<span class="tooltip-value">{totalTokenCount.toLocaleString()}</span>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}
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
		margin-top: calc(var(--space-sm) * -1.5);
	}
	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.info-container {
		position: relative;
		display: inline-flex;
	}

	.info-tooltip {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%) translateY(4px);
		opacity: 0;
		visibility: hidden;
		transition:
			opacity var(--duration-standard) var(--ease-out),
			transform var(--duration-standard) var(--ease-out),
			visibility var(--duration-standard);
		z-index: 50;
		pointer-events: none;
	}

	.info-container:hover .info-tooltip,
	.info-button:focus-visible + .info-tooltip {
		opacity: 1;
		visibility: visible;
		transform: translateX(-50%) translateY(0);
		pointer-events: auto;
	}

	.tooltip-content {
		background: var(--surface-overlay);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		padding: var(--space-sm) var(--space-md);
		box-shadow: var(--shadow-lg);
		white-space: nowrap;
	}

	.tooltip-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		font-size: 12px;
		line-height: 1.4;
	}

	.tooltip-row + .tooltip-row {
		margin-top: var(--space-xs);
	}

	.tooltip-label {
		color: var(--text-muted);
	}

	.tooltip-value {
		color: var(--text-primary);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}

	@media (prefers-reduced-motion: reduce) {
		.info-tooltip {
			transition: none;
		}
	}
</style>
