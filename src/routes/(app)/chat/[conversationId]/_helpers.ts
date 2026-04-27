import type { StreamMetadata } from '$lib/services/streaming';
import type {
	ArtifactSummary,
	ChatMessage,
	EvidenceSourceType,
	PendingAttachment,
	ToolEvidenceCandidate,
	ChatGeneratedFileListItem,
	DocumentWorkspaceItem,
	ModelId,
} from '$lib/types';

export type SendPayload = {
	message: string;
	attachmentIds: string[];
	attachments: ArtifactSummary[];
	pendingAttachments: PendingAttachment[];
	conversationId?: string | null;
	modelId?: ModelId;
};

export type MessageEditPayload = {
	messageId: string;
	newText: string;
};

export type MessageRegeneratePayload = {
	messageId: string;
};

export type DraftChangePayload = {
	conversationId: string | null;
	draftText: string;
	selectedAttachmentIds: string[];
	selectedAttachments: PendingAttachment[];
};

export type StreamToolCallDetails = {
	outputSummary?: string | null;
	sourceType?: EvidenceSourceType | null;
	candidates?: ToolEvidenceCandidate[];
};

const FRIENDLY_SEND_ERRORS = {
	timeout: 'The response is taking too long. Please try again.',
	network: 'We could not reach the chat service. Check your connection and try again.',
	backend_failure: 'We hit a temporary issue generating a response. Please try again.',
	capacity_exceeded: 'Our servers are handling too many requests right now. Please wait a moment and try again.',
	file_too_large: 'The uploaded file exceeds the maximum allowed size. Please upload a smaller file.',
	message_too_long: 'Your message is too long. Please shorten it and try again.',
	provider_tool_rounds: 'The AI needed too many tool-call rounds for this request. Please try a simpler request.',
} as const;

export function toFriendlySendError(error: Error): string {
	const errorWithCode = error as Error & { code?: unknown };
	if (errorWithCode.code === 'attachment_not_ready') {
		return error.message;
	}
	if (errorWithCode.code === 'timeout') return FRIENDLY_SEND_ERRORS.timeout;
	if (errorWithCode.code === 'network') return FRIENDLY_SEND_ERRORS.network;
	if (errorWithCode.code === 'backend_failure') return FRIENDLY_SEND_ERRORS.backend_failure;
	if (errorWithCode.code === 'capacity_exceeded') return FRIENDLY_SEND_ERRORS.capacity_exceeded;
	if (errorWithCode.code === 'file_too_large') return FRIENDLY_SEND_ERRORS.file_too_large;
	if (errorWithCode.code === 'message_too_long') return FRIENDLY_SEND_ERRORS.message_too_long;
	if (errorWithCode.code === 'provider_tool_rounds') return FRIENDLY_SEND_ERRORS.provider_tool_rounds;

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

	if (message.includes('capacity') || message.includes('server at capacity')) return FRIENDLY_SEND_ERRORS.capacity_exceeded;

	if (message.includes('file too large') || message.includes('too large') || message.includes('maximum size')) return FRIENDLY_SEND_ERRORS.file_too_large;

	return FRIENDLY_SEND_ERRORS.backend_failure;
}

export function mergeAttachedArtifacts(
	currentArtifacts: ArtifactSummary[],
	nextArtifacts: ArtifactSummary[]
): ArtifactSummary[] {
	if (nextArtifacts.length === 0) return currentArtifacts;

	const mergedArtifacts = new Map(currentArtifacts.map((artifact) => [artifact.id, artifact]));
	for (const artifact of nextArtifacts) {
		mergedArtifacts.set(artifact.id, artifact);
	}
	return Array.from(mergedArtifacts.values());
}

export function createAssistantPlaceholder(id: string, timestamp = Date.now()): ChatMessage {
	return {
		id,
		renderKey: id,
		role: 'assistant',
		content: '',
		timestamp,
		isStreaming: true,
	};
}

