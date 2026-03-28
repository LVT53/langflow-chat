<script lang="ts">
	import { onMount } from 'svelte';
	import { uploadKnowledgeAttachment } from '$lib/client/api/knowledge';
	import { currentConversationId } from '$lib/stores/ui';
	import ContextUsageRing from './ContextUsageRing.svelte';
	import ComposerToolsMenu from './ComposerToolsMenu.svelte';
	import FileAttachment from './FileAttachment.svelte';
	import type {
		ArtifactSummary,
		ContextDebugState,
		ConversationContextStatus,
		PendingAttachment,
		TaskState,
		TaskSteeringPayload,
	} from '$lib/types';

	type SendPayload = {
		message: string;
		attachmentIds: string[];
		attachments: ArtifactSummary[];
		pendingAttachments: PendingAttachment[];
		conversationId: string | null;
	};

	type DraftPayload = {
		conversationId: string | null;
		draftText: string;
		selectedAttachmentIds: string[];
		selectedAttachments: PendingAttachment[];
	};

	let {
		disabled = false,
		maxLength = 10000,
		isGenerating = false,
		conversationId = null,
		attachmentsEnabled = false,
		ensureConversation = null,
		contextStatus = null,
		attachedArtifacts = [],
		taskState = null,
		contextDebug = null,
		draftText = '',
		draftAttachments = [],
		draftVersion = 0,
		onSend = undefined,
		onQueue = undefined,
		onStop = undefined,
		onSteer = undefined,
		onManageEvidence = undefined,
		onEditQueuedMessage = undefined,
		onDeleteQueuedMessage = undefined,
		hasQueuedMessage = false,
		queuedMessagePreview = '',
		onDraftChange = undefined,
	}: {
		disabled?: boolean;
		maxLength?: number;
		isGenerating?: boolean;
		conversationId?: string | null;
		attachmentsEnabled?: boolean;
		ensureConversation?: (() => Promise<string>) | null;
		contextStatus?: ConversationContextStatus | null;
		attachedArtifacts?: ArtifactSummary[];
		taskState?: TaskState | null;
		contextDebug?: ContextDebugState | null;
		draftText?: string;
		draftAttachments?: PendingAttachment[];
		draftVersion?: number;
		onSend?: ((payload: SendPayload) => void) | undefined;
		onQueue?: ((payload: SendPayload) => void) | undefined;
		onStop?: (() => void) | undefined;
		onSteer?: ((payload: TaskSteeringPayload) => void) | undefined;
		onManageEvidence?: (() => void) | undefined;
		onEditQueuedMessage?: (() => void) | undefined;
		onDeleteQueuedMessage?: (() => void) | undefined;
		hasQueuedMessage?: boolean;
		queuedMessagePreview?: string;
		onDraftChange?: ((payload: DraftPayload) => void) | undefined;
	} = $props();

	let textarea = $state<HTMLTextAreaElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let message = $state('');
	let pendingAttachments = $state<PendingAttachment[]>([]);
	let uploadState = $state<'idle' | 'uploading' | 'preparing'>('idle');
	let attachmentError = $state('');
	let resolvedConversationId = $state<string | null>(null);
	let showToolsMenu = $state(false);
	let appliedDraftVersion = -1;
	let lastEmittedDraftKey = '';
	let ensureDraftConversationPromise: Promise<string> | null = null;
	let draftEmissionVersion = 0;
	
	let isEmpty = $derived(message.trim().length === 0);
	let isOverMaxLength = $derived(message.length > maxLength);
	let showCharCount = $derived(message.length > maxLength * 0.8);
	let charCountColor = $derived(isOverMaxLength ? 'text-danger' : 'text-text-muted');
	let isUploadingAttachment = $derived(uploadState !== 'idle');
	let pendingAttachmentArtifacts = $derived(
		pendingAttachments.map((attachment) => attachment.artifact)
	);
	let hasUnreadyAttachment = $derived(
		pendingAttachments.some((attachment) => !attachment.promptReady)
	);
	let attachmentReadinessErrors = $derived(
		pendingAttachments.filter((attachment) => Boolean(attachment.readinessError))
	);
	
	let canSend = $derived(
		!isEmpty && !isOverMaxLength && !isUploadingAttachment && !hasUnreadyAttachment
	);
	let canQueue = $derived(canSend && isGenerating && !hasQueuedMessage);
	let canAttach = $derived(
		attachmentsEnabled && Boolean(resolvedConversationId || ensureConversation) && !isUploadingAttachment
	);
	let composerArtifacts = $derived(
		Array.from(
		new Map(
			[...attachedArtifacts, ...pendingAttachmentArtifacts].map((artifact) => [artifact.id, artifact])
		).values()
		)
	);

	$effect(() => {
		if (conversationId) {
			resolvedConversationId = conversationId;
		}
	});

	$effect(() => {
		if (draftVersion === appliedDraftVersion) return;

		const shouldApplyDraft =
			appliedDraftVersion === -1 ||
			draftVersion === 0 ||
			(message.trim().length === 0 && pendingAttachments.length === 0);
		appliedDraftVersion = draftVersion;

		if (shouldApplyDraft) {
			message = draftText;
			pendingAttachments = draftAttachments.map((attachment) => ({ ...attachment }));
			attachmentError = '';
			uploadState = 'idle';
			showToolsMenu = false;
			lastEmittedDraftKey = '';
			draftEmissionVersion += 1;
			adjustHeight();
		}
	});

	function isMobile(): boolean {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
			return false;
		}
		return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
	}

	let lastConversationId = '';

	$effect(() => {
		const activeConversationId = $currentConversationId;

		if (!activeConversationId || activeConversationId === lastConversationId || !textarea) {
			return;
		}

		lastConversationId = activeConversationId;
		// Only clear if we actually switched conversations, not on initial load if it already has text.
		if (!message) {
			message = '';
			pendingAttachments = [];
			attachmentError = '';
			uploadState = 'idle';
			showToolsMenu = false;
			lastEmittedDraftKey = '';
			draftEmissionVersion += 1;
			adjustHeight();
			if (!isMobile()) {
				setTimeout(() => textarea?.focus(), 0);
			}
		}
	});

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
		draftEmissionVersion += 1;
		adjustHeight();
		void emitDraftChange();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey && !isMobile()) {
			event.preventDefault();
			if (isGenerating) {
				queue();
				return;
			}
			send();
		}
	}

	function buildSendPayload(): SendPayload {
		return {
			message: message.trim(),
			attachmentIds: pendingAttachments.map((attachment) => attachment.artifact.id),
			attachments: pendingAttachmentArtifacts,
			pendingAttachments: pendingAttachments.map((attachment) => ({ ...attachment })),
			conversationId: resolvedConversationId
		};
	}

	function clearComposerAfterSubmit() {
		message = '';
		pendingAttachments = [];
		attachmentError = '';
		showToolsMenu = false;
		lastEmittedDraftKey = '';
		draftEmissionVersion += 1;
		adjustHeight();
		if (!isMobile()) {
			textarea?.focus();
		} else {
			textarea?.blur();
		}
	}

	function send() {
		if (!canSend || isGenerating) return;
		onSend?.(buildSendPayload());
		clearComposerAfterSubmit();
	}

	function queue() {
		if (!canQueue) return;
		onQueue?.(buildSendPayload());
		clearComposerAfterSubmit();
	}

	function stop() {
		onStop?.();
		showToolsMenu = false;
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
		showToolsMenu = false;
		fileInput?.click();
	}

	function toggleToolsMenu() {
		showToolsMenu = !showToolsMenu;
	}

	function closeToolsMenu() {
		showToolsMenu = false;
	}

	async function uploadFiles(files: FileList | null) {
		if (!files) return;
		uploadState = 'uploading';
		attachmentError = '';
		let preparingTimer: ReturnType<typeof setTimeout> | null = null;
		if (typeof window !== 'undefined') {
			preparingTimer = window.setTimeout(() => {
				uploadState = 'preparing';
			}, 900);
		}

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
				const payload = await uploadKnowledgeAttachment(file, targetConversationId);
				if (payload?.artifact) {
					const next = new Map(
						pendingAttachments.map((attachment) => [attachment.artifact.id, attachment])
					);
					next.set(payload.artifact.id, {
						artifact: payload.artifact,
						promptReady: Boolean(payload.promptReady),
						promptArtifactId:
							typeof payload.promptArtifactId === 'string' ? payload.promptArtifactId : null,
						readinessError:
							typeof payload.readinessError === 'string' && payload.readinessError.trim()
								? payload.readinessError
								: null,
					});
					pendingAttachments = Array.from(next.values());
					draftEmissionVersion += 1;
					void emitDraftChange();
				}
			}
		} catch (error) {
			attachmentError = error instanceof Error ? error.message : 'Failed to upload attachment.';
		} finally {
			if (preparingTimer) {
				clearTimeout(preparingTimer);
			}
			uploadState = 'idle';
			if (fileInput) fileInput.value = '';
		}
	}

	function removePendingAttachment(id: string) {
		pendingAttachments = pendingAttachments.filter((attachment) => attachment.artifact.id !== id);
		draftEmissionVersion += 1;
		void emitDraftChange();
	}

	function handleSteering(payload: TaskSteeringPayload) {
		onSteer?.(payload);
	}

	function handleManageEvidence() {
		onManageEvidence?.();
	}

	function editQueuedMessage() {
		onEditQueuedMessage?.();
		if (!isMobile()) {
			textarea?.focus();
		}
	}

	function deleteQueuedMessage() {
		onDeleteQueuedMessage?.();
		if (!isMobile()) {
			textarea?.focus();
		}
	}

	async function ensureDraftConversationId(): Promise<string | null> {
		if (resolvedConversationId) return resolvedConversationId;
		if (!ensureConversation) return null;
		if (!ensureDraftConversationPromise) {
			ensureDraftConversationPromise = ensureConversation()
				.then((id) => {
					resolvedConversationId = id;
					return id;
				})
				.finally(() => {
					ensureDraftConversationPromise = null;
				});
		}
		return ensureDraftConversationPromise;
	}

	async function emitDraftChange(force = false) {
		const emissionVersion = draftEmissionVersion;
		const nextMessage = message;
		const nextPendingAttachments = pendingAttachments.map((attachment) => ({ ...attachment }));
		const hasMeaningfulDraft = nextMessage.trim().length > 0 || nextPendingAttachments.length > 0;
		const draftConversationId = hasMeaningfulDraft
			? await ensureDraftConversationId()
			: resolvedConversationId;
		if (emissionVersion !== draftEmissionVersion) return;
		const payload = {
			conversationId: draftConversationId,
			draftText: nextMessage,
			selectedAttachmentIds: nextPendingAttachments.map((attachment) => attachment.artifact.id),
			selectedAttachments: nextPendingAttachments,
		};
		const key = JSON.stringify(payload);
		if (!force && key === lastEmittedDraftKey) return;
		lastEmittedDraftKey = key;
		onDraftChange?.(payload);
	}
</script>

<div class="relative flex w-full flex-col">
	<div class="message-composer flex min-h-[78px] flex-col rounded-[1.25rem] border border-border px-[10px] pt-[10px] pb-0 transition-all duration-150 focus-within:border-focus-ring">
		<input
			bind:this={fileInput}
			type="file"
			class="hidden"
			multiple
			onchange={(event) => uploadFiles((event.currentTarget as HTMLInputElement).files)}
		/>
		<textarea
			data-testid="message-input"
			bind:this={textarea}
			bind:value={message}
			oninput={handleInput}
			onkeydown={handleKeydown}
			placeholder="Type a message..."
			class="composer-textarea min-h-[90px] w-full resize-none overflow-y-auto border-0 bg-transparent px-[16px] py-[8px] text-left text-[14px] md:text-[15px] leading-[1.35] font-serif text-text-primary placeholder:font-sans placeholder:text-text-muted focus:outline-none focus:ring-0"
			rows="1"
		></textarea>

		{#if pendingAttachments.length > 0}
			<div class="flex flex-wrap gap-2 px-[16px] pb-2 pt-1">
				{#each pendingAttachments as attachment (attachment.artifact.id)}
					<FileAttachment
						attachment={attachment.artifact}
						variant="pending"
						removable={true}
						onRemove={(payload) => removePendingAttachment(payload.id)}
					/>
				{/each}
			</div>
		{/if}

		{#if hasQueuedMessage}
			<div
				data-testid="queued-message-banner"
				class="mx-[16px] mb-2 flex items-center justify-between gap-3 rounded-[1rem] border border-border-subtle bg-surface-page px-3 py-2"
			>
				<div class="min-w-0">
					<p class="text-[11px] font-sans font-medium uppercase tracking-[0.12em] text-text-muted">
						Queued next
					</p>
					<p class="truncate text-[13px] font-sans text-text-primary">
						{queuedMessagePreview || 'Next message queued.'}
					</p>
				</div>
				<div class="flex items-center gap-2">
					<button
						data-testid="delete-queued-button"
						type="button"
						class="rounded-full border border-border px-3 py-1 text-[12px] font-sans font-medium text-text-muted transition-colors duration-150 hover:bg-surface-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
						onclick={deleteQueuedMessage}
					>
						Delete
					</button>
					<button
						data-testid="edit-queued-button"
						type="button"
						class="rounded-full border border-border px-3 py-1 text-[12px] font-sans font-medium text-text-primary transition-colors duration-150 hover:bg-surface-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
						onclick={editQueuedMessage}
					>
						Edit
					</button>
				</div>
			</div>
		{/if}

		<div class="composer-actions flex items-center justify-between gap-3 pt-[4px] pb-[5px]">
			<div class="flex items-center gap-2">
				<div class="relative flex items-center">
					<button
						type="button"
						class="btn-icon-bare composer-icon flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center text-text-muted"
						onclick={toggleToolsMenu}
						aria-label="Open composer tools"
						aria-expanded={showToolsMenu}
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
							<line x1="12" x2="12" y1="5" y2="19" />
							<line x1="5" x2="19" y1="12" y2="12" />
						</svg>
					</button>

					{#if showToolsMenu}
						<ComposerToolsMenu
							{canAttach}
							{attachmentsEnabled}
							onClose={closeToolsMenu}
							onAttach={openFilePicker}
						/>
					{/if}
				</div>

				<ContextUsageRing
					{contextStatus}
					attachedArtifacts={composerArtifacts}
					{taskState}
					{contextDebug}
					onSteer={handleSteering}
					onManageEvidence={handleManageEvidence}
				/>
			</div>

			<div class="action-button-container flex min-h-[50px] items-center justify-end gap-2 flex-shrink-0">
				{#if isGenerating}
					{#if !hasQueuedMessage && canQueue}
						<button
							data-testid="queue-button"
							type="button"
							onclick={queue}
							aria-label="Queue next message"
							class="queue-button flex h-[50px] items-center justify-center rounded-[15px] border border-border bg-surface-page px-4 text-[13px] font-sans font-medium text-text-primary shadow-sm animate-in"
						>
							Queue
						</button>
					{/if}
					<button
						data-testid="stop-button"
						type="button"
						onclick={stop}
						aria-label="Stop generation"
						class="composer-stop-accent flex h-[50px] w-[50px] items-center justify-center rounded-[15px] shadow-sm animate-in"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
							<rect x="6" y="6" width="12" height="12" rx="2" />
						</svg>
					</button>
				{:else}
					<button
						data-testid="send-button"
						type="button"
						onclick={send}
						disabled={!canSend || disabled}
						aria-label="Send message"
						class="btn-primary composer-send flex h-[50px] w-[50px] items-center justify-center rounded-[15px] shadow-sm disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-elevated disabled:text-icon-muted animate-in"
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

	{#if isUploadingAttachment || attachmentError || attachmentReadinessErrors.length > 0}
		<div class="mt-2 flex flex-col gap-1 px-2 text-xs font-sans">
			{#if uploadState === 'uploading'}
				<span class="text-text-muted">Uploading file...</span>
			{:else if uploadState === 'preparing'}
				<span class="text-text-muted">Preparing file for chat...</span>
			{/if}
			{#if attachmentError}
				<span class="text-danger">{attachmentError}</span>
			{/if}
			{#each attachmentReadinessErrors as attachment (attachment.artifact.id)}
				<span class="text-danger">
					{attachment.artifact.name}: {attachment.readinessError}
				</span>
			{/each}
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
		align-self: center;
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

	.queue-button:hover {
		background: color-mix(in srgb, var(--surface-elevated) 82%, var(--surface-page) 18%);
	}

	.queue-button:focus-visible {
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
