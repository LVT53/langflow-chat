<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import { currentConversationId } from '$lib/stores/ui';
	import TranslationToggle from './TranslationToggle.svelte';
	import ModelSelector from './ModelSelector.svelte';
	import type { ArtifactSummary } from '$lib/types';

	export let disabled: boolean = false;
	export let maxLength: number = 10000;
	export let isGenerating: boolean = false;
	export let conversationId: string | null = null;
	export let attachmentsEnabled: boolean = false;
	export let ensureConversation: (() => Promise<string>) | null = null;

	const dispatch = createEventDispatcher<{
		send: { message: string; attachmentIds: string[]; attachments: ArtifactSummary[]; conversationId: string | null };
		stop: void;
	}>();

	let textarea: HTMLTextAreaElement;
	let fileInput: HTMLInputElement;
	let message = '';
	let pendingAttachments: ArtifactSummary[] = [];
	let uploadingAttachment = false;
	let attachmentError = '';
	let resolvedConversationId: string | null = conversationId;
	
	$: isEmpty = message.trim().length === 0;
	$: isOverMaxLength = message.length > maxLength;
	$: showCharCount = message.length > maxLength * 0.8;
	$: charCountColor = isOverMaxLength ? 'text-danger' : 'text-text-muted';
	
	$: canSend = !isEmpty && !isOverMaxLength;
	$: if (conversationId) {
		resolvedConversationId = conversationId;
	}
	$: canAttach = attachmentsEnabled && Boolean(resolvedConversationId || ensureConversation) && !uploadingAttachment;

	function isMobile(): boolean {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
			return false;
		}
		return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
	}

	let lastConversationId = '';
	$: if ($currentConversationId && $currentConversationId !== lastConversationId && textarea) {
		lastConversationId = $currentConversationId;
		// Only clear if we actually switched conversations, not on initial load if it already has text
		if (!message) {
			message = '';
			pendingAttachments = [];
			attachmentError = '';
			adjustHeight();
			if (!isMobile()) {
				setTimeout(() => textarea.focus(), 0);
			}
		}
	}

	function adjustHeight() {
		if (!textarea) return;
		requestAnimationFrame(() => {
			if (!textarea) return;
			const minHeight = 90;
			textarea.style.height = `${minHeight}px`;
			const isMobileDevice = window.innerWidth < 768;
			const maxHeight = isMobileDevice ? 120 : 240;
			textarea.style.height = `${Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight))}px`;
		});
	}

	function handleInput() {
		message = textarea.value;
		adjustHeight();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !isMobile()) {
			event.preventDefault();
			send();
		}
	}

	function send() {
		if (!canSend) return;
		dispatch('send', {
			message: message.trim(),
			attachmentIds: pendingAttachments.map((attachment) => attachment.id),
			attachments: pendingAttachments,
			conversationId: resolvedConversationId
		});
		message = '';
		pendingAttachments = [];
		attachmentError = '';
		adjustHeight();
		if (!isMobile()) {
			textarea.focus();
		} else {
			textarea.blur();
		}
	}

	function stop() {
		dispatch('stop');
		if (isMobile()) {
			textarea.blur();
		}
	}

	onMount(() => {
		if (textarea) {
			if (!isMobile()) {
				textarea.focus();
			}
			adjustHeight();
		}
		window.addEventListener('resize', adjustHeight);
		return () => window.removeEventListener('resize', adjustHeight);
	});

	function openFilePicker() {
		if (!canAttach) return;
		fileInput?.click();
	}

	async function uploadFiles(files: FileList | null) {
		if (!files) return;
		uploadingAttachment = true;
		attachmentError = '';

		try {
			let targetConversationId = resolvedConversationId;
			if (!targetConversationId && ensureConversation) {
				targetConversationId = await ensureConversation();
				resolvedConversationId = targetConversationId;
			}
			if (!targetConversationId) {
				throw new Error('Unable to prepare a conversation for attachments.');
			}
			for (const file of Array.from(files)) {
				const formData = new FormData();
				formData.append('file', file);
				formData.append('conversationId', targetConversationId);
				const response = await fetch('/api/knowledge/upload', {
					method: 'POST',
					body: formData
				});
				if (!response.ok) {
					const payload = await response.json().catch(() => ({}));
					throw new Error(payload.error ?? 'Failed to upload attachment.');
				}
				const payload = await response.json();
				if (payload?.artifact) {
					const next = new Map(pendingAttachments.map((attachment) => [attachment.id, attachment]));
					next.set(payload.artifact.id, payload.artifact);
					pendingAttachments = Array.from(next.values());
				}
			}
		} catch (error) {
			attachmentError = error instanceof Error ? error.message : 'Failed to upload attachment.';
		} finally {
			uploadingAttachment = false;
			if (fileInput) fileInput.value = '';
		}
	}

	function removePendingAttachment(id: string) {
		pendingAttachments = pendingAttachments.filter((attachment) => attachment.id !== id);
	}
</script>

<div class="relative flex w-full flex-col">
	<div class="message-composer flex min-h-[78px] flex-col rounded-[1.25rem] border border-border px-[10px] pt-[10px] pb-0 transition-all duration-150 focus-within:border-focus-ring">
		<input
			bind:this={fileInput}
			type="file"
			class="hidden"
			multiple
			on:change={(event) => uploadFiles((event.currentTarget as HTMLInputElement).files)}
		/>
		<textarea
			data-testid="message-input"
			bind:this={textarea}
			bind:value={message}
			on:input={handleInput}
			on:keydown={handleKeydown}
			placeholder="Type a message..."
			class="composer-textarea min-h-[90px] w-full resize-none overflow-y-auto border-0 bg-transparent px-[16px] py-[8px] text-left text-[14px] md:text-[15px] leading-[1.35] font-serif text-text-primary placeholder:font-sans placeholder:text-text-muted focus:outline-none focus:ring-0"
			rows="1"
		></textarea>

		{#if pendingAttachments.length > 0}
			<div class="flex flex-wrap gap-2 px-[16px] pb-2 pt-1">
				{#each pendingAttachments as attachment (attachment.id)}
					<div class="attachment-chip flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-sans text-text-secondary">
						<span class="truncate max-w-[180px]">{attachment.name}</span>
						<button
							type="button"
							class="text-text-muted transition-colors hover:text-text-primary"
							on:click={() => removePendingAttachment(attachment.id)}
							aria-label={`Remove ${attachment.name}`}
						>
							×
						</button>
					</div>
				{/each}
			</div>
		{/if}

		<div class="composer-actions flex items-center justify-between gap-3 pt-[4px] pb-[5px]">
			<div class="flex items-center gap-2">
				<ModelSelector />
				<TranslationToggle />
				<button
					type="button"
					class="btn-icon-bare composer-icon flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center text-text-muted disabled:cursor-not-allowed disabled:opacity-40"
					on:click={openFilePicker}
					disabled={!canAttach}
					title={attachmentsEnabled ? 'Attach file' : 'File uploads are unavailable'}
					aria-label="Attach file"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
					</svg>
				</button>
			</div>

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
						disabled={!canSend || disabled}
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

	{#if uploadingAttachment || attachmentError}
		<div class="mt-2 flex items-center justify-between px-2 text-xs font-sans">
			{#if uploadingAttachment}
				<span class="text-text-muted">Uploading attachment...</span>
			{/if}
			{#if attachmentError}
				<span class="text-danger">{attachmentError}</span>
			{/if}
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

	.attachment-chip {
		background: color-mix(in srgb, var(--surface-page) 88%, var(--surface-elevated) 12%);
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
