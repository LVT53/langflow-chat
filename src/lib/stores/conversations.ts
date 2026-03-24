import { writable } from 'svelte/store';
import type { ConversationListItem } from '$lib/types';

export const conversations = writable<ConversationListItem[]>([]);

export async function loadConversations(): Promise<void> {
	try {
		const res = await fetch('/api/conversations');
		if (!res.ok) throw new Error('Failed to load conversations');
		const data = await res.json();
		conversations.set(data.conversations || []);
	} catch (error) {
		console.error('Error loading conversations:', error);
	}
}

let isCreating = false;

export async function createNewConversation(): Promise<string> {
	if (isCreating) {
		throw new Error('Please wait, a conversation is already being created.');
	}

	isCreating = true;
	try {
		const res = await fetch('/api/conversations', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({})
		});

		if (!res.ok) {
			const errorText = await res.text().catch(() => 'Unknown error');
			console.error('Failed to create conversation:', res.status, errorText);
			throw new Error('We could not create a new conversation at this time. Please try again later.');
		}

		let data;
		try {
			data = await res.json();
		} catch (parseError) {
			console.error('Failed to parse response:', parseError);
			throw new Error('Received an invalid response from the server. Please try again.');
		}

		if (!data || !data.id || typeof data.id !== 'string') {
			console.error('Invalid response from create conversation API:', data);
			throw new Error('The server returned unexpected data. Please try again.');
		}

		return data.id;
	} catch (error) {
		console.error('Error in createNewConversation:', error);
		if (error instanceof Error) {
			throw error;
		}
		throw new Error('An unexpected error occurred while creating a conversation. Please try again.');
	} finally {
		isCreating = false;
	}
}

export function upsertConversationLocal(id: string, title = 'New Conversation', updatedAt = Date.now() / 1000): void {
	conversations.update((items) => {
		const existingIndex = items.findIndex((item) => item.id === id);
		if (existingIndex === -1) {
			return [{ id, title, updatedAt }, ...items];
		}

		const nextItems = [...items];
		nextItems[existingIndex] = {
			...nextItems[existingIndex],
			updatedAt
		};
		return nextItems;
	});
}

export function removeConversationLocal(id: string): void {
	conversations.update((items) => items.filter((conversation) => conversation.id !== id));
}

export async function deleteConversationById(id: string): Promise<void> {
	const res = await fetch(`/api/conversations/${id}`, {
		method: 'DELETE'
	});
	if (!res.ok) throw new Error('Failed to delete conversation');
	
	conversations.update(items => items.filter(c => c.id !== id));
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const res = await fetch(`/api/conversations/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ title })
  });
  if (!res.ok) throw new Error('Failed to rename conversation');
  
  conversations.update(items => 
    items.map(c => c.id === id ? { ...c, title } : c)
  );
}

export function updateConversationTitleLocal(id: string, title: string): void {
  conversations.update(items =>
    items.map(c => c.id === id ? { ...c, title } : c)
  );
}

export async function moveConversationToProject(id: string, projectId: string | null): Promise<void> {
  const res = await fetch(`/api/conversations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
  if (!res.ok) throw new Error('Failed to move conversation');
  conversations.update(items =>
    items.map(c => c.id === id ? { ...c, projectId } : c)
  );
}

export function clearProjectFromConversations(projectId: string): void {
  conversations.update(items =>
    items.map(c => c.projectId === projectId ? { ...c, projectId: null } : c)
  );
}
