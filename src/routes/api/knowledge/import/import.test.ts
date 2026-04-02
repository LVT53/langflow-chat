import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';

const mockImportObsidianVault = vi.fn();
const mockImportNotionExport = vi.fn();
const mockGetVault = vi.fn();

vi.mock('$lib/server/services/knowledge/import', () => ({
	importObsidianVault: mockImportObsidianVault,
	importNotionExport: mockImportNotionExport,
}));

vi.mock('$lib/server/services/knowledge/store/vaults', () => ({
	getVault: mockGetVault,
}));

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn(),
}));

async function createZipBuffer(files: Record<string, string | Buffer>): Promise<Buffer> {
	const zip = new JSZip();
	for (const [path, content] of Object.entries(files)) {
		zip.file(path, content);
	}
	const blob = await zip.generateAsync({ type: 'nodebuffer' });
	return Buffer.from(blob);
}

const { POST } = await import('./+server');

function createMockEvent(body: FormData): Parameters<typeof POST>[0] {
	return {
		request: {
			formData: () => Promise.resolve(body),
			headers: new Headers(),
		},
		locals: {
			user: { id: 'user-1', email: 'test@example.com', name: 'Test User' },
		},
	} as unknown as Parameters<typeof POST>[0];
}

function createFormData(
	file: File | null,
	conversationId: string,
	vaultId: string,
	type: string
): FormData {
	const formData = new FormData();
	if (file) {
		formData.append('file', file);
	}
	formData.append('conversationId', conversationId);
	formData.append('vaultId', vaultId);
	formData.append('type', type);
	return formData;
}

function createMockFile(content: Buffer, name: string, type: string = 'application/zip'): File {
	return new File([new Uint8Array(content)], name, { type });
}

