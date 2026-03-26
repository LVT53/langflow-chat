import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
	conversations,
	createNewConversation,
	deleteConversationById,
	loadConversations,
	moveConversationToProject,
	renameConversation,
} from './conversations';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body), {
		headers: { 'Content-Type': 'application/json' },
		...init,
	});
}

describe('conversations store', () => {
	beforeEach(() => {
		conversations.set([]);
		vi.restoreAllMocks();
		vi.stubGlobal('fetch', vi.fn());
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('loads conversations from the API', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({
				conversations: [{ id: 'conv-1', title: 'One', updatedAt: 123, projectId: null }],
			})
		);

		await loadConversations();

		expect(get(conversations)).toEqual([
			{ id: 'conv-1', title: 'One', updatedAt: 123, projectId: null },
		]);
	});

	it('creates a conversation through the API', async () => {
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse(
				{ id: 'conv-1', title: 'New Conversation', updatedAt: 123, projectId: null },
				{ status: 201 }
			)
		);

		await expect(createNewConversation()).resolves.toBe('conv-1');
		expect(fetch).toHaveBeenCalledWith(
			'/api/conversations',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('renames a conversation and updates the store locally', async () => {
		conversations.set([{ id: 'conv-1', title: 'Old', updatedAt: 123, projectId: null }]);
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({ id: 'conv-1', title: 'New', updatedAt: 123, projectId: null })
		);

		await renameConversation('conv-1', 'New');

		expect(get(conversations)).toEqual([
			{ id: 'conv-1', title: 'New', updatedAt: 123, projectId: null },
		]);
	});

	it('moves a conversation to a project and updates the store locally', async () => {
		conversations.set([{ id: 'conv-1', title: 'Chat', updatedAt: 123, projectId: null }]);
		vi.mocked(fetch).mockResolvedValueOnce(
			jsonResponse({ id: 'conv-1', title: 'Chat', updatedAt: 123, projectId: 'proj-1' })
		);

		await moveConversationToProject('conv-1', 'proj-1');

		expect(get(conversations)).toEqual([
			{ id: 'conv-1', title: 'Chat', updatedAt: 123, projectId: 'proj-1' },
		]);
	});

	it('deletes a conversation and removes it from the store', async () => {
		conversations.set([{ id: 'conv-1', title: 'Chat', updatedAt: 123, projectId: null }]);
		vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ success: true }));

		await deleteConversationById('conv-1');

		expect(get(conversations)).toEqual([]);
	});
});
