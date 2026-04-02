import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH, DELETE } from './+server';

const mockGetVault = vi.hoisted(() => vi.fn());
const mockUpdateVault = vi.hoisted(() => vi.fn());
const mockDeleteVault = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/services/knowledge/store/vaults', () => ({
	getVault: mockGetVault,
	updateVault: mockUpdateVault,
	deleteVault: mockDeleteVault
}));

const mockRequireAuth = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: mockRequireAuth
}));

describe('GET /api/knowledge/vaults/[id]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockImplementation(() => {});
	});

	function createMockEvent(vaultId: string, overrides = {}) {
		return {
			locals: {
				user: { id: 'user-123', email: 'test@example.com' }
			},
			params: { id: vaultId },
			request: new Request(`http://localhost/api/knowledge/vaults/${vaultId}`),
			...overrides
		};
	}

	it('returns 401 when not authenticated', async () => {
		mockRequireAuth.mockImplementation(() => {
			throw new Error('Unauthorized');
		});

		const event = createMockEvent('vault-1', { locals: { user: null } });

		await expect(GET(event as any)).rejects.toThrow('Unauthorized');
	});

	it('returns vault when found', async () => {
		const mockVault = {
			id: 'vault-1',
			userId: 'user-123',
			name: 'My Vault',
			color: '#FF5733',
			sortOrder: 0,
			createdAt: 1234567890,
			updatedAt: 1234567890
		};
		mockGetVault.mockResolvedValue(mockVault);

		const event = createMockEvent('vault-1');
		const response = await GET(event as any);

		expect(mockRequireAuth).toHaveBeenCalledWith(event);
		expect(mockGetVault).toHaveBeenCalledWith('user-123', 'vault-1');
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data).toEqual(mockVault);
	});

	it('returns 404 when vault not found', async () => {
		mockGetVault.mockResolvedValue(null);

		const event = createMockEvent('vault-nonexistent');
		const response = await GET(event as any);

		expect(response.status).toBe(404);

		const data = await response.json();
		expect(data.error).toBe('Vault not found');
	});

	it('returns 404 for other user vault', async () => {
		mockGetVault.mockResolvedValue(null);

		const event = createMockEvent('vault-other');
		const response = await GET(event as any);

		expect(mockGetVault).toHaveBeenCalledWith('user-123', 'vault-other');
		expect(response.status).toBe(404);
	});
});

