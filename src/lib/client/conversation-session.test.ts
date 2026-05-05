import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArtifactSummary } from '$lib/types';
import {
	cleanupPreparedConversation,
	consumePendingConversationMessage,
	consumePreviousConversationId,
	createConversationDraftRecord,
	createDraftPersistence,
	getLandingDraftConversationId,
	hasPendingConversationMessage,
	markPreviousConversationId,
	setLandingDraftConversationId,
	storePendingConversationMessage,
} from './conversation-session';

describe('conversation-session', () => {
	beforeEach(() => {
		window.sessionStorage.clear();
		vi.useRealTimers();
	});

	it('stores and consumes the landing return marker', () => {
		markPreviousConversationId('conv-123');

		expect(consumePreviousConversationId()).toBe('conv-123');
		expect(consumePreviousConversationId()).toBeNull();
	});

	it('stores, reads, and clears the landing draft conversation id', () => {
		setLandingDraftConversationId('conv-landing');
		expect(getLandingDraftConversationId()).toBe('conv-landing');

		setLandingDraftConversationId(null);
		expect(getLandingDraftConversationId()).toBeNull();
	});

	it('stores and consumes pending conversation messages', () => {
		const attachment: ArtifactSummary = {
			id: 'artifact-1',
			type: 'source_document',
			retrievalClass: 'durable',
			name: 'notes.txt',
			mimeType: 'text/plain',
			sizeBytes: 12,
			conversationId: 'conv-123',
			summary: 'Notes',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		storePendingConversationMessage('conv-123', {
			message: 'Hello there',
			attachmentIds: ['artifact-1'],
			attachments: [attachment],
		});

		expect(hasPendingConversationMessage('conv-123')).toBe(true);
		expect(consumePendingConversationMessage('conv-123')).toEqual({
			message: 'Hello there',
			attachmentIds: ['artifact-1'],
			attachments: [attachment],
			modelId: undefined,
			personalityProfileId: null,
		});
		expect(hasPendingConversationMessage('conv-123')).toBe(false);
	});

	it('builds a draft record only when the draft is meaningful', () => {
		expect(
			createConversationDraftRecord({
				conversationId: null,
				fallbackConversationId: 'conv-fallback',
				draftText: 'Draft message',
				selectedAttachmentIds: [],
				selectedAttachments: [],
				updatedAt: 123,
			})
		).toEqual({
			conversationId: 'conv-fallback',
			draftText: 'Draft message',
			selectedAttachmentIds: [],
			selectedAttachments: [],
			updatedAt: 123,
		});

		expect(
			createConversationDraftRecord({
				conversationId: null,
				draftText: '   ',
				selectedAttachmentIds: [],
				selectedAttachments: [],
			})
		).toBeNull();
	});

	it('debounces draft persistence and issues a PUT for meaningful drafts', async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const persistence = createDraftPersistence(fetchMock, 400);

		void persistence.persist({
			conversationId: 'conv-123',
			draftText: 'Hello draft',
			selectedAttachmentIds: ['artifact-1'],
		});

		expect(fetchMock).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(400);

		expect(fetchMock).toHaveBeenCalledWith('/api/conversations/conv-123/draft', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				draftText: 'Hello draft',
				selectedAttachmentIds: ['artifact-1'],
			}),
		});
	});

	it('flushes a pending draft write immediately', async () => {
		vi.useFakeTimers();
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const persistence = createDraftPersistence(fetchMock, 400);

		void persistence.persist({
			conversationId: 'conv-123',
			draftText: 'Hello draft',
			selectedAttachmentIds: [],
		});

		await persistence.flush();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith('/api/conversations/conv-123/draft', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				draftText: 'Hello draft',
				selectedAttachmentIds: [],
			}),
		});
	});

	it('deletes empty drafts instead of persisting them', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const persistence = createDraftPersistence(fetchMock);

		await persistence.persist(
			{
				conversationId: 'conv-123',
				draftText: '',
				selectedAttachmentIds: [],
			},
			true
		);

		expect(fetchMock).toHaveBeenCalledWith('/api/conversations/conv-123/draft', {
			method: 'DELETE',
		});
	});

	it('deletes empty drafts immediately so cleared attachments do not restore on reload', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const persistence = createDraftPersistence(fetchMock, 400);

		await persistence.persist({
			conversationId: 'conv-123',
			draftText: '',
			selectedAttachmentIds: [],
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith('/api/conversations/conv-123/draft', {
			method: 'DELETE',
		});
	});

	it('cleans up empty prepared conversations through the shared helper', () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const removeLocal = vi.fn();

		cleanupPreparedConversation({
			conversationId: 'conv-123',
			removeLocal,
			fetchImpl: fetchMock,
		});

		expect(removeLocal).toHaveBeenCalledWith('conv-123');
		expect(fetchMock).toHaveBeenCalledWith('/api/conversations/conv-123', {
			method: 'DELETE',
			keepalive: true,
		});
	});

	it('does not clean up a prepared conversation with a pending bootstrap message', () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		const removeLocal = vi.fn();

		storePendingConversationMessage('conv-123', {
			message: 'Send this after navigation',
			attachmentIds: [],
			attachments: [],
		});

		cleanupPreparedConversation({
			conversationId: 'conv-123',
			removeLocal,
			fetchImpl: fetchMock,
		});

		expect(removeLocal).not.toHaveBeenCalled();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(hasPendingConversationMessage('conv-123')).toBe(true);
	});
});
