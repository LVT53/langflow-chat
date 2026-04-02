import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn(),
}));

vi.mock('$lib/server/services/knowledge', () => ({
	searchVaultDocuments: vi.fn(),
}));

import { GET } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import { searchVaultDocuments } from '$lib/server/services/knowledge';

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockSearchVaultDocuments = searchVaultDocuments as ReturnType<typeof vi.fn>;

function makeEvent(url: string) {
	return {
		locals: { user: { id: 'user-1', email: 'test@example.com' } },
		request: {
			headers: {
				get: vi.fn().mockReturnValue(null),
			},
		},
		url: new URL(url),
		params: {},
		route: { id: '/api/knowledge/search' },
	} as any;
}

describe('GET /api/knowledge/search', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
		mockSearchVaultDocuments.mockResolvedValue([
			{
				id: 'doc-1',
				displayArtifactId: 'source-1',
				promptArtifactId: 'normalized-1',
				name: 'Vault brief.txt',
				mimeType: 'text/plain',
				vaultId: 'vault-1',
				vaultName: 'Research',
				summary: 'Short summary',
				snippet: 'Short summary',
				normalizedAvailable: true,
				updatedAt: Date.now(),
			},
		]);
	});

	it('returns vault search results for the authenticated user', async () => {
		const response = await GET(
			makeEvent('http://localhost/api/knowledge/search?q=brief&limit=4')
		);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(mockSearchVaultDocuments).toHaveBeenCalledWith({
			userId: 'user-1',
			query: 'brief',
			limit: 4,
		});
		expect(payload.results).toHaveLength(1);
		expect(payload.results[0].vaultName).toBe('Research');
	});

	it('falls back to the default limit when the query param is invalid', async () => {
		await GET(makeEvent('http://localhost/api/knowledge/search?q=&limit=wat'));

		expect(mockSearchVaultDocuments).toHaveBeenCalledWith({
			userId: 'user-1',
			query: '',
			limit: 6,
		});
	});
});
