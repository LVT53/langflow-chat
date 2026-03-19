<script lang="ts">
	import { writable } from 'svelte/store';
	import { onMount, onDestroy } from 'svelte';
	import { currentConversationId } from '$lib/stores/ui';
	import { selectedModel } from '$lib/stores/settings';
	import MessageArea from '$lib/components/chat/MessageArea.svelte';
	import MessageInput from '$lib/components/chat/MessageInput.svelte';
	import ErrorMessage from '$lib/components/chat/ErrorMessage.svelte';
	import type { ChatMessage } from '$lib/types';
	import type { PageData } from './$types';
	import { streamChat } from '$lib/services/streaming';
	import type { StreamHandle } from '$lib/services/streaming';
	import {
		removeConversationLocal,
		updateConversationTitleLocal,
		upsertConversationLocal
	} from '$lib/stores/conversations';

	export let data: PageData;
	const PENDING_MESSAGE_PREFIX = 'pending-chat-message:';

	const messages = writable<ChatMessage[]>(data.messages ?? []);
	let sendError: string | null = null;
	let isSending = false;
	let activeStream: StreamHandle | null = null;
	let titleGenerationTriggered = false;
	let lastUserMessage = '';
	let lastAssistantResponse = '';
	let canRetry = false;
	let prevConversationId: string | null = null;
	let hasPersistedMessages = (data.messages?.length ?? 0) > 0;

	$: hasMessages = $messages.length > 0;

	function maybeSendPendingInitialMessage() {
		if (typeof window === 'undefined' || isSending || (data.messages?.length ?? 0) > 0) {
			return;
		}

		const storageKey = `${PENDING_MESSAGE_PREFIX}${data.conversation.id}`;
		const pendingMessage = window.sessionStorage.getItem(storageKey);
		if (!pendingMessage?.trim()) {
			return;
		}

		window.sessionStorage.removeItem(storageKey);
		handleSend(
			new CustomEvent('send', {
				detail: { message: pendingMessage }
			})
		);
	}

	function resetState() {
		if (activeStream) {
			activeStream.abort();
			activeStream = null;
		}
		messages.set(data.messages ?? []);
		hasPersistedMessages = (data.messages?.length ?? 0) > 0;
		sendError = null;
		isSending = false;
		titleGenerationTriggered = false;
		lastUserMessage = '';
		lastAssistantResponse = '';
		canRetry = false;
		currentConversationId.set(data.conversation.id);
		maybeSendPendingInitialMessage();
	}

	$: if (data?.conversation?.id && !activeStream) {
		if (data.conversation.id !== prevConversationId) {
			prevConversationId = data.conversation.id;
			resetState();
		}
	}

	const FRIENDLY_SEND_ERRORS = {
		timeout: 'The response is taking too long. Please try again.',
		network: 'We could not reach the chat service. Check your connection and try again.',
		backend_failure: 'We hit a temporary issue generating a response. Please try again.'
	} as const;

	function toFriendlySendError(error: Error): string {
		const errorWithCode = error as Error & { code?: unknown };
		if (errorWithCode.code === 'timeout') return FRIENDLY_SEND_ERRORS.timeout;
		if (errorWithCode.code === 'network') return FRIENDLY_SEND_ERRORS.network;
		if (errorWithCode.code === 'backend_failure') return FRIENDLY_SEND_ERRORS.backend_failure;

		const message = (error.message ?? '').toLowerCase();
		if (message.includes('timeout') || message.includes('timed out')) {
			return FRIENDLY_SEND_ERRORS.timeout;
		}

		if (
			message.includes('network') ||
			message.includes('failed to fetch') ||
			message.includes('fetch') ||
			message.includes('connection')
		) {
			return FRIENDLY_SEND_ERRORS.network;
		}

		return FRIENDLY_SEND_ERRORS.backend_failure;
	}

	onMount(() => {
		currentConversationId.set(data.conversation.id);
	});

	onDestroy(() => {
		if (activeStream) {
			activeStream.abort();
			activeStream = null;
		}

		if (!hasPersistedMessages && data?.conversation?.id) {
			removeConversationLocal(data.conversation.id);
			fetch(`/api/conversations/${data.conversation.id}`, {
				method: 'DELETE',
				keepalive: true
			}).catch(() => {
				// Ignore cleanup failures; draft conversations are filtered from the sidebar anyway.
			});
		}
	});

	function handleSend(event: CustomEvent<{ message: string }>) {
		const text = event.detail.message;
		if (!text.trim() || isSending) return;

		sendError = null;
		isSending = true;
		lastUserMessage = text;
		canRetry = true;
		hasPersistedMessages = true;
		upsertConversationLocal(data.conversation.id, data.conversation.title, Date.now() / 1000);

		const userMsg: ChatMessage = {
			id: crypto.randomUUID(),
			role: 'user',
			content: text,
			timestamp: Date.now()
		};

		const placeholderId = crypto.randomUUID();
		const placeholder: ChatMessage = {
			id: placeholderId,
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			isStreaming: true
		};

		messages.update((msgs) => [...msgs, userMsg, placeholder]);

		activeStream = streamChat(
			text,
			data.conversation.id,
			{
				onToken(chunk) {
					messages.update((msgs) =>
						msgs.map((m) =>
							m.id === placeholderId
								? {
										...m,
										content: m.content + chunk,
										isThinkingStreaming: false
									}
								: m
						)
					);
				},
				onThinking(chunk) {
					messages.update((msgs) =>
						msgs.map((m) =>
							m.id === placeholderId
								? {
										...m,
										thinking: (m.thinking ?? '') + chunk,
										isThinkingStreaming: true
									}
								: m
						)
					);
				},
				onEnd(_fullText, metadata) {
					lastAssistantResponse = _fullText;
					messages.update((msgs) => {
						return msgs.map((m) =>
							m.id === placeholderId
								? {
										...m,
										content: metadata?.wasStopped ? m.content || 'Stopped' : m.content,
										isStreaming: false,
										thinking: metadata?.thinking ?? m.thinking,
										isThinkingStreaming: false,
										thinkingTokenCount: metadata?.thinkingTokenCount,
										responseTokenCount: metadata?.responseTokenCount,
										totalTokenCount: metadata?.totalTokenCount
									}
								: m
						);
					});
					isSending = false;
					activeStream = null;
					canRetry = false;

					// Trigger title generation for new conversations (fire-and-forget)
					if (!titleGenerationTriggered && data.conversation.title === 'New Conversation') {
						titleGenerationTriggered = true;
						const conversationIdForTitle = data.conversation.id;
						fetch(`/api/conversations/${conversationIdForTitle}/title`, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json'
							},
							body: JSON.stringify({
								userMessage: lastUserMessage,
								assistantResponse: lastAssistantResponse
							})
						}).then(async (res) => {
							if (res.ok) {
								const result = await res.json();
								if (typeof result.title === 'string' && result.title.trim().length > 0) {
									updateConversationTitleLocal(conversationIdForTitle, result.title);
								}
							}
						}).catch(() => {
							// Ignore errors, title remains "New conversation"
						});
					}
				},
				onError(err) {
					messages.update((msgs) => msgs.filter((m) => m.id !== placeholderId));
					sendError = toFriendlySendError(err);
					isSending = false;
					activeStream = null;
					canRetry = true;
				}
			},
			$selectedModel
		);
	}

	function handleRetry() {
		if (canRetry && lastUserMessage) {
			sendError = null;
			const retryEvent = new CustomEvent('send', {
				detail: { message: lastUserMessage }
			});
			handleSend(retryEvent);
		}
	}

	function handleStop() {
		if (activeStream) {
			activeStream.abort();
			// The stream will trigger onEnd via the abort controller
		}
	}

	function handleErrorClose() {
		sendError = null;
	}
