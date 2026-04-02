import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatFile, FileInput } from './chat-files';

type ChatFileRow = {
	id: string;
	conversationId: string;
	userId: string;
	filename: string;
	mimeType: string | null;
	sizeBytes: number;
	storagePath: string;
	createdAt: Date;
};

const { mockRows, mockInsertValues, mockSelectWhere, mockDeleteWhere, mockUnlink, mockMkdir, mockWriteFile, mockReadFile, mockAccess } = vi.hoisted(() => {
	const mockRows: ChatFileRow[] = [];

	const mockInsertValues = vi.fn(async (values: ChatFileRow | ChatFileRow[]) => {
		const items = Array.isArray(values) ? values : [values];
		const now = new Date();
		const itemsWithDate = items.map((item) => ({
			...item,
			createdAt: item.createdAt || now,
		}));
		mockRows.push(...itemsWithDate);
		return itemsWithDate.map((item) => ({ ...item }));
	});

	const mockSelectWhere = vi.fn(async (conversationId: string) => {
		return mockRows
			.filter((row) => row.conversationId === conversationId)
			.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
			.map((row) => ({ ...row }));
	});

	const mockDeleteWhere = vi.fn(async (conversationId: string, fileId?: string) => {
		const indicesToRemove: number[] = [];
		mockRows.forEach((row, index) => {
			if (row.conversationId === conversationId && (!fileId || row.id === fileId)) {
				indicesToRemove.push(index);
			}
		});
		const removed = indicesToRemove.length;
		indicesToRemove.reverse().forEach((index) => mockRows.splice(index, 1));
		return removed;
	});

	const mockUnlink = vi.fn(() => Promise.resolve(undefined));
	const mockMkdir = vi.fn(() => Promise.resolve(undefined));
	const mockWriteFile = vi.fn(() => Promise.resolve(undefined));
	const mockReadFile = vi.fn(() => Promise.resolve(Buffer.from('test content')));
	const mockAccess = vi.fn(() => Promise.resolve(undefined));

	return { mockRows, mockInsertValues, mockSelectWhere, mockDeleteWhere, mockUnlink, mockMkdir, mockWriteFile, mockReadFile, mockAccess };
});

vi.mock(import('fs/promises'), async (importOriginal) => {
	const actual = await importOriginal();
	return {
		...actual,
		mkdir: vi.fn(() => Promise.resolve(undefined)),
		writeFile: vi.fn(() => Promise.resolve(undefined)),
		readFile: vi.fn(() => Promise.resolve(Buffer.from('test content'))),
		unlink: vi.fn(() => Promise.resolve(undefined)),
		access: vi.fn(() => Promise.resolve(undefined)),
	};
});

vi.mock('$lib/server/db', () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn((table: { name: string }) => ({
				where: vi.fn((condition: unknown) => ({
					orderBy: vi.fn(async () => {
						const conversationId = extractConversationId(condition);
						return mockSelectWhere(conversationId);
					}),
					limit: vi.fn(async () => {
						const conversationId = extractConversationId(condition);
						const fileId = extractFileId(condition);
						const userId = extractUserId(condition);
						const rows = mockRows.filter(
							(r) =>
								(!conversationId || r.conversationId === conversationId) &&
								(!fileId || r.id === fileId) &&
								(!userId || r.userId === userId)
						);
						return rows.slice(0, 1).map((r) => ({ ...r }));
					}),
				})),
			})),
		})),
		insert: vi.fn(() => ({
			values: vi.fn((values: ChatFileRow | ChatFileRow[]) => {
				const items = Array.isArray(values) ? values : [values];
				const now = new Date();
				const itemsWithDate = items.map((item) => ({
					...item,
					createdAt: item.createdAt || now,
				}));
				mockRows.push(...itemsWithDate);
				return {
					returning: vi.fn(() => Promise.resolve(itemsWithDate.map((item) => ({ ...item })))),
				};
			}),
		})),
		delete: vi.fn(() => ({
			where: vi.fn((condition: unknown) => {
				const conversationId = extractConversationId(condition);
				const fileId = extractFileId(condition);
				return Promise.resolve(mockDeleteWhere(conversationId, fileId));
			}),
		})),
	},
}));

