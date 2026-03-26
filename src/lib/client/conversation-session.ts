import type { ArtifactSummary, ConversationDraft, PendingAttachment } from '$lib/types';

const PREVIOUS_CONVERSATION_KEY = 'previous-conversation-id';
const LANDING_DRAFT_CONVERSATION_KEY = 'landing-draft-conversation-id';
const PENDING_MESSAGE_PREFIX = 'pending-chat-message:';

export type PendingConversationMessage = {
	message: string;
	attachmentIds: string[];
	attachments: ArtifactSummary[];
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function getSessionStorage(): Storage | null {
	if (typeof window === 'undefined') return null;
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

function getPendingMessageKey(conversationId: string): string {
	return `${PENDING_MESSAGE_PREFIX}${conversationId}`;
}

function toArtifactSummaryList(value: unknown): ArtifactSummary[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(artifact): artifact is ArtifactSummary =>
			typeof artifact === 'object' &&
			artifact !== null &&
			'id' in artifact &&
			typeof artifact.id === 'string'
	);
}

export function markPreviousConversationId(conversationId: string | null): void {
	if (!conversationId) return;
	getSessionStorage()?.setItem(PREVIOUS_CONVERSATION_KEY, conversationId);
}

export function consumePreviousConversationId(): string | null {
	const storage = getSessionStorage();
	const previousConversationId = storage?.getItem(PREVIOUS_CONVERSATION_KEY) ?? null;
	if (previousConversationId) {
		storage?.removeItem(PREVIOUS_CONVERSATION_KEY);
	}
	return previousConversationId;
}

export function getLandingDraftConversationId(): string | null {
	return getSessionStorage()?.getItem(LANDING_DRAFT_CONVERSATION_KEY) ?? null;
}

export function setLandingDraftConversationId(conversationId: string | null): void {
	const storage = getSessionStorage();
	if (!storage) return;
	if (conversationId) {
		storage.setItem(LANDING_DRAFT_CONVERSATION_KEY, conversationId);
		return;
	}
	storage.removeItem(LANDING_DRAFT_CONVERSATION_KEY);
}

export function storePendingConversationMessage(
	conversationId: string,
	payload: PendingConversationMessage
): void {
	getSessionStorage()?.setItem(
		getPendingMessageKey(conversationId),
		JSON.stringify({
			message: payload.message.trim(),
			attachmentIds: payload.attachmentIds,
			attachments: payload.attachments,
		})
	);
}

export function hasPendingConversationMessage(conversationId: string): boolean {
	return Boolean(getSessionStorage()?.getItem(getPendingMessageKey(conversationId)));
}

export function consumePendingConversationMessage(
	conversationId: string
): PendingConversationMessage | null {
	const storage = getSessionStorage();
	const key = getPendingMessageKey(conversationId);
	const rawValue = storage?.getItem(key) ?? null;
	if (!rawValue) {
		return null;
	}

	storage?.removeItem(key);

	try {
		const parsed = JSON.parse(rawValue) as Record<string, unknown>;
		return {
			message: typeof parsed.message === 'string' ? parsed.message : '',
			attachmentIds: Array.isArray(parsed.attachmentIds)
				? parsed.attachmentIds.filter((value): value is string => typeof value === 'string')
				: [],
			attachments: toArtifactSummaryList(parsed.attachments),
		};
	} catch {
		return {
			message: rawValue,
			attachmentIds: [],
			attachments: [],
		};
	}
}

export function hasMeaningfulDraft(
	draftText: string,
	selectedAttachmentIds: string[]
): boolean {
	return draftText.trim().length > 0 || selectedAttachmentIds.length > 0;
}

export function createConversationDraftRecord(params: {
	conversationId: string | null;
	fallbackConversationId?: string | null;
	draftText: string;
	selectedAttachmentIds: string[];
	selectedAttachments: PendingAttachment[];
	updatedAt?: number;
}): ConversationDraft | null {
	if (!hasMeaningfulDraft(params.draftText, params.selectedAttachmentIds)) {
		return null;
	}

	return {
		conversationId: params.conversationId ?? params.fallbackConversationId ?? 'draft',
		draftText: params.draftText,
		selectedAttachmentIds: params.selectedAttachmentIds,
		selectedAttachments: params.selectedAttachments,
		updatedAt: params.updatedAt ?? Date.now(),
	};
}

export function createDraftPersistence(fetchImpl: FetchLike = fetch, delayMs = 400) {
	let draftPersistTimer: ReturnType<typeof setTimeout> | null = null;
	let lastPersistKey = '';
	let pendingRequest:
		| { conversationId: string; draftText: string; selectedAttachmentIds: string[] }
		| null = null;

	async function runPersist(request: {
		conversationId: string;
		draftText: string;
		selectedAttachmentIds: string[];
	}): Promise<void> {
		try {
			if (!hasMeaningfulDraft(request.draftText, request.selectedAttachmentIds)) {
				await fetchImpl(`/api/conversations/${request.conversationId}/draft`, {
					method: 'DELETE',
				});
				return;
			}

			await fetchImpl(`/api/conversations/${request.conversationId}/draft`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					draftText: request.draftText,
					selectedAttachmentIds: request.selectedAttachmentIds,
				}),
			});
		} catch {
			// Ignore transient persistence failures in the composer.
		}
	}

	return {
		async persist(
			request: { conversationId: string; draftText: string; selectedAttachmentIds: string[] },
			immediate = false
		): Promise<void> {
			const key = `${request.conversationId}:${JSON.stringify({
				draftText: request.draftText,
				selectedAttachmentIds: request.selectedAttachmentIds,
			})}`;
			if (!immediate && key === lastPersistKey) {
				return;
			}

			lastPersistKey = key;
			pendingRequest = request;

			if (draftPersistTimer) {
				clearTimeout(draftPersistTimer);
				draftPersistTimer = null;
			}

			if (immediate) {
				const nextRequest = pendingRequest;
				pendingRequest = null;
				if (nextRequest) {
					await runPersist(nextRequest);
				}
				return;
			}

			draftPersistTimer = setTimeout(() => {
				const nextRequest = pendingRequest;
				pendingRequest = null;
				draftPersistTimer = null;
				if (nextRequest) {
					void runPersist(nextRequest);
				}
			}, delayMs);
		},

		async flush(): Promise<void> {
			if (draftPersistTimer) {
				clearTimeout(draftPersistTimer);
				draftPersistTimer = null;
			}

			const nextRequest = pendingRequest;
			pendingRequest = null;
			if (nextRequest) {
				await runPersist(nextRequest);
			}
		},

		clear(): void {
			if (draftPersistTimer) {
				clearTimeout(draftPersistTimer);
				draftPersistTimer = null;
			}
			pendingRequest = null;
			lastPersistKey = '';
		},
	};
}

export function cleanupPreparedConversation(params: {
	conversationId: string;
	removeLocal?: (conversationId: string) => void;
	fetchImpl?: FetchLike;
}): void {
	params.removeLocal?.(params.conversationId);
	void (params.fetchImpl ?? fetch)(`/api/conversations/${params.conversationId}`, {
		method: 'DELETE',
		keepalive: true,
	}).catch(() => {
		// Ignore cleanup failures; draft conversations are filtered from the sidebar anyway.
	});
}
