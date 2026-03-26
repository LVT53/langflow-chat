import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn(),
}));

vi.mock('$lib/server/services/knowledge', () => ({
	createNormalizedArtifact: vi.fn(),
	saveUploadedArtifact: vi.fn(),
}));

vi.mock('$lib/server/services/honcho', () => ({
	syncArtifactToHoncho: vi.fn(),
}));

import { POST } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import { createNormalizedArtifact, saveUploadedArtifact } from '$lib/server/services/knowledge';
import { syncArtifactToHoncho } from '$lib/server/services/honcho';

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockCreateNormalizedArtifact = createNormalizedArtifact as ReturnType<typeof vi.fn>;
const mockSaveUploadedArtifact = saveUploadedArtifact as ReturnType<typeof vi.fn>;
const mockSyncArtifactToHoncho = syncArtifactToHoncho as ReturnType<typeof vi.fn>;

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
});
