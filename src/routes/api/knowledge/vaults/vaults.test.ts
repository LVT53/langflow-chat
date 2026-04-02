import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './+server';

const mockGetVaults = vi.hoisted(() => vi.fn());
const mockCreateVault = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/services/knowledge/store/vaults', () => ({
	getVaults: mockGetVaults,
	createVault: mockCreateVault
}));

const mockRequireAuth = vi.hoisted(() => vi.fn());

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: mockRequireAuth
}));

describe('GET /api/knowledge/vaults', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockImplementation(() => {});
	});

	function createMockEvent(overrides = {}) {
		return {
			locals: {
				user: { id: 'user-123', email: 'test@example.com' }
			},
			request: new Request('http://localhost/api/knowledge/vaults'),
			...overrides
		};
	}

	it('returns 401 when not authenticated', async () => {
		mockRequireAuth.mockImplementation(() => {
			throw new Error('Unauthorized');
		});

		const event = createMockEvent({ locals: { user: null } });

		await expect(GET(event as any)).rejects.toThrow('Unauthorized');
	});

	it('returns user vaults as JSON array', async () => {
		const mockVaults = [
			{
				id: 'vault-1',
				userId: 'user-123',
				name: 'My Vault',
				color: '#FF5733',
				sortOrder: 0,
				createdAt: 1234567890,
				updatedAt: 1234567890
			}
		];
		mockGetVaults.mockResolvedValue(mockVaults);

		const event = createMockEvent();
		const response = await GET(event as any);

		expect(mockRequireAuth).toHaveBeenCalledWith(event);
		expect(mockGetVaults).toHaveBeenCalledWith('user-123');
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data).toEqual({ vaults: mockVaults });
	});

	it('returns empty array when user has no vaults', async () => {
		mockGetVaults.mockResolvedValue([]);

		const event = createMockEvent();
		const response = await GET(event as any);

		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data).toEqual({ vaults: [] });
	});
});

describe('POST /api/knowledge/vaults', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockImplementation(() => {});
	});

	function createMockEvent(body: unknown, overrides = {}) {
		return {
			locals: {
				user: { id: 'user-123', email: 'test@example.com' }
			},
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

		const event = createMockEvent({ name: 'Test Vault' }, { locals: { user: null } });

		await expect(POST(event as any)).rejects.toThrow('Unauthorized');
	});

	it('creates vault with name only', async () => {
		const mockVault = {
			id: 'vault-new',
			userId: 'user-123',
			name: 'Test Vault',
			color: null,
			sortOrder: 0,
			createdAt: 1234567890,
			updatedAt: 1234567890
		};
		mockCreateVault.mockResolvedValue(mockVault);

		const event = createMockEvent({ name: 'Test Vault' });
		const response = await POST(event as any);

		expect(mockRequireAuth).toHaveBeenCalledWith(event);
		expect(mockCreateVault).toHaveBeenCalledWith('user-123', 'Test Vault', undefined);
		expect(response.status).toBe(201);

		const data = await response.json();
		expect(data).toEqual(mockVault);
	});

	it('creates vault with name and color', async () => {
		const mockVault = {
			id: 'vault-new',
			userId: 'user-123',
			name: 'Test Vault',
			color: '#FF5733',
			sortOrder: 0,
			createdAt: 1234567890,
			updatedAt: 1234567890
		};
		mockCreateVault.mockResolvedValue(mockVault);

		const event = createMockEvent({ name: 'Test Vault', color: '#FF5733' });
		const response = await POST(event as any);

		expect(mockCreateVault).toHaveBeenCalledWith('user-123', 'Test Vault', '#FF5733');
		expect(response.status).toBe(201);
	});

	it('rejects missing name with 400', async () => {
		const event = createMockEvent({ color: '#FF5733' });
		const response = await POST(event as any);

		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data.error).toBe('Name is required');
	});

	it('rejects empty name with 400', async () => {
		const event = createMockEvent({ name: '   ' });
		const response = await POST(event as any);

		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data.error).toBe('Name cannot be empty');
	});

	it('rejects name exceeding 100 characters with 400', async () => {
		const event = createMockEvent({ name: 'a'.repeat(101) });
		const response = await POST(event as any);

		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data.error).toBe('Name cannot exceed 100 characters');
	});

	it('rejects invalid color format with 400', async () => {
		const event = createMockEvent({ name: 'Test Vault', color: 'invalid' });
		const response = await POST(event as any);

		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data.error).toBe('Color must be a valid hex color (#RGB or #RRGGBB)');
	});

	it('rejects non-string name with 400', async () => {
		const event = createMockEvent({ name: 123 });
		const response = await POST(event as any);

		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data.error).toBe('Name must be a string');
	});

	it('rejects non-string color with 400', async () => {
		const event = createMockEvent({ name: 'Test Vault', color: 123 });
		const response = await POST(event as any);

		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data.error).toBe('Color must be a string');
	});

	it('accepts valid 3-digit hex color', async () => {
		const mockVault = {
			id: 'vault-new',
			userId: 'user-123',
			name: 'Test Vault',
			color: '#F33',
			sortOrder: 0,
			createdAt: 1234567890,
			updatedAt: 1234567890
		};
		mockCreateVault.mockResolvedValue(mockVault);

		const event = createMockEvent({ name: 'Test Vault', color: '#F33' });
		const response = await POST(event as any);

		expect(response.status).toBe(201);
	});

	it('accepts null color', async () => {
		const mockVault = {
			id: 'vault-new',
			userId: 'user-123',
			name: 'Test Vault',
			color: null,
			sortOrder: 0,
			createdAt: 1234567890,
			updatedAt: 1234567890
		};
		mockCreateVault.mockResolvedValue(mockVault);

		const event = createMockEvent({ name: 'Test Vault', color: null });
		const response = await POST(event as any);

		expect(mockCreateVault).toHaveBeenCalledWith('user-123', 'Test Vault', null);
		expect(response.status).toBe(201);
	});

	it('trims whitespace from name', async () => {
		const mockVault = {
			id: 'vault-new',
			userId: 'user-123',
			name: 'Test Vault',
			color: null,
			sortOrder: 0,
			createdAt: 1234567890,
			updatedAt: 1234567890
		};
		mockCreateVault.mockResolvedValue(mockVault);

		const event = createMockEvent({ name: '  Test Vault  ' });
		await POST(event as any);

		expect(mockCreateVault).toHaveBeenCalledWith('user-123', 'Test Vault', undefined);
	});

	it('handles invalid JSON body', async () => {
		const event = {
			locals: {
				user: { id: 'user-123', email: 'test@example.com' }
			},
			request: {
				json: vi.fn().mockRejectedValue(new Error('Invalid JSON'))
			}
		};

		const response = await POST(event as any);

		expect(response.status).toBe(400);

		const data = await response.json();
		expect(data.error).toBe('Name is required');
	});
});
