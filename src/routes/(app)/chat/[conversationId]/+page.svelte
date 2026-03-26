<script lang="ts">
	import { writable } from 'svelte/store';
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { browser } from '$app/environment';
	import { currentConversationId } from '$lib/stores/ui';
	import { selectedModel } from '$lib/stores/settings';
	import MessageArea from '$lib/components/chat/MessageArea.svelte';
	import EvidenceManager from '$lib/components/chat/EvidenceManager.svelte';
	import MessageInput from '$lib/components/chat/MessageInput.svelte';
	import ErrorMessage from '$lib/components/chat/ErrorMessage.svelte';
	import type {
		ArtifactSummary,
		ChatMessage,
		ConversationDetail,
		ContextDebugState,
		ConversationContextStatus,
		TaskState,
		TaskSteeringPayload,
	} from '$lib/types';
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
	let contextStatus: ConversationContextStatus | null = data.contextStatus ?? null;
	let attachedArtifacts: ArtifactSummary[] = data.attachedArtifacts ?? [];
	let activeWorkingSet: ArtifactSummary[] = data.activeWorkingSet ?? [];
	let taskState: TaskState | null = data.taskState ?? null;
	let contextDebug: ContextDebugState | null = data.contextDebug ?? null;
	let evidenceManagerOpen = false;
	let bootstrapMode = data.bootstrap ?? false;
	let hydratingConversation = false;
	// Set to true when the stream was cancelled by the browser (e.g. mobile backgrounding)
	// rather than by the user tapping Stop. Triggers a data reload on visibility restore.
	let streamInterruptedByBackground = false;
	const evidencePollControllers = new Map<string, AbortController>();

	$: hasMessages = $messages.length > 0;
	$: isThinkingActive = Boolean($messages[$messages.length - 1]?.isThinkingStreaming);

	function maybeSendPendingInitialMessage() {
		if (typeof window === 'undefined' || isSending || (data.messages?.length ?? 0) > 0) {
			return;
		}

		const storageKey = `${PENDING_MESSAGE_PREFIX}${data.conversation.id}`;
		const pendingDraft = window.sessionStorage.getItem(storageKey);
		if (!pendingDraft) {
			return;
		}

		window.sessionStorage.removeItem(storageKey);
		let message = '';
		let attachmentIds: string[] = [];
		let attachments: ArtifactSummary[] = [];
		try {
			const parsed = JSON.parse(pendingDraft) as {
				message?: string;
				attachmentIds?: string[];
				attachments?: ArtifactSummary[];
			};
			message = typeof parsed.message === 'string' ? parsed.message : '';
			attachmentIds = Array.isArray(parsed.attachmentIds)
				? parsed.attachmentIds.filter((id): id is string => typeof id === 'string')
				: [];
			attachments = Array.isArray(parsed.attachments)
				? parsed.attachments.filter((artifact): artifact is ArtifactSummary => typeof artifact?.id === 'string')
				: [];
		} catch {
			message = pendingDraft;
		}
		if (!message.trim()) {
			return;
		}
		handleSend(
			new CustomEvent('send', {
				detail: { message, attachmentIds, attachments }
			})
		);
	}

	function resetState() {
		for (const controller of evidencePollControllers.values()) {
			controller.abort();
		}
		evidencePollControllers.clear();
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
		contextStatus = data.contextStatus ?? null;
		attachedArtifacts = data.attachedArtifacts ?? [];
		activeWorkingSet = data.activeWorkingSet ?? [];
		taskState = data.taskState ?? null;
		contextDebug = data.contextDebug ?? null;
		bootstrapMode = data.bootstrap ?? false;
		hydratingConversation = false;
		evidenceManagerOpen = false;
		currentConversationId.set(data.conversation.id);
		maybeSendPendingInitialMessage();
		if (bootstrapMode) {
			void hydrateConversationDetail(data.conversation.id);
		}
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

	function handleVisibilityChange() {
		if (document.visibilityState === 'visible' && streamInterruptedByBackground) {
			streamInterruptedByBackground = false;
			invalidateAll();
		}
	}

	onMount(() => {
		currentConversationId.set(data.conversation.id);
		document.addEventListener('visibilitychange', handleVisibilityChange);
	});

	onDestroy(() => {
		if (browser) document.removeEventListener('visibilitychange', handleVisibilityChange);
		for (const controller of evidencePollControllers.values()) {
			controller.abort();
		}
		evidencePollControllers.clear();

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

	async function hydrateConversationDetail(conversationId: string) {
		if (hydratingConversation) return;
		hydratingConversation = true;

		try {
			const response = await fetch(`/api/conversations/${conversationId}`);
			if (!response.ok) return;

			const payload = (await response.json()) as ConversationDetail;
			attachedArtifacts = payload.attachedArtifacts ?? attachedArtifacts;
			activeWorkingSet = payload.activeWorkingSet ?? activeWorkingSet;
			contextStatus = payload.contextStatus ?? contextStatus;
			taskState = payload.taskState ?? taskState;
			contextDebug = payload.contextDebug ?? contextDebug;
			bootstrapMode = false;

			if (!activeStream && $messages.length === 0 && (payload.messages?.length ?? 0) > 0) {
				messages.set(payload.messages ?? []);
				hasPersistedMessages = true;
			}
		} catch {
			// Ignore hydration failures; the optimistic chat flow can continue without it.
		} finally {
			hydratingConversation = false;
		}
	}

	function patchMessage(messageId: string, updater: (message: ChatMessage) => ChatMessage) {
		messages.update((list) => list.map((message) => (message.id === messageId ? updater(message) : message)));
	}

	async function pollMessageEvidence(messageId: string) {
		evidencePollControllers.get(messageId)?.abort();
		const controller = new AbortController();
		evidencePollControllers.set(messageId, controller);

		const attempts = 12;
		for (let attempt = 0; attempt < attempts; attempt += 1) {
			if (controller.signal.aborted) return;

			try {
				const response = await fetch(
					`/api/conversations/${data.conversation.id}/messages/${messageId}/evidence`,
					{ signal: controller.signal }
				);

				if (response.status === 202) {
					await new Promise((resolve) => setTimeout(resolve, attempt < 4 ? 250 : 500));
					continue;
				}

				if (response.status === 204 || response.status === 404) {
					patchMessage(messageId, (message) => ({
						...message,
						evidencePending: false,
					}));
					return;
				}

				if (!response.ok) {
					break;
				}

				const payload = (await response.json()) as {
					evidenceSummary?: ChatMessage['evidenceSummary'];
				};
				patchMessage(messageId, (message) => ({
					...message,
					evidenceSummary: payload.evidenceSummary,
					evidencePending: false,
				}));
				return;
			} catch (error) {
				if ((error as Error).name === 'AbortError') {
					return;
				}
				break;
			}
		}

		patchMessage(messageId, (message) => ({
			...message,
			evidencePending: false,
		}));
	}

	function handleSend(
		event: CustomEvent<{ message: string; attachmentIds: string[]; attachments: ArtifactSummary[] }>,
		skipUserMessage = false,
		skipPersistUserMessage = false
	) {
		const text = event.detail.message;
		const attachmentIds = event.detail.attachmentIds ?? [];
		const newAttachments = event.detail.attachments ?? [];
		if (!text.trim() || isSending) return;

		sendError = null;
		isSending = true;
		lastUserMessage = text;
		canRetry = true;
		hasPersistedMessages = true;
		if (newAttachments.length > 0) {
			const merged = new Map(attachedArtifacts.map((artifact) => [artifact.id, artifact]));
			for (const attachment of newAttachments) {
				merged.set(attachment.id, attachment);
			}
			attachedArtifacts = Array.from(merged.values());
		}
		upsertConversationLocal(data.conversation.id, data.conversation.title, Date.now() / 1000);

		const placeholderId = crypto.randomUUID();
		const placeholder: ChatMessage = {
			id: placeholderId,
			role: 'assistant',
			content: '',
			timestamp: Date.now(),
			isStreaming: true
		};

		let clientUserMsgId: string | null = null;
		if (skipUserMessage) {
			messages.update((msgs) => [...msgs, placeholder]);
		} else {
			clientUserMsgId = crypto.randomUUID();
			const userMsg: ChatMessage = {
				id: clientUserMsgId,
				role: 'user',
				content: text,
				attachments: attachedArtifacts
					.filter((artifact) => attachmentIds.includes(artifact.id))
					.map((artifact) => ({
						id: artifact.id,
						artifactId: artifact.id,
						name: artifact.name,
						type: artifact.type,
						mimeType: artifact.mimeType,
						sizeBytes: artifact.sizeBytes,
						conversationId: artifact.conversationId,
						messageId: null,
						createdAt: artifact.createdAt
					})),
				timestamp: Date.now()
			};
			messages.update((msgs) => [...msgs, userMsg, placeholder]);
		}

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
						msgs.map((m) => {
							if (m.id !== placeholderId) return m;
							const segs = m.thinkingSegments ?? [];
							const last = segs[segs.length - 1];
							const newSegs = last?.type === 'text'
								? [...segs.slice(0, -1), { type: 'text' as const, content: last.content + chunk }]
								: [...segs, { type: 'text' as const, content: chunk }];
							return {
								...m,
								thinking: (m.thinking ?? '') + chunk,
								thinkingSegments: newSegs,
								isThinkingStreaming: true
							};
						})
					);
				},
				onToolCall(name, input, status, details) {
					messages.update((msgs) =>
						msgs.map((m) => {
							if (m.id !== placeholderId) return m;
							const segs = m.thinkingSegments ?? [];
							if (status === 'running') {
								return {
									...m,
									thinkingSegments: [
										...segs,
										{ type: 'tool_call' as const, name, input, status: 'running' as const }
									]
								};
							}
							const updated = [...segs];
							let lastRunningIdx = -1;
							for (let i = updated.length - 1; i >= 0; i--) {
								const s = updated[i];
								if (s.type === 'tool_call' && s.name === name && s.status === 'running') {
									lastRunningIdx = i;
									break;
								}
							}
							if (lastRunningIdx !== -1) {
								// Preserve the original input stored at TOOL_START — the TOOL_END
								// payload only carries the name, so `input` here is always {}.
								updated[lastRunningIdx] = {
									...updated[lastRunningIdx],
									status: 'done' as const,
									outputSummary: details?.outputSummary ?? null,
									sourceType: details?.sourceType ?? null,
									candidates: details?.candidates,
								};
							}
							return { ...m, thinkingSegments: updated };
						})
					);
				},
				onEnd(_fullText, metadata) {
					lastAssistantResponse = _fullText;
					contextStatus = metadata?.contextStatus ?? contextStatus;
					activeWorkingSet = metadata?.activeWorkingSet ?? activeWorkingSet;
					taskState = metadata?.taskState ?? taskState;
					contextDebug = metadata?.contextDebug ?? contextDebug;
					const serverAssistantId = metadata?.assistantMessageId;
					const serverUserMsgId = metadata?.userMessageId;
					messages.update((msgs) => {
						return msgs.map((m) => {
							if (m.id === placeholderId) {
								return {
									...m,
								id: serverAssistantId ?? m.id,
								content: metadata?.wasStopped ? m.content || 'Stopped' : m.content,
								isStreaming: false,
								thinking: metadata?.thinking ?? m.thinking,
								isThinkingStreaming: false,
								modelDisplayName: metadata?.modelDisplayName ?? m.modelDisplayName,
								thinkingTokenCount: metadata?.thinkingTokenCount,
								responseTokenCount: metadata?.responseTokenCount,
								totalTokenCount: metadata?.totalTokenCount,
								evidenceSummary: m.evidenceSummary,
								evidencePending: Boolean(serverAssistantId),
								};
							}
							if (clientUserMsgId && m.id === clientUserMsgId && serverUserMsgId) {
								return { ...m, id: serverUserMsgId };
							}
							return m;
						});
					});
					isSending = false;
					activeStream = null;
					canRetry = false;
					if (serverAssistantId) {
						void pollMessageEvidence(serverAssistantId);
					}

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
					activeStream = null;
					isSending = false;

					// Detect browser-initiated abort (mobile backgrounding / connection drop).
					// The server continues generating and persists the result; reload on return.
					const isBrowserAbort =
						err.name === 'AbortError' && browser && document.visibilityState === 'hidden';
					if (isBrowserAbort) {
						streamInterruptedByBackground = true;
						return;
					}

					sendError = toFriendlySendError(err);
					canRetry = true;
				}
			},
			$selectedModel,
			skipPersistUserMessage,
			attachmentIds
		);
	}

	function handleRetry() {
		if (canRetry && lastUserMessage) {
			sendError = null;
			const retryEvent = new CustomEvent('send', {
				detail: { message: lastUserMessage, attachmentIds: [], attachments: [] }
			});
			handleSend(retryEvent);
		}
	}

	function handleRegenerate(event: CustomEvent<{ messageId: string }>) {
		if (isSending) return;
		const { messageId } = event.detail;
		const msgs = $messages;
		const assistantIdx = msgs.findIndex((m) => m.id === messageId);
		if (assistantIdx === -1) return;

		// Find the user message immediately before this assistant message
		const userIdx = assistantIdx - 1;
		if (userIdx < 0 || msgs[userIdx].role !== 'user') return;

		const userText = msgs[userIdx].content;
		const idsToDelete = msgs.slice(assistantIdx).map((m) => m.id);

		// Remove the assistant message(s) from in-memory state
		messages.update((m) => m.slice(0, assistantIdx));

		// Delete from DB (fire-and-forget, non-critical)
		fetch(`/api/conversations/${data.conversation.id}/messages`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ messageIds: idsToDelete })
		}).catch(() => {});

		sendError = null;
		handleSend(
			new CustomEvent('send', { detail: { message: userText, attachmentIds: [], attachments: [] } }),
			true,
			true
		);
	}

	function handleEdit(event: CustomEvent<{ messageId: string; newText: string }>) {
		if (isSending) return;
		const { messageId, newText } = event.detail;
		const msgs = $messages;
		const editIdx = msgs.findIndex((m) => m.id === messageId);
		if (editIdx === -1) return;

		const idsToDelete = msgs.slice(editIdx).map((m) => m.id);

		// Remove all messages from the edited one onwards
		messages.update((m) => m.slice(0, editIdx));

		// Delete from DB (fire-and-forget, non-critical)
		fetch(`/api/conversations/${data.conversation.id}/messages`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ messageIds: idsToDelete })
		}).catch(() => {});

		sendError = null;
		handleSend(new CustomEvent('send', { detail: { message: newText, attachmentIds: [], attachments: [] } }));
	}

	function handleStop() {
		if (activeStream) {
			activeStream.abort();
			// The stream will trigger onEnd via the abort controller
		}
	}

	async function handleSteering(event: CustomEvent<TaskSteeringPayload>) {
		const response = await fetch(`/api/conversations/${data.conversation.id}/task-steering`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(event.detail),
		});

		if (!response.ok) {
			return;
		}

		const payload = await response.json();
		taskState = payload.taskState ?? taskState;
		contextDebug = payload.contextDebug ?? contextDebug;
	}

	function openEvidenceManager() {
		evidenceManagerOpen = true;
	}

	function closeEvidenceManager() {
		evidenceManagerOpen = false;
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
			<MessageArea
				messages={$messages}
				conversationId={data.conversation.id}
				isThinkingActive={isThinkingActive}
				{contextDebug}
				on:regenerate={handleRegenerate}
				on:edit={handleEdit}
				on:steer={handleSteering}
			/>
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

					<MessageInput
						on:send={handleSend}
					on:stop={handleStop}
					disabled={isSending}
					isGenerating={isSending}
					maxLength={data.maxMessageLength}
					conversationId={data.conversation.id}
					{contextStatus}
					{attachedArtifacts}
					{taskState}
					{contextDebug}
					attachmentsEnabled={true}
					on:steer={handleSteering}
					on:manageEvidence={openEvidenceManager}
				/>
			</div>
		</div>
	</div>

	<EvidenceManager
		open={evidenceManagerOpen}
		{contextDebug}
		on:close={closeEvidenceManager}
		on:steer={handleSteering}
	/>
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
