import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockReadFile = vi.fn();
const mockRequireAuth = vi.fn();
const mockGetArtifactForUser = vi.fn();

vi.mock('fs/promises', () => ({
	default: {},
	readFile: (...args: unknown[]) => mockReadFile(...args),
}));

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

vi.mock('$lib/server/services/knowledge', () => ({
	getArtifactForUser: (...args: unknown[]) => mockGetArtifactForUser(...args),
}));

import { GET } from './+server';

describe('GET /api/knowledge/[id]/preview', () => {
	const mockUser = { id: 'user-123', email: 'test@example.com' };

	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockImplementation(() => {});
	});

	it('returns 404 when artifact not found', async () => {
		mockGetArtifactForUser.mockResolvedValue(null);

		const event = {
			locals: { user: mockUser },
			params: { id: 'artifact-123' },
		} as any;

		const response = await GET(event);

		expect(response.status).toBe(404);
		const body = await response.json();
		expect(body.error).toBe('Artifact not found');
	});

	it('returns 404 when artifact has no storage path', async () => {
		mockGetArtifactForUser.mockResolvedValue({
			id: 'artifact-123',
			name: 'test.txt',
			storagePath: null,
			mimeType: 'text/plain',
			extension: 'txt',
		});

		const event = {
			locals: { user: mockUser },
			params: { id: 'artifact-123' },
		} as any;

		const response = await GET(event);

		expect(response.status).toBe(404);
		const body = await response.json();
		expect(body.error).toBe('File not available for preview');
	});

	it('returns file content with correct headers for PDF', async () => {
		const fileBuffer = Buffer.from('PDF content');
		mockReadFile.mockResolvedValue(fileBuffer);
		mockGetArtifactForUser.mockResolvedValue({
			id: 'artifact-123',
			name: 'document.pdf',
			storagePath: 'data/knowledge/user-123/document.pdf',
			mimeType: 'application/pdf',
			extension: 'pdf',
		});

		const event = {
			locals: { user: mockUser },
			params: { id: 'artifact-123' },
		} as any;

		const response = await GET(event);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('application/pdf');
		expect(response.headers.get('Content-Length')).toBe('11');
		expect(response.headers.get('Content-Disposition')).toContain('document.pdf');
		expect(response.headers.get('Cache-Control')).toBe('private, max-age=3600');

		const body = await response.arrayBuffer();
		expect(Buffer.from(body).toString()).toBe('PDF content');
	});

	it('returns file content with inferred mime type from extension', async () => {
		const fileBuffer = Buffer.from('DOCX content');
		mockReadFile.mockResolvedValue(fileBuffer);
		mockGetArtifactForUser.mockResolvedValue({
			id: 'artifact-123',
			name: 'document.docx',
			storagePath: 'data/knowledge/user-123/document.docx',
			mimeType: null,
			extension: 'docx',
		});

		const event = {
			locals: { user: mockUser },
			params: { id: 'artifact-123' },
		} as any;

		const response = await GET(event);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe(
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
		);
	});

	it('returns 500 when file read fails', async () => {
		mockReadFile.mockRejectedValue(new Error('File not found on disk'));
		mockGetArtifactForUser.mockResolvedValue({
			id: 'artifact-123',
			name: 'document.pdf',
			storagePath: 'data/knowledge/user-123/document.pdf',
			mimeType: 'application/pdf',
			extension: 'pdf',
		});

		const event = {
			locals: { user: mockUser },
			params: { id: 'artifact-123' },
		} as any;

		const response = await GET(event);

		expect(response.status).toBe(500);
		const body = await response.json();
		expect(body.error).toBe('Failed to read file');
	});

	it('handles image files correctly', async () => {
		const fileBuffer = Buffer.from('PNG image data');
		mockReadFile.mockResolvedValue(fileBuffer);
		mockGetArtifactForUser.mockResolvedValue({
			id: 'artifact-123',
			name: 'image.png',
			storagePath: 'data/knowledge/user-123/image.png',
			mimeType: 'image/png',
			extension: 'png',
		});

		const event = {
			locals: { user: mockUser },
			params: { id: 'artifact-123' },
		} as any;

		const response = await GET(event);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('image/png');
	});

	it('handles XLSX files correctly', async () => {
		const fileBuffer = Buffer.from('XLSX spreadsheet data');
		mockReadFile.mockResolvedValue(fileBuffer);
		mockGetArtifactForUser.mockResolvedValue({
			id: 'artifact-123',
			name: 'spreadsheet.xlsx',
			storagePath: 'data/knowledge/user-123/spreadsheet.xlsx',
			mimeType: null,
			extension: 'xlsx',
		});

		const event = {
			locals: { user: mockUser },
			params: { id: 'artifact-123' },
		} as any;

		const response = await GET(event);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe(
			'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
		);
	});

	it('handles PPTX files correctly', async () => {
		const fileBuffer = Buffer.from('PPTX presentation data');
		mockReadFile.mockResolvedValue(fileBuffer);
		mockGetArtifactForUser.mockResolvedValue({
			id: 'artifact-123',
			name: 'presentation.pptx',
			storagePath: 'data/knowledge/user-123/presentation.pptx',
			mimeType: null,
			extension: 'pptx',
		});

		const event = {
			locals: { user: mockUser },
			params: { id: 'artifact-123' },
		} as any;

		const response = await GET(event);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe(
			'application/vnd.openxmlformats-officedocument.presentationml.presentation'
		);
	});

	it('handles text files correctly', async () => {
		const fileBuffer = Buffer.from('Plain text content');
		mockReadFile.mockResolvedValue(fileBuffer);
		mockGetArtifactForUser.mockResolvedValue({
			id: 'artifact-123',
			name: 'notes.txt',
			storagePath: 'data/knowledge/user-123/notes.txt',
			mimeType: 'text/plain',
			extension: 'txt',
		});

		const event = {
			locals: { user: mockUser },
			params: { id: 'artifact-123' },
		} as any;

		const response = await GET(event);

		expect(response.status).toBe(200);
		expect(response.headers.get('Content-Type')).toBe('text/plain');
	});

	it('encodes filename in Content-Disposition header', async () => {
		const fileBuffer = Buffer.from('PDF content');
		mockReadFile.mockResolvedValue(fileBuffer);
		mockGetArtifactForUser.mockResolvedValue({
			id: 'artifact-123',
			name: 'document with spaces & special chars.pdf',
			storagePath: 'data/knowledge/user-123/document.pdf',
			mimeType: 'application/pdf',
			extension: 'pdf',
		});

		const event = {
			locals: { user: mockUser },
			params: { id: 'artifact-123' },
		} as any;

		const response = await GET(event);

		expect(response.status).toBe(200);
		const contentDisposition = response.headers.get('Content-Disposition');
		expect(contentDisposition).toContain('inline');
		expect(contentDisposition).toContain(encodeURIComponent('document with spaces & special chars.pdf'));
	});
});