describe('Import API Endpoint', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetVault.mockResolvedValue({ id: 'vault-1', userId: 'user-1', name: 'Test Vault' });
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('POST /api/knowledge/import', () => {
		it('imports Obsidian vault successfully', async () => {
			const zipBuffer = await createZipBuffer({ 'note.md': '# Note' });
			const file = createMockFile(zipBuffer, 'vault.zip');
			const formData = createFormData(file, 'conv-1', 'vault-1', 'obsidian');
			const event = createMockEvent(formData);

			mockImportObsidianVault.mockResolvedValue({
				imported: 1,
				failed: 0,
				errors: [],
				artifacts: [
					{
						id: 'artifact-1',
						name: 'note.txt',
						metadata: { originalPath: 'note.md' },
						sizeBytes: 8,
					},
				],
			});

			const response = await POST(event);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.imported).toBe(1);
			expect(result.failed).toBe(0);
			expect(result.artifacts).toHaveLength(1);
			expect(result.artifacts[0].originalPath).toBe('note.md');
			expect(mockImportObsidianVault).toHaveBeenCalledWith(
				'user-1',
				'conv-1',
				'vault-1',
				expect.any(Buffer)
			);
		});

		it('imports Notion export successfully', async () => {
			const zipBuffer = await createZipBuffer({ 'page.html': '<html><body>Content</body></html>' });
			const file = createMockFile(zipBuffer, 'notion-export.zip');
			const formData = createFormData(file, 'conv-1', 'vault-1', 'notion');
			const event = createMockEvent(formData);

			mockImportNotionExport.mockResolvedValue({
				imported: 1,
				failed: 0,
				errors: [],
				artifacts: [
					{
						id: 'artifact-1',
						name: 'page.txt',
						metadata: { originalPath: 'page.html' },
						sizeBytes: 10,
					},
				],
			});

			const response = await POST(event);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.imported).toBe(1);
			expect(mockImportNotionExport).toHaveBeenCalledWith(
				'user-1',
				'conv-1',
				'vault-1',
				expect.any(Buffer)
			);
		});

		it('returns 400 when no file provided', async () => {
			const formData = createFormData(null, 'conv-1', 'vault-1', 'obsidian');
			const event = createMockEvent(formData);

			const response = await POST(event);
			const result = await response.json();

			expect(response.status).toBe(400);
			expect(result.error).toBe('No file provided');
		});

		it('returns 400 when conversationId is missing', async () => {
			const zipBuffer = await createZipBuffer({ 'note.md': '# Note' });
			const file = createMockFile(zipBuffer, 'vault.zip');
			const formData = new FormData();
			formData.append('file', file);
			formData.append('vaultId', 'vault-1');
			formData.append('type', 'obsidian');
			const event = createMockEvent(formData);

			const response = await POST(event);
			const result = await response.json();

			expect(response.status).toBe(400);
			expect(result.error).toBe('conversationId is required');
		});

		it('returns 400 when vaultId is missing', async () => {
			const zipBuffer = await createZipBuffer({ 'note.md': '# Note' });
			const file = createMockFile(zipBuffer, 'vault.zip');
			const formData = new FormData();
			formData.append('file', file);
			formData.append('conversationId', 'conv-1');
			formData.append('type', 'obsidian');
			const event = createMockEvent(formData);

			const response = await POST(event);
			const result = await response.json();

			expect(response.status).toBe(400);
			expect(result.error).toBe('vaultId is required');
		});

		it('returns 400 when type is invalid', async () => {
			const zipBuffer = await createZipBuffer({ 'note.md': '# Note' });
			const file = createMockFile(zipBuffer, 'vault.zip');
			const formData = createFormData(file, 'conv-1', 'vault-1', 'invalid');
			const event = createMockEvent(formData);

			const response = await POST(event);
			const result = await response.json();

			expect(response.status).toBe(400);
			expect(result.error).toContain('Invalid import type');
		});

		it('returns 400 when file is too large', async () => {
			const largeBuffer = Buffer.alloc(101 * 1024 * 1024);
			const file = createMockFile(largeBuffer, 'large.zip');
			const formData = createFormData(file, 'conv-1', 'vault-1', 'obsidian');
			const event = createMockEvent(formData);

			const response = await POST(event);
			const result = await response.json();

			expect(response.status).toBe(400);
			expect(result.error).toContain('File too large');
		});

		it('returns 400 when vault not found', async () => {
			const zipBuffer = await createZipBuffer({ 'note.md': '# Note' });
			const file = createMockFile(zipBuffer, 'vault.zip');
			const formData = createFormData(file, 'conv-1', 'vault-1', 'obsidian');
			const event = createMockEvent(formData);

			mockGetVault.mockResolvedValue(null);

			const response = await POST(event);
			const result = await response.json();

			expect(response.status).toBe(400);
			expect(result.error).toBe('Vault not found or access denied');
		});

		it('returns partial success result', async () => {
			const zipBuffer = await createZipBuffer({
				'good.md': '# Good',
				'bad.md': '# Bad',
			});
			const file = createMockFile(zipBuffer, 'vault.zip');
			const formData = createFormData(file, 'conv-1', 'vault-1', 'obsidian');
			const event = createMockEvent(formData);

			mockImportObsidianVault.mockResolvedValue({
				imported: 1,
				failed: 1,
				errors: ['Failed to import bad.md: DB error'],
				artifacts: [
					{
						id: 'artifact-1',
						name: 'good.txt',
						metadata: { originalPath: 'good.md' },
						sizeBytes: 8,
					},
				],
			});

			const response = await POST(event);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.imported).toBe(1);
			expect(result.failed).toBe(1);
			expect(result.errors).toHaveLength(1);
		});

		it('returns empty result for empty ZIP', async () => {
			const zipBuffer = await createZipBuffer({});
			const file = createMockFile(zipBuffer, 'empty.zip');
			const formData = createFormData(file, 'conv-1', 'vault-1', 'obsidian');
			const event = createMockEvent(formData);

			mockImportObsidianVault.mockResolvedValue({
				imported: 0,
				failed: 0,
				errors: [],
				artifacts: [],
			});

			const response = await POST(event);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.imported).toBe(0);
			expect(result.artifacts).toHaveLength(0);
		});

		it('returns error for invalid ZIP', async () => {
			const invalidBuffer = Buffer.from('not a zip');
			const file = createMockFile(invalidBuffer, 'invalid.zip');
			const formData = createFormData(file, 'conv-1', 'vault-1', 'obsidian');
			const event = createMockEvent(formData);

			mockImportObsidianVault.mockResolvedValue({
				imported: 0,
				failed: 0,
				errors: ['Invalid ZIP file format'],
				artifacts: [],
			});

			const response = await POST(event);
			const result = await response.json();

			expect(response.status).toBe(200);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('Invalid ZIP');
		});
	});
});