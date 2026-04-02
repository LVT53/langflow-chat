import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn(),
}));

vi.mock('$lib/server/services/knowledge', () => ({
	createNormalizedArtifact: vi.fn(),
	resolvePromptAttachmentArtifacts: vi.fn(),
	saveUploadedArtifact: vi.fn(),
}));

vi.mock('$lib/server/services/honcho', () => ({
	syncArtifactToHoncho: vi.fn(),
}));

vi.mock('$lib/server/services/attachment-trace', () => ({
	createAttachmentTraceId: vi.fn(() => 'trace-upload'),
	logAttachmentTrace: vi.fn(),
}));

vi.mock('$lib/server/services/conversations', () => ({
	getConversation: vi.fn(),
}));

vi.mock('$lib/server/services/knowledge/store/vaults', () => ({
	getVault: vi.fn(),
}));

import { POST } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	createNormalizedArtifact,
	resolvePromptAttachmentArtifacts,
	saveUploadedArtifact,
} from '$lib/server/services/knowledge';
import { syncArtifactToHoncho } from '$lib/server/services/honcho';
import { getConversation } from '$lib/server/services/conversations';
import { getVault } from '$lib/server/services/knowledge/store/vaults';

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockCreateNormalizedArtifact = createNormalizedArtifact as ReturnType<typeof vi.fn>;
const mockResolvePromptAttachmentArtifacts = resolvePromptAttachmentArtifacts as ReturnType<typeof vi.fn>;
const mockSaveUploadedArtifact = saveUploadedArtifact as ReturnType<typeof vi.fn>;
const mockSyncArtifactToHoncho = syncArtifactToHoncho as ReturnType<typeof vi.fn>;
const mockGetConversation = getConversation as ReturnType<typeof vi.fn>;
const mockGetVault = getVault as ReturnType<typeof vi.fn>;

function makeEventWithFormData(formData: FormData) {
	return {
		request: {
			formData: vi.fn().mockResolvedValue(formData),
			headers: {
				get: vi.fn().mockReturnValue(null),
			},
		},
		locals: { user: { id: 'user-1', email: 'test@example.com' } },
		params: {},
		url: new URL('http://localhost/api/knowledge/upload'),
		route: { id: '/api/knowledge/upload' },
	} as any;
}