describe('PATCH /api/knowledge/vaults/[id]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockImplementation(() => {});
	});

	function createMockEvent(vaultId: string, body: unknown, overrides = {}) {
		return {
			locals: {
				user: { id: 'user-123', email: 'test@example.com' }
			},
			params: { id: vaultId },
			request: {
				json: vi.fn().mockResolvedValue(body)
			},
			...overrides
		};
	}

	it('returns 401 when not authenticated', async () => {
		mockRequireAuth.mockImplementation(() => {
			throw new Error('Unauthorized');
		});

		const event = createMockEvent('vault-1', { name: 'Updated' }, { locals: { user: null } });

		await expect(PATCH(event as any)).rejects.toThrow('Unauthorized');
	});

	it('updates vault name', async () => {
		const mockVault = {
			id: 'vault-1',
			userId: 'user-123',
			name: 'Updated Vault',
			color: '#FF5733',
			sortOrder: 0,
			createdAt: 1234567890,
			updatedAt: 1234567891
		};
		mockUpdateVault.mockResolvedValue(mockVault);

		const event = createMockEvent('vault-1', { name: 'Updated Vault' });
		const response = await PATCH(event as any);

		expect(mockRequireAuth).toHaveBeenCalledWith(event);
		expect(mockUpdateVault).toHaveBeenCalledWith('user-123', 'vault-1', { name: 'Updated Vault' });
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data).toEqual(mockVault);
	});

	it('updates vault color', async () => {
		const mockVault = {
			id: 'vault-1',
			userId: 'user-123',
			name: 'My Vault',
			color: '#00FF00',
			sortOrder: 0,
			createdAt: 1234567890,
			updatedAt: 1234567891
		};
		mockUpdateVault.mockResolvedValue(mockVault);

		const event = createMockEvent('vault-1', { color: '#00FF00' });
		const response = await PATCH(event as any);

		expect(mockUpdateVault).toHaveBeenCalledWith('user-123', 'vault-1', { color: '#00FF00' });
		expect(response.status).toBe(200);
	});

	it('updates vault sortOrder', async () => {
		const mockVault = {
			id: 'vault-1',
			userId: 'user-123',
			name: 'My Vault',
			color: '#FF5733',
			sortOrder: 5,
			createdAt: 1234567890,
			updatedAt: 1234567891
		};
		mockUpdateVault.mockResolvedValue(mockVault);

		const event = createMockEvent('vault-1', { sortOrder: 5 });
		const response = await PATCH(event as any);

		expect(mockUpdateVault).toHaveBeenCalledWith('user-123', 'vault-1', { sortOrder: 5 });
		expect(response.status).toBe(200);
	});

	it('updates multiple fields', async () => {
		const mockVault = {
			id: 'vault-1',
			userId: 'user-123',
			name: 'Updated Name',
			color: '#0000FF',
			sortOrder: 10,
			createdAt: 1234567890,
			updatedAt: 1234567891
		};
		mockUpdateVault.mockResolvedValue(mockVault);

		const event = createMockEvent('vault-1', { name: 'Updated Name', color: '#0000FF', sortOrder: 10 });
		const response = await PATCH(event as any);

		expect(mockUpdateVault).toHaveBeenCalledWith('user-123', 'vault-1', {
			name: 'Updated Name',
			color: '#0000FF',
			sortOrder: 10
		});
		expect(response.status).toBe(200);
	});

	it('returns 404 when vault not found', async () => {
		mockUpdateVault.mockResolvedValue(null);

		const event = createMockEvent('vault-nonexistent', { name: 'Updated' });
		const response = await PATCH(event as any);

		expect(response.status).toBe(404);

		const data = await response.json();
		expect(data.error).toBe('Vault not found');
	});

	it('returns 404 for other user vault', async () => {
		mockUpdateVault.mockResolvedValue(null);

		const event = createMockEvent('vault-other', { name: 'Updated' });
		const response = await PATCH(event as any);

		expect(mockUpdateVault).toHaveBeenCalledWith('user-123', 'vault-other', { name: 'Updated' });
		expect(response.status).toBe(404);
	});

	it('rejects empty update with 400', async () => {
		const event = createMockEvent('vault-1', {});
		const response = await PATCH(event as any);

		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data.error).toBe('No valid fields to update');
	});

	it('rejects invalid name with 400', async () => {
		const event = createMockEvent('vault-1', { name: '' });
		const response = await PATCH(event as any);

		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data.error).toBe('Name cannot be empty');
	});

	it('rejects invalid color with 400', async () => {
		const event = createMockEvent('vault-1', { color: 'invalid' });
		const response = await PATCH(event as any);

		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data.error).toBe('Color must be a valid hex color (#RGB or #RRGGBB)');
	});

	it('rejects invalid sortOrder with 400', async () => {
		const event = createMockEvent('vault-1', { sortOrder: 'not-a-number' });
		const response = await PATCH(event as any);

		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data.error).toBe('sortOrder must be an integer');
	});

	it('rejects non-integer sortOrder with 400', async () => {
		const event = createMockEvent('vault-1', { sortOrder: 1.5 });
		const response = await PATCH(event as any);

		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data.error).toBe('sortOrder must be an integer');
	});

	it('accepts null color', async () => {
		const mockVault = {
			id: 'vault-1',
			userId: 'user-123',
			name: 'My Vault',
			color: null,
			sortOrder: 0,
			createdAt: 1234567890,
			updatedAt: 1234567891
		};
		mockUpdateVault.mockResolvedValue(mockVault);

		const event = createMockEvent('vault-1', { color: null });
		const response = await PATCH(event as any);

		expect(mockUpdateVault).toHaveBeenCalledWith('user-123', 'vault-1', { color: null });
		expect(response.status).toBe(200);
	});

	it('trims whitespace from name', async () => {
		const mockVault = {
			id: 'vault-1',
			userId: 'user-123',
			name: 'Updated Vault',
			color: '#FF5733',
			sortOrder: 0,
			createdAt: 1234567890,
			updatedAt: 1234567891
		};
		mockUpdateVault.mockResolvedValue(mockVault);

		const event = createMockEvent('vault-1', { name: '  Updated Vault  ' });
		await PATCH(event as any);

		expect(mockUpdateVault).toHaveBeenCalledWith('user-123', 'vault-1', { name: 'Updated Vault' });
	});
});

describe('DELETE /api/knowledge/vaults/[id]', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockImplementation(() => {});
	});

	function createMockEvent(vaultId: string, overrides = {}) {
		return {
			locals: {
				user: { id: 'user-123', email: 'test@example.com' }
			},
			params: { id: vaultId },
			request: new Request(`http://localhost/api/knowledge/vaults/${vaultId}`, { method: 'DELETE' }),
			...overrides
		};
	}

	it('returns 401 when not authenticated', async () => {
		mockRequireAuth.mockImplementation(() => {
			throw new Error('Unauthorized');
		});

		const event = createMockEvent('vault-1', { locals: { user: null } });

		await expect(DELETE(event as any)).rejects.toThrow('Unauthorized');
	});

	it('deletes vault and returns 204', async () => {
		mockDeleteVault.mockResolvedValue({ deleted: true, fileCount: 0, deletedArtifactIds: [], deletedStoragePaths: [], failedStoragePaths: [] });

		const event = createMockEvent('vault-1');
		const response = await DELETE(event as any);

		expect(mockRequireAuth).toHaveBeenCalledWith(event);
		expect(mockDeleteVault).toHaveBeenCalledWith('user-123', 'vault-1');
		expect(response.status).toBe(204);
		expect(await response.text()).toBe('');
	});

	it('returns 404 when vault not found', async () => {
		mockDeleteVault.mockResolvedValue(null);

		const event = createMockEvent('vault-nonexistent');
		const response = await DELETE(event as any);

		expect(response.status).toBe(404);

		const data = await response.json();
		expect(data.error).toBe('Vault not found');
	});

	it('returns 404 for other user vault', async () => {
		mockDeleteVault.mockResolvedValue(null);

		const event = createMockEvent('vault-other');
		const response = await DELETE(event as any);

		expect(mockDeleteVault).toHaveBeenCalledWith('user-123', 'vault-other');
		expect(response.status).toBe(404);
	});
});
