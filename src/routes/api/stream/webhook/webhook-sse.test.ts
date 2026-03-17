import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn()
}));

vi.mock('$lib/server/services/webhook-buffer', () => ({
	webhookBuffer: {
		getSentences: vi.fn(),
		clearSession: vi.fn()
	}
}));

import { GET } from './[sessionId]/+server';
import { requireAuth } from '$lib/server/auth/hooks';
import { webhookBuffer } from '$lib/server/services/webhook-buffer';

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockGetSentences = webhookBuffer.getSentences as ReturnType<typeof vi.fn>;
const mockClearSession = webhookBuffer.clearSession as ReturnType<typeof vi.fn>;

function makeEvent(sessionId: string, user = { id: 'user-1', email: 'test@example.com' }) {
	return {
		request: new Request(`http://localhost/api/stream/webhook/${sessionId}`),
		locals: { user },
		params: { sessionId },
		url: new URL(`http://localhost/api/stream/webhook/${sessionId}`),
		route: { id: '/api/stream/webhook/[sessionId]' }
	} as any;
}

async function collectSseEvents(response: Response, maxMs = 500): Promise<string> {
	const reader = response.body!.getReader();
	const decoder = new TextDecoder();
	const chunks: string[] = [];

	const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, maxMs));
	const readPromise = (async () => {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) chunks.push(decoder.decode(value));
		}
	})();

	await Promise.race([readPromise, timeoutPromise]);
	reader.cancel();

	return chunks.join('');
}

describe('GET /api/stream/webhook/[sessionId]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mockRequireAuth.mockReturnValue(undefined);
		mockClearSession.mockReturnValue(undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns text/event-stream content-type', async () => {
		mockGetSentences.mockReturnValue({ sentences: [], isComplete: false });

		const event = makeEvent('session-1');
		const response = await GET(event);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');
		expect(response.headers.get('Cache-Control')).toBe('no-cache');
		expect(response.headers.get('Connection')).toBe('keep-alive');

		response.body?.cancel();
	});

	it('streams sentence events as they arrive in buffer', async () => {
		let callCount = 0;
		mockGetSentences.mockImplementation(() => {
			callCount++;
			if (callCount < 3) return { sentences: [], isComplete: false };
			if (callCount < 5) return { sentences: ['Hello world'], isComplete: false };
			return { sentences: ['Hello world', 'Second sentence'], isComplete: true };
		});

		const event = makeEvent('session-1');
		const response = await GET(event);

		const chunks: string[] = [];
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();

		const readUntilEnd = async () => {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) chunks.push(decoder.decode(value));
			}
		};

		const readPromise = readUntilEnd();
		vi.advanceTimersByTimeAsync(600);
		await readPromise;

		const body = chunks.join('');
		expect(body).toContain('event: sentence');
		expect(body).toContain('"text":"Hello world"');
		expect(body).toContain('"index":0');
		expect(body).toContain('"text":"Second sentence"');
		expect(body).toContain('"index":1');
		expect(body).toContain('event: end');
		expect(body).toContain('data: {}');
	});

	it('emits end event when session is complete', async () => {
		mockGetSentences.mockReturnValue({ sentences: ['Final sentence'], isComplete: true });

		const event = makeEvent('session-1');
		const response = await GET(event);

		const chunks: string[] = [];
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();

		const readPromise = (async () => {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) chunks.push(decoder.decode(value));
			}
		})();

		await vi.advanceTimersByTimeAsync(200);
		await readPromise;

		const body = chunks.join('');
		expect(body).toContain('event: sentence');
		expect(body).toContain('event: end');
		expect(body).toContain('data: {}');
	});

	it('cleans up session data when stream ends', async () => {
		mockGetSentences.mockReturnValue({ sentences: ['Done'], isComplete: true });

		const event = makeEvent('session-abc');
		const response = await GET(event);

		const reader = response.body!.getReader();
		const readPromise = (async () => {
			while (true) {
				const { done } = await reader.read();
				if (done) break;
			}
		})();

		await vi.advanceTimersByTimeAsync(200);
		await readPromise;

		expect(mockClearSession).toHaveBeenCalledWith('session-abc');
	});

	it('emits timeout error event after 2 minutes of inactivity', async () => {
		mockGetSentences.mockReturnValue({ sentences: [], isComplete: false });

		const event = makeEvent('session-timeout');
		const response = await GET(event);

		const chunks: string[] = [];
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();

		const readPromise = (async () => {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) chunks.push(decoder.decode(value));
			}
		})();

		await vi.advanceTimersByTimeAsync(120_001);
		await readPromise;

		const body = chunks.join('');
		expect(body).toContain('event: error');
		expect(body).toContain('Stream timed out');
	});

	it('does not replay already-sent sentences on subsequent polls', async () => {
		let callCount = 0;
		mockGetSentences.mockImplementation(() => {
			callCount++;
			if (callCount <= 2) return { sentences: ['First'], isComplete: false };
			return { sentences: ['First', 'Second'], isComplete: true };
		});

		const event = makeEvent('session-dedup');
		const response = await GET(event);

		const chunks: string[] = [];
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();

		const readPromise = (async () => {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) chunks.push(decoder.decode(value));
			}
		})();

		await vi.advanceTimersByTimeAsync(400);
		await readPromise;

		const body = chunks.join('');
		const sentenceMatches = [...body.matchAll(/event: sentence/g)];
		expect(sentenceMatches).toHaveLength(2);
	});

	it('handles null buffer result gracefully (session not yet created)', async () => {
		let callCount = 0;
		mockGetSentences.mockImplementation(() => {
			callCount++;
			if (callCount < 4) return null;
			return { sentences: ['Hello'], isComplete: true };
		});

		const event = makeEvent('session-late');
		const response = await GET(event);

		const chunks: string[] = [];
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();

		const readPromise = (async () => {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) chunks.push(decoder.decode(value));
			}
		})();

		await vi.advanceTimersByTimeAsync(500);
		await readPromise;

		const body = chunks.join('');
		expect(body).toContain('event: sentence');
		expect(body).toContain('event: end');
	});

	it('streams sentence events with correct index values', async () => {
		mockGetSentences.mockReturnValue({
			sentences: ['Sentence A', 'Sentence B', 'Sentence C'],
			isComplete: true
		});

		const event = makeEvent('session-idx');
		const response = await GET(event);

		const chunks: string[] = [];
		const reader = response.body!.getReader();
		const decoder = new TextDecoder();

		const readPromise = (async () => {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				if (value) chunks.push(decoder.decode(value));
			}
		})();

		await vi.advanceTimersByTimeAsync(200);
		await readPromise;

		const body = chunks.join('');
		expect(body).toContain('"index":0');
		expect(body).toContain('"index":1');
		expect(body).toContain('"index":2');
		expect(body).toContain('"text":"Sentence A"');
		expect(body).toContain('"text":"Sentence B"');
		expect(body).toContain('"text":"Sentence C"');
	});

	it('throws when user is not authenticated', async () => {
		mockRequireAuth.mockImplementation(() => {
			throw { status: 302, location: '/login' };
		});

		const event = makeEvent('session-1');
		await expect(GET(event)).rejects.toMatchObject({ status: 302 });
	});
});