export function createUserMessage(params: {
	id: string;
	text: string;
	timestamp?: number;
	attachmentIds: string[];
	attachedArtifacts: ArtifactSummary[];
}): ChatMessage {
	const timestamp = params.timestamp ?? Date.now();

	return {
		id: params.id,
		renderKey: params.id,
		role: 'user',
		content: params.text,
		attachments: params.attachedArtifacts
			.filter((artifact) => params.attachmentIds.includes(artifact.id))
			.map((artifact) => ({
				id: artifact.id,
				artifactId: artifact.id,
				name: artifact.name,
				type: artifact.type,
				mimeType: artifact.mimeType,
				sizeBytes: artifact.sizeBytes,
				conversationId: artifact.conversationId,
				messageId: null,
				createdAt: artifact.createdAt,
			})),
		timestamp,
	};
}

export function appendAssistantPlaceholder(
	list: ChatMessage[],
	placeholder: ChatMessage
): ChatMessage[] {
	return [...list, placeholder];
}

export function appendUserMessageAndPlaceholder(
	list: ChatMessage[],
	userMessage: ChatMessage,
	placeholder: ChatMessage
): ChatMessage[] {
	return [...list, userMessage, placeholder];
}

export function updateMessageById(
	list: ChatMessage[],
	messageId: string,
	updater: (message: ChatMessage) => ChatMessage
): ChatMessage[] {
	return list.map((message) => (message.id === messageId ? updater(message) : message));
}

export function appendTokenChunkToMessageList(
	list: ChatMessage[],
	placeholderId: string,
	chunk: string
): ChatMessage[] {
	// NOTE: Do NOT set isThinkingStreaming: false here.
	// isThinkingStreaming tracks whether thinking chunks are still arriving.
	// It should only be set true by appendThinkingChunkToMessageList (when thinking
	// chunks arrive) and set false by finalizeStreamingMessageList (when stream ends).
	// Setting it false on first visible token causes thinkingIsDone to become true
	// while tool_call thinking segments may still be arriving, showing <tool_call|>
	// artifacts in the UI before the thinking block is fully rendered.
	return updateMessageById(list, placeholderId, (message) => ({
		...message,
		content: message.content + chunk,
	}));
}

export function appendThinkingChunkToMessageList(
	list: ChatMessage[],
	placeholderId: string,
	chunk: string
): ChatMessage[] {
	return updateMessageById(list, placeholderId, (message) => {
		const segments = message.thinkingSegments ?? [];
		const lastSegment = segments[segments.length - 1];
		const nextSegments =
			lastSegment?.type === 'text'
				? [
						...segments.slice(0, -1),
						{ type: 'text' as const, content: lastSegment.content + chunk },
					]
				: [...segments, { type: 'text' as const, content: chunk }];

		return {
			...message,
			thinking: (message.thinking ?? '') + chunk,
			thinkingSegments: nextSegments,
			isThinkingStreaming: true,
		};
	});
}

export function applyToolCallUpdateToMessageList(
	list: ChatMessage[],
	params: {
		placeholderId: string;
		name: string;
		input: Record<string, unknown>;
		status: 'running' | 'done';
		details?: StreamToolCallDetails;
	}
): ChatMessage[] {
	return updateMessageById(list, params.placeholderId, (message) => {
		const segments = message.thinkingSegments ?? [];
		if (params.status === 'running') {
			return {
				...message,
				thinkingSegments: [
					...segments,
					{ type: 'tool_call' as const, name: params.name, input: params.input, status: 'running' as const },
				],
			};
		}

		const updatedSegments = [...segments];
		let lastRunningIndex = -1;
		for (let i = updatedSegments.length - 1; i >= 0; i -= 1) {
			const segment = updatedSegments[i];
			if (
				segment.type === 'tool_call' &&
				segment.name === params.name &&
				segment.status === 'running'
			) {
				lastRunningIndex = i;
				break;
			}
		}

		if (lastRunningIndex !== -1) {
			updatedSegments[lastRunningIndex] = {
				...updatedSegments[lastRunningIndex],
				status: 'done' as const,
				outputSummary: params.details?.outputSummary ?? null,
				sourceType: params.details?.sourceType ?? null,
				candidates: params.details?.candidates,
			};
		}

		return { ...message, thinkingSegments: updatedSegments };
	});
}

