<script lang="ts">
	import { writable } from 'svelte/store';
	import { onMount, onDestroy, tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { goto, invalidateAll, replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import {
		cleanupPreparedConversation,
		consumePendingConversationMessage,
		createConversationDraftRecord,
		createDraftPersistence,
		hasMeaningfulDraft,
	} from '$lib/client/conversation-session';
	import {
		applyTaskSteering,
		deleteConversationMessages,
		fetchConversationDetail,
		fetchMessageEvidence,
		generateConversationTitle,
	} from '$lib/client/api/conversations';
	import { recordDocumentWorkspaceOpen } from '$lib/client/api/knowledge';
	import { currentConversationId } from '$lib/stores/ui';
	import { selectedModel } from '$lib/stores/settings';
	import EvidenceManager from '$lib/components/chat/EvidenceManager.svelte';
	import type {
		ArtifactSummary,
		ChatGeneratedFile,
		ChatGeneratedFileListItem,
		ChatMessage,
		ConversationDraft,
		ContextDebugState,
		ConversationContextStatus,
		DocumentWorkspaceItem,
		TaskState,
		TaskSteeringPayload,
	} from '$lib/types';
	import type { PageProps } from './$types';
	import { streamChat, checkForOrphanedStream } from '$lib/services/streaming';
	import type { StreamHandle } from '$lib/services/streaming';
	import { inferGeneratedFilenameFromToolInput } from '$lib/utils/generate-file-tool';
	import {
		buildChatSourceMessageHref,
		clearChatFocusMessageParam,
		getChatFocusMessageIdFromUrl,
	} from '$lib/client/document-workspace-navigation';
	import {
		removeConversationLocal,
		updateConversationTitleLocal,
		upsertConversationLocal
	} from '$lib/stores/conversations';
	import ChatComposerPanel from './_components/ChatComposerPanel.svelte';
	import ChatMessagePane from './_components/ChatMessagePane.svelte';
	import DropZoneOverlay from '$lib/components/chat/DropZoneOverlay.svelte';
	import DocumentWorkspace from '$lib/components/chat/DocumentWorkspace.svelte';
	import {
		appendAssistantPlaceholder,
		appendThinkingChunkToMessageList,
		appendTokenChunkToMessageList,
		appendUserMessageAndPlaceholder,
		applyToolCallUpdateToMessageList,
		createAssistantPlaceholder,
		createUserMessage,
		finalizeStreamingMessageList,
		mergeAttachedArtifacts,
		removeMessageById,
		toFriendlySendError,
		updateMessageById,
		type DraftChangePayload,
		type MessageEditPayload,
		type MessageRegeneratePayload,
		type SendPayload,
	} from './_helpers';

	let { data }: PageProps = $props();
	const getData = () => data;
	const initialMessages = getData().messages ?? [];
	const initialHasPersistedMessages = initialMessages.length > 0;
	const initialContextStatus = getData().contextStatus ?? null;
	const initialAttachedArtifacts = getData().attachedArtifacts ?? [];
	const initialActiveWorkingSet = getData().activeWorkingSet ?? [];
	const initialTaskState = getData().taskState ?? null;
	const initialContextDebug = getData().contextDebug ?? null;
	const initialConversationDraft = getData().draft ?? null;
	const initialBootstrapMode = getData().bootstrap ?? false;
	const initialGeneratedFiles = getData().generatedFiles ?? [];

	// Track conversation title reactively - use $derived to keep in sync with page data
	let conversationTitle = $derived(data.conversation.title);

	// For manual updates (title generation), track separately
	let generatedTitleOverride = $state<string | null>(null);
	let effectiveConversationTitle = $derived(generatedTitleOverride ?? conversationTitle);

	const messages = writable<ChatMessage[]>(initialMessages);
	const draftPersistence = createDraftPersistence();
	let sendError = $state<string | null>(null);
	let isSending = $state(false);
	let activeStream = $state<StreamHandle | null>(null);
	let queuedTurn = $state<SendPayload | null>(null);
	let titleGenerationTriggered = false;
	let lastUserMessage = '';
	let lastAssistantResponse = '';
	let canRetry = false;
	let prevConversationId: string | null = null;
	let hasPersistedMessages = initialHasPersistedMessages;
	let contextStatus = $state<ConversationContextStatus | null>(initialContextStatus);
	let attachedArtifacts = $state<ArtifactSummary[]>(initialAttachedArtifacts);
	let activeWorkingSet: ArtifactSummary[] = initialActiveWorkingSet;
	let taskState = $state<TaskState | null>(initialTaskState);
	let contextDebug = $state<ContextDebugState | null>(initialContextDebug);
	let conversationDraft = $state<ConversationDraft | null>(initialConversationDraft);
	let generatedFiles = $state<ChatGeneratedFile[]>(initialGeneratedFiles);
	let pendingGeneratedFiles = $state<ChatGeneratedFileListItem[]>([]);
	let workspaceDocuments = $state<DocumentWorkspaceItem[]>([]);
	let activeWorkspaceDocumentId = $state<string | null>(null);
	let workspaceOpen = $state(false);
	let evidenceManagerOpen = $state(false);
	let bootstrapMode = initialBootstrapMode;
	let hydratingConversation = false;
	// Set to true when the stream was cancelled by the browser (e.g. mobile backgrounding)
	// rather than by the user tapping Stop. Triggers a data reload on visibility restore.
	let streamInterruptedByBackground = false;
	// Set to true when we're waiting for the initial pending message to be sent (landing page transition)
	let initialStreamPending = $state(false);
	const evidencePollControllers = new Map<string, AbortController>();

	let isThinkingActive = $derived(Boolean($messages[$messages.length - 1]?.isThinkingStreaming));
	// Show loading state when waiting for the first response (either from pending message or new send)
	let showInitialLoading = $derived((isSending || initialStreamPending) && $messages.length === 0);
	let generatedFileCards = $derived([
		...generatedFiles.map((file) => ({
			...file,
			status: 'success',
		}) satisfies ChatGeneratedFileListItem),
		...pendingGeneratedFiles,
	]);
	let availableWorkspaceDocuments = $derived(
		generatedFiles.map((file) => ({
			id: file.id,
			source: 'chat_generated_file' as const,
			filename: file.filename,
			title: file.documentLabel ?? file.filename,
			documentFamilyId: file.documentFamilyId ?? null,
			documentFamilyStatus: file.documentFamilyStatus ?? null,
			documentLabel: file.documentLabel ?? null,
			documentRole: file.documentRole ?? null,
			versionNumber: file.versionNumber ?? null,
			originConversationId: file.originConversationId ?? null,
			originAssistantMessageId: file.originAssistantMessageId ?? null,
			sourceChatFileId: file.sourceChatFileId ?? null,
			mimeType: file.mimeType,
			previewUrl: `/api/chat/files/${file.id}/preview`,
			artifactId: file.artifactId ?? null,
			conversationId: file.conversationId,
			downloadUrl: `/api/chat/files/${file.id}/download`,
			savedVaultName: file.savedVaultName ?? null,
		}))
	);

	function inferGeneratedFilename(input: Record<string, unknown>): string {
		return inferGeneratedFilenameFromToolInput(input);
	}

	function addPendingGeneratedFile(input: Record<string, unknown>, assistantMessageId: string) {
		// Prevent duplicate pending files if the tool is called multiple times before completion
		if (pendingGeneratedFiles.some((f) => f.assistantMessageId === assistantMessageId)) {
			return;
		}
		const filename = inferGeneratedFilename(input);
		pendingGeneratedFiles = [
			...pendingGeneratedFiles,
			{
				id: `pending-${crypto.randomUUID()}`,
				conversationId: data.conversation.id,
				assistantMessageId,
				filename,
				mimeType: 'application/octet-stream',
				sizeBytes: 0,
				createdAt: Date.now(),
				status: 'generating',
			},
		];
	}

	function resetPendingGeneratedFiles() {
		pendingGeneratedFiles = [];
	}

	function openWorkspaceDocument(document: DocumentWorkspaceItem) {
		const alreadyOpen = workspaceDocuments.some((entry) => entry.id === document.id);
		if (alreadyOpen) {
			workspaceDocuments = workspaceDocuments.map((entry) =>
				entry.id === document.id ? { ...entry, ...document } : entry
			);
		} else {
			workspaceDocuments = [...workspaceDocuments, document];
		}

		activeWorkspaceDocumentId = document.id;
		workspaceOpen = true;
		if (browser && document.artifactId) {
			void recordDocumentWorkspaceOpen(document.artifactId).catch(() => undefined);
		}
	}

	function selectWorkspaceDocument(documentId: string) {
		activeWorkspaceDocumentId = documentId;
		workspaceOpen = true;
		const document = workspaceDocuments.find((entry) => entry.id === documentId) ?? null;
		if (browser && document?.artifactId) {
			void recordDocumentWorkspaceOpen(document.artifactId).catch(() => undefined);
		}
	}

	function closeWorkspaceDocument(documentId: string) {
		const remainingDocuments = workspaceDocuments.filter((document) => document.id !== documentId);
		workspaceDocuments = remainingDocuments;

		if (activeWorkspaceDocumentId === documentId) {
			activeWorkspaceDocumentId = remainingDocuments.at(-1)?.id ?? null;
		}

		if (remainingDocuments.length === 0) {
			workspaceOpen = false;
		}
	}

	function closeWorkspace() {
		workspaceOpen = false;
	}

	async function focusMessage(messageId: string) {
		await tick();
		requestAnimationFrame(() => {
			const target = document.getElementById(`message-${messageId}`);
			target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		});
	}

	async function handleJumpToWorkspaceSource(document: DocumentWorkspaceItem) {
		const conversationId = document.originConversationId;
		const assistantMessageId = document.originAssistantMessageId;
		if (!(conversationId && assistantMessageId)) return;

		if (conversationId === data.conversation.id) {
			await focusMessage(assistantMessageId);
			return;
		}

		await goto(
			buildChatSourceMessageHref({
				conversationId,
				assistantMessageId,
			})
		);
	}

	function getActiveWorkspaceArtifactId(): string | undefined {
		if (!workspaceOpen || !activeWorkspaceDocumentId) {
			return undefined;
		}

		const activeDocument =
			workspaceDocuments.find((document) => document.id === activeWorkspaceDocumentId) ?? null;
		return activeDocument?.artifactId ?? undefined;
	}

	function maybeSendPendingInitialMessage() {
		if (typeof window === 'undefined' || isSending || (data.messages?.length ?? 0) > 0) {
			return;
		}

		const pendingDraft = consumePendingConversationMessage(data.conversation.id);
		if (!pendingDraft) {
			return;
		}

		if (!pendingDraft.message.trim()) {
			return;
		}
		// Show loading state until streaming actually starts
		initialStreamPending = true;
		handleSend({ ...pendingDraft, pendingAttachments: [] });
	}

	function resetState() {
		for (const controller of evidencePollControllers.values()) {
			controller.abort();
		}
		evidencePollControllers.clear();
		if (activeStream) {
			activeStream.detach();
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
		conversationDraft = data.draft ?? null;
		generatedFiles = data.generatedFiles ?? [];
		workspaceDocuments = [];
		activeWorkspaceDocumentId = null;
		workspaceOpen = false;
		resetPendingGeneratedFiles();
		queuedTurn = null;
		bootstrapMode = data.bootstrap ?? false;
		hydratingConversation = false;
		evidenceManagerOpen = false;
		draftPersistence.clear();
		currentConversationId.set(data.conversation.id);
		maybeSendPendingInitialMessage();
		if (bootstrapMode) {
			void hydrateConversationDetail(data.conversation.id);
		}
	}

	$effect(() => {
		const focusMessageId = getChatFocusMessageIdFromUrl(page.url);
		if (!focusMessageId || !$messages.some((message) => message.id === focusMessageId)) {
			return;
		}

		void focusMessage(focusMessageId);
		replaceState(clearChatFocusMessageParam(page.url), page.state);
	});

	$effect(() => {
		if (!data?.conversation?.id || activeStream) {
			return;
		}
		if (data.conversation.id !== prevConversationId) {
			prevConversationId = data.conversation.id;
			resetState();
		}
	});

	function handleVisibilityChange() {
		if (document.visibilityState === 'visible' && streamInterruptedByBackground) {
			streamInterruptedByBackground = false;
			invalidateAll();
			// Also check for orphaned streams when returning to foreground
			void checkForOrphanedStreamOnMount();
		}
	}

	async function reconnectToOrphanedStream(streamId: string) {
		if (isSending || activeStream) return;

		console.info('[CHAT] Starting reconnection to stream:', streamId);
		isSending = true;
		hasPersistedMessages = true;

		const placeholderId = crypto.randomUUID();
		const placeholder = createAssistantPlaceholder(placeholderId);
		messages.update((list) => appendAssistantPlaceholder(list, placeholder));

		activeStream = streamChat(
			'',
			data.conversation.id,
			{
				onToken(chunk) {
					messages.update((list) => appendTokenChunkToMessageList(list, placeholderId, chunk));
				},
				onThinking(chunk) {
					messages.update((list) => appendThinkingChunkToMessageList(list, placeholderId, chunk));
				},
				onToolCall(name, input, status, details) {
					if ((name === 'generate_file' || name === 'export_document') && status === 'running') {
						addPendingGeneratedFile(input, placeholderId);
					}
					messages.update((list) =>
						applyToolCallUpdateToMessageList(list, {
							placeholderId,
							name,
							input,
							status,
							details,
						})
					);
				},
				onEnd(fullText, metadata) {
					console.info('[CHAT] Reconnection stream ended, fullText length:', fullText.length);
					contextStatus = metadata?.contextStatus ?? contextStatus;
					activeWorkingSet = metadata?.activeWorkingSet ?? activeWorkingSet;
					taskState = metadata?.taskState ?? taskState;
					contextDebug = metadata?.contextDebug ?? contextDebug;
					if (metadata?.generatedFiles) {
						const existingIds = new Set(generatedFiles.map((f) => f.id));
						const newFiles = metadata.generatedFiles.filter((f) => !existingIds.has(f.id));
						generatedFiles = [...generatedFiles, ...newFiles];
					}
					resetPendingGeneratedFiles();
					const serverAssistantId = metadata?.assistantMessageId;
					messages.update((list) =>
						finalizeStreamingMessageList(list, {
							placeholderId,
							clientUserMessageId: null,
							metadata,
						})
					);
					isSending = false;
					activeStream = null;
					canRetry = false;
					if (serverAssistantId) {
						void pollMessageEvidence(serverAssistantId);
					}
				},
				onError(err) {
					console.info('[CHAT] Reconnection error:', err.message);
					messages.update((list) => removeMessageById(list, placeholderId));
					activeStream = null;
					isSending = false;
					resetPendingGeneratedFiles();

					const isBrowserAbort =
						err.name === 'AbortError' && browser && document.visibilityState === 'hidden';
					if (isBrowserAbort) {
						streamInterruptedByBackground = true;
						return;
					}

					// Reconnection error - the stream may have completed server-side
					// while we attempted to reconnect. Fetch fresh data and update state.
					console.info('[CHAT] Reconnection failed, fetching fresh data:', err.message);
					hasPersistedMessages = true;
					// Force invalidateAll and wait for it to complete before refreshing state
					void invalidateAll().then(() => {
						// After invalidation completes, update local state from fresh data
						messages.set(getData().messages ?? []);
						generatedFiles = getData().generatedFiles ?? [];
						conversationDraft = getData().draft ?? null;
					});
				},
			},
			{
				reconnectToStreamId: streamId,
			}
		);
	}

	async function checkForOrphanedStreamOnMount() {
		if (isSending || activeStream || hydratingConversation) {
			console.info('[CHAT] Skip orphan check: isSending=', isSending, 'activeStream=', !!activeStream, 'hydrating=', hydratingConversation);
			return;
		}

		// Consume pending message from sessionStorage immediately
		// This prevents maybeSendPendingInitialMessage() from also trying to send
		const pendingMessage = consumePendingConversationMessage(data.conversation.id);
		console.info('[CHAT] Orphan check - pending message consumed:', pendingMessage ? pendingMessage.message.slice(0, 50) : 'none');

		// Check for orphaned streams regardless of existing messages
		// Previous turns don't prevent reconnection to active streams
		const streamId = await checkForOrphanedStream(data.conversation.id);
		console.info('[CHAT] Orphan check result:', streamId ? `found stream ${streamId}` : 'no orphaned stream');

		if (!streamId) return;

		void reconnectToOrphanedStream(streamId);
	}

	onMount(() => {
		currentConversationId.set(data.conversation.id);
		document.addEventListener('visibilitychange', handleVisibilityChange);
		void checkForOrphanedStreamOnMount();
	});

	onDestroy(() => {
		if (browser) document.removeEventListener('visibilitychange', handleVisibilityChange);
		for (const controller of evidencePollControllers.values()) {
			controller.abort();
		}
		evidencePollControllers.clear();

		if (activeStream) {
			activeStream.detach();
			activeStream = null;
		}

		void draftPersistence.flush();

		if (
			!hasPersistedMessages &&
			data?.conversation?.id &&
			!hasMeaningfulDraft(
				conversationDraft?.draftText ?? '',
				conversationDraft?.selectedAttachmentIds ?? []
			)
		) {
			cleanupPreparedConversation({
				conversationId: data.conversation.id,
				removeLocal: removeConversationLocal,
			});
		}
	});

	async function hydrateConversationDetail(conversationId: string) {
		if (hydratingConversation) return;
		hydratingConversation = true;

		try {
			const payload = await fetchConversationDetail(conversationId);
			attachedArtifacts = payload.attachedArtifacts ?? attachedArtifacts;
			activeWorkingSet = payload.activeWorkingSet ?? activeWorkingSet;
			contextStatus = payload.contextStatus ?? contextStatus;
			taskState = payload.taskState ?? taskState;
			contextDebug = payload.contextDebug ?? contextDebug;
			conversationDraft = payload.draft ?? conversationDraft;
			generatedFiles = payload.generatedFiles ?? generatedFiles;
			resetPendingGeneratedFiles();
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

	let initializedGeneratedFilesData = false;
	let prevGeneratedFilesData: typeof data.generatedFiles;
	$effect(() => {
		if (!initializedGeneratedFilesData) {
			prevGeneratedFilesData = data.generatedFiles;
			initializedGeneratedFilesData = true;
			return;
		}
		if (data.generatedFiles !== prevGeneratedFilesData) {
			prevGeneratedFilesData = data.generatedFiles;
			if (data.generatedFiles) {
				const currentFiles = untrack(() => generatedFiles);
				const existingIds = new Set(currentFiles.map((f) => f.id));
				const newFiles = data.generatedFiles.filter((f) => !existingIds.has(f.id));
				generatedFiles = [...currentFiles, ...newFiles];
			}
			resetPendingGeneratedFiles();
		}
	});

	function cloneSendPayload(payload: SendPayload): SendPayload {
		return {
			message: payload.message,
			attachmentIds: [...(payload.attachmentIds ?? [])],
			attachments: [...(payload.attachments ?? [])],
			pendingAttachments: (payload.pendingAttachments ?? []).map((attachment) => ({
				...attachment,
			})),
			conversationId: payload.conversationId ?? null,
		};
	}

	function restorePayloadToDraft(payload: SendPayload) {
		const nextConversationId = payload.conversationId ?? data.conversation.id;
		conversationDraft = createConversationDraftRecord({
			conversationId: nextConversationId,
			fallbackConversationId: data.conversation.id,
			draftText: payload.message,
			selectedAttachmentIds: payload.attachmentIds,
			selectedAttachments: payload.pendingAttachments ?? [],
		});
		void draftPersistence.persist(
			{
				conversationId: nextConversationId,
				draftText: payload.message,
				selectedAttachmentIds: payload.attachmentIds,
			},
			true
		);
	}

	function restoreQueuedTurnToDraft() {
		if (!queuedTurn) return;
		const nextQueuedTurn = cloneSendPayload(queuedTurn);
		queuedTurn = null;
		restorePayloadToDraft(nextQueuedTurn);
	}

	function editQueuedTurn() {
		restoreQueuedTurnToDraft();
		sendError = null;
	}

	function clearQueuedTurn() {
		queuedTurn = null;
		sendError = null;
	}

function maybeTriggerTitleGeneration(userMessage: string, assistantResponse: string) {
		if (titleGenerationTriggered || effectiveConversationTitle !== 'New Conversation') {
			return;
		}

		titleGenerationTriggered = true;
		const conversationIdForTitle = data.conversation.id;
		generateConversationTitle(conversationIdForTitle, {
			userMessage,
			assistantResponse,
		})
			.then((title) => {
				if (title) {
					updateConversationTitleLocal(conversationIdForTitle, title);
					generatedTitleOverride = title;
				}
			})
.catch(() => {
				// Ignore errors, title remains 'New conversation'
			});
	}

	async function pollMessageEvidence(messageId: string) {
		evidencePollControllers.get(messageId)?.abort();
		const controller = new AbortController();
		evidencePollControllers.set(messageId, controller);

		const attempts = 12;
		for (let attempt = 0; attempt < attempts; attempt += 1) {
			if (controller.signal.aborted) return;

			try {
				const result = await fetchMessageEvidence(
					data.conversation.id,
					messageId,
					controller.signal
				);

				if (result.status === 'pending') {
					await new Promise((resolve) => setTimeout(resolve, attempt < 4 ? 250 : 500));
					continue;
				}

				if (result.status === 'none' || result.status === 'missing') {
					messages.update((list) =>
						updateMessageById(list, messageId, (message) => ({
							...message,
							evidencePending: false,
						}))
					);
					return;
				}

				messages.update((list) =>
					updateMessageById(list, messageId, (message) => ({
						...message,
						evidenceSummary: result.evidenceSummary,
						evidencePending: false,
					}))
				);
				return;
			} catch (error) {
				if ((error as Error).name === 'AbortError') {
					return;
				}
				break;
			}
		}

		messages.update((list) =>
			updateMessageById(list, messageId, (message) => ({
				...message,
				evidencePending: false,
			}))
		);
	}

	function handleSend(
		payload: SendPayload,
		skipUserMessage = false,
		skipPersistUserMessage = false,
		clearDraft = true
	) {
		const text = payload.message;
		const attachmentIds = payload.attachmentIds ?? [];
		const newAttachments = payload.attachments ?? [];
		if (!text.trim() || isSending) return;

		sendError = null;
		isSending = true;
		initialStreamPending = false;
		lastUserMessage = text;
		canRetry = true;
		hasPersistedMessages = true;
		if (clearDraft) {
			conversationDraft = null;
			draftPersistence.clear();
		}
		
		// CRITICAL: Clear attachedArtifacts BEFORE anything else so the child component
		// doesn't re-merge them after clearComposerAfterSubmit() runs.
		const currentAttachedArtifacts = attachedArtifacts;
		attachedArtifacts = [];
		
		const sentAttachments = mergeAttachedArtifacts(currentAttachedArtifacts, newAttachments);
		upsertConversationLocal(data.conversation.id, data.conversation.title, Date.now() / 1000);

		const placeholderId = crypto.randomUUID();
		const placeholder = createAssistantPlaceholder(placeholderId);

		let clientUserMsgId: string | null = null;
		if (skipUserMessage) {
			messages.update((list) => appendAssistantPlaceholder(list, placeholder));
		} else {
			clientUserMsgId = crypto.randomUUID();
			const userMessage = createUserMessage({
				id: clientUserMsgId,
				text,
				attachmentIds,
				attachedArtifacts: sentAttachments,
			});
			messages.update((list) => appendUserMessageAndPlaceholder(list, userMessage, placeholder));
		}

		activeStream = streamChat(
			text,
			data.conversation.id,
			{
				onToken(chunk) {
					messages.update((list) => appendTokenChunkToMessageList(list, placeholderId, chunk));
				},
				onThinking(chunk) {
					messages.update((list) => appendThinkingChunkToMessageList(list, placeholderId, chunk));
				},
				onToolCall(name, input, status, details) {
					if ((name === 'generate_file' || name === 'export_document') && status === 'running') {
						addPendingGeneratedFile(input, placeholderId);
					}
					messages.update((list) =>
						applyToolCallUpdateToMessageList(list, {
							placeholderId,
							name,
							input,
							status,
							details,
						})
					);
				},
				onEnd(fullText, metadata) {
					const completedUserMessage = lastUserMessage;
					const completedAssistantResponse = fullText;
					lastAssistantResponse = fullText;
					contextStatus = metadata?.contextStatus ?? contextStatus;
					activeWorkingSet = metadata?.activeWorkingSet ?? activeWorkingSet;
					taskState = metadata?.taskState ?? taskState;
					contextDebug = metadata?.contextDebug ?? contextDebug;
					if (metadata?.generatedFiles) {
						// Merge new files with existing, using ID to prevent duplicates
						const existingIds = new Set(generatedFiles.map((f) => f.id));
						const newFiles = metadata.generatedFiles.filter((f) => !existingIds.has(f.id));
						generatedFiles = [...generatedFiles, ...newFiles];
					}
					resetPendingGeneratedFiles();
					const serverAssistantId = metadata?.assistantMessageId;
					messages.update((list) =>
						finalizeStreamingMessageList(list, {
							placeholderId,
							clientUserMessageId: clientUserMsgId,
							metadata,
						})
					);
					isSending = false;
					activeStream = null;
					canRetry = false;
					if (serverAssistantId) {
						void pollMessageEvidence(serverAssistantId);
					}

					if (metadata?.wasStopped) {
						restoreQueuedTurnToDraft();
						return;
					}

					maybeTriggerTitleGeneration(completedUserMessage, completedAssistantResponse);

					if (queuedTurn) {
						const nextQueuedTurn = cloneSendPayload(queuedTurn);
						queuedTurn = null;
						handleSend(nextQueuedTurn, false, false, false);
					}
				},
				onError(err) {
					messages.update((list) => removeMessageById(list, placeholderId));
					activeStream = null;
					isSending = false;
					resetPendingGeneratedFiles();
					restoreQueuedTurnToDraft();

					const isBrowserAbort =
						err.name === 'AbortError' && browser && document.visibilityState === 'hidden';
					if (isBrowserAbort) {
						streamInterruptedByBackground = true;
						return;
					}

					sendError = toFriendlySendError(err);
					canRetry = true;
				},
			},
			{
				modelId: $selectedModel,
				skipPersistUserMessage,
				attachmentIds,
				activeDocumentArtifactId: getActiveWorkspaceArtifactId(),
			}
		);
	}

	function handleRetry() {
		if (canRetry && lastUserMessage) {
			sendError = null;
			isSending = true;
			hasPersistedMessages = true;

			const placeholderId = crypto.randomUUID();
			const placeholder = createAssistantPlaceholder(placeholderId);
			messages.update((list) => [...list, placeholder]);

			const lastAssistantMsg = $messages.findLast((m) => m.role === 'assistant');
			const retryAssistantMessageId = lastAssistantMsg?.id;
			if (retryAssistantMessageId) {
				messages.update((list) => removeMessageById(list, retryAssistantMessageId));
			}

			activeStream = streamChat(
				lastUserMessage,
				data.conversation.id,
				{
					onToken(chunk) {
						messages.update((list) => appendTokenChunkToMessageList(list, placeholderId, chunk));
					},
					onThinking(chunk) {
						messages.update((list) => appendThinkingChunkToMessageList(list, placeholderId, chunk));
					},
				onToolCall(name, input, status, details) {
					if ((name === 'generate_file' || name === 'export_document') && status === 'running') {
						addPendingGeneratedFile(input, placeholderId);
					}
						messages.update((list) =>
							applyToolCallUpdateToMessageList(list, {
								placeholderId,
								name,
								input,
								status,
								details,
							})
						);
					},
					onEnd(fullText, metadata) {
						lastAssistantResponse = fullText;
						contextStatus = metadata?.contextStatus ?? contextStatus;
						activeWorkingSet = metadata?.activeWorkingSet ?? activeWorkingSet;
						taskState = metadata?.taskState ?? taskState;
						contextDebug = metadata?.contextDebug ?? contextDebug;
						if (metadata?.generatedFiles) {
							// Merge new files with existing, using ID to prevent duplicates
							const existingIds = new Set(generatedFiles.map((f) => f.id));
							const newFiles = metadata.generatedFiles.filter((f) => !existingIds.has(f.id));
							generatedFiles = [...generatedFiles, ...newFiles];
						}
						resetPendingGeneratedFiles();
						const serverAssistantId = metadata?.assistantMessageId;
						messages.update((list) =>
							finalizeStreamingMessageList(list, {
								placeholderId,
								clientUserMessageId: null,
								metadata,
							})
						);
						isSending = false;
						activeStream = null;
						canRetry = false;
						if (serverAssistantId) {
							void pollMessageEvidence(serverAssistantId);
						}

						if (metadata?.wasStopped) {
							restoreQueuedTurnToDraft();
							return;
						}

						maybeTriggerTitleGeneration(lastUserMessage, fullText);

						if (queuedTurn) {
							const nextQueuedTurn = cloneSendPayload(queuedTurn);
							queuedTurn = null;
							handleSend(nextQueuedTurn, false, false, false);
						}
					},
					onError(err) {
						messages.update((list) => removeMessageById(list, placeholderId));
						activeStream = null;
						isSending = false;
						resetPendingGeneratedFiles();
						restoreQueuedTurnToDraft();

						const isBrowserAbort =
							err.name === 'AbortError' && browser && document.visibilityState === 'hidden';
						if (isBrowserAbort) {
							streamInterruptedByBackground = true;
							return;
						}

						sendError = toFriendlySendError(err);
						canRetry = true;
					},
				},
				{
					activeDocumentArtifactId: getActiveWorkspaceArtifactId(),
					retryAssistantMessageId: retryAssistantMessageId ?? undefined,
				}
			);
		}
	}

	function handleRegenerate(payload: MessageRegeneratePayload) {
		if (isSending) return;
		const { messageId } = payload;
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
		void deleteConversationMessages(data.conversation.id, idsToDelete).catch(() => {});

		sendError = null;
		handleSend(
			{ message: userText, attachmentIds: [], attachments: [], pendingAttachments: [] },
			true,
			true
		);
	}

	function handleEdit(payload: MessageEditPayload) {
		if (isSending) return;
		const { messageId, newText } = payload;
		const msgs = $messages;
		const editIdx = msgs.findIndex((m) => m.id === messageId);
		if (editIdx === -1) return;

		const idsToDelete = msgs.slice(editIdx).map((m) => m.id);

		// Remove all messages from the edited one onwards
		messages.update((m) => m.slice(0, editIdx));

		// Delete from DB (fire-and-forget, non-critical)
		void deleteConversationMessages(data.conversation.id, idsToDelete).catch(() => {});

		sendError = null;
		handleSend({ message: newText, attachmentIds: [], attachments: [], pendingAttachments: [] });
	}

	function handleStop() {
		if (activeStream) {
			activeStream.stop();
			// The stream will trigger onEnd via the abort controller
		}
	}

	function handleQueue(payload: SendPayload) {
		if (!isSending || queuedTurn || !payload.message.trim()) {
			return;
		}

		queuedTurn = cloneSendPayload(payload);
		conversationDraft = null;
		draftPersistence.clear();
		sendError = null;
	}

	async function handleSteering(payload: TaskSteeringPayload) {
		try {
			const result = await applyTaskSteering(data.conversation.id, payload);
			taskState = result.taskState ?? taskState;
			contextDebug = result.contextDebug ?? contextDebug;
		} catch {
			return;
		}
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

	function handleDraftChange(payload: DraftChangePayload) {
		const nextConversationId = payload.conversationId ?? data.conversation.id;
		conversationDraft = createConversationDraftRecord({
			conversationId: nextConversationId,
			draftText: payload.draftText,
			selectedAttachmentIds: payload.selectedAttachmentIds,
			selectedAttachments: payload.selectedAttachments,
		});
		void draftPersistence.persist({
			conversationId: nextConversationId,
			draftText: payload.draftText,
			selectedAttachmentIds: payload.selectedAttachmentIds,
		});
	}

	const INTERNAL_MIME = 'application/x-alfyai-conversation';
	let fileDragActive = $state(false);
	let fileDragRejected = $state(false);
	let dragEnterCount = 0;
	let uploadFilesFn: ((files: FileList | null) => Promise<void>) | null = null;

	function handleUploadReady(uploadFn: (files: FileList | null) => Promise<void>) {
		uploadFilesFn = uploadFn;
	}

	function isOsFileDrop(event: DragEvent): boolean {
		const types = event.dataTransfer?.types;
		if (!types) return false;
		// Must have Files type (OS file drop), not internal conversation DnD
		return types.includes('Files') && !types.includes(INTERNAL_MIME);
	}

	function handleDragEnter(event: DragEvent) {
		if (!isOsFileDrop(event)) return;
		event.preventDefault();
		dragEnterCount += 1;
		if (isSending) {
			fileDragRejected = true;
		} else {
			fileDragRejected = false;
		}
		fileDragActive = true;
	}

	function handleDragOver(event: DragEvent) {
		if (!isOsFileDrop(event)) return;
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleDragLeave(event: DragEvent) {
		if (!isOsFileDrop(event)) return;
		dragEnterCount -= 1;
		if (dragEnterCount <= 0) {
			dragEnterCount = 0;
			fileDragActive = false;
			fileDragRejected = false;
		}
	}

	function handleDrop(event: DragEvent) {
		dragEnterCount = 0;
		fileDragActive = false;
		fileDragRejected = false;
		if (!isOsFileDrop(event)) return;
		event.preventDefault();
		if (isSending) return;
		const files = event.dataTransfer?.files;
		if (!files || files.length === 0) return;
		uploadFilesFn?.(files);
	}
</script>

<svelte:head>
	<title>{effectiveConversationTitle}</title>
</svelte:head>

<div
	class="chat-page flex h-full min-w-0 flex-col"
	role="region"
	aria-label="Chat page"
	ondragenter={handleDragEnter}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<DropZoneOverlay active={fileDragActive} rejected={fileDragRejected} />
	<div class="chat-stage relative flex min-h-0 flex-1 overflow-hidden rounded-lg">
		<div class="chat-main relative flex min-h-0 flex-1 flex-col overflow-hidden">
			<div class="chat-messages flex flex-1 flex-col overflow-hidden">
				{#if showInitialLoading}
					<div class="flex flex-1 items-center justify-center">
						<div class="flex flex-col items-center gap-3">
							<div class="spinner-large"></div>
							<span class="text-sm text-text-muted">Starting conversation...</span>
						</div>
					</div>
				{:else}
					<ChatMessagePane
						messages={$messages}
						conversationId={data.conversation.id}
						{isThinkingActive}
						{contextDebug}
						generatedFiles={generatedFileCards}
						onOpenDocument={openWorkspaceDocument}
						onRegenerate={handleRegenerate}
						onEdit={handleEdit}
						onSteer={handleSteering}
					/>
				{/if}
			</div>

			<ChatComposerPanel
				{sendError}
				onRetry={handleRetry}
				onErrorClose={handleErrorClose}
				onSend={handleSend}
				onQueue={handleQueue}
				onStop={handleStop}
				onDraftChange={handleDraftChange}
				onEditQueuedMessage={editQueuedTurn}
				onDeleteQueuedMessage={clearQueuedTurn}
				disabled={isSending}
				isGenerating={isSending}
				hasQueuedMessage={Boolean(queuedTurn)}
				queuedMessagePreview={queuedTurn?.message ?? ''}
				maxLength={data.maxMessageLength}
				conversationId={data.conversation.id}
				{contextStatus}
				{attachedArtifacts}
				{taskState}
				{contextDebug}
				draftText={conversationDraft?.draftText ?? ''}
				draftAttachments={conversationDraft?.selectedAttachments ?? []}
				draftVersion={conversationDraft?.updatedAt ?? 0}
				onSteer={handleSteering}
				onManageEvidence={openEvidenceManager}
				onUploadReady={handleUploadReady}
			/>
		</div>

		<DocumentWorkspace
			open={workspaceOpen}
			documents={workspaceDocuments}
			availableDocuments={availableWorkspaceDocuments}
			activeDocumentId={activeWorkspaceDocumentId}
			onSelectDocument={selectWorkspaceDocument}
			onOpenDocument={openWorkspaceDocument}
			onJumpToSource={handleJumpToWorkspaceSource}
			onCloseDocument={closeWorkspaceDocument}
			onCloseWorkspace={closeWorkspace}
		/>
	</div>

	<EvidenceManager
		open={evidenceManagerOpen}
		{contextDebug}
		onClose={closeEvidenceManager}
		onSteer={handleSteering}
	/>
</div>

<style>
	.chat-main {
		min-width: 0;
	}

	.chat-messages {
		min-width: 0;
	}

	.spinner-large {
		width: 32px;
		height: 32px;
		border: 3px solid color-mix(in srgb, var(--border-default) 50%, transparent 50%);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
