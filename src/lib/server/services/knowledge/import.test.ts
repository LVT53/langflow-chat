import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';

const mockDb = {
	insert: vi.fn(() => ({
		values: vi.fn(() => ({
			returning: vi.fn(),
		})),
	})),
};

vi.mock('../../db', () => ({
	db: mockDb,
}));

vi.mock('../task-state', () => ({
	syncArtifactChunks: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../config-store', () => ({
	getConfig: vi.fn(() => ({
		maxModelContext: 262144,
		compactionUiThreshold: 209715,
		targetConstructedContext: 157286,
	})),
	getDocumentTokenBudget: vi.fn(() => 8000),
	getWorkingSetPromptTokenBudget: vi.fn(() => 20000),
	getSmallFileThreshold: vi.fn(() => 51200),
}));

const { importObsidianVault, importNotionExport } = await import('./import');

async function createZipBuffer(files: Record<string, string | Buffer>): Promise<Buffer> {
	const zip = new JSZip();
	for (const [path, content] of Object.entries(files)) {
		zip.file(path, content);
	}
	const blob = await zip.generateAsync({ type: 'nodebuffer' });
	return Buffer.from(blob);
}

function createMockArtifact(overrides: {
	id: string;
	originalPath: string;
	contentText: string;
	sizeBytes: number;
}) {
	return {
		id: overrides.id,
		userId: 'user-1',
		conversationId: 'conv-1',
		vaultId: 'vault-1',
		type: 'source_document',
		retrievalClass: 'durable',
		name: overrides.originalPath.replace(/\.md$/, '.txt').replace(/\.html?$/, '.txt').replace(/\.csv$/, '.txt'),
		mimeType: 'text/plain',
		sizeBytes: overrides.sizeBytes,
		binaryHash: null,
		storagePath: null,
		contentText: overrides.contentText,
		summary: null,
		metadataJson: JSON.stringify({ originalPath: overrides.originalPath }),
		extension: 'txt',
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}

describe('Import Handler', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('importObsidianVault', () => {
		it('imports markdown files from nested folders', async () => {
			const files = {
				'note1.md': '# Note 1\n\nContent of note 1',
				'folder/note2.md': '# Note 2\n\nContent of note 2',
				'folder/subfolder/note3.md': '# Note 3\n\nContent of note 3',
			};
			const zipBuffer = await createZipBuffer(files);

			const mockArtifacts = [
				createMockArtifact({
					id: 'artifact-1',
					originalPath: 'note1.md',
					contentText: '# Note 1\n\nContent of note 1',
					sizeBytes: 30,
				}),
				createMockArtifact({
					id: 'artifact-2',
					originalPath: 'folder/note2.md',
					contentText: '# Note 2\n\nContent of note 2',
					sizeBytes: 30,
				}),
				createMockArtifact({
					id: 'artifact-3',
					originalPath: 'folder/subfolder/note3.md',
					contentText: '# Note 3\n\nContent of note 3',
					sizeBytes: 30,
				}),
			];

			let artifactIndex = 0;
			mockDb.insert.mockReturnValue({
				values: vi.fn(() => ({
					returning: vi.fn(() => Promise.resolve([mockArtifacts[artifactIndex++]])),
				})),
			});

			const result = await importObsidianVault('user-1', 'conv-1', 'vault-1', zipBuffer);

			expect(result.imported).toBe(3);
			expect(result.failed).toBe(0);
			expect(result.errors).toHaveLength(0);
			expect(result.artifacts).toHaveLength(3);
		});

		it('extracts YAML frontmatter from markdown files', async () => {
			const files = {
				'note-with-frontmatter.md':
					'---\ntitle: My Note\ntags: [tag1, tag2]\n---\n\n# My Note\n\nContent here',
			};
			const zipBuffer = await createZipBuffer(files);

			const mockArtifact = createMockArtifact({
				id: 'artifact-1',
				originalPath: 'note-with-frontmatter.md',
				contentText:
					'---\ntitle: My Note\ntags: [tag1, tag2]\n---\n\n# My Note\n\nContent here',
				sizeBytes: 60,
			});

			mockDb.insert.mockReturnValue({
				values: vi.fn(() => ({
					returning: vi.fn(() => Promise.resolve([mockArtifact])),
				})),
			});

			const result = await importObsidianVault('user-1', 'conv-1', 'vault-1', zipBuffer);

			expect(result.imported).toBe(1);
			expect(result.artifacts[0].metadata?.originalPath).toBe('note-with-frontmatter.md');
		});

		it('stores original path in artifact metadata', async () => {
			const files = {
				'deeply/nested/path/to/note.md': '# Deep Note',
			};
			const zipBuffer = await createZipBuffer(files);

			const mockArtifact = createMockArtifact({
				id: 'artifact-1',
				originalPath: 'deeply/nested/path/to/note.md',
				contentText: '# Deep Note',
				sizeBytes: 12,
			});

			mockDb.insert.mockReturnValue({
				values: vi.fn(() => ({
					returning: vi.fn(() => Promise.resolve([mockArtifact])),
				})),
			});

			const result = await importObsidianVault('user-1', 'conv-1', 'vault-1', zipBuffer);

			expect(result.artifacts[0].metadata?.originalPath).toBe(
				'deeply/nested/path/to/note.md'
			);
		});

		it('handles partial success with some failures', async () => {
			const files = {
				'good-note.md': '# Good Note',
				'bad-note.md': '# Bad Note',
			};
			const zipBuffer = await createZipBuffer(files);

			let callCount = 0;
			mockDb.insert.mockImplementation(() => ({
				values: vi.fn(() => ({
					returning: vi.fn(() => {
						callCount++;
						if (callCount === 1) {
							return Promise.resolve([
								createMockArtifact({
									id: 'artifact-1',
									originalPath: 'good-note.md',
									contentText: '# Good Note',
									sizeBytes: 12,
								}),
							]);
						}
						return Promise.reject(new Error('DB error'));
					}),
				})),
			}));

			const result = await importObsidianVault('user-1', 'conv-1', 'vault-1', zipBuffer);

			expect(result.imported).toBe(1);
			expect(result.failed).toBe(1);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('bad-note.md');
		});

		it('handles empty ZIP', async () => {
			const zipBuffer = await createZipBuffer({});

			const result = await importObsidianVault('user-1', 'conv-1', 'vault-1', zipBuffer);

			expect(result.imported).toBe(0);
			expect(result.failed).toBe(0);
			expect(result.errors).toHaveLength(0);
			expect(result.artifacts).toHaveLength(0);
		});

		it('handles invalid ZIP buffer', async () => {
			const invalidBuffer = Buffer.from('not a valid zip file');

			const result = await importObsidianVault('user-1', 'conv-1', 'vault-1', invalidBuffer);

			expect(result.imported).toBe(0);
			expect(result.failed).toBe(0);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('Invalid ZIP');
		});

		it('skips non-markdown files', async () => {
			const files = {
				'note.md': '# Note',
				'image.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
				'data.json': '{"key": "value"}',
			};
			const zipBuffer = await createZipBuffer(files);

			const mockArtifact = createMockArtifact({
				id: 'artifact-1',
				originalPath: 'note.md',
				contentText: '# Note',
				sizeBytes: 8,
			});

			mockDb.insert.mockReturnValue({
				values: vi.fn(() => ({
					returning: vi.fn(() => Promise.resolve([mockArtifact])),
				})),
			});

			const result = await importObsidianVault('user-1', 'conv-1', 'vault-1', zipBuffer);

			expect(result.imported).toBe(1);
			expect(result.artifacts[0].metadata?.originalPath).toBe('note.md');
		});
	});

	describe('importNotionExport', () => {
		it('imports HTML files from Notion export', async () => {
			const files = {
				'Page 1.html': '<html><body><h1>Page 1</h1><p>Content</p></body></html>',
				'Folder/Page 2.html': '<html><body><h1>Page 2</h1><p>More content</p></body></html>',
			};
			const zipBuffer = await createZipBuffer(files);

			const mockArtifacts = [
				createMockArtifact({
					id: 'artifact-1',
					originalPath: 'Page 1.html',
					contentText: 'Page 1 Content',
					sizeBytes: 20,
				}),
				createMockArtifact({
					id: 'artifact-2',
					originalPath: 'Folder/Page 2.html',
					contentText: 'Page 2 More content',
					sizeBytes: 25,
				}),
			];

			let artifactIndex = 0;
			mockDb.insert.mockReturnValue({
				values: vi.fn(() => ({
					returning: vi.fn(() => Promise.resolve([mockArtifacts[artifactIndex++]])),
				})),
			});

			const result = await importNotionExport('user-1', 'conv-1', 'vault-1', zipBuffer);

			expect(result.imported).toBe(2);
			expect(result.failed).toBe(0);
			expect(result.artifacts).toHaveLength(2);
		});

		it('imports markdown files from Notion export', async () => {
			const files = {
				'Page.md': '# Page\n\nMarkdown content',
			};
			const zipBuffer = await createZipBuffer(files);

			const mockArtifact = createMockArtifact({
				id: 'artifact-1',
				originalPath: 'Page.md',
				contentText: '# Page\n\nMarkdown content',
				sizeBytes: 25,
			});

			mockDb.insert.mockReturnValue({
				values: vi.fn(() => ({
					returning: vi.fn(() => Promise.resolve([mockArtifact])),
				})),
			});

			const result = await importNotionExport('user-1', 'conv-1', 'vault-1', zipBuffer);

			expect(result.imported).toBe(1);
			expect(result.artifacts[0].metadata?.originalPath).toBe('Page.md');
		});

		it('imports CSV database files', async () => {
			const files = {
				'Database.csv': 'Name,Value\nItem1,100\nItem2,200',
			};
			const zipBuffer = await createZipBuffer(files);

			const mockArtifact = createMockArtifact({
				id: 'artifact-1',
				originalPath: 'Database.csv',
				contentText: 'Name,Value\nItem1,100\nItem2,200',
				sizeBytes: 35,
			});

			mockDb.insert.mockReturnValue({
				values: vi.fn(() => ({
					returning: vi.fn(() => Promise.resolve([mockArtifact])),
				})),
			});

			const result = await importNotionExport('user-1', 'conv-1', 'vault-1', zipBuffer);

			expect(result.imported).toBe(1);
			expect(result.artifacts[0].metadata?.originalPath).toBe('Database.csv');
		});

		it('strips HTML tags from content', async () => {
			const files = {
				'page.html': '<html><body><h1>Title</h1><p>Paragraph with <strong>bold</strong> text</p></body></html>',
			};
			const zipBuffer = await createZipBuffer(files);

			const mockArtifact = createMockArtifact({
				id: 'artifact-1',
				originalPath: 'page.html',
				contentText: 'Title Paragraph with bold text',
				sizeBytes: 40,
			});

			mockDb.insert.mockReturnValue({
				values: vi.fn(() => ({
					returning: vi.fn(() => Promise.resolve([mockArtifact])),
				})),
			});

			const result = await importNotionExport('user-1', 'conv-1', 'vault-1', zipBuffer);

			expect(result.imported).toBe(1);
			expect(result.artifacts[0].contentText).not.toContain('<');
			expect(result.artifacts[0].contentText).not.toContain('>');
		});

		it('stores original path in artifact metadata', async () => {
			const files = {
				'Projects/Project Alpha/Notes.html': '<html><body><h1>Notes</h1></body></html>',
			};
			const zipBuffer = await createZipBuffer(files);

			const mockArtifact = createMockArtifact({
				id: 'artifact-1',
				originalPath: 'Projects/Project Alpha/Notes.html',
				contentText: 'Notes',
				sizeBytes: 10,
			});

			mockDb.insert.mockReturnValue({
				values: vi.fn(() => ({
					returning: vi.fn(() => Promise.resolve([mockArtifact])),
				})),
			});

			const result = await importNotionExport('user-1', 'conv-1', 'vault-1', zipBuffer);

			expect(result.artifacts[0].metadata?.originalPath).toBe(
				'Projects/Project Alpha/Notes.html'
			);
		});

		it('handles partial success with some failures', async () => {
			const files = {
				'good.html': '<html><body><h1>Good</h1></body></html>',
				'bad.html': '<html><body><h1>Bad</h1></body></html>',
			};
			const zipBuffer = await createZipBuffer(files);

			let callCount = 0;
			mockDb.insert.mockImplementation(() => ({
				values: vi.fn(() => ({
					returning: vi.fn(() => {
						callCount++;
						if (callCount === 1) {
							return Promise.resolve([
								createMockArtifact({
									id: 'artifact-1',
									originalPath: 'good.html',
									contentText: 'Good',
									sizeBytes: 10,
								}),
							]);
						}
						return Promise.reject(new Error('DB error'));
					}),
				})),
			}));

			const result = await importNotionExport('user-1', 'conv-1', 'vault-1', zipBuffer);

			expect(result.imported).toBe(1);
			expect(result.failed).toBe(1);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('bad.html');
		});

		it('handles empty ZIP', async () => {
			const zipBuffer = await createZipBuffer({});

			const result = await importNotionExport('user-1', 'conv-1', 'vault-1', zipBuffer);

			expect(result.imported).toBe(0);
			expect(result.failed).toBe(0);
			expect(result.errors).toHaveLength(0);
			expect(result.artifacts).toHaveLength(0);
		});

		it('handles invalid ZIP buffer', async () => {
			const invalidBuffer = Buffer.from('not a valid zip file');

			const result = await importNotionExport('user-1', 'conv-1', 'vault-1', invalidBuffer);

			expect(result.imported).toBe(0);
			expect(result.failed).toBe(0);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0]).toContain('Invalid ZIP');
		});

		it('skips unsupported file types', async () => {
			const files = {
				'page.html': '<html><body><h1>Page</h1></body></html>',
				'image.png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
				'binary.bin': Buffer.from([0x00, 0x01, 0x02]),
			};
			const zipBuffer = await createZipBuffer(files);

			const mockArtifact = createMockArtifact({
				id: 'artifact-1',
				originalPath: 'page.html',
				contentText: 'Page',
				sizeBytes: 10,
			});

			mockDb.insert.mockReturnValue({
				values: vi.fn(() => ({
					returning: vi.fn(() => Promise.resolve([mockArtifact])),
				})),
			});

			const result = await importNotionExport('user-1', 'conv-1', 'vault-1', zipBuffer);

			expect(result.imported).toBe(1);
			expect(result.artifacts[0].metadata?.originalPath).toBe('page.html');
		});
	});
});