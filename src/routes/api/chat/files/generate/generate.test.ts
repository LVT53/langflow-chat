import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn()
}));

vi.mock('$lib/server/services/conversations', () => ({
	getConversation: vi.fn()
}));

vi.mock('$lib/server/services/sandbox-execution', () => ({
	executeCode: vi.fn()
}));

vi.mock('$lib/server/services/chat-files', () => ({
	storeGeneratedFile: vi.fn()
}));

import { POST } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import { getConversation } from '$lib/server/services/conversations';
import { executeCode } from '$lib/server/services/sandbox-execution';
import { storeGeneratedFile } from '$lib/server/services/chat-files';

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockGetConversation = getConversation as ReturnType<typeof vi.fn>;
const mockExecuteCode = executeCode as ReturnType<typeof vi.fn>;
const mockStoreGeneratedFile = storeGeneratedFile as ReturnType<typeof vi.fn>;

function makeEvent(body: unknown, user = { id: 'user-1', email: 'test@example.com' }) {
	return {
		request: new Request('http://localhost/api/chat/files/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: { user },
		params: {},
		url: new URL('http://localhost/api/chat/files/generate'),
		route: { id: '/api/chat/files/generate' }
	} as any;
}

describe('POST /api/chat/files/generate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
	});

	it('returns file metadata for a valid request', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		
		mockExecuteCode.mockResolvedValue({
			files: [
				{
					filename: 'output.pdf',
					mimeType: 'application/pdf',
					content: Buffer.from('test pdf content'),
					sizeBytes: 17
				}
			],
			stdout: 'Execution successful',
			stderr: ''
		});
		
		mockStoreGeneratedFile.mockResolvedValue({
			id: 'file-1',
			conversationId: 'conv-1',
			userId: 'user-1',
			filename: 'output.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 17,
			storagePath: 'conv-1/file-1.pdf',
			createdAt: Date.now()
		});

		const event = makeEvent({
			conversationId: 'conv-1',
			code: 'import pandas as pd\nprint("test")',
			language: 'python'
		});
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.files).toHaveLength(1);
		expect(data.files[0].filename).toBe('output.pdf');
		expect(data.files[0].downloadUrl).toContain('/api/chat/files/conv-1/file-1');
		expect(data.files[0].size).toBe(17);
		expect(data.files[0].mimeType).toBe('application/pdf');
		expect(mockExecuteCode).toHaveBeenCalledWith('import pandas as pd\nprint("test")', 'python');
		expect(mockStoreGeneratedFile).toHaveBeenCalledWith(
			'conv-1',
			'user-1',
			{
				filename: 'output.pdf',
				mimeType: 'application/pdf',
				content: expect.any(Buffer)
			}
		);
	});

	it('returns multiple files when sandbox generates multiple outputs', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		
		mockExecuteCode.mockResolvedValue({
			files: [
				{
					filename: 'data.csv',
					mimeType: 'text/csv',
					content: Buffer.from('col1,col2\n1,2'),
					sizeBytes: 14
				},
				{
					filename: 'report.pdf',
					mimeType: 'application/pdf',
					content: Buffer.from('pdf content'),
					sizeBytes: 12
				}
			],
			stdout: 'Generated 2 files',
			stderr: ''
		});
		
		mockStoreGeneratedFile
			.mockResolvedValueOnce({
				id: 'file-1',
				conversationId: 'conv-1',
				userId: 'user-1',
				filename: 'data.csv',
				mimeType: 'text/csv',
				sizeBytes: 14,
				storagePath: 'conv-1/file-1.csv',
				createdAt: Date.now()
			})
			.mockResolvedValueOnce({
				id: 'file-2',
				conversationId: 'conv-1',
				userId: 'user-1',
				filename: 'report.pdf',
				mimeType: 'application/pdf',
				sizeBytes: 12,
				storagePath: 'conv-1/file-2.pdf',
				createdAt: Date.now()
			});

		const event = makeEvent({
			conversationId: 'conv-1',
			code: 'generate files',
			language: 'python'
		});
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.files).toHaveLength(2);
		expect(data.files[0].filename).toBe('data.csv');
		expect(data.files[1].filename).toBe('report.pdf');
	});

	it('returns 401 for unauthorized request', async () => {
		mockRequireAuth.mockImplementation(() => {
			throw new Error('Unauthorized');
		});

		const event = makeEvent({
			conversationId: 'conv-1',
			code: 'test',
			language: 'python'
		});
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data.error).toMatch(/unauthorized/i);
		expect(mockExecuteCode).not.toHaveBeenCalled();
	});

	it('returns 400 when conversationId is missing', async () => {
		const event = makeEvent({
			code: 'test',
			language: 'python'
		});
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/conversationId.*required/i);
		expect(mockExecuteCode).not.toHaveBeenCalled();
	});

	it('returns 400 when code is missing', async () => {
		const event = makeEvent({
			conversationId: 'conv-1',
			language: 'python'
		});
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/code.*required/i);
		expect(mockExecuteCode).not.toHaveBeenCalled();
	});

	it('returns 400 when language is missing', async () => {
		const event = makeEvent({
			conversationId: 'conv-1',
			code: 'test'
		});
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/language.*required/i);
		expect(mockExecuteCode).not.toHaveBeenCalled();
	});

	it('returns 400 when language is not supported', async () => {
		const event = makeEvent({
			conversationId: 'conv-1',
			code: 'test',
			language: 'javascript'
		});
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/unsupported language/i);
		expect(mockExecuteCode).not.toHaveBeenCalled();
	});

	it('returns 404 when conversation does not exist', async () => {
		mockGetConversation.mockResolvedValue(null);

		const event = makeEvent({
			conversationId: 'nonexistent-id',
			code: 'test',
			language: 'python'
		});
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toMatch(/conversation.*not found/i);
		expect(mockExecuteCode).not.toHaveBeenCalled();
	});

	it('returns 404 when conversation belongs to different user', async () => {
		mockGetConversation.mockResolvedValue(null);

		const event = makeEvent({
			conversationId: 'conv-2',
			code: 'test',
			language: 'python'
		});
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toMatch(/conversation.*not found/i);
		expect(mockExecuteCode).not.toHaveBeenCalled();
	});

	it('returns 500 when sandbox execution fails', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		
		mockExecuteCode.mockResolvedValue({
			files: [],
			stdout: '',
			stderr: 'SyntaxError: invalid syntax',
			error: 'Syntax error: SyntaxError: invalid syntax'
		});

		const event = makeEvent({
			conversationId: 'conv-1',
			code: 'invalid code',
			language: 'python'
		});
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toMatch(/syntax error/i);
		expect(mockStoreGeneratedFile).not.toHaveBeenCalled();
	});

	it('returns 500 when sandbox execution times out', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		
		mockExecuteCode.mockResolvedValue({
			files: [],
			stdout: '',
			stderr: '',
			error: 'Execution timed out'
		});

		const event = makeEvent({
			conversationId: 'conv-1',
			code: 'while True: pass',
			language: 'python'
		});
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toMatch(/execution timed out/i);
	});

	it('returns 500 when sandbox execution throws exception', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		
		mockExecuteCode.mockRejectedValue(new Error('Docker connection failed'));

		const event = makeEvent({
			conversationId: 'conv-1',
			code: 'test',
			language: 'python'
		});
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toMatch(/failed to execute code/i);
	});

	it('returns empty files array when sandbox produces no output files', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		
		mockExecuteCode.mockResolvedValue({
			files: [],
			stdout: 'No files generated',
			stderr: ''
		});

		const event = makeEvent({
			conversationId: 'conv-1',
			code: 'print("hello")',
			language: 'python'
		});
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.files).toHaveLength(0);
		expect(mockStoreGeneratedFile).not.toHaveBeenCalled();
	});

	it('returns 400 when request body is invalid JSON', async () => {
		const event = {
			request: new Request('http://localhost/api/chat/files/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not-valid-json'
			}),
			locals: { user: { id: 'user-1' } },
			params: {},
			url: new URL('http://localhost/api/chat/files/generate'),
			route: { id: '/api/chat/files/generate' }
		} as any;

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/invalid json/i);
	});

	it('uses provided filename when specified', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		
		mockExecuteCode.mockResolvedValue({
			files: [
				{
					filename: 'output.pdf',
					mimeType: 'application/pdf',
					content: Buffer.from('test pdf content'),
					sizeBytes: 17
				}
			],
			stdout: 'Execution successful',
			stderr: ''
		});
		
		mockStoreGeneratedFile.mockResolvedValue({
			id: 'file-1',
			conversationId: 'conv-1',
			userId: 'user-1',
			filename: 'custom-report.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 17,
			storagePath: 'conv-1/file-1.pdf',
			createdAt: Date.now()
		});

		const event = makeEvent({
			conversationId: 'conv-1',
			code: 'generate pdf',
			language: 'python',
			filename: 'custom-report.pdf'
		});
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.files[0].filename).toBe('custom-report.pdf');
		expect(mockStoreGeneratedFile).toHaveBeenCalledWith(
			'conv-1',
			'user-1',
			expect.objectContaining({
				filename: 'custom-report.pdf'
			})
		);
	});
});