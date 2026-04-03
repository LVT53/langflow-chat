import type {
	ChatMessage,
	ContextDebugState,
	ConversationDetail,
	ConversationListItem,
	TaskState,
	TaskSteeringPayload,
} from '$lib/types';
import { requestJson, requestVoid, type FetchLike } from './http';

type ConversationSummary = Pick<ConversationListItem, 'id' | 'title' | 'updatedAt' | 'projectId'>;
type MessageEvidenceSummary = ChatMessage['evidenceSummary'];

export type MessageEvidenceResult =
	| { status: 'pending' }
	| { status: 'none' }
	| { status: 'missing' }
	| { status: 'ready'; evidenceSummary?: MessageEvidenceSummary };

interface TitleGenerationResponse {
	title: string | null;
}

interface TaskSteeringResponse {
	taskState?: TaskState | null;
	contextDebug?: ContextDebugState | null;
}

interface ConversationDraftPayload {
	draftText: string;
	selectedAttachmentIds: string[];
}

export async function fetchConversations(): Promise<ConversationListItem[]> {
	const payload = await requestJson<{ conversations?: ConversationListItem[] }>(
		'/api/conversations',
		undefined,
		'Failed to load conversations'
	);
	return Array.isArray(payload.conversations) ? payload.conversations : [];
}

export async function fetchConversationDetail(
	id: string,
	options?: { view?: 'bootstrap' }
): Promise<ConversationDetail> {
	const viewParam = options?.view ? `?view=${encodeURIComponent(options.view)}` : '';

	return requestJson<ConversationDetail>(
		`/api/conversations/${id}${viewParam}`,
		undefined,
		'Failed to load conversation'
	);
}

export async function conversationExists(
	id: string,
	fetchImpl: FetchLike = fetch
): Promise<boolean | null> {
	try {
		const response = await fetchImpl(`/api/conversations/${id}`);
		if (response.status === 404) {
			return false;
		}
		if (response.ok) {
			return true;
		}
		return null;
	} catch {
		return null;
	}
}

export async function createConversation(title?: string): Promise<ConversationSummary> {
	const payload = await requestJson<ConversationSummary>(
		'/api/conversations',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(title ? { title } : {}),
		},
		'We could not create a new conversation at this time. Please try again later.'
	);

	if (!payload || typeof payload.id !== 'string') {
		throw new Error('The server returned unexpected data. Please try again.');
	}

	return payload;
}

export async function renameConversation(
	id: string,
	title: string
): Promise<ConversationSummary> {
	return requestJson<ConversationSummary>(
		`/api/conversations/${id}`,
		{
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ title }),
		},
		'Failed to rename conversation'
	);
}

export async function moveConversationToProject(
	id: string,
	projectId: string | null
): Promise<ConversationSummary> {
	return requestJson<ConversationSummary>(
		`/api/conversations/${id}`,
		{
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ projectId }),
		},
		'Failed to move conversation'
	);
}

export async function deleteConversation(id: string): Promise<void> {
	await requestVoid(
		`/api/conversations/${id}`,
		{
			method: 'DELETE',
		},
		'Failed to delete conversation'
	);
}

export async function persistConversationDraft(
	conversationId: string,
	payload: ConversationDraftPayload,
	fetchImpl: FetchLike = fetch
): Promise<void> {
	await requestVoid(
		`/api/conversations/${conversationId}/draft`,
		{
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		},
		'Failed to save conversation draft',
		fetchImpl
	);
}

export async function deleteConversationDraft(
	conversationId: string,
	fetchImpl: FetchLike = fetch
): Promise<void> {
	await requestVoid(
		`/api/conversations/${conversationId}/draft`,
		{
			method: 'DELETE',
		},
		'Failed to delete conversation draft',
		fetchImpl
	);
}

export async function deletePreparedConversation(
	conversationId: string,
	options?: { keepalive?: boolean; fetchImpl?: FetchLike }
): Promise<void> {
	await requestVoid(
		`/api/conversations/${conversationId}`,
		{
			method: 'DELETE',
			...(options?.keepalive ? { keepalive: true } : {}),
		},
		'Failed to delete conversation',
		options?.fetchImpl
	);
}

export async function fetchMessageEvidence(
	conversationId: string,
	messageId: string,
	signal?: AbortSignal
): Promise<MessageEvidenceResult> {
	const response = await fetch(
		`/api/conversations/${conversationId}/messages/${messageId}/evidence`,
		{ signal }
	);

	if (response.status === 202) {
		return { status: 'pending' };
	}

	if (response.status === 204) {
		return { status: 'none' };
	}

	if (response.status === 404) {
		return { status: 'missing' };
	}

	if (!response.ok) {
		throw new Error('Failed to load message evidence');
	}

	const payload = (await response.json()) as {
		evidenceSummary?: MessageEvidenceSummary;
	};

	return {
		status: 'ready',
		evidenceSummary: payload.evidenceSummary,
	};
}

export async function generateConversationTitle(
	conversationId: string,
	params: { userMessage: string; assistantResponse: string }
): Promise<string | null> {
	const payload = await requestJson<TitleGenerationResponse>(
		`/api/conversations/${conversationId}/title`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(params),
		},
		'Failed to generate conversation title'
	);

	return typeof payload.title === 'string' && payload.title.trim().length > 0 ? payload.title : null;
}

export async function deleteConversationMessages(
	conversationId: string,
	messageIds: string[]
): Promise<number> {
	const payload = await requestJson<{ deleted?: number }>(
		`/api/conversations/${conversationId}/messages`,
		{
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ messageIds }),
		},
		'Failed to delete messages'
	);

	return typeof payload.deleted === 'number' ? payload.deleted : 0;
}

export async function applyTaskSteering(
	conversationId: string,
	payload: TaskSteeringPayload
): Promise<TaskSteeringResponse> {
	return requestJson<TaskSteeringResponse>(
		`/api/conversations/${conversationId}/task-steering`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(payload),
		},
		'Failed to update task steering'
	);
}
