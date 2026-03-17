import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn()
}));

vi.mock('$lib/server/services/conversations', () => ({
	getConversation: vi.fn(),
	touchConversation: vi.fn()
}));

vi.mock('$lib/server/services/langflow', () => ({
	sendMessageStream: vi.fn()
}));

vi.mock('$lib/server/services/messages', () => ({
	createMessage: vi.fn()
}));

vi.mock('$lib/server/services/language', () => ({
	detectLanguage: vi.fn()
}));

vi.mock('$lib/server/services/translator', () => ({
	translateHungarianToEnglish: vi.fn(),
	StreamingHungarianTranslator: class {
		addChunk = vi.fn(async (chunk: string) => [`HU:${chunk}`]);
		flush = vi.fn(async () => []);
	}
}));

vi.mock('$lib/server/env', () => ({
	config: {
		maxMessageLength: 10000
	}
}));

import { POST } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import { getConversation, touchConversation } from '$lib/server/services/conversations';
import { sendMessageStream } from '$lib/server/services/langflow';
import { createMessage } from '$lib/server/services/messages';
import { detectLanguage } from '$lib/server/services/language';
import { translateHungarianToEnglish } from '$lib/server/services/translator';

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockGetConversation = getConversation as ReturnType<typeof vi.fn>;
const mockTouchConversation = touchConversation as ReturnType<typeof vi.fn>;
const mockSendMessageStream = sendMessageStream as ReturnType<typeof vi.fn>;
const mockCreateMessage = createMessage as ReturnType<typeof vi.fn>;
const mockDetectLanguage = detectLanguage as ReturnType<typeof vi.fn>;
const mockTranslateHungarianToEnglish = translateHungarianToEnglish as ReturnType<typeof vi.fn>;

function makeEvent(body: unknown, user = { id: 'user-1', email: 'test@example.com' }) {
	return {
		request: new Request('http://localhost/api/chat/stream', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: {
			user,
			webhookBuffer: {
				getSentences: vi.fn(() => null),
				clearSession: vi.fn()
			}
		},
		params: {},
		url: new URL('http://localhost/api/chat/stream'),
		route: { id: '/api/chat/stream' }
	} as any;
}

function buildSseStream(lines: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const line of lines) {
				controller.enqueue(encoder.encode(line));
			}
			controller.close();
		}
	});
}

async function readSseResponse(response: Response): Promise<string> {
	const reader = response.body!.getReader();
	const chunks: Uint8Array[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) chunks.push(value);
	}
	const decoder = new TextDecoder();
	return chunks.map((c) => decoder.decode(c)).join('');
}

