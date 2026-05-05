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

vi.mock('$lib/server/services/deep-research', () => ({
	assertCanStartDeepResearchJob: vi.fn(),
	isDeepResearchJobStartError: vi.fn(
		(error: unknown) =>
			typeof error === 'object' &&
			error !== null &&
			'name' in error &&
			error.name === 'DeepResearchJobStartError',
	),
	startDeepResearchJobShell: vi.fn(),
}));

vi.mock('$lib/server/services/messages', () => ({
	createMessage: vi.fn(),
	updateMessageEvidence: vi.fn(async () => undefined),
	updateMessageHonchoMetadata: vi.fn(async () => undefined),
}));

vi.mock('$lib/server/services/knowledge', () => ({
	assertPromptReadyAttachments: vi.fn(async () => ({
		displayArtifacts: [],
		promptArtifacts: [],
	})),
	attachArtifactsToMessage: vi.fn(),
	createGeneratedOutputArtifact: vi.fn(),
	getConversationWorkingSet: vi.fn(async () => []),
	getArtifactsForUser: vi.fn(async () => []),
	isAttachmentReadinessError: vi.fn((error: unknown) => {
		return (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as { code?: unknown }).code === 'attachment_not_ready'
		);
	}),
	listConversationSourceArtifactIds: vi.fn(async () => []),
	refreshConversationWorkingSet: vi.fn(async () => []),
	upsertWorkCapsule: vi.fn(async () => null)
}));

vi.mock('$lib/server/services/task-state', () => ({
	attachContinuityToTaskState: vi.fn(async (_userId: string, taskState: unknown) => taskState),
	getContextDebugState: vi.fn(async () => null),
	getConversationTaskState: vi.fn(async () => null),
	syncTaskContinuityFromTaskState: vi.fn(async () => null),
	updateTaskStateCheckpoint: vi.fn(async () => null),
}));

vi.mock('$lib/server/services/honcho', () => ({
	listPersonaMemories: vi.fn(async () => []),
	mirrorMessage: vi.fn(async () => undefined),
	mirrorWorkCapsuleConclusion: vi.fn(async () => undefined),
}));

vi.mock('$lib/server/env', () => ({
	getDatabasePath: () => './data/test.db',
	config: {
		maxMessageLength: 10000,
		model1MaxMessageLength: 10000,
		model2MaxMessageLength: 10000,
	}
}));

