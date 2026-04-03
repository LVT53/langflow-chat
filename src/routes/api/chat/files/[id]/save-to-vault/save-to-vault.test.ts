import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn(),
}));

vi.mock('$lib/server/services/chat-files', () => ({
	getChatFile: vi.fn(),
	getSavedVaultForChatFile: vi.fn(),
	readChatFileContent: vi.fn(),
}));

vi.mock('$lib/server/services/knowledge/store/vaults', () => ({
	getVault: vi.fn(),
}));

vi.mock('$lib/server/services/knowledge', () => ({
	saveUploadedArtifact: vi.fn(),
	createNormalizedArtifact: vi.fn(),
}));

import { POST } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	getChatFile,
	getSavedVaultForChatFile,
	readChatFileContent,
} from '$lib/server/services/chat-files';
import { getVault } from '$lib/server/services/knowledge/store/vaults';
import {
	createNormalizedArtifact,
	saveUploadedArtifact,
} from '$lib/server/services/knowledge';

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockGetChatFile = getChatFile as ReturnType<typeof vi.fn>;
const mockGetSavedVaultForChatFile = getSavedVaultForChatFile as ReturnType<typeof vi.fn>;
const mockReadChatFileContent = readChatFileContent as ReturnType<typeof vi.fn>;
const mockGetVault = getVault as ReturnType<typeof vi.fn>;
const mockSaveUploadedArtifact = saveUploadedArtifact as ReturnType<typeof vi.fn>;
const mockCreateNormalizedArtifact = createNormalizedArtifact as ReturnType<typeof vi.fn>;

function makeEvent(
	body: unknown,
	fileId = 'file-1',
	user = { id: 'user-1', email: 'test@example.com' }
) {
	return {
		request: new Request(`http://localhost/api/chat/files/${fileId}/save-to-vault`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		}),
		locals: { user },
		params: { id: fileId },
		url: new URL(`http://localhost/api/chat/files/${fileId}/save-to-vault`),
		route: { id: '/api/chat/files/[id]/save-to-vault' },
	} as any;
}

const chatFile = {
	id: 'file-1',
	conversationId: 'conv-1',
	userId: 'user-1',
	filename: 'report.pdf',
	mimeType: 'application/pdf',
	sizeBytes: 1024,
	storagePath: 'conv-1/file-1.pdf',
	createdAt: Date.now(),
};

const vault = {
	id: 'vault-1',
	userId: 'user-1',
	name: 'Reports',
	color: '#0f766e',
	sortOrder: 0,
	createdAt: Date.now(),
	updatedAt: Date.now(),
};

describe('POST /api/chat/files/[id]/save-to-vault', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
		mockGetSavedVaultForChatFile.mockResolvedValue(null);
	});

	it('returns 401 for unauthorized requests', async () => {
		mockRequireAuth.mockImplementation(() => {
			throw new Error('Unauthorized');
		});

		const response = await POST(makeEvent({ conversationId: 'conv-1', vaultId: 'vault-1' }));
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data.error).toMatch(/unauthorized/i);
	});

	it('returns 400 when conversationId is missing', async () => {
		const response = await POST(makeEvent({ vaultId: 'vault-1' }));
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/conversationId.*required/i);
	});

	it('returns 404 when the chat file does not exist', async () => {
		mockGetChatFile.mockResolvedValue(null);

		const response = await POST(makeEvent({ conversationId: 'conv-1', vaultId: 'vault-1' }));
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toMatch(/file not found/i);
	});

	it('returns 404 when the vault does not exist', async () => {
		mockGetChatFile.mockResolvedValue(chatFile);
		mockGetVault.mockResolvedValue(null);

		const response = await POST(makeEvent({ conversationId: 'conv-1', vaultId: 'vault-1' }));
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toMatch(/vault not found/i);
		expect(mockReadChatFileContent).not.toHaveBeenCalled();
	});

	it('returns an existing saved vault link without uploading again', async () => {
		mockGetChatFile.mockResolvedValue(chatFile);
		mockGetVault.mockResolvedValue(vault);
		mockGetSavedVaultForChatFile.mockResolvedValue({
			artifactId: 'artifact-existing',
			filename: 'report.pdf',
			vaultId: 'vault-1',
			vaultName: 'Reports',
		});

		const response = await POST(makeEvent({ conversationId: 'conv-1', vaultId: 'vault-1' }));
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toEqual({
			artifactId: 'artifact-existing',
			vaultId: 'vault-1',
			vaultName: 'Reports',
			filename: 'report.pdf',
		});
		expect(mockReadChatFileContent).not.toHaveBeenCalled();
		expect(mockSaveUploadedArtifact).not.toHaveBeenCalled();
	});

	it('returns 500 when the file content cannot be read', async () => {
		mockGetChatFile.mockResolvedValue(chatFile);
		mockGetVault.mockResolvedValue(vault);
		mockReadChatFileContent.mockResolvedValue(null);

		const response = await POST(makeEvent({ conversationId: 'conv-1', vaultId: 'vault-1' }));
		const data = await response.json();

		expect(response.status).toBe(500);
		expect(data.error).toMatch(/failed to read file content/i);
		expect(mockSaveUploadedArtifact).not.toHaveBeenCalled();
	});

	it('uploads the chat file into the vault as a source document and normalizes it', async () => {
		mockGetChatFile.mockResolvedValue(chatFile);
		mockGetVault.mockResolvedValue(vault);
		mockReadChatFileContent.mockResolvedValue(Buffer.from('pdf content'));
		mockSaveUploadedArtifact.mockResolvedValue({
			artifact: {
				id: 'artifact-1',
				name: 'report.pdf',
				storagePath: 'data/knowledge/user-1/artifact-1.pdf',
				mimeType: 'application/pdf',
			},
			normalizedArtifact: null,
		});
		mockCreateNormalizedArtifact.mockResolvedValue({
			id: 'artifact-1-normalized',
		});

		const response = await POST(makeEvent({ conversationId: 'conv-1', vaultId: 'vault-1' }));
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toEqual({
			artifactId: 'artifact-1',
			vaultId: 'vault-1',
			vaultName: 'Reports',
			filename: 'report.pdf',
		});
		expect(mockSaveUploadedArtifact).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				conversationId: 'conv-1',
				vaultId: 'vault-1',
				metadata: {
					uploadSource: 'chat_generated_file',
					originalChatFileId: 'file-1',
					originalConversationId: 'conv-1',
				},
			})
		);
		expect(mockCreateNormalizedArtifact).toHaveBeenCalledWith({
			userId: 'user-1',
			conversationId: 'conv-1',
			sourceArtifactId: 'artifact-1',
			sourceStoragePath: 'data/knowledge/user-1/artifact-1.pdf',
			sourceName: 'report.pdf',
			sourceMimeType: 'application/pdf',
		});
	});

	it('returns 400 when the request body is invalid JSON', async () => {
		const event = {
			request: new Request('http://localhost/api/chat/files/file-1/save-to-vault', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: 'not-valid-json',
			}),
			locals: { user: { id: 'user-1' } },
			params: { id: 'file-1' },
			url: new URL('http://localhost/api/chat/files/file-1/save-to-vault'),
			route: { id: '/api/chat/files/[id]/save-to-vault' },
		} as any;

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/invalid json/i);
	});
});
