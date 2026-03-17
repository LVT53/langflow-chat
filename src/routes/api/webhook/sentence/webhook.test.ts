import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn()
}));

vi.mock('$lib/server/services/webhook-buffer', () => ({
	webhookBuffer: {
		addSentence: vi.fn(),
		getSentences: vi.fn(),
		getAllSessionIds: vi.fn(),
		getSessionData: vi.fn()
	}
}));

import { POST } from './+server';
import type { WebhookSentencePayload } from '$lib/types';

const mockRequireAuth = vi.fn();

function makeEvent(body: unknown, user = { id: 'user-1', email: 'test@example.com' }) {
	return {
		request: new Request('http://localhost/api/webhook/sentence', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: { 
			user, 
			webhookBuffer: {
				addSentence: vi.fn(),
				getSentences: vi.fn(),
				getAllSessionIds: vi.fn(),
				getSessionData: vi.fn()
			} 
		},
		params: {},
		url: new URL('http://localhost/api/webhook/sentence'),
		route: { id: '/api/webhook/sentence' }
	} as any;
}

describe('POST /api/webhook/sentence', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
	});

	it('returns 200 OK for valid payload', async () => {
		const payload: WebhookSentencePayload = {
			session_id: 'session-1',
			sentence: 'Hello world',
			index: 0,
			is_final: false
		};

		const event = makeEvent(payload);
		const response = await POST(event);

		expect(response.status).toBe(200);
		const data = await response.json();
		expect(data.success).toBe(true);
	});

	it('returns 400 for missing session_id', async () => {
		const payload = {
			sentence: 'Hello world',
			index: 0,
			is_final: false
		};

		const event = makeEvent(payload);
		const response = await POST(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toMatch(/Missing required fields/);
	});

	it('returns 400 for missing sentence', async () => {
		const payload = {
			session_id: 'session-1',
			index: 0,
			is_final: false
		};

		const event = makeEvent(payload);
		const response = await POST(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toMatch(/Missing required fields/);
	});

	it('returns 400 for missing index', async () => {
		const payload = {
			session_id: 'session-1',
			sentence: 'Hello world',
			is_final: false
		};

		const event = makeEvent(payload);
		const response = await POST(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toMatch(/Missing required fields/);
	});

	it('returns 400 for missing is_final', async () => {
		const payload = {
			session_id: 'session-1',
			sentence: 'Hello world',
			index: 0
		};

		const event = makeEvent(payload);
		const response = await POST(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toMatch(/Missing required fields/);
	});

	it('returns 400 for empty session_id', async () => {
		const payload: WebhookSentencePayload = {
			session_id: '',
			sentence: 'Hello world',
			index: 0,
			is_final: false
		};

		const event = makeEvent(payload);
		const response = await POST(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toMatch(/session_id must be a non-empty string/);
	});

	it('returns 400 for empty sentence', async () => {
		const payload: WebhookSentencePayload = {
			session_id: 'session-1',
			sentence: '',
			index: 0,
			is_final: false
		};

		const event = makeEvent(payload);
		const response = await POST(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toMatch(/sentence must be a non-empty string/);
	});

	it('returns 400 for negative index', async () => {
		const payload: WebhookSentencePayload = {
			session_id: 'session-1',
			sentence: 'Hello world',
			index: -1,
			is_final: false
		};

		const event = makeEvent(payload);
		const response = await POST(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toMatch(/index must be a non-negative integer/);
	});

	it('returns 400 for non-integer index', async () => {
		const payload = {
			session_id: 'session-1',
			sentence: 'Hello world',
			index: 1.5,
			is_final: false
		};

		const event = makeEvent(payload);
		const response = await POST(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toMatch(/index must be a non-negative integer/);
	});

	it('returns 400 for non-boolean is_final', async () => {
		const payload = {
			session_id: 'session-1',
			sentence: 'Hello world',
			index: 0,
			is_final: 'yes'
		};

		const event = makeEvent(payload);
		const response = await POST(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toMatch(/is_final must be a boolean/);
	});

	it('returns 400 for invalid JSON', async () => {
		const event = {
			request: new Request('http://localhost/api/webhook/sentence', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not-valid-json'
			}),
			locals: { 
				user: { id: 'user-1' }, 
				webhookBuffer: {
					addSentence: vi.fn(),
					getSentences: vi.fn(),
					getAllSessionIds: vi.fn(),
					getSessionData: vi.fn()
				} 
			},
			params: {},
			url: new URL('http://localhost/api/webhook/sentence'),
			route: { id: '/api/webhook/sentence' }
		} as any;

		const response = await POST(event);

		expect(response.status).toBe(400);
		const data = await response.json();
		expect(data.error).toMatch(/Invalid JSON body/);
	});

	it('stores sentence in webhook buffer', async () => {
		const payload: WebhookSentencePayload = {
			session_id: 'session-1',
			sentence: 'Hello world',
			index: 0,
			is_final: false
		};

		const mockWebhookBuffer = {
			addSentence: vi.fn()
		};

		const event = makeEvent(payload);
		// Override the locals.webhookBuffer with our mock
		event.locals.webhookBuffer = mockWebhookBuffer;

		const response = await POST(event);

		expect(response.status).toBe(200);
		expect(mockWebhookBuffer.addSentence).toHaveBeenCalledWith(
			'session-1',
			'Hello world',
			0,
			false
		);
	});

	it('handles out-of-order sentences correctly', async () => {
		// This test would require checking the actual buffer implementation
		// For now, we'll test that the endpoint accepts sentences regardless of order
		const payload1: WebhookSentencePayload = {
			session_id: 'session-1',
			sentence: 'First sentence',
			index: 1,
			is_final: false
		};

		const payload2: WebhookSentencePayload = {
			session_id: 'session-1',
			sentence: 'Second sentence',
			index: 0,
			is_final: false
		};

		const mockWebhookBuffer = {
			addSentence: vi.fn()
		};

		// Send sentences out of order
		let event = makeEvent(payload1);
		event.locals.webhookBuffer = mockWebhookBuffer;
		await POST(event);

		event = makeEvent(payload2);
		event.locals.webhookBuffer = mockWebhookBuffer;
		await POST(event);

		expect(mockWebhookBuffer.addSentence).toHaveBeenCalledTimes(2);
		expect(mockWebhookBuffer.addSentence).toHaveBeenNthCalledWith(1, 'session-1', 'First sentence', 1, false);
		expect(mockWebhookBuffer.addSentence).toHaveBeenNthCalledWith(2, 'session-1', 'Second sentence', 0, false);
	});

	it('marks session as complete when is_final is true', async () => {
		const payload: WebhookSentencePayload = {
			session_id: 'session-1',
			sentence: 'Final sentence',
			index: 0,
			is_final: true
		};

		const mockWebhookBuffer = {
			addSentence: vi.fn()
		};

		const event = makeEvent(payload);
		event.locals.webhookBuffer = mockWebhookBuffer;

		const response = await POST(event);

		expect(response.status).toBe(200);
		expect(mockWebhookBuffer.addSentence).toHaveBeenCalledWith(
			'session-1',
			'Final sentence',
			0,
			true
		);
	});
});