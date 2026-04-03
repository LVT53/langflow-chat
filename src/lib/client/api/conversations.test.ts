import { describe, expect, it, vi } from 'vitest';
import { conversationExists } from './conversations';

describe('conversationExists', () => {
	it('returns true when the conversation detail endpoint succeeds', async () => {
		const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));

		await expect(conversationExists('conv-1', fetchMock)).resolves.toBe(true);
		expect(fetchMock).toHaveBeenCalledWith('/api/conversations/conv-1');
	});

	it('returns false when the conversation detail endpoint returns 404', async () => {
		const fetchMock = vi.fn(async () => new Response('Not found', { status: 404 }));

		await expect(conversationExists('conv-1', fetchMock)).resolves.toBe(false);
	});

	it('returns null on transient failures', async () => {
		const fetchMock = vi.fn(async () => new Response('Server error', { status: 500 }));

		await expect(conversationExists('conv-1', fetchMock)).resolves.toBeNull();
	});
});
