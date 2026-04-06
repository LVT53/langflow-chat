import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn(),
}));

vi.mock('$lib/server/services/chat-files', () => ({
	getChatFileByConversationOwner: vi.fn(),
	getChatFileByUser: vi.fn(),
	readChatFileContentByConversationOwner: vi.fn(),
	readChatFileContentByUser: vi.fn(),
}));

import { GET } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	getChatFileByConversationOwner,
	getChatFileByUser,
	readChatFileContentByConversationOwner,
	readChatFileContentByUser,
} from '$lib/server/services/chat-files';

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockGetChatFileByUser = getChatFileByUser as ReturnType<typeof vi.fn>;
const mockGetChatFileByConversationOwner = getChatFileByConversationOwner as ReturnType<typeof vi.fn>;
const mockReadChatFileContentByUser = readChatFileContentByUser as ReturnType<typeof vi.fn>;
const mockReadChatFileContentByConversationOwner =
	readChatFileContentByConversationOwner as ReturnType<typeof vi.fn>;

function makeEvent(fileId = 'file-1', user = { id: 'user-1', email: 'test@example.com' }) {
	return {
		request: new Request(`http://localhost/api/chat/files/${fileId}/preview`),
		locals: { user },
		params: { id: fileId },
		url: new URL(`http://localhost/api/chat/files/${fileId}/preview`),
		route: { id: '/api/chat/files/[id]/preview' },
	} as any;
}

describe('GET /api/chat/files/[id]/preview', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
	});

	it('returns 401 when unauthenticated', async () => {
		mockRequireAuth.mockImplementation(() => {
			throw new Error('Unauthorized');
		});

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body.error).toBe('Unauthorized');
		expect(mockGetChatFileByUser).not.toHaveBeenCalled();
	});

	it('returns 404 when the generated file cannot be previewed', async () => {
		mockGetChatFileByUser.mockResolvedValue(null);
		mockGetChatFileByConversationOwner.mockResolvedValue(null);

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe('File not found');
		expect(mockGetChatFileByUser).toHaveBeenCalledWith('file-1', 'user-1');
		expect(mockGetChatFileByConversationOwner).toHaveBeenCalledWith('file-1', 'user-1');
	});

	it('returns inline preview content for a user-owned generated file', async () => {
		mockGetChatFileByUser.mockResolvedValue({
			id: 'file-1',
			conversationId: 'conv-1',
			userId: 'user-1',
			filename: 'notes.txt',
			mimeType: 'text/plain',
			sizeBytes: 11,
			storagePath: 'conv-1/file-1.txt',
			createdAt: Date.now(),
		});
		mockReadChatFileContentByUser.mockResolvedValue(Buffer.from('hello world'));

		const response = await GET(makeEvent());

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/plain');
		expect(response.headers.get('Content-Length')).toBe('11');
		expect(response.headers.get('Content-Disposition')).toContain('inline; filename="notes.txt"');
		expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600');

		const body = await response.arrayBuffer();
		expect(Buffer.from(body).toString()).toBe('hello world');
	});

	it('returns 500 when the generated file content cannot be read', async () => {
		mockGetChatFileByUser.mockResolvedValue({
			id: 'file-1',
			conversationId: 'conv-1',
			userId: 'user-1',
			filename: 'notes.txt',
			mimeType: null,
			sizeBytes: 11,
			storagePath: 'conv-1/file-1.txt',
			createdAt: Date.now(),
		});
		mockReadChatFileContentByUser.mockResolvedValue(null);
		mockReadChatFileContentByConversationOwner.mockResolvedValue(null);

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(response.status).toBe(500);
		expect(body.error).toBe('Failed to read file content');
	});

	it('falls back to conversation ownership lookup when userId scoped lookup misses', async () => {
		mockGetChatFileByUser.mockResolvedValue(null);
		mockGetChatFileByConversationOwner.mockResolvedValue({
			id: 'file-1',
			conversationId: 'conv-1',
			userId: 'legacy-mismatch',
			filename: 'legacy.txt',
			mimeType: 'text/plain',
			sizeBytes: 5,
			storagePath: 'conv-1/file-1.txt',
			createdAt: Date.now(),
		});
		mockReadChatFileContentByUser.mockResolvedValue(null);
		mockReadChatFileContentByConversationOwner.mockResolvedValue(Buffer.from('hello'));

		const response = await GET(makeEvent());

		expect(response.status).toBe(200);
		expect(await response.text()).toBe('hello');
	});

	it('infers ODT preview content type from the filename', async () => {
		mockGetChatFileByUser.mockResolvedValue({
			id: 'file-1',
			conversationId: 'conv-1',
			userId: 'user-1',
			filename: 'draft.odt',
			mimeType: null,
			sizeBytes: 9,
			storagePath: 'conv-1/file-1.odt',
			createdAt: Date.now(),
		});
		mockReadChatFileContentByUser.mockResolvedValue(Buffer.from('odt bytes'));

		const response = await GET(makeEvent());

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe(
			'application/vnd.oasis.opendocument.text'
		);
	});
});