describe('POST /api/chat/stream', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
		mockTouchConversation.mockImplementation(async () => null);
		mockCreateMessage.mockImplementation(async () => null);
		mockDetectLanguage.mockReturnValue('en');
		mockTranslateHungarianToEnglish.mockImplementation(async (message: string) => `EN:${message}`);
	});

	it('returns text/event-stream content-type for valid request', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockSendMessageStream.mockResolvedValue(
			buildSseStream([
				'event: add_message\ndata: {"text":"Hello"}\n\n',
				'data: [DONE]\n\n'
			])
		);

		const event = makeEvent({ message: 'Hi', conversationId: 'conv-1' });
		const response = await POST(event);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/event-stream');
	});

	it('stream contains token events with text chunks', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockSendMessageStream.mockResolvedValue(
			buildSseStream([
				'event: add_message\ndata: {"text":"Hello"}\n\n',
				'event: add_message\ndata: {"text":" world"}\n\n',
				'data: [DONE]\n\n'
			])
		);

		const event = makeEvent({ message: 'Hi', conversationId: 'conv-1' });
		const response = await POST(event);
		const body = await readSseResponse(response);

		expect(body).toContain('event: token');
		expect(body).toContain('"text":"Hello"');
		expect(body).toContain('"text":" world"');
	});

	it('parses CRLF-delimited SSE blocks from Langflow', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockSendMessageStream.mockResolvedValue(
			buildSseStream([
				'event: add_message\r\ndata: {"text":"Hello"}\r\n\r\n',
				'event: add_message\r\ndata: {"text":" world"}\r\n\r\n',
				'data: [DONE]\r\n\r\n'
			])
		);

		const event = makeEvent({ message: 'Hi', conversationId: 'conv-1' });
		const response = await POST(event);
		const body = await readSseResponse(response);

		expect(body).toContain('event: token');
		expect(body).toContain('"text":"Hello"');
		expect(body).toContain('"text":" world"');
		expect(body).toContain('event: end');
	});

	it('parses Langflow JSON event blocks and ignores echoed user messages', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockSendMessageStream.mockResolvedValue(
			buildSseStream([
				'{"event":"add_message","data":{"sender":"User","text":"Hi"}}\n\n',
				'{"event":"add_message","data":{"sender":"Machine","text":"Hello"}}\n\n',
				'{"event":"end","data":{}}\n\n'
			])
		);

		const event = makeEvent({ message: 'Hi', conversationId: 'conv-1' });
		const response = await POST(event);
		const body = await readSseResponse(response);

		expect(body).toContain('event: token');
		expect(body).toContain('"text":"Hello"');
		expect(body).not.toContain('"text":"Hi"');
	});

	it('emits only deltas when Langflow sends cumulative assistant snapshots', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockSendMessageStream.mockResolvedValue(
			buildSseStream([
				'{"event":"add_message","data":{"sender":"Machine","text":"Hello"}}\n\n',
				'{"event":"add_message","data":{"sender":"Machine","text":"Hello world"}}\n\n',
				'{"event":"add_message","data":{"sender":"Machine","text":"Hello world again"}}\n\n',
				'{"event":"end","data":{}}\n\n'
			])
		);

		const event = makeEvent({ message: 'Hi', conversationId: 'conv-1' });
		const response = await POST(event);
		const body = await readSseResponse(response);

		expect(body).toContain('"text":"Hello"');
		expect(body).toContain('"text":" world"');
		expect(body).toContain('"text":" again"');
		expect(body).not.toContain('"text":"Hello world"');
		expect(mockCreateMessage).toHaveBeenNthCalledWith(1, 'conv-1', 'user', 'Hi');
		expect(mockCreateMessage).toHaveBeenNthCalledWith(
			2,
			'conv-1',
			'assistant',
			'Hello world again'
		);
	});

	it('translates Hungarian input before sending it to Langflow', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockDetectLanguage.mockReturnValue('hu');
		mockSendMessageStream.mockResolvedValue(
			buildSseStream([
				'{"event":"add_message","data":{"sender":"Machine","text":"Final English answer."}}\n\n',
				'{"event":"end","data":{}}\n\n'
			])
		);

		const event = makeEvent({ message: 'Szia', conversationId: 'conv-1' });
		const response = await POST(event);
		const body = await readSseResponse(response);

		expect(mockTranslateHungarianToEnglish).toHaveBeenCalledWith('Szia');
		expect(mockSendMessageStream).toHaveBeenCalledWith('EN:Szia', 'conv-1', expect.any(Object));
		expect(body).toContain('"text":"HU:Final English answer."');
	});

	it('stream ends with end event after [DONE]', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockSendMessageStream.mockResolvedValue(
			buildSseStream([
				'event: add_message\ndata: {"text":"chunk"}\n\n',
				'data: [DONE]\n\n'
			])
		);

		const event = makeEvent({ message: 'Hi', conversationId: 'conv-1' });
		const response = await POST(event);
		const body = await readSseResponse(response);

		expect(body).toContain('event: end');
		expect(body).toContain('data: {}');
	});

	it('returns 401 when user is not authenticated', async () => {
		mockRequireAuth.mockImplementation(() => {
			throw { status: 302, location: '/login' };
		});

		const event = makeEvent({ message: 'Hi', conversationId: 'conv-1' });

		await expect(POST(event)).rejects.toMatchObject({ status: 302 });
	});

	it('returns 404 when conversationId does not exist', async () => {
		mockGetConversation.mockResolvedValue(null);

		const event = makeEvent({ message: 'Hi', conversationId: 'nonexistent' });
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toMatch(/not found/i);
	});

	it('emits error event when sendMessageStream throws', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockSendMessageStream.mockRejectedValue(new Error('Langflow down'));

		const event = makeEvent({ message: 'Hi', conversationId: 'conv-1' });
		const response = await POST(event);
		const body = await readSseResponse(response);

		expect(body).toContain('event: error');
		expect(body).toContain('"code":"backend_failure"');
		expect(body).toContain('temporary issue generating a response');
	});

	it('returns 400 when message is empty', async () => {
		const event = makeEvent({ message: '', conversationId: 'conv-1' });
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/non-empty/i);
	});

	it('returns 400 when conversationId is missing', async () => {
		const event = makeEvent({ message: 'Hello' });
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/conversationId/i);
	});
});
