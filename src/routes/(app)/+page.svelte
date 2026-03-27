<script lang="ts">
	import { goto } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import {
		cleanupPreparedConversation,
		consumePreviousConversationId,
		createConversationDraftRecord,
		getLandingDraftConversationId,
		setLandingDraftConversationId,
		storePendingConversationMessage,
	} from '$lib/client/conversation-session';
	import { fetchConversationDetail } from '$lib/client/api/conversations';
	import { createNewConversation, upsertConversationLocal } from '$lib/stores/conversations';
	import { currentConversationId } from '$lib/stores/ui';
	import MessageInput from '$lib/components/chat/MessageInput.svelte';
	import { onMount } from 'svelte';
	import type {
		ArtifactSummary,
		ConversationDraft,
		PendingAttachment,
	} from '$lib/types';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type MessageInputSendPayload = {
		message: string;
		attachmentIds: string[];
		attachments: ArtifactSummary[];
		conversationId: string | null;
	};

	type MessageInputDraftPayload = {
		conversationId: string | null;
		draftText: string;
		selectedAttachmentIds: string[];
		selectedAttachments: PendingAttachment[];
	};

	let hasStarted = $state(false);
	let creating = $state(false);
	let error = $state<string | null>(null);
	let isFromChat = $state(false);
	let animateIn = $state(false);
	let preparedConversationId = $state<string | null>(null);
	let preparedConversationPromise: Promise<string> | null = null;
	let conversationDraft = $state<ConversationDraft | null>(null);

	onMount(() => {
		const previousId = consumePreviousConversationId();
		if (previousId) {
			isFromChat = true;
			setTimeout(() => {
				animateIn = true;
			}, 50);
		} else {
			animateIn = true;
		}

		const storedConversationId = getLandingDraftConversationId();
		if (storedConversationId) {
			preparedConversationId = storedConversationId;
			void loadPreparedDraft(storedConversationId);
		}
	});

	async function ensurePreparedConversation(): Promise<string> {
		if (preparedConversationId) {
			return preparedConversationId;
		}
		if (!preparedConversationPromise) {
			preparedConversationPromise = createNewConversation().then((id) => {
				preparedConversationId = id;
				setLandingDraftConversationId(id);
				return id;
			}).finally(() => {
				preparedConversationPromise = null;
			});
		}
		return preparedConversationPromise;
	}

	async function handleSend(payload: MessageInputSendPayload) {
		if (creating) return;
		const text = payload.message;

		hasStarted = true;
		creating = true;
		error = null;

		try {
			const id = payload.conversationId ?? await ensurePreparedConversation();
			currentConversationId.set(id);
			upsertConversationLocal(id, 'New Conversation', Date.now() / 1000);
			setLandingDraftConversationId(null);
			storePendingConversationMessage(id, {
				message: text,
				attachmentIds: payload.attachmentIds,
				attachments: payload.attachments,
			});
			await goto(`/chat/${id}`);
		} catch {
			error = 'Failed to create conversation. Please try again.';
			hasStarted = false;
		} finally {
			creating = false;
		}
	}

	async function loadPreparedDraft(conversationId: string) {
		try {
			const payload = await fetchConversationDetail(conversationId);
			conversationDraft = payload.draft ?? null;
		} catch {
			preparedConversationId = null;
			setLandingDraftConversationId(null);
		}
	}

	function handleDraftChange(payload: MessageInputDraftPayload) {
		const nextDraft = createConversationDraftRecord({
			conversationId: payload.conversationId,
			fallbackConversationId: preparedConversationId,
			draftText: payload.draftText,
			selectedAttachmentIds: payload.selectedAttachmentIds,
			selectedAttachments: payload.selectedAttachments,
		});
		const stalePreparedConversationId =
			(payload.conversationId ?? preparedConversationId) ?? null;

		if (!nextDraft) {
			conversationDraft = null;
			preparedConversationId = null;
			setLandingDraftConversationId(null);
			if (stalePreparedConversationId) {
				cleanupPreparedConversation({
					conversationId: stalePreparedConversationId,
				});
			}
			return;
		}

		conversationDraft = nextDraft;
		if (nextDraft.conversationId !== 'draft') {
			preparedConversationId = nextDraft.conversationId;
			setLandingDraftConversationId(nextDraft.conversationId);
		}
	}
</script>

<svelte:head>
	<title>Alfy AI</title>
</svelte:head>

<div class="chat-page flex h-full min-w-0 flex-col bg-surface-page">
	<div class="chat-stage relative flex min-h-0 flex-1 overflow-hidden rounded-lg">
		<div class="composer-layer" class:composer-layer-animate={isFromChat && animateIn} class:composer-layer-no-animate={!isFromChat}>
			<div class="mx-auto flex w-full max-w-[780px] flex-col gap-4 px-1">
				{#if !hasStarted}
					<div class="intro-copy px-2 text-center" in:fade={{ duration: isFromChat ? 400 : 0, delay: isFromChat ? 100 : 0 }}>
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

				{#if creating}
					<div class="creating-indicator" transition:fade={{ duration: 150 }}>
						<div class="spinner"></div>
						<span class="text-sm text-text-muted">Creating conversation...</span>
					</div>
				{/if}

				<MessageInput
					onSend={handleSend}
					onDraftChange={handleDraftChange}
					disabled={creating}
					maxLength={data.maxMessageLength}
					conversationId={preparedConversationId}
					contextStatus={null}
					attachedArtifacts={[]}
					taskState={null}
					contextDebug={null}
					draftText={conversationDraft?.draftText ?? ''}
					draftAttachments={conversationDraft?.selectedAttachments ?? []}
					draftVersion={conversationDraft?.updatedAt ?? 0}
					attachmentsEnabled={true}
					ensureConversation={ensurePreparedConversation}
				/>
			</div>
		</div>
	</div>
</div>

<style>
	.composer-layer {
		position: absolute;
		left: 0;
		right: 0;
		top: 100%;
		transform: translateY(0);
		opacity: 0;
		transition:
			top 420ms cubic-bezier(0.22, 1, 0.36, 1),
			transform 420ms cubic-bezier(0.22, 1, 0.36, 1),
			opacity 320ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	/* No animation - directly at center (for direct navigation to landing) */
	.composer-layer-no-animate {
		top: 50%;
		transform: translateY(-50%);
		opacity: 1;
		transition: none;
	}

	/* Animation class - animates from bottom (100%) to center (50%) */
	.composer-layer-animate {
		top: 50%;
		transform: translateY(-50%);
		opacity: 1;
	}

	/* On mobile the header (52px) shifts the available area down, making top:50%
	   land 26px below the true screen center. Compensate by nudging up. */
	@media (max-width: 767px) {
		.composer-layer-no-animate,
		.composer-layer-animate {
			top: calc(50% - 26px);
		}
	}

	.intro-copy {
		/* Uses Svelte transitions instead of CSS classes */
	}

	.creating-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-sm);
		padding: var(--space-md);
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid var(--border-default);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