function extractConversationId(condition: unknown): string {
	if (Array.isArray(condition)) {
		const convCondition = condition.find((c: { field: string }) => c.field === 'conversationId');
		if (convCondition) return convCondition.value;
	}
	if (typeof condition === 'object' && condition !== null && 'field' in condition) {
		const c = condition as { field: string; value: string };
		if (c.field === 'conversationId') return c.value;
	}
	if (typeof condition === 'string') return condition;
	return '';
}

function extractFileId(condition: unknown): string | undefined {
	if (Array.isArray(condition)) {
		const idCondition = condition.find((c: { field: string }) => c.field === 'id');
		if (idCondition) return idCondition.value;
	}
	return undefined;
}

function extractUserId(condition: unknown): string | undefined {
	if (Array.isArray(condition)) {
		const userCondition = condition.find((c: { field: string }) => c.field === 'userId');
		if (userCondition) return userCondition.value;
	}
	if (typeof condition === 'object' && condition !== null && 'field' in condition) {
		const c = condition as { field: string; value: string };
		if (c.field === 'userId') return c.value;
	}
	return undefined;
}

vi.mock('$lib/server/db/schema', () => ({
	chatGeneratedFiles: {
		id: { name: 'id' },
		conversationId: { name: 'conversationId' },
		userId: { name: 'userId' },
		filename: { name: 'filename' },
		mimeType: { name: 'mimeType' },
		sizeBytes: { name: 'sizeBytes' },
		storagePath: { name: 'storagePath' },
		createdAt: { name: 'createdAt' },
	},
	conversations: { id: { name: 'id' } },
	users: { id: { name: 'id' } },
}));

vi.mock('drizzle-orm', () => ({
	and: vi.fn((...conditions: unknown[]) => conditions.filter((c): c is { field: string; value: string } => 
		typeof c === 'object' && c !== null && 'field' in c && 'value' in c
	)),
	desc: vi.fn(() => 'desc'),
	eq: vi.fn((field: { name: string }, value: string) => ({ field: field.name, value })),
}));

