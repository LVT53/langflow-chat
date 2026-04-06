import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	verifyFileGenerateServiceAssertion: vi.fn()
}));

vi.mock('$lib/server/services/conversations', () => ({
	getConversation: vi.fn(),
	getConversationUserId: vi.fn(),
}));

vi.mock('$lib/server/services/sandbox-execution', () => ({
	executeCode: vi.fn()
}));

vi.mock('$lib/server/services/chat-files', () => ({
	storeGeneratedFile: vi.fn()
}));

import { POST } from './+server';
import { verifyFileGenerateServiceAssertion } from '$lib/server/auth/hooks';
import { getConversation, getConversationUserId } from '$lib/server/services/conversations';
import { executeCode } from '$lib/server/services/sandbox-execution';
import { storeGeneratedFile } from '$lib/server/services/chat-files';
import { runUserMemoryMaintenance } from '$lib/server/services/memory-maintenance';

vi.mock('$lib/server/services/memory-maintenance', () => ({
	runUserMemoryMaintenance: vi.fn().mockResolvedValue(undefined),
}));

const mockVerifyFileGenerateServiceAssertion = verifyFileGenerateServiceAssertion as ReturnType<typeof vi.fn>;
const mockGetConversation = getConversation as ReturnType<typeof vi.fn>;
const mockGetConversationUserId = getConversationUserId as ReturnType<typeof vi.fn>;
const mockExecuteCode = executeCode as ReturnType<typeof vi.fn>;
const mockStoreGeneratedFile = storeGeneratedFile as ReturnType<typeof vi.fn>;
const mockRunUserMemoryMaintenance = runUserMemoryMaintenance as ReturnType<typeof vi.fn>;

