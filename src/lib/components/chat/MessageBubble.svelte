<script lang="ts">
	import { isDark } from '$lib/stores/theme';
	import type { ChatMessage } from '$lib/types';
	import MarkdownRenderer from './MarkdownRenderer.svelte';
	import ThinkingBlock from './ThinkingBlock.svelte';
	import LogoMark from './LogoMark.svelte';
	import FileAttachment from './FileAttachment.svelte';
	import MessageEvidenceDetails from './MessageEvidenceDetails.svelte';
	import AttachmentContentModal from './AttachmentContentModal.svelte';
	import { onDestroy, tick } from 'svelte';
	import type { TaskSteeringPayload } from '$lib/types';

	let {
		message,
		isLast = false,
		pinnedArtifactIds = [],
		excludedArtifactIds = [],
		onRegenerate = undefined,
		onEdit = undefined,
		onSteer = undefined,
	}: {
		message: ChatMessage;
		isLast?: boolean;
		pinnedArtifactIds?: string[];
		excludedArtifactIds?: string[];
		onRegenerate?: ((payload: { messageId: string }) => void) | undefined;
		onEdit?: ((payload: { messageId: string; newText: string }) => void) | undefined;
		onSteer?: ((payload: TaskSteeringPayload) => void) | undefined;
	} = $props();

	let copied = $state(false);
	let copyTimeout: ReturnType<typeof setTimeout> | undefined;
	let isEditing = $state(false);
	let editText = $state('');
	let editTextarea = $state<HTMLTextAreaElement | null>(null);
	let showTimestampTooltip = $state(false);
	let attachmentModalOpen = $state(false);
	let selectedAttachmentId = $state<string | null>(null);
	let selectedAttachmentName = $state('');

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

	let isUser = $derived(message.role === 'user');
	let hasAttachments = $derived((message.attachments?.length ?? 0) > 0);
	let hasThinking = $derived(Boolean(message.thinking?.trim()));
	let hasToolCalls = $derived(
		(message.thinkingSegments?.some((segment) => segment.type === 'tool_call')) ?? false
	);
	let thinkingTokenCount = $derived(hasThinking ? estimateTokenCount(message.thinking ?? '') : 0);
	let responseTokenCount = $derived(estimateTokenCount(message.content));
	let totalTokenCount = $derived(thinkingTokenCount + responseTokenCount);
	let hasTokenInfo = $derived(hasThinking || responseTokenCount > 0);

	// Thinking is definitively done once visible response text has started streaming
	// OR the whole message is complete. This keeps the label as "Thinking" between
	// multi-burst thinking phases (isThinkingStreaming briefly false, but no content yet).
	let isDone = $derived(!message.isStreaming && !message.isThinkingStreaming);
	let isGenerating = $derived(Boolean(message.isStreaming || message.isThinkingStreaming));
	let showLogoBelow = $derived(!isUser && isLast && (hasThinking || isGenerating));
	let thinkingIsDone = $derived(
		hasThinking && !message.isThinkingStreaming && (message.content.trim().length > 0 || isDone)
	);

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

	async function startEdit() {
		editText = message.content;
		isEditing = true;
		await tick();
		editTextarea?.focus();
	}

	function cancelEdit() {
		isEditing = false;
		editText = '';
	}

	function submitEdit() {
		const trimmed = editText.trim();
		if (!trimmed || trimmed === message.content) {
			cancelEdit();
			return;
		}
		onEdit?.({ messageId: message.id, newText: trimmed });
		isEditing = false;
		editText = '';
	}

	function formatTimestamp(ts: number): string {
		const date = new Date(ts);
		const now = new Date();
		const isToday = date.toDateString() === now.toDateString();

		if (isToday) {
			const h = String(date.getHours()).padStart(2, '0');
			const m = String(date.getMinutes()).padStart(2, '0');
			return `${h}:${m}`;
		}
		const day = date.getDate();
		const month = date.toLocaleString('en-GB', { month: 'short' });
		return `${day} ${month}`;
	}

	function formatFullTimestamp(ts: number): string {
		const date = new Date(ts);
		const day = date.getDate();
		const month = date.toLocaleString('en-GB', { month: 'long' });
		const year = date.getFullYear();
		const h = String(date.getHours()).padStart(2, '0');
		const m = String(date.getMinutes()).padStart(2, '0');
		return `${day} ${month} ${year}, ${h}:${m}`;
	}

	function toggleTimestampTooltip(e: MouseEvent) {
		e.stopPropagation();
		showTimestampTooltip = !showTimestampTooltip;
	}

	let timestampLabel = $derived(isUser ? formatTimestamp(message.timestamp) : '');
	let fullTimestampLabel = $derived(isUser ? formatFullTimestamp(message.timestamp) : '');

	function handleEditKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			submitEdit();
		}
		if (e.key === 'Escape') {
			cancelEdit();
		}
	}

	$effect(() => {
		if (!showTimestampTooltip) return;

		const handleWindowClick = () => {
			showTimestampTooltip = false;
		};

		window.addEventListener('click', handleWindowClick, { once: true });
		return () => {
			window.removeEventListener('click', handleWindowClick);
		};
	});

	onDestroy(() => {
		if (copyTimeout) {
			clearTimeout(copyTimeout);
		}
	});

	function handleViewAttachment(payload: { id: string; name: string }) {
		selectedAttachmentId = payload.id;
		selectedAttachmentName = payload.name;
		attachmentModalOpen = true;
	}

	function closeAttachmentModal() {
		attachmentModalOpen = false;
		selectedAttachmentId = null;
		selectedAttachmentName = '';
	}
</script>

<div class="group flex w-full flex-col {isUser && !isEditing ? 'items-end' : 'items-start'} gap-md py-md fade-in">
	<div
		data-testid={isUser ? 'user-message' : 'assistant-message'}
		class="relative flex min-w-0 flex-col font-serif
		{isUser && !isEditing
			? 'max-w-[85%] min-w-0 rounded-md border border-border-subtle bg-surface-elevated p-sm text-text-primary shadow-sm md:max-w-[80%]'
			: isUser
				? 'w-full min-w-0 max-w-full rounded-md border border-border bg-surface-elevated p-md text-text-primary shadow-sm'
				: 'w-full min-w-0 max-w-full rounded-none bg-surface-page p-sm text-text-primary'}"
	>
		{#if !isUser && (hasThinking || hasToolCalls)}
			<ThinkingBlock
				content={message.thinking ?? ''}
				thinkingIsDone={thinkingIsDone}
				segments={message.thinkingSegments ?? []}
			/>
		{/if}
		{#if isUser}
			{#if isEditing}
				<div class="flex flex-col gap-3">
					<textarea
						bind:this={editTextarea}
						class="w-full resize-none rounded-md border border-border bg-surface-page px-4 py-3 font-serif text-[16px] leading-[1.6] text-text-primary focus:border-focus-ring focus:outline-none focus:ring-2 focus:ring-focus-ring"
						bind:value={editText}
						onkeydown={handleEditKeydown}
						rows={Math.min(10, Math.max(3, editText.split('\n').length))}
					></textarea>
					<div class="flex items-center gap-3 justify-end">
						<span class="text-xs text-text-muted">⌘↵ to send</span>
						<button type="button" class="btn-secondary" onclick={cancelEdit}>Cancel</button>
						<button type="button" class="btn-primary" onclick={submitEdit} disabled={!editText.trim()}>Send</button>
					</div>
				</div>
			{:else}
				{#if hasAttachments}
					<div class="mb-3 flex flex-wrap gap-2">
						{#each message.attachments ?? [] as attachment (attachment.id)}
							<FileAttachment {attachment} variant="compact" viewable={true} onView={handleViewAttachment} />
						{/each}
					</div>
				{/if}
				<div class="whitespace-pre-wrap break-words text-[14px] md:text-[15px] leading-[1.45] md:leading-[1.55]">
					{message.content}
				</div>
			{/if}
		{:else}
			<div class="prose-container min-w-0 w-full overflow-hidden text-[14px] md:text-[15px] leading-[1.45] md:leading-[1.55]">
				<MarkdownRenderer
					content={message.content}
					isDark={$isDark}
					isStreaming={Boolean(message.isStreaming)}
				/>
			</div>
			{#if message.evidenceSummary && message.evidenceSummary.groups.length > 0}
				<MessageEvidenceDetails
					evidenceSummary={message.evidenceSummary}
					{pinnedArtifactIds}
					{excludedArtifactIds}
					onSteer={onSteer}
				/>
			{:else if message.evidencePending}
				<div class="evidence-pending">Evidence is loading…</div>
			{/if}
			{/if}

	</div>

	{#if !message.isStreaming && !isEditing}
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
								{#if message.modelDisplayName}
									<div class="tooltip-row">
										<span class="tooltip-label">Model</span>
										<span class="tooltip-value">{message.modelDisplayName}</span>
									</div>
								{/if}
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

			{#if !isUser}
				<!-- Regenerate button -->
				<button
					type="button"
					class="btn-icon-bare sm:!min-h-[44px] sm:!min-w-[44px]"
					onclick={() => onRegenerate?.({ messageId: message.id })}
					title="Regenerate response"
					aria-label="Regenerate response"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21 2v6h-6"/>
						<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
						<path d="M3 22v-6h6"/>
						<path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
					</svg>
				</button>
			{/if}

			{#if isUser}
				<div class="timestamp-container">
					<button
						type="button"
						class="timestamp-label font-mono tabular-nums"
						onclick={toggleTimestampTooltip}
					>{timestampLabel}</button>
					<div class="timestamp-tooltip" class:visible={showTimestampTooltip}>
						<div class="tooltip-content">
							<div class="tooltip-row">
								<span class="tooltip-value">{fullTimestampLabel}</span>
							</div>
						</div>
					</div>
				</div>
				<!-- Edit button -->
				<button
					type="button"
					class="btn-icon-bare sm:!min-h-[44px] sm:!min-w-[44px]"
					onclick={startEdit}
					title="Edit message"
					aria-label="Edit message"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
						<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
					</svg>
				</button>
			{/if}

			<button
				type="button"
				class="btn-icon-bare sm:!min-h-[44px] sm:!min-w-[44px]"
				onclick={copyToClipboard}
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
	{#if showLogoBelow}
		<div class="logo-signature">
			<LogoMark animated={isGenerating} size={42} />
		</div>
	{/if}

	<AttachmentContentModal
		open={attachmentModalOpen}
		artifactId={selectedAttachmentId}
		filename={selectedAttachmentName}
		onClose={closeAttachmentModal}
	/>
</div>

<style lang="postcss">
	/* Override Tailwind prose base font size to match reduced chat text size */
	.prose-container {
		min-width: 0;
		width: 100%;
		max-width: 100%;
		overflow-x: clip;
	}

	.prose-container :global(.prose) {
		width: 100%;
		min-width: 0;
		max-width: 100%;
	}

	.prose-container :global(.prose) {
		font-size: 16px;
		line-height: 1.5;
	}
	@media (min-width: 768px) {
		.prose-container :global(.prose) {
			font-size: 15px;
			line-height: 1.55;
		}
	}
	.prose-container :global(img) {
		max-width: 100%;
		height: auto;
	}
	.prose-container :global(p),
	.prose-container :global(li),
	.prose-container :global(blockquote),
	.prose-container :global(h1),
	.prose-container :global(h2),
	.prose-container :global(h3),
	.prose-container :global(h4),
	.prose-container :global(h5),
	.prose-container :global(h6) {
		word-break: break-word;
		overflow-wrap: break-word;
	}
	/* But don't break code — let it scroll */
	.prose-container :global(pre),
	.prose-container :global(code) {
		word-break: normal;
		overflow-wrap: normal;
	}
	.prose-container :global(.markdown-table-wrap) {
		width: 100%;
		min-width: 0;
		max-width: 100%;
		margin: 0 0 var(--space-md);
	}
	.prose-container :global(.markdown-table-wrap[data-overflow='scroll']) {
		overflow-x: auto;
		padding-bottom: 0.15rem;
	}
	.prose-container :global(.markdown-table-wrap[data-overflow='fit']) {
		overflow-x: clip;
	}
	.prose-container :global(.markdown-table-wrap table) {
		width: 100%;
		min-width: 0;
		table-layout: fixed;
		border-collapse: collapse;
	}
	.prose-container :global(.markdown-table-wrap[data-overflow='scroll'] table) {
		width: max-content;
		min-width: 100%;
		table-layout: auto;
	}
	.prose-container :global(.markdown-table-wrap th),
	.prose-container :global(.markdown-table-wrap td) {
		white-space: normal;
		word-break: normal;
		overflow-wrap: break-word;
		hyphens: auto;
		vertical-align: top;
	}
	.prose-container :global(.markdown-table-wrap th a),
	.prose-container :global(.markdown-table-wrap td a),
	.prose-container :global(.markdown-table-wrap th code),
	.prose-container :global(.markdown-table-wrap td code) {
		word-break: break-word;
		overflow-wrap: anywhere;
	}
	.prose-container :global(a),
	.prose-container :global(li code),
	.prose-container :global(p code),
	.prose-container :global(blockquote code) {
		overflow-wrap: anywhere;
		word-break: break-word;
	}
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

	.evidence-pending {
		margin-top: var(--space-md);
		border-top: 1px solid color-mix(in srgb, var(--border-subtle) 70%, transparent 30%);
		padding-top: var(--space-sm);
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.76rem;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		color: var(--text-muted);
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
		left: 0;
		transform: translateY(4px);
		opacity: 0;
		visibility: hidden;
		transition:
			opacity var(--duration-standard) var(--ease-out),
			transform var(--duration-standard) var(--ease-out),
			visibility var(--duration-standard);
		z-index: 50;
		pointer-events: none;
		max-width: calc(100vw - 2rem);
	}

	.info-container:hover .info-tooltip,
	.info-button:focus-visible + .info-tooltip {
		opacity: 1;
		visibility: visible;
		transform: translateY(0);
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
		font-family: 'Nimbus Sans L', sans-serif;
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

	.timestamp-container {
		position: relative;
		display: inline-flex;
	}

	.timestamp-label {
		font-size: 11px;
		color: var(--text-muted);
		padding: 0 0.5rem;
		min-height: 44px;
		line-height: 1;
		display: inline-flex;
		align-items: center;
		background: none;
		border: none;
		cursor: default;
	}

	.timestamp-tooltip {
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

	.timestamp-container:hover .timestamp-tooltip,
	.timestamp-tooltip.visible {
		opacity: 1;
		visibility: visible;
		transform: translateX(-50%) translateY(0);
		pointer-events: auto;
	}

	.logo-signature {
		display: flex;
		justify-content: flex-start;
		margin-top: var(--space-xs);
		opacity: 0.85;
	}

	@media (prefers-reduced-motion: reduce) {
		.info-tooltip,
		.timestamp-tooltip {
			transition: none;
		}
	}
</style>
