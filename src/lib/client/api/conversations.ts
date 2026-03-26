import type { ConversationListItem } from '$lib/types';
import { requestJson } from './http';

type ConversationSummary = Pick<ConversationListItem, 'id' | 'title' | 'updatedAt' | 'projectId'>;

export async function fetchConversations(): Promise<ConversationListItem[]> {
	const payload = await requestJson<{ conversations?: ConversationListItem[] }>(
		'/api/conversations',
		undefined,
		'Failed to load conversations'
	);
	return Array.isArray(payload.conversations) ? payload.conversations : [];
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
	await requestJson<{ success?: boolean }>(
		`/api/conversations/${id}`,
		{
			method: 'DELETE',
		},
		'Failed to delete conversation'
	);
}
