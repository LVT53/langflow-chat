import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn()
}));

vi.mock('$lib/server/services/conversations', () => ({
	getConversation: vi.fn(),
	touchConversation: vi.fn()
}));

vi.mock('$lib/server/services/langflow', () => ({
	sendMessage: vi.fn()
}));

vi.mock('$lib/server/services/messages', () => ({
	createMessage: vi.fn()
}));

vi.mock('$lib/server/services/knowledge', () => ({
	attachArtifactsToMessage: vi.fn(),
	createGeneratedOutputArtifact: vi.fn(),
	getConversationWorkingSet: vi.fn(async () => []),
	listConversationSourceArtifactIds: vi.fn(async () => []),
	refreshConversationWorkingSet: vi.fn(async () => []),
	upsertWorkCapsule: vi.fn(async () => null)
}));

vi.mock('$lib/server/services/task-state', () => ({
	getContextDebugState: vi.fn(async () => null),
	getConversationTaskState: vi.fn(async () => null),
	updateTaskStateCheckpoint: vi.fn(async () => null),
}));

vi.mock('$lib/server/services/language', () => ({
	detectLanguage: vi.fn()
}));

vi.mock('$lib/server/services/translator', () => ({
	translateHungarianToEnglish: vi.fn(),
	translateEnglishToHungarian: vi.fn()
}));

vi.mock('$lib/server/services/honcho', () => ({
	capturePersonaMemorySnapshot: vi.fn(async () => new Set()),
	mirrorMessage: vi.fn(async () => undefined),
	mirrorWorkCapsuleConclusion: vi.fn(async () => undefined),
	syncConversationPersonaMemoryAttributions: vi.fn(async () => 0),
}));

vi.mock('$lib/server/env', () => ({
	config: {
		maxMessageLength: 10000
	}
}));

import { POST } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import { getConversation, touchConversation } from '$lib/server/services/conversations';
import { sendMessage } from '$lib/server/services/langflow';
import { createMessage } from '$lib/server/services/messages';
import { detectLanguage } from '$lib/server/services/language';
import {
	translateEnglishToHungarian,
	translateHungarianToEnglish
} from '$lib/server/services/translator';

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockGetConversation = getConversation as ReturnType<typeof vi.fn>;
const mockTouchConversation = touchConversation as ReturnType<typeof vi.fn>;
const mockSendMessage = sendMessage as ReturnType<typeof vi.fn>;
const mockCreateMessage = createMessage as ReturnType<typeof vi.fn>;
const mockDetectLanguage = detectLanguage as ReturnType<typeof vi.fn>;
const mockTranslateHungarianToEnglish = translateHungarianToEnglish as ReturnType<typeof vi.fn>;
const mockTranslateEnglishToHungarian = translateEnglishToHungarian as ReturnType<typeof vi.fn>;

function makeEvent(body: unknown, user = { id: 'user-1', email: 'test@example.com' }) {
	return {
		request: new Request('http://localhost/api/chat/send', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: { user },
		params: {},
		url: new URL('http://localhost/api/chat/send'),
		route: { id: '/api/chat/send' }
	} as any;
}

describe('POST /api/chat/send', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
		mockTouchConversation.mockImplementation(async () => null);
		mockCreateMessage.mockImplementation(async () => ({
			id: crypto.randomUUID(),
			role: 'user',
			content: '',
			timestamp: Date.now()
		}));
		mockDetectLanguage.mockReturnValue('en');
		mockTranslateHungarianToEnglish.mockImplementation(async (message: string) => `EN:${message}`);
		mockTranslateEnglishToHungarian.mockImplementation(async (message: string) => `HU:${message}`);
	});

	it('returns AI response text for a valid request', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockSendMessage.mockResolvedValue({ text: 'Hello from AI!', rawResponse: {}, contextStatus: undefined });

		const event = makeEvent({ message: 'Hello', conversationId: 'conv-1' });
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.response.text).toBe('Hello from AI!');
		expect(data.conversationId).toBe('conv-1');
		expect(mockSendMessage).toHaveBeenCalledWith('Hello', 'conv-1', undefined, 'user-1', {
			attachmentIds: []
		});
	});

	it('translates Hungarian requests and responses when translationEnabled is true', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockDetectLanguage.mockReturnValue('hu');
		mockSendMessage.mockResolvedValue({ text: 'Hello from AI!', rawResponse: {}, contextStatus: undefined });

		const userWithTranslation = { id: 'user-1', email: 'test@example.com', translationEnabled: true };
		const event = makeEvent({ message: 'Szia', conversationId: 'conv-1' }, userWithTranslation);
		const response = await POST(event);
		const data = await response.json();

		expect(mockTranslateHungarianToEnglish).toHaveBeenCalledWith('Szia');
		expect(mockSendMessage).toHaveBeenCalledWith('EN:Szia', 'conv-1', undefined, 'user-1', {
			attachmentIds: []
		});
		expect(mockTranslateEnglishToHungarian).toHaveBeenCalledWith('Hello from AI!');
		expect(data.response.text).toBe('HU:Hello from AI!');
	});

	it('returns 400 when message is empty', async () => {
		const event = makeEvent({ message: '', conversationId: 'conv-1' });
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/non-empty/i);
		expect(mockSendMessage).not.toHaveBeenCalled();
	});

	it('returns 400 when message is whitespace only', async () => {
		const event = makeEvent({ message: '   ', conversationId: 'conv-1' });
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/non-empty/i);
		expect(mockSendMessage).not.toHaveBeenCalled();
	});

	it('returns 400 when message exceeds max length', async () => {
		const longMessage = 'a'.repeat(10001);
		const event = makeEvent({ message: longMessage, conversationId: 'conv-1' });
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/maximum length/i);
		expect(mockSendMessage).not.toHaveBeenCalled();
	});

	it('returns 404 when conversation does not exist', async () => {
		mockGetConversation.mockResolvedValue(null);

		const event = makeEvent({ message: 'Hello', conversationId: 'nonexistent-id' });
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toMatch(/not found/i);
		expect(mockSendMessage).not.toHaveBeenCalled();
	});

	it('returns 502 when Langflow sendMessage throws', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockSendMessage.mockRejectedValue(new Error('Langflow down'));

		const event = makeEvent({ message: 'Hello', conversationId: 'conv-1' });
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(502);
		expect(data.error).toMatch(/failed to get response/i);
	});

	it('returns 400 when request body is invalid JSON', async () => {
		const event = {
			request: new Request('http://localhost/api/chat/send', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not-valid-json'
			}),
			locals: { user: { id: 'user-1' } },
			params: {},
			url: new URL('http://localhost/api/chat/send'),
			route: { id: '/api/chat/send' }
		} as any;

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/invalid json/i);
	});
});