</script>

<svelte:head>
	<title>{data.conversation.title}</title>
</svelte:head>

<div class="chat-page flex h-full min-w-0 flex-col bg-surface-page">
	<div class="chat-stage relative flex min-h-0 flex-1 overflow-hidden rounded-lg" class:chat-stage-active={hasMessages}>
		<div class="message-layer min-h-0 flex-1" class:message-layer-active={hasMessages}>
			<MessageArea messages={$messages} conversationId={data.conversation.id} />
		</div>

		<div class="composer-layer" class:composer-layer-active={hasMessages}>
			<div class="mx-auto flex w-full max-w-[780px] flex-col gap-4 px-1">
				<div class="intro-copy px-2 text-center" class:intro-copy-hidden={hasMessages}>
					<h1
						class="text-balance text-[2rem] font-serif font-medium tracking-[-0.05em] md:text-[3rem]"
							style="color: color-mix(in srgb, var(--text-primary) 60%, var(--accent) 40%); font-weight: 500;"
						>
						What can I help you with?
					</h1>
				</div>

				{#if sendError}
					<ErrorMessage error={sendError} onRetry={handleRetry} onClose={handleErrorClose} />
				{/if}

				<MessageInput on:send={handleSend} on:stop={handleStop} disabled={isSending} isGenerating={isSending} maxLength={data.maxMessageLength} />
			</div>
		</div>
	</div>
</div>

<style>
	.message-layer {
		opacity: 0;
		transform: translateY(18px);
		pointer-events: none;
		transition:
			opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
			transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.message-layer-active {
		opacity: 1;
		transform: translateY(0);
		pointer-events: auto;
	}

	.composer-layer {
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		transform: translateY(-50%);
		transition:
			top 320ms cubic-bezier(0.22, 1, 0.36, 1),
			transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.composer-layer-active {
		top: 100%;
		transform: translateY(calc(-100% - max(1.5rem, env(safe-area-inset-bottom))));
	}

	.intro-copy {
		max-height: 10rem;
		opacity: 1;
		transform: translateY(0);
		transition:
			opacity 220ms cubic-bezier(0.22, 1, 0.36, 1),
			transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
			max-height 240ms cubic-bezier(0.22, 1, 0.36, 1),
			margin 240ms cubic-bezier(0.22, 1, 0.36, 1);
	}

	.intro-copy-hidden {
		max-height: 0;
		margin: 0;
		opacity: 0;
		transform: translateY(-12px);
		overflow: hidden;
		pointer-events: none;
	}
</style>