export function finalizeStreamingMessageList(
	list: ChatMessage[],
	params: {
		placeholderId: string;
		clientUserMessageId: string | null;
		metadata?: StreamMetadata;
	}
): ChatMessage[] {
	const serverAssistantId = params.metadata?.assistantMessageId;
	const serverUserMessageId = params.metadata?.userMessageId;

	return list.map((message) => {
		if (message.id === params.placeholderId) {
			return {
				...message,
				renderKey: message.renderKey ?? params.placeholderId,
				id: serverAssistantId ?? message.id,
				content: params.metadata?.wasStopped ? message.content || 'Stopped' : message.content,
				isStreaming: false,
				thinking: params.metadata?.thinking ?? message.thinking,
				isThinkingStreaming: false,
				modelId: params.metadata?.modelId ?? message.modelId,
				modelDisplayName: params.metadata?.modelDisplayName ?? message.modelDisplayName,
				thinkingTokenCount: params.metadata?.thinkingTokenCount,
				responseTokenCount: params.metadata?.responseTokenCount,
				totalTokenCount: params.metadata?.totalTokenCount,
				evidenceSummary: message.evidenceSummary,
				evidencePending: Boolean(serverAssistantId),
			};
		}

		if (
			params.clientUserMessageId &&
			message.id === params.clientUserMessageId &&
			serverUserMessageId
		) {
			return {
				...message,
				renderKey: message.renderKey ?? params.clientUserMessageId,
				id: serverUserMessageId,
			};
		}

		return message;
	});
}

export function removeMessageById(list: ChatMessage[], messageId: string): ChatMessage[] {
	return list.filter((message) => message.id !== messageId);
}

export function reducePendingGeneratedFiles(
	list: ChatGeneratedFileListItem[],
	filename: string,
	assistantMessageId: string,
	conversationId: string
): ChatGeneratedFileListItem[] {
	if (list.some((f) => f.assistantMessageId === assistantMessageId && f.filename === filename)) {
		return list;
	}
	return [
		...list,
		{
			id: `pending-${crypto.randomUUID()}`,
			conversationId,
			assistantMessageId,
			filename,
			mimeType: 'application/octet-stream',
			sizeBytes: 0,
			createdAt: Date.now(),
			status: 'generating',
		},
	];
}

export function cloneSendPayload(payload: SendPayload): SendPayload {
	return {
		message: payload.message,
		attachmentIds: [...(payload.attachmentIds ?? [])],
		attachments: [...(payload.attachments ?? [])],
		pendingAttachments: (payload.pendingAttachments ?? []).map((attachment) => ({
			...attachment,
		})),
		conversationId: payload.conversationId ?? null,
		modelId: payload.modelId,
	};
}

export function isOsFileDropEvent(event: DragEvent): boolean {
	const types = event.dataTransfer?.types;
	if (!types) return false;
	// Must have Files type (OS file drop), not internal conversation DnD
	return types.includes('Files') && !types.includes('application/x-alfyai-conversation');
}

export function reduceWorkspaceDocumentOpen(
	documents: DocumentWorkspaceItem[],
	document: DocumentWorkspaceItem
): { documents: DocumentWorkspaceItem[]; activeDocumentId: string | null; isOpen: boolean } {
	const alreadyOpen = documents.some((entry) => entry.id === document.id);
	const updatedDocuments = alreadyOpen
		? documents.map((entry) => (entry.id === document.id ? { ...entry, ...document } : entry))
		: [...documents, document];

	return {
		documents: updatedDocuments,
		activeDocumentId: document.id,
		isOpen: true,
	};
}

export function reduceWorkspaceDocumentClose(
	documents: DocumentWorkspaceItem[],
	documentId: string,
	activeWorkspaceDocumentId: string | null
): { documents: DocumentWorkspaceItem[]; activeDocumentId: string | null; isOpen: boolean } {
	const remainingDocuments = documents.filter((document) => document.id !== documentId);
	let nextActiveId = activeWorkspaceDocumentId;

	if (activeWorkspaceDocumentId === documentId) {
		nextActiveId = remainingDocuments.at(-1)?.id ?? null;
	}

	return {
		documents: remainingDocuments,
		activeDocumentId: nextActiveId,
		isOpen: remainingDocuments.length > 0,
	};
}
