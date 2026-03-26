import { writable } from 'svelte/store';
import type { ConversationListItem } from '$lib/types';
import {
	createConversation,
	deleteConversation,
	fetchConversations,
	moveConversationToProject as moveConversationRequest,
	renameConversation as renameConversationRequest,
} from '$lib/client/api/conversations';

export const conversations = writable<ConversationListItem[]>([]);

export async function loadConversations(): Promise<void> {
	try {
		conversations.set(await fetchConversations());
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
		const conversation = await createConversation();
		return conversation.id;
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
	await deleteConversation(id);
	conversations.update((items) => items.filter((conversation) => conversation.id !== id));
}

export async function renameConversation(id: string, title: string): Promise<void> {
	await renameConversationRequest(id, title);
	conversations.update((items) =>
		items.map((conversation) => (conversation.id === id ? { ...conversation, title } : conversation))
	);
}

export function updateConversationTitleLocal(id: string, title: string): void {
	conversations.update((items) =>
		items.map((conversation) =>
			conversation.id === id ? { ...conversation, title } : conversation
		)
	);
}

export async function moveConversationToProject(id: string, projectId: string | null): Promise<void> {
	await moveConversationRequest(id, projectId);
	conversations.update((items) =>
		items.map((conversation) =>
			conversation.id === id ? { ...conversation, projectId } : conversation
		)
	);
}

export function clearProjectFromConversations(projectId: string): void {
	conversations.update((items) =>
		items.map((conversation) =>
			conversation.projectId === projectId
				? { ...conversation, projectId: null }
				: conversation
		)
	);
}