import { POST } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import { getConversation, touchConversation } from '$lib/server/services/conversations';
import { sendMessage } from '$lib/server/services/langflow';
import {
	assertCanStartDeepResearchJob,
	startDeepResearchJobShell,
} from '$lib/server/services/deep-research';
import { createMessage, updateMessageHonchoMetadata } from '$lib/server/services/messages';
import { assertPromptReadyAttachments } from '$lib/server/services/knowledge';
const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockGetConversation = getConversation as ReturnType<typeof vi.fn>;
const mockTouchConversation = touchConversation as ReturnType<typeof vi.fn>;
const mockSendMessage = sendMessage as ReturnType<typeof vi.fn>;
const mockAssertCanStartDeepResearchJob = assertCanStartDeepResearchJob as ReturnType<typeof vi.fn>;
const mockStartDeepResearchJobShell = startDeepResearchJobShell as ReturnType<typeof vi.fn>;
const mockCreateMessage = createMessage as ReturnType<typeof vi.fn>;
const mockUpdateMessageHonchoMetadata = updateMessageHonchoMetadata as ReturnType<typeof vi.fn>;
const mockAssertPromptReadyAttachments = assertPromptReadyAttachments as ReturnType<typeof vi.fn>;

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
		mockAssertCanStartDeepResearchJob.mockResolvedValue(undefined);
		mockCreateMessage.mockImplementation(async () => ({
			id: crypto.randomUUID(),
			role: 'user',
			content: '',
			timestamp: Date.now()
		}));
		mockStartDeepResearchJobShell.mockResolvedValue({
			id: 'research-job-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg',
			depth: 'standard',
			status: 'awaiting_approval',
			stage: 'plan_drafted',
			title: 'Compare EU and US AI copyright training data rules',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
		mockAssertPromptReadyAttachments.mockResolvedValue({ displayArtifacts: [], promptArtifacts: [] });
	});

	it('returns AI response text for a valid request', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockCreateMessage
			.mockResolvedValueOnce({ id: 'user-msg', role: 'user', content: 'Hello', timestamp: Date.now() })
			.mockResolvedValueOnce({
				id: 'assistant-msg',
				role: 'assistant',
				content: 'Hello from AI!',
				timestamp: Date.now(),
			});
		mockSendMessage.mockResolvedValue({
			text: 'Hello from AI!',
			rawResponse: {},
			contextStatus: undefined,
			honchoContext: {
				source: 'live',
				waitedMs: 25,
				queuePendingWorkUnits: 0,
				queueInProgressWorkUnits: 0,
				fallbackReason: null,
				snapshotCreatedAt: 123,
			},
			honchoSnapshot: {
				createdAt: 123,
				summary: 'Latest Honcho summary',
				messages: [
					{
						role: 'assistant',
						content: 'Hello from AI!',
						createdAt: Date.now(),
					},
				],
			},
		});

		const event = makeEvent({ message: 'Hello', conversationId: 'conv-1' });
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.response.text).toBe('Hello from AI!');
		expect(data.conversationId).toBe('conv-1');
		expect(mockSendMessage).toHaveBeenCalledWith(
			'Hello',
			'conv-1',
			'model1',
			{
				id: 'user-1',
				displayName: undefined,
				email: 'test@example.com',
			},
			expect.objectContaining({
				attachmentIds: [],
			})
		);
		expect(mockUpdateMessageHonchoMetadata).toHaveBeenCalledWith('assistant-msg', {
			honchoContext: expect.objectContaining({ source: 'live' }),
			honchoSnapshot: expect.objectContaining({ summary: 'Latest Honcho summary' }),
		});
	});

	it('starts a Deep Research job shell instead of a normal assistant answer', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockCreateMessage.mockResolvedValueOnce({
			id: 'user-msg',
			role: 'user',
			content: 'Compare EU and US AI copyright training data rules',
			timestamp: Date.now(),
		});

		const event = makeEvent({
			message: 'Compare EU and US AI copyright training data rules',
			conversationId: 'conv-1',
			deepResearch: { depth: 'standard' },
		});
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.response).toBeNull();
		expect(data.deepResearchJob).toMatchObject({
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg',
			depth: 'standard',
			status: 'awaiting_approval',
		});
		expect(mockCreateMessage).toHaveBeenCalledTimes(1);
		expect(mockCreateMessage).toHaveBeenCalledWith(
			'conv-1',
			'user',
			'Compare EU and US AI copyright training data rules',
		);
		expect(mockStartDeepResearchJobShell).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				conversationId: 'conv-1',
				triggerMessageId: 'user-msg',
				userRequest: 'Compare EU and US AI copyright training data rules',
				depth: 'standard',
			}),
		);
		expect(mockSendMessage).not.toHaveBeenCalled();
	});

	it('rejects Deep Research in a sealed conversation before persisting the triggering message', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		const error = {
			name: 'DeepResearchJobStartError',
			code: 'conversation_sealed',
			message: 'Deep Research cannot be started in a sealed conversation',
			status: 409,
		};
		mockAssertCanStartDeepResearchJob.mockRejectedValue(error);

		const event = makeEvent({
			message: 'Research this sealed topic',
			conversationId: 'conv-1',
			deepResearch: { depth: 'standard' },
		});
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(409);
		expect(data).toMatchObject({
			error: 'Deep Research cannot be started in a sealed conversation',
			code: 'conversation_sealed',
		});
		expect(mockCreateMessage).not.toHaveBeenCalled();
		expect(mockStartDeepResearchJobShell).not.toHaveBeenCalled();
		expect(mockSendMessage).not.toHaveBeenCalled();
	});

	it('rejects Deep Research when an active job exists before persisting the triggering message', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		const error = {
			name: 'DeepResearchJobStartError',
			code: 'active_job_exists',
			message: 'This conversation already has an active Deep Research job',
			status: 409,
		};
		mockAssertCanStartDeepResearchJob.mockRejectedValue(error);

		const event = makeEvent({
			message: 'Start another research pass',
			conversationId: 'conv-1',
			deepResearch: { depth: 'focused' },
		});
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(409);
		expect(data).toMatchObject({
			error: 'This conversation already has an active Deep Research job',
			code: 'active_job_exists',
		});
		expect(mockCreateMessage).not.toHaveBeenCalled();
		expect(mockStartDeepResearchJobShell).not.toHaveBeenCalled();
		expect(mockSendMessage).not.toHaveBeenCalled();
	});

	it('passes messages through unchanged', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockSendMessage.mockResolvedValue({ text: 'Hello from AI!', rawResponse: {}, contextStatus: undefined });

		const event = makeEvent({ message: 'Szia', conversationId: 'conv-1' });
		const response = await POST(event);
		const data = await response.json();

		expect(mockSendMessage).toHaveBeenCalledWith(
			'Szia',
			'conv-1',
			'model1',
			expect.any(Object),
			expect.any(Object)
		);
		expect(data.response.text).toBe('Hello from AI!');
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

	it('returns 422 when a same-turn attachment is not prompt-ready', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockAssertPromptReadyAttachments.mockRejectedValue({
			name: 'AttachmentReadinessError',
			message: 'Attached file is not ready for chat.',
			code: 'attachment_not_ready',
			status: 422,
			attachmentIds: ['artifact-1'],
		});

		const event = makeEvent({
			message: 'Use this file',
			conversationId: 'conv-1',
			attachmentIds: ['artifact-1'],
		});
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(422);
		expect(data.code).toBe('attachment_not_ready');
		expect(data.error).toMatch(/not ready/i);
		expect(mockSendMessage).not.toHaveBeenCalled();
	});

	it('returns 422 when prompt construction fails closed after preflight', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockSendMessage.mockRejectedValue({
			name: 'AttachmentReadinessError',
			message: 'Attached file content was missing from the final prompt bundle.',
			code: 'attachment_not_ready',
			status: 422,
			attachmentIds: ['artifact-1'],
		});

		const event = makeEvent({
			message: 'Use this file',
			conversationId: 'conv-1',
			attachmentIds: ['artifact-1'],
		});
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(422);
		expect(data.code).toBe('attachment_not_ready');
		expect(data.error).toMatch(/final prompt bundle/i);
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
