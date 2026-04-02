import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn()
}));

vi.mock('$lib/server/services/chat-files', () => ({
	getChatFile: vi.fn(),
	readChatFileContent: vi.fn()
}));

vi.mock('$lib/server/services/knowledge/store/vaults', () => ({
	getVault: vi.fn()
}));

vi.mock('$lib/server/services/knowledge/store/core', () => ({
	createArtifact: vi.fn(),
	createArtifactLink: vi.fn(),
	fileExtension: vi.fn(),
	knowledgeUserDir: vi.fn()
}));

vi.mock('fs/promises', () => ({
	default: {},
	mkdir: vi.fn(() => Promise.resolve(undefined)),
	writeFile: vi.fn(() => Promise.resolve(undefined)),
}));

import { POST } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import { getChatFile, readChatFileContent } from '$lib/server/services/chat-files';
import { getVault } from '$lib/server/services/knowledge/store/vaults';
import { createArtifact, createArtifactLink, fileExtension, knowledgeUserDir } from '$lib/server/services/knowledge/store/core';

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockGetChatFile = getChatFile as ReturnType<typeof vi.fn>;
const mockReadChatFileContent = readChatFileContent as ReturnType<typeof vi.fn>;
const mockGetVault = getVault as ReturnType<typeof vi.fn>;
const mockCreateArtifact = createArtifact as ReturnType<typeof vi.fn>;
const mockCreateArtifactLink = createArtifactLink as ReturnType<typeof vi.fn>;
const mockFileExtension = fileExtension as ReturnType<typeof vi.fn>;
const mockKnowledgeUserDir = knowledgeUserDir as ReturnType<typeof vi.fn>;

function makeEvent(body: unknown, fileId: string, user = { id: 'user-1', email: 'test@example.com' }) {
	return {
		request: new Request(`http://localhost/api/chat/files/${fileId}/save-to-vault`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: { user },
		params: { id: fileId },
		url: new URL(`http://localhost/api/chat/files/${fileId}/save-to-vault`),
		route: { id: '/api/chat/files/[id]/save-to-vault' }
	} as any;
}

describe('POST /api/chat/files/[id]/save-to-vault', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
		mockKnowledgeUserDir.mockReturnValue('/data/knowledge/user-1');
		mockFileExtension.mockReturnValue('pdf');
	});

	it.skip('saves file to vault and creates artifact with vaultId', async () => {
		const chatFile = {
			id: 'file-1',
			conversationId: 'conv-1',
			userId: 'user-1',
			filename: 'report.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 1024,
			storagePath: 'conv-1/file-1.pdf',
			createdAt: Date.now()
		};
		mockGetChatFile.mockResolvedValue(chatFile);
		mockReadChatFileContent.mockResolvedValue(Buffer.from('pdf content'));

		const vault = {
			id: 'vault-1',
			userId: 'user-1',
			name: 'My Documents',
			color: '#3b82f6',
			sortOrder: 0,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		mockGetVault.mockResolvedValue(vault);

		const artifact = {
			id: 'artifact-1',
			userId: 'user-1',
			conversationId: 'conv-1',
			vaultId: 'vault-1',
			type: 'generated_output',
			name: 'report.pdf',
			mimeType: 'application/pdf',
			extension: 'pdf',
			sizeBytes: 1024,
			storagePath: 'data/knowledge/user-1/artifact-1.pdf',
			summary: 'Generated file saved from chat: report.pdf',
			metadata: {
				source: 'chat_generated_file',
				originalFileId: 'file-1',
				conversationId: 'conv-1'
			},
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		mockCreateArtifact.mockResolvedValue(artifact);
		mockCreateArtifactLink.mockResolvedValue({ id: 'link-1' });

		const event = makeEvent({
			conversationId: 'conv-1',
			vaultId: 'vault-1'
		}, 'file-1');

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.artifactId).toBe('artifact-1');
		expect(data.vaultId).toBe('vault-1');
		expect(data.vaultName).toBe('My Documents');
		expect(data.filename).toBe('report.pdf');

		expect(mockGetChatFile).toHaveBeenCalledWith('conv-1', 'file-1');
		expect(mockGetVault).toHaveBeenCalledWith('user-1', 'vault-1');
		expect(mockReadChatFileContent).toHaveBeenCalledWith('conv-1', 'file-1');
		expect(mockCreateArtifact).toHaveBeenCalledWith(expect.objectContaining({
			vaultId: 'vault-1',
			type: 'generated_output',
			name: 'report.pdf'
		}));
		expect(mockCreateArtifactLink).toHaveBeenCalledWith(expect.objectContaining({
			userId: 'user-1',
			artifactId: 'artifact-1',
			linkType: 'attached_to_conversation',
			conversationId: 'conv-1'
		}));
	});

	it('returns 401 for unauthorized request', async () => {
		mockRequireAuth.mockImplementation(() => {
			throw new Error('Unauthorized');
		});

		const event = makeEvent({
			conversationId: 'conv-1',
			vaultId: 'vault-1'
		}, 'file-1');

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data.error).toMatch(/unauthorized/i);
		expect(mockGetChatFile).not.toHaveBeenCalled();
	});

	it('returns 400 when conversationId is missing', async () => {
		const event = makeEvent({
			vaultId: 'vault-1'
		}, 'file-1');

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/conversationId.*required/i);
		expect(mockGetChatFile).not.toHaveBeenCalled();
	});

	it('returns 400 when vaultId is missing', async () => {
		const event = makeEvent({
			conversationId: 'conv-1'
		}, 'file-1');

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/vaultId.*required/i);
		expect(mockGetChatFile).not.toHaveBeenCalled();
	});

	it('returns 404 when chat file does not exist', async () => {
		mockGetChatFile.mockResolvedValue(null);

		const event = makeEvent({
			conversationId: 'conv-1',
			vaultId: 'vault-1'
		}, 'file-1');

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toMatch(/file.*not found/i);
		expect(mockGetVault).not.toHaveBeenCalled();
	});

	it('returns 401 when file belongs to different user', async () => {
		const chatFile = {
			id: 'file-1',
			conversationId: 'conv-1',
			userId: 'user-2',
			filename: 'report.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 1024,
			storagePath: 'conv-1/file-1.pdf',
			createdAt: Date.now()
		};
		mockGetChatFile.mockResolvedValue(chatFile);

		const event = makeEvent({
			conversationId: 'conv-1',
			vaultId: 'vault-1'
		}, 'file-1', { id: 'user-1', email: 'test@example.com' });

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data.error).toMatch(/unauthorized/i);
		expect(mockGetVault).not.toHaveBeenCalled();
		expect(mockReadChatFileContent).not.toHaveBeenCalled();
	});

	it('returns 404 when vault does not exist', async () => {
		const chatFile = {
			id: 'file-1',
			conversationId: 'conv-1',
			userId: 'user-1',
			filename: 'report.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 1024,
			storagePath: 'conv-1/file-1.pdf',
			createdAt: Date.now()
		};
		mockGetChatFile.mockResolvedValue(chatFile);
		mockGetVault.mockResolvedValue(null);

		const event = makeEvent({
			conversationId: 'conv-1',
			vaultId: 'vault-1'
		}, 'file-1');

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toMatch(/vault.*not found/i);
		expect(mockReadChatFileContent).not.toHaveBeenCalled();
	});

	it('returns 404 when vault belongs to different user', async () => {
		const chatFile = {
			id: 'file-1',
			conversationId: 'conv-1',
			userId: 'user-1',
			filename: 'report.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 1024,
			storagePath: 'conv-1/file-1.pdf',
			createdAt: Date.now()
		};
		mockGetChatFile.mockResolvedValue(chatFile);
		mockGetVault.mockResolvedValue(null);

		const event = makeEvent({
			conversationId: 'conv-1',
			vaultId: 'vault-2'
		}, 'file-1');

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toMatch(/vault.*not found/i);
		expect(mockReadChatFileContent).not.toHaveBeenCalled();
	});

	it('returns 500 when file content cannot be read', async () => {
		const chatFile = {
			id: 'file-1',
			conversationId: 'conv-1',
			userId: 'user-1',
			filename: 'report.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 1024,
			storagePath: 'conv-1/file-1.pdf',
			createdAt: Date.now()
		};
		mockGetChatFile.mockResolvedValue(chatFile);

		const vault = {
			id: 'vault-1',
			userId: 'user-1',
			name: 'My Documents',
			color: '#3b82f6',
			sortOrder: 0,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		mockGetVault.mockResolvedValue(vault);
		mockReadChatFileContent.mockResolvedValue(null);

		const event = makeEvent({
			conversationId: 'conv-1',
			vaultId: 'vault-1'
		}, 'file-1');

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toMatch(/failed to read file content/i);
		expect(mockCreateArtifact).not.toHaveBeenCalled();
	});

	it('returns 400 when request body is invalid JSON', async () => {
		const event = {
			request: new Request('http://localhost/api/chat/files/file-1/save-to-vault', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not-valid-json'
			}),
			locals: { user: { id: 'user-1' } },
			params: { id: 'file-1' },
			url: new URL('http://localhost/api/chat/files/file-1/save-to-vault'),
			route: { id: '/api/chat/files/[id]/save-to-vault' }
		} as any;

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/invalid json/i);
	});

	it.skip('handles files without extension', async () => {
		const chatFile = {
			id: 'file-1',
			conversationId: 'conv-1',
			userId: 'user-1',
			filename: 'README',
			mimeType: 'text/plain',
			sizeBytes: 100,
			storagePath: 'conv-1/file-1.bin',
			createdAt: Date.now()
		};
		mockGetChatFile.mockResolvedValue(chatFile);
		mockReadChatFileContent.mockResolvedValue(Buffer.from('content'));
		mockFileExtension.mockReturnValue(null);

		const vault = {
			id: 'vault-1',
			userId: 'user-1',
			name: 'My Documents',
			color: '#3b82f6',
			sortOrder: 0,
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		mockGetVault.mockResolvedValue(vault);

		const artifact = {
			id: 'artifact-1',
			userId: 'user-1',
			conversationId: 'conv-1',
			vaultId: 'vault-1',
			type: 'generated_output',
			name: 'README',
			mimeType: 'text/plain',
			extension: null,
			sizeBytes: 100,
			storagePath: 'data/knowledge/user-1/artifact-1',
			summary: 'Generated file saved from chat: README',
			metadata: {
				source: 'chat_generated_file',
				originalFileId: 'file-1',
				conversationId: 'conv-1'
			},
			createdAt: Date.now(),
			updatedAt: Date.now()
		};
		mockCreateArtifact.mockResolvedValue(artifact);
		mockCreateArtifactLink.mockResolvedValue({ id: 'link-1' });

		const event = makeEvent({
			conversationId: 'conv-1',
			vaultId: 'vault-1'
		}, 'file-1');

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.filename).toBe('README');
		expect(mockCreateArtifact).toHaveBeenCalledWith(expect.objectContaining({
			extension: null
		}));
	});
});