describe('POST /api/knowledge/upload', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
		mockSyncArtifactToHoncho.mockResolvedValue({ uploaded: true, mode: 'native' });
		mockCreateNormalizedArtifact.mockResolvedValue(null);
		mockResolvePromptAttachmentArtifacts.mockResolvedValue({
			displayArtifacts: [],
			promptArtifacts: [],
			items: [],
			unresolvedItems: [],
		});
		mockGetConversation.mockResolvedValue({
			id: 'conv-1',
			title: 'Test Conversation',
			projectId: null,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
		mockGetVault.mockResolvedValue(null);
	});

	it('rejects files larger than 50MB', async () => {
		const formData = new FormData();
		const file = new File(['tiny'], 'large.pdf', { type: 'application/pdf' });
		Object.defineProperty(file, 'size', { value: 50 * 1024 * 1024 + 1 });
		formData.append('file', file);
		formData.append('conversationId', 'conv-1');

		const response = await POST(makeEventWithFormData(formData));
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/50MB/i);
		expect(mockSaveUploadedArtifact).not.toHaveBeenCalled();
	});

	it('returns prompt-ready metadata when a normalized artifact exists', async () => {
		const artifact = {
			id: 'artifact-1',
			type: 'source_document',
			retrievalClass: 'durable',
			name: 'recipe.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 1024,
			conversationId: 'conv-1',
			summary: 'Recipe',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		const normalizedArtifact = {
			id: 'normalized-1',
			type: 'normalized_document',
			retrievalClass: 'durable',
			name: 'recipe.txt',
			mimeType: 'text/plain',
			sizeBytes: 400,
			conversationId: 'conv-1',
			summary: 'Recipe text',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		mockSaveUploadedArtifact.mockResolvedValue({
			artifact,
			reusedExistingArtifact: false,
			normalizedArtifact,
		});
		mockResolvePromptAttachmentArtifacts.mockResolvedValue({
			displayArtifacts: [artifact],
			promptArtifacts: [normalizedArtifact],
			items: [
				{
					requestedArtifactId: artifact.id,
					displayArtifact: artifact,
					promptArtifact: normalizedArtifact,
					promptReady: true,
					readinessError: null,
					contentLength: 320,
					contentPreview: 'Recipe text',
					contentHash: 'hash-1',
					chunkCount: 2,
				},
			],
			unresolvedItems: [],
		});

		const formData = new FormData();
		formData.append('file', new File(['recipe'], 'recipe.pdf', { type: 'application/pdf' }));
		formData.append('conversationId', 'conv-1');

		const response = await POST(makeEventWithFormData(formData));
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.promptReady).toBe(true);
		expect(data.promptArtifactId).toBe('normalized-1');
		expect(data.readinessError).toBeNull();
	});

	it('returns a readiness error when the file cannot be normalized for chat', async () => {
		const artifact = {
			id: 'artifact-2',
			type: 'source_document',
			retrievalClass: 'durable',
			name: 'scan.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 1024,
			conversationId: 'conv-1',
			summary: 'Scan',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		mockSaveUploadedArtifact.mockResolvedValue({
			artifact,
			reusedExistingArtifact: false,
			normalizedArtifact: null,
		});
		mockSyncArtifactToHoncho.mockResolvedValue({ uploaded: false, mode: 'none' });
		mockCreateNormalizedArtifact.mockResolvedValue(null);
		mockResolvePromptAttachmentArtifacts.mockResolvedValue({
			displayArtifacts: [artifact],
			promptArtifacts: [],
			items: [
				{
					requestedArtifactId: artifact.id,
					displayArtifact: artifact,
					promptArtifact: null,
					promptReady: false,
					readinessError: 'This file could not be prepared for chat.',
					contentLength: 0,
					contentPreview: null,
					contentHash: null,
					chunkCount: 0,
				},
			],
			unresolvedItems: [
				{
					requestedArtifactId: artifact.id,
					displayArtifact: artifact,
					promptArtifact: null,
					promptReady: false,
					readinessError: 'This file could not be prepared for chat.',
					contentLength: 0,
					contentPreview: null,
					contentHash: null,
					chunkCount: 0,
				},
			],
		});

		const formData = new FormData();
		formData.append('file', new File(['scan'], 'scan.pdf', { type: 'application/pdf' }));
		formData.append('conversationId', 'conv-1');

		const response = await POST(makeEventWithFormData(formData));
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.promptReady).toBe(false);
		expect(data.promptArtifactId).toBeNull();
		expect(data.readinessError).toMatch(/could not be prepared for chat/i);
	});

	it('returns promptReady false when the normalized artifact exists but the extracted content is too thin', async () => {
		const artifact = {
			id: 'artifact-3',
			type: 'source_document',
			retrievalClass: 'durable',
			name: 'emptyish.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 1024,
			conversationId: 'conv-1',
			summary: 'Thin extraction',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		const normalizedArtifact = {
			id: 'normalized-3',
			type: 'normalized_document',
			retrievalClass: 'durable',
			name: 'emptyish.txt',
			mimeType: 'text/plain',
			sizeBytes: 12,
			conversationId: 'conv-1',
			summary: 'Thin text',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		mockSaveUploadedArtifact.mockResolvedValue({
			artifact,
			reusedExistingArtifact: false,
			normalizedArtifact,
		});
		mockResolvePromptAttachmentArtifacts.mockResolvedValue({
			displayArtifacts: [artifact],
			promptArtifacts: [],
			items: [
				{
					requestedArtifactId: artifact.id,
					displayArtifact: artifact,
					promptArtifact: normalizedArtifact,
					promptReady: false,
					readinessError: 'This file was uploaded, but no usable readable text could be prepared for chat from it.',
					contentLength: 8,
					contentPreview: 'Too thin',
					contentHash: 'hash-thin',
					chunkCount: 1,
				},
			],
			unresolvedItems: [],
		});

		const formData = new FormData();
		formData.append('file', new File(['thin'], 'emptyish.pdf', { type: 'application/pdf' }));
		formData.append('conversationId', 'conv-1');

		const response = await POST(makeEventWithFormData(formData));
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.promptReady).toBe(false);
		expect(data.promptArtifactId).toBeNull();
		expect(data.readinessError).toMatch(/usable readable text/i);
	});

	it('returns updated 413 guidance when multipart parsing exceeds the server limit', async () => {
		const event = {
			request: {
				formData: vi.fn().mockRejectedValue(new Error('request body size exceeded')),
				headers: {
					get: vi.fn().mockReturnValue('99999999'),
				},
			},
			locals: { user: { id: 'user-1', email: 'test@example.com' } },
			params: {},
			url: new URL('http://localhost/api/knowledge/upload'),
			route: { id: '/api/knowledge/upload' },
		} as any;

		const response = await POST(event);
		const data = await response.json();

		expect(response.status).toBe(413);
		expect(data.error).toMatch(/50MB/i);
		expect(data.error).toMatch(/BODY_SIZE_LIMIT/i);
	});

	it('uploads without vaultId leaves vaultId null on artifact', async () => {
		const artifact = {
			id: 'artifact-1',
			type: 'source_document',
			retrievalClass: 'durable',
			name: 'doc.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 1024,
			conversationId: 'conv-1',
			vaultId: null,
			summary: 'Doc',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		mockSaveUploadedArtifact.mockResolvedValue({
			artifact,
			reusedExistingArtifact: false,
			normalizedArtifact: null,
		});
		mockResolvePromptAttachmentArtifacts.mockResolvedValue({
			displayArtifacts: [artifact],
			promptArtifacts: [],
			items: [
				{
					requestedArtifactId: artifact.id,
					displayArtifact: artifact,
					promptArtifact: null,
					promptReady: false,
					readinessError: 'No text',
					contentLength: 0,
					contentPreview: null,
					contentHash: null,
					chunkCount: 0,
				},
			],
			unresolvedItems: [],
		});

		const formData = new FormData();
		formData.append('file', new File(['doc'], 'doc.pdf', { type: 'application/pdf' }));
		formData.append('conversationId', 'conv-1');

		const response = await POST(makeEventWithFormData(formData));
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(mockSaveUploadedArtifact).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				conversationId: 'conv-1',
				vaultId: null,
			})
		);
		expect(mockGetVault).not.toHaveBeenCalled();
	});

	it('uploads to a vault without a conversation id', async () => {
		const artifact = {
			id: 'artifact-vault-only',
			type: 'source_document',
			retrievalClass: 'durable',
			name: 'vault-doc.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 1024,
			conversationId: null,
			vaultId: 'vault-1',
			storagePath: 'data/knowledge/user-1/artifact-vault-only.pdf',
			summary: 'Vault doc',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		const normalizedArtifact = {
			id: 'normalized-vault-only',
			type: 'normalized_document',
			retrievalClass: 'durable',
			name: 'vault-doc.txt',
			mimeType: 'text/plain',
			sizeBytes: 256,
			conversationId: null,
			summary: 'Vault text',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		mockGetVault.mockResolvedValue({
			id: 'vault-1',
			userId: 'user-1',
			name: 'My Vault',
			color: '#C15F3C',
			sortOrder: 0,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
		mockSaveUploadedArtifact.mockResolvedValue({
			artifact,
			reusedExistingArtifact: false,
			normalizedArtifact: null,
		});
		mockCreateNormalizedArtifact.mockResolvedValue(normalizedArtifact);
		mockResolvePromptAttachmentArtifacts.mockResolvedValue({
			displayArtifacts: [artifact],
			promptArtifacts: [normalizedArtifact],
			items: [
				{
					requestedArtifactId: artifact.id,
					displayArtifact: artifact,
					promptArtifact: normalizedArtifact,
					promptReady: true,
					readinessError: null,
					contentLength: 256,
					contentPreview: 'Vault text',
					contentHash: 'hash-vault',
					chunkCount: 1,
				},
			],
			unresolvedItems: [],
		});

		const formData = new FormData();
		formData.append('file', new File(['doc'], 'vault-doc.pdf', { type: 'application/pdf' }));
		formData.append('vaultId', 'vault-1');

		const response = await POST(makeEventWithFormData(formData));
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.promptReady).toBe(true);
		expect(mockGetConversation).not.toHaveBeenCalled();
		expect(mockGetVault).toHaveBeenCalledWith('user-1', 'vault-1');
		expect(mockSaveUploadedArtifact).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				conversationId: null,
				vaultId: 'vault-1',
			})
		);
		expect(mockCreateNormalizedArtifact).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				conversationId: null,
				sourceArtifactId: artifact.id,
			})
		);
		expect(mockSyncArtifactToHoncho).not.toHaveBeenCalled();
	});

	it('uploads with vaultId sets vaultId on artifact', async () => {
		const artifact = {
			id: 'artifact-2',
			type: 'source_document',
			retrievalClass: 'durable',
			name: 'doc.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 1024,
			conversationId: 'conv-1',
			vaultId: 'vault-1',
			summary: 'Doc',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};
		mockGetVault.mockResolvedValue({
			id: 'vault-1',
			userId: 'user-1',
			name: 'My Vault',
			color: '#C15F3C',
			sortOrder: 0,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
		mockSaveUploadedArtifact.mockResolvedValue({
			artifact,
			reusedExistingArtifact: false,
			normalizedArtifact: null,
		});
		mockResolvePromptAttachmentArtifacts.mockResolvedValue({
			displayArtifacts: [artifact],
			promptArtifacts: [],
			items: [
				{
					requestedArtifactId: artifact.id,
					displayArtifact: artifact,
					promptArtifact: null,
					promptReady: false,
					readinessError: 'No text',
					contentLength: 0,
					contentPreview: null,
					contentHash: null,
					chunkCount: 0,
				},
			],
			unresolvedItems: [],
		});

		const formData = new FormData();
		formData.append('file', new File(['doc'], 'doc.pdf', { type: 'application/pdf' }));
		formData.append('conversationId', 'conv-1');
		formData.append('vaultId', 'vault-1');

		const response = await POST(makeEventWithFormData(formData));
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(mockGetVault).toHaveBeenCalledWith('user-1', 'vault-1');
		expect(mockSaveUploadedArtifact).toHaveBeenCalledWith(
			expect.objectContaining({
				userId: 'user-1',
				conversationId: 'conv-1',
				vaultId: 'vault-1',
			})
		);
	});

	it('returns 400 when vaultId does not exist', async () => {
		mockGetVault.mockResolvedValue(null);

		const formData = new FormData();
		formData.append('file', new File(['doc'], 'doc.pdf', { type: 'application/pdf' }));
		formData.append('conversationId', 'conv-1');
		formData.append('vaultId', 'nonexistent-vault');

		const response = await POST(makeEventWithFormData(formData));
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/vault not found/i);
		expect(mockSaveUploadedArtifact).not.toHaveBeenCalled();
	});

	it('returns 400 when vaultId belongs to another user', async () => {
		mockGetVault.mockResolvedValue(null);

		const formData = new FormData();
		formData.append('file', new File(['doc'], 'doc.pdf', { type: 'application/pdf' }));
		formData.append('conversationId', 'conv-1');
		formData.append('vaultId', 'other-user-vault');

		const response = await POST(makeEventWithFormData(formData));
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/vault not found/i);
		expect(mockSaveUploadedArtifact).not.toHaveBeenCalled();
	});

	it('returns 400 when conversationId does not exist', async () => {
		mockGetConversation.mockResolvedValue(null);

		const formData = new FormData();
		formData.append('file', new File(['doc'], 'doc.pdf', { type: 'application/pdf' }));
		formData.append('conversationId', 'missing-conv');

		const response = await POST(makeEventWithFormData(formData));
		const data = await response.json();

		expect(response.status).toBe(400);
		expect(data.error).toMatch(/conversation not found/i);
		expect(mockSaveUploadedArtifact).not.toHaveBeenCalled();
	});
});