function makeEvent(
	body: unknown,
	user: { id: string; email?: string } | null = { id: 'user-1', email: 'test@example.com' },
	authorization?: string
) {
	return {
		request: new Request('http://localhost/api/chat/files/generate', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				...(authorization ? { Authorization: authorization } : {}),
			},
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
		mockVerifyFileGenerateServiceAssertion.mockReturnValue({
			valid: true,
			claims: {
				conversationId: 'conv-service',
				userId: 'user-9',
				exp: Date.now() + 60_000,
			},
		});
		vi.spyOn(console, 'info').mockImplementation(() => undefined);
		vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
	});

	it('returns file metadata for a valid request', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		
		mockExecuteCode.mockResolvedValue({
			files: [
				{
					filename: 'output.pdf',
					mimeType: 'application/pdf',
					content: Buffer.from('%PDF-1.4 test pdf content'),
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
		expect(data.files[0].downloadUrl).toBe('/api/chat/files/file-1/download');
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
		expect(console.info).toHaveBeenCalledWith(
			'[FILE_GENERATE] Request succeeded',
			expect.objectContaining({
				conversationId: 'conv-1',
				fileCount: 1,
			})
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
					content: Buffer.from('%PDF-1.4 pdf content'),
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

	it('accepts javascript execution for office-style file generation', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);
		mockExecuteCode.mockResolvedValue({
			files: [
				{
					filename: 'deck.pptx',
					mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
					content: Buffer.from('pptx content'),
					sizeBytes: 12,
				},
			],
			stdout: 'Generated PPTX',
			stderr: '',
		});
		mockStoreGeneratedFile.mockResolvedValue({
			id: 'file-js',
			conversationId: 'conv-1',
			userId: 'user-1',
			filename: 'deck.pptx',
			mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
			sizeBytes: 12,
			storagePath: 'conv-1/file-js.pptx',
			createdAt: Date.now(),
		});

		const response = await POST(
			makeEvent({
				conversationId: 'conv-1',
				code: 'const pptx = require("pptxgenjs");',
				language: 'javascript',
			})
		);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.files[0].filename).toBe('deck.pptx');
		expect(mockExecuteCode).toHaveBeenCalledWith(
			'const pptx = require("pptxgenjs");',
			'javascript'
		);
	});

	it('returns 401 for unauthorized request', async () => {
		const event = makeEvent({
			conversationId: 'conv-1',
			code: 'test',
			language: 'python'
		}, null);
		
		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data.error).toMatch(/unauthorized/i);
		expect(mockExecuteCode).not.toHaveBeenCalled();
	});

	it('accepts a valid signed service assertion outside a browser session', async () => {
		mockVerifyFileGenerateServiceAssertion.mockReturnValue({
			valid: true,
			claims: {
				conversationId: 'conv-service',
				exp: Date.now() + 60_000,
			},
		});
		mockGetConversationUserId.mockResolvedValue('user-9');
		mockExecuteCode.mockResolvedValue({
			files: [
				{
					filename: 'output.csv',
					mimeType: 'text/csv',
					content: Buffer.from('a,b\n1,2'),
					sizeBytes: 7
				}
			],
			stdout: 'Execution successful',
			stderr: ''
		});
		mockStoreGeneratedFile.mockResolvedValue({
			id: 'file-9',
			conversationId: 'conv-service',
			userId: 'user-9',
			filename: 'output.csv',
			mimeType: 'text/csv',
			sizeBytes: 7,
			storagePath: 'conv-service/file-9.csv',
			createdAt: Date.now()
		});

		const response = await POST(
			makeEvent(
				{
					conversationId: 'conv-service',
					code: 'print("service request")',
					language: 'python'
				},
				null,
				'Bearer service-key'
			)
		);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(mockVerifyFileGenerateServiceAssertion).toHaveBeenCalledWith('Bearer service-key');
		expect(mockGetConversationUserId).toHaveBeenCalledWith('conv-service');
		expect(mockGetConversation).not.toHaveBeenCalled();
		expect(mockStoreGeneratedFile).toHaveBeenCalledWith(
			'conv-service',
			'user-9',
			expect.objectContaining({
				filename: 'output.csv'
			})
		);
		expect(data.files[0].downloadUrl).toBe('/api/chat/files/file-9/download');
		expect(mockRunUserMemoryMaintenance).toHaveBeenCalledWith('user-9', 'file_generate_service');
	});

	it('rejects invalid signed service assertions', async () => {
		mockVerifyFileGenerateServiceAssertion.mockReturnValue({ valid: false, reason: 'invalid_signature' });

		const response = await POST(
			makeEvent(
				{
					conversationId: 'conv-service',
					code: 'print("service request")',
					language: 'python'
				},
				null,
				'Bearer invalid-signature'
			)
		);

		expect(response.status).toBe(401);
		expect(mockGetConversationUserId).not.toHaveBeenCalled();
		expect(mockExecuteCode).not.toHaveBeenCalled();
	});

	it('rejects service assertions whose conversation does not match request body', async () => {
		mockVerifyFileGenerateServiceAssertion.mockReturnValue({
			valid: true,
			claims: {
				conversationId: 'other-conversation',
				exp: Date.now() + 60_000,
			},
		});

		const response = await POST(
			makeEvent(
				{
					conversationId: 'conv-service',
					code: 'print("service request")',
					language: 'python'
				},
				null,
				'Bearer service-key'
			)
		);

		expect(response.status).toBe(404);
		expect(mockGetConversationUserId).not.toHaveBeenCalled();
	});

	it('accepts service assertions even when optional assertion userId differs', async () => {
		mockVerifyFileGenerateServiceAssertion.mockReturnValue({
			valid: true,
			claims: {
				conversationId: 'conv-service',
				userId: 'user-9',
				exp: Date.now() + 60_000,
			},
		});
		mockGetConversationUserId.mockResolvedValue('different-user');
		mockExecuteCode.mockResolvedValue({
			files: [
				{
					filename: 'output.csv',
					mimeType: 'text/csv',
					content: Buffer.from('a,b\n1,2'),
					sizeBytes: 7
				}
			],
			stdout: 'Execution successful',
			stderr: ''
		});
		mockStoreGeneratedFile.mockResolvedValue({
			id: 'file-optional-user-mismatch',
			conversationId: 'conv-service',
			userId: 'different-user',
			filename: 'output.csv',
			mimeType: 'text/csv',
			sizeBytes: 7,
			storagePath: 'conv-service/file-optional-user-mismatch.csv',
			createdAt: Date.now()
		});

		const response = await POST(
			makeEvent(
				{
					conversationId: 'conv-service',
					code: 'print("service request")',
					language: 'python'
				},
				null,
				'Bearer service-key'
			)
		);

		expect(response.status).toBe(200);
		expect(mockExecuteCode).toHaveBeenCalled();
		expect(mockStoreGeneratedFile).toHaveBeenCalledWith(
			'conv-service',
			'different-user',
			expect.objectContaining({
				filename: 'output.csv',
			})
		);
		expect(mockRunUserMemoryMaintenance).toHaveBeenCalledWith('different-user', 'file_generate_service');
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
			language: 'ruby'
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

	it('returns 422 when sandbox produces no output files', async () => {
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

		expect(response.status).toBe(422);
		expect(data.error).toMatch(/write the final output file to \/output/i);
		expect(mockStoreGeneratedFile).not.toHaveBeenCalled();
		expect(console.warn).toHaveBeenCalledWith(
			'[FILE_GENERATE] Sandbox finished without files',
			expect.objectContaining({
				conversationId: 'conv-1',
			})
		);
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
					content: Buffer.from('%PDF-1.4 test pdf content'),
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

	it('rejects custom filename when generated extension does not match', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);

		mockExecuteCode.mockResolvedValue({
			files: [
				{
					filename: 'error_log.txt',
					mimeType: 'text/plain',
					content: Buffer.from('Error details'),
					sizeBytes: 13,
				}
			],
			stdout: '',
			stderr: '',
		});

		const response = await POST(
			makeEvent({
				conversationId: 'conv-1',
				code: 'generate fallback log',
				language: 'javascript',
				filename: 'uploaded_documents_summary.pdf',
			})
		);
		const data = await response.json();

		expect(response.status).toBe(422);
		expect(data.error).toMatch(/extension.*match/i);
		expect(mockStoreGeneratedFile).not.toHaveBeenCalled();
	});

	it('rejects custom filename when more than one file is generated', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);

		mockExecuteCode.mockResolvedValue({
			files: [
				{
					filename: 'one.pdf',
					mimeType: 'application/pdf',
					content: Buffer.from('pdf1'),
					sizeBytes: 4,
				},
				{
					filename: 'two.pdf',
					mimeType: 'application/pdf',
					content: Buffer.from('pdf2'),
					sizeBytes: 4,
				},
			],
			stdout: 'Generated 2 files',
			stderr: '',
		});

		const response = await POST(
			makeEvent({
				conversationId: 'conv-1',
				code: 'generate multiple outputs',
				language: 'javascript',
				filename: 'final.pdf',
			})
		);
		const data = await response.json();

		expect(response.status).toBe(422);
		expect(data.error).toMatch(/exactly one output file/i);
		expect(mockStoreGeneratedFile).not.toHaveBeenCalled();
	});

	it('rejects invalid pdf content when effective filename is pdf', async () => {
		const conversation = { id: 'conv-1', title: 'Test', createdAt: 0, updatedAt: 0 };
		mockGetConversation.mockResolvedValue(conversation);

		mockExecuteCode.mockResolvedValue({
			files: [
				{
					filename: 'uploaded_documents_summary.pdf',
					mimeType: 'text/plain',
					content: Buffer.from('Error: WinAnsi cannot encode'),
					sizeBytes: 28,
				}
			],
			stdout: '',
			stderr: 'Error details',
		});

		const response = await POST(
			makeEvent({
				conversationId: 'conv-1',
				code: 'fake pdf write',
				language: 'javascript',
				filename: 'uploaded_documents_summary.pdf',
			})
		);
		const data = await response.json();

		expect(response.status).toBe(422);
		expect(data.error).toMatch(/pdf output is invalid/i);
		expect(mockStoreGeneratedFile).not.toHaveBeenCalled();
	});
});
