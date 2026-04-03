import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn(),
}));

vi.mock('$lib/server/services/chat-files', () => ({
	previewChatFileContentByUser: vi.fn(),
}));

import { GET } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import { previewChatFileContentByUser } from '$lib/server/services/chat-files';

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockPreviewChatFileContentByUser = previewChatFileContentByUser as ReturnType<
	typeof vi.fn
>;

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
		expect(mockPreviewChatFileContentByUser).not.toHaveBeenCalled();
	});

	it('returns 404 when the generated file cannot be previewed', async () => {
		mockPreviewChatFileContentByUser.mockResolvedValue(null);

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(response.status).toBe(404);
		expect(body.error).toBe('File not found');
		expect(mockPreviewChatFileContentByUser).toHaveBeenCalledWith('file-1', 'user-1');
	});

	it('returns preview content for a user-owned generated file', async () => {
		mockPreviewChatFileContentByUser.mockResolvedValue({
			file: {
				id: 'file-1',
				conversationId: 'conv-1',
				userId: 'user-1',
				filename: 'notes.txt',
				mimeType: 'text/plain',
				sizeBytes: 12,
				storagePath: 'conv-1/file-1.txt',
				createdAt: Date.now(),
			},
			contentText: 'hello world',
		});

		const response = await GET(makeEvent());
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({
			fileId: 'file-1',
			filename: 'notes.txt',
			mimeType: 'text/plain',
			contentText: 'hello world',
		});
	});
});