describe('chat-files service', () => {
	beforeEach(() => {
		mockRows.length = 0;
		vi.clearAllMocks();
	});

	describe('storeGeneratedFile', () => {
		it('creates file and database record', async () => {
			const { storeGeneratedFile } = await import('./chat-files');

			const file: FileInput = {
				filename: 'test-document.pdf',
				mimeType: 'application/pdf',
				content: Buffer.from('PDF content here'),
			};

			const result = await storeGeneratedFile('conv-123', 'user-456', file);

			expect(result).toMatchObject({
				conversationId: 'conv-123',
				userId: 'user-456',
				filename: 'test-document.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 16,
			});
			expect(result.id).toBeDefined();
			expect(result.storagePath).toMatch(/^conv-123\/[a-f0-9-]+\.pdf$/);
			expect(result.createdAt).toBeDefined();

			expect(mockRows).toHaveLength(1);
			expect(mockRows[0]).toMatchObject({
				conversationId: 'conv-123',
				userId: 'user-456',
				filename: 'test-document.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 16,
			});
		});

		it('handles files without extension', async () => {
			const { storeGeneratedFile } = await import('./chat-files');

			const file: FileInput = {
				filename: 'README',
				content: Buffer.from('Documentation'),
			};

			const result = await storeGeneratedFile('conv-123', 'user-456', file);

			expect(result.storagePath).toMatch(/\.bin$/);
		});

		it('handles Uint8Array content', async () => {
			const { storeGeneratedFile } = await import('./chat-files');

			const file: FileInput = {
				filename: 'data.json',
				mimeType: 'application/json',
				content: new Uint8Array([123, 34, 107, 101, 121, 34, 58, 34, 118, 97, 108, 117, 101, 34, 125]),
			};

			const result = await storeGeneratedFile('conv-123', 'user-456', file);

			expect(result.sizeBytes).toBe(15);
			expect(result.mimeType).toBe('application/json');
		});
	});

	describe('getChatFiles', () => {
		it('returns only files for the specified conversation', async () => {
			const { getChatFiles } = await import('./chat-files');

			mockRows.push(
				{
					id: 'file-1',
					conversationId: 'conv-a',
					userId: 'user-1',
					filename: 'doc1.pdf',
					mimeType: 'application/pdf',
					sizeBytes: 1000,
					storagePath: 'conv-a/file-1.pdf',
					createdAt: new Date('2026-01-01'),
				},
				{
					id: 'file-2',
					conversationId: 'conv-b',
					userId: 'user-1',
					filename: 'doc2.pdf',
					mimeType: 'application/pdf',
					sizeBytes: 2000,
					storagePath: 'conv-b/file-2.pdf',
					createdAt: new Date('2026-01-02'),
				},
				{
					id: 'file-3',
					conversationId: 'conv-a',
					userId: 'user-1',
					filename: 'doc3.pdf',
					mimeType: 'application/pdf',
					sizeBytes: 3000,
					storagePath: 'conv-a/file-3.pdf',
					createdAt: new Date('2026-01-03'),
				}
			);

			const result = await getChatFiles('conv-a');

			expect(result).toHaveLength(2);
			expect(result.map((f) => f.id)).toContain('file-1');
			expect(result.map((f) => f.id)).toContain('file-3');
			expect(result.map((f) => f.id)).not.toContain('file-2');
		});

		it('returns empty array when conversation has no files', async () => {
			const { getChatFiles } = await import('./chat-files');

			const result = await getChatFiles('conv-empty');

			expect(result).toEqual([]);
		});

		it('returns files sorted by createdAt descending', async () => {
			const { getChatFiles } = await import('./chat-files');

			mockRows.push(
				{
					id: 'file-1',
					conversationId: 'conv-a',
					userId: 'user-1',
					filename: 'oldest.pdf',
					mimeType: 'application/pdf',
					sizeBytes: 1000,
					storagePath: 'conv-a/file-1.pdf',
					createdAt: new Date('2026-01-01'),
				},
				{
					id: 'file-2',
					conversationId: 'conv-a',
					userId: 'user-1',
					filename: 'newest.pdf',
					mimeType: 'application/pdf',
					sizeBytes: 2000,
					storagePath: 'conv-a/file-2.pdf',
					createdAt: new Date('2026-01-03'),
				}
			);

			const result = await getChatFiles('conv-a');

			expect(result[0].filename).toBe('newest.pdf');
			expect(result[1].filename).toBe('oldest.pdf');
		});
	});

	describe('getChatFile', () => {
		it('returns file when found in conversation', async () => {
			const { getChatFile } = await import('./chat-files');

			mockRows.push({
				id: 'file-1',
				conversationId: 'conv-a',
				userId: 'user-1',
				filename: 'document.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 5000,
				storagePath: 'conv-a/file-1.pdf',
				createdAt: new Date('2026-01-01'),
			});

			const result = await getChatFile('conv-a', 'file-1');

			expect(result).toMatchObject({
				id: 'file-1',
				conversationId: 'conv-a',
				filename: 'document.pdf',
			});
		});

		it('returns null when file not found', async () => {
			const { getChatFile } = await import('./chat-files');

			const result = await getChatFile('conv-a', 'nonexistent');

			expect(result).toBeNull();
		});

		it('returns null when file exists in different conversation', async () => {
			const { getChatFile } = await import('./chat-files');

			mockRows.push({
				id: 'file-1',
				conversationId: 'conv-b',
				userId: 'user-1',
				filename: 'document.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 5000,
				storagePath: 'conv-b/file-1.pdf',
				createdAt: new Date('2026-01-01'),
			});

			const result = await getChatFile('conv-a', 'file-1');

			expect(result).toBeNull();
		});
	});

	describe('getChatFileByUser', () => {
		it('returns a file when the user owns it', async () => {
			const { getChatFileByUser } = await import('./chat-files');

			mockRows.push({
				id: 'file-7',
				conversationId: 'conv-a',
				userId: 'user-7',
				filename: 'owned.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 1234,
				storagePath: 'conv-a/file-7.pdf',
				createdAt: new Date('2026-01-01'),
			});

			const result = await getChatFileByUser('file-7', 'user-7');

			expect(result).toMatchObject({
				id: 'file-7',
				userId: 'user-7',
				filename: 'owned.pdf',
			});
		});

		it('returns null when the file belongs to a different user', async () => {
			const { getChatFileByUser } = await import('./chat-files');

			mockRows.push({
				id: 'file-8',
				conversationId: 'conv-a',
				userId: 'user-8',
				filename: 'private.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 1234,
				storagePath: 'conv-a/file-8.pdf',
				createdAt: new Date('2026-01-01'),
			});

			const result = await getChatFileByUser('file-8', 'user-7');

			expect(result).toBeNull();
		});
	});

	describe('deleteChatFile', () => {
		it('deletes file and returns true when found', async () => {
			const { deleteChatFile } = await import('./chat-files');

			mockRows.push({
				id: 'file-1',
				conversationId: 'conv-a',
				userId: 'user-1',
				filename: 'document.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 5000,
				storagePath: 'conv-a/file-1.pdf',
				createdAt: new Date('2026-01-01'),
			});

			const result = await deleteChatFile('conv-a', 'file-1');

			expect(result).toBe(true);
			expect(mockRows).toHaveLength(0);
		});

		it('returns false when file not found', async () => {
			const { deleteChatFile } = await import('./chat-files');

			const result = await deleteChatFile('conv-a', 'nonexistent');

			expect(result).toBe(false);
		});

		it('returns false when file exists in different conversation', async () => {
			const { deleteChatFile } = await import('./chat-files');

			mockRows.push({
				id: 'file-1',
				conversationId: 'conv-b',
				userId: 'user-1',
				filename: 'document.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 5000,
				storagePath: 'conv-b/file-1.pdf',
				createdAt: new Date('2026-01-01'),
			});

			const result = await deleteChatFile('conv-a', 'file-1');

			expect(result).toBe(false);
			expect(mockRows).toHaveLength(1);
		});
	});

	describe('deleteAllChatFilesForConversation', () => {
		it('deletes all files for conversation and returns count', async () => {
			const { deleteAllChatFilesForConversation } = await import('./chat-files');

			mockRows.push(
				{
					id: 'file-1',
					conversationId: 'conv-a',
					userId: 'user-1',
					filename: 'doc1.pdf',
					mimeType: 'application/pdf',
					sizeBytes: 1000,
					storagePath: 'conv-a/file-1.pdf',
					createdAt: new Date('2026-01-01'),
				},
				{
					id: 'file-2',
					conversationId: 'conv-a',
					userId: 'user-1',
					filename: 'doc2.pdf',
					mimeType: 'application/pdf',
					sizeBytes: 2000,
					storagePath: 'conv-a/file-2.pdf',
					createdAt: new Date('2026-01-02'),
				},
				{
					id: 'file-3',
					conversationId: 'conv-b',
					userId: 'user-1',
					filename: 'other.pdf',
					mimeType: 'application/pdf',
					sizeBytes: 3000,
					storagePath: 'conv-b/file-3.pdf',
					createdAt: new Date('2026-01-03'),
				}
			);

			await deleteAllChatFilesForConversation('conv-a');

			expect(mockRows).toHaveLength(1);
			expect(mockRows[0].id).toBe('file-3');
		});

		it('returns 0 when conversation has no files', async () => {
			const { deleteAllChatFilesForConversation } = await import('./chat-files');

			const result = await deleteAllChatFilesForConversation('conv-empty');

			expect(result).toBe(0);
		});
	});
});
