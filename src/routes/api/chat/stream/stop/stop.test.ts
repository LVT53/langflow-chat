import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn(),
}));

import { POST } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	registerActiveChatStream,
	unregisterActiveChatStream,
} from '$lib/server/services/chat-turn/active-streams';

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;

function makeEvent(body: unknown, userId = 'user-1') {
	return {
		request: new Request('http://localhost/api/chat/stream/stop', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		}),
		locals: {
			user: {
				id: userId,
				email: 'test@example.com',
				translationEnabled: false,
			},
		},
		params: {},
		url: new URL('http://localhost/api/chat/stream/stop'),
		route: { id: '/api/chat/stream/stop' },
	} as any;
}

describe('POST /api/chat/stream/stop', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
	});

	it('returns 400 when streamId is missing', async () => {
		const response = await POST(makeEvent({}));
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toMatch(/streamId/i);
	});

	it('aborts an active stream for the current user', async () => {
		const controller = new AbortController();
		registerActiveChatStream({
			streamId: 'stream-1',
			userId: 'user-1',
			controller,
		});

		const response = await POST(makeEvent({ streamId: 'stream-1' }));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.stopped).toBe(true);
		expect(controller.signal.aborted).toBe(true);

		unregisterActiveChatStream('stream-1', controller);
	});
});
