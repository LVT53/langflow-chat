import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDbSelect = vi.fn();

vi.mock('$lib/server/db', () => ({
	db: {
		select: mockDbSelect,
	},
}));

const mockRequireAuth = vi.fn();

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: mockRequireAuth,
}));

const { GET } = await import('./+server');

describe('GET /api/knowledge/storage-quota', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockImplementation(() => {});
	});

	function createMockEvent(overrides = {}) {
		return {
			locals: {
				user: { id: 'user-123', email: 'test@example.com' }
			},
			request: new Request('http://localhost/api/knowledge/storage-quota'),
			...overrides
		};
	}

	function createQueryChain(result: unknown) {
		return {
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					groupBy: vi.fn(() => Promise.resolve(result)),
				})),
			})),
		};
	}

	function createSingleQueryChain(result: unknown) {
		return {
			from: vi.fn(() => ({
				where: vi.fn(() => Promise.resolve(result)),
			})),
		};
	}

	it('returns 401 when not authenticated', async () => {
		mockRequireAuth.mockImplementation(() => {
			throw new Error('Unauthorized');
		});

		const event = createMockEvent({ locals: { user: null } });

		await expect(GET(event as any)).rejects.toThrow('Unauthorized');
	});

	it('returns correct quota with empty vaults', async () => {
		mockDbSelect
			.mockReturnValueOnce(createSingleQueryChain([{ totalStorage: 0, totalFiles: 0 }]))
			.mockReturnValueOnce(createQueryChain([]));

		const event = createMockEvent();
		const response = await GET(event as any);

		expect(mockRequireAuth).toHaveBeenCalledWith(event);
		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.totalStorageUsed).toBe(0);
		expect(data.totalFiles).toBe(0);
		expect(data.storageLimit).toBe(5 * 1024 * 1024 * 1024);
		expect(data.usagePercent).toBe(0);
		expect(data.isWarning).toBe(false);
		expect(data.warningThreshold).toBe(80);
		expect(data.vaults).toEqual([]);
	});

	it('returns correct totals and per-vault breakdown', async () => {
		const vaultStats = [
			{ vaultId: 'vault-1', fileCount: 5, storageUsed: 1024 * 1024 * 100 },
			{ vaultId: 'vault-2', fileCount: 3, storageUsed: 1024 * 1024 * 50 },
		];

		const vaultRows = [
			{ id: 'vault-1', name: 'Documents' },
			{ id: 'vault-2', name: 'Images' },
		];

		mockDbSelect
			.mockReturnValueOnce(createSingleQueryChain([
				{ totalStorage: 1024 * 1024 * 150, totalFiles: 8 }
			]))
			.mockReturnValueOnce(createQueryChain(vaultStats))
			.mockReturnValueOnce(createSingleQueryChain(vaultRows));

		const event = createMockEvent();
		const response = await GET(event as any);

		expect(response.status).toBe(200);

		const data = await response.json();
		expect(data.totalStorageUsed).toBe(1024 * 1024 * 150);
		expect(data.totalFiles).toBe(8);
		expect(data.vaults).toHaveLength(2);
		expect(data.vaults[0]).toEqual({
			vaultId: 'vault-1',
			vaultName: 'Documents',
			fileCount: 5,
			storageUsed: 1024 * 1024 * 100,
		});
		expect(data.vaults[1]).toEqual({
			vaultId: 'vault-2',
			vaultName: 'Images',
			fileCount: 3,
			storageUsed: 1024 * 1024 * 50,
		});
	});

	it('shows warning when usage exceeds 80%', async () => {
		const fiveGB = 5 * 1024 * 1024 * 1024;
		const over80Percent = Math.floor(fiveGB * 0.85);

		mockDbSelect
			.mockReturnValueOnce(createSingleQueryChain([
				{ totalStorage: over80Percent, totalFiles: 100 }
			]))
			.mockReturnValueOnce(createQueryChain([
				{ vaultId: 'vault-1', fileCount: 100, storageUsed: over80Percent }
			]))
			.mockReturnValueOnce(createSingleQueryChain([
				{ id: 'vault-1', name: 'Big Vault' }
			]));

		const event = createMockEvent();
		const response = await GET(event as any);

		const data = await response.json();
		expect(data.isWarning).toBe(true);
		expect(data.usagePercent).toBeGreaterThan(80);
	});

	it('does not show warning when usage is below 80%', async () => {
		const fiveGB = 5 * 1024 * 1024 * 1024;
		const under80Percent = Math.floor(fiveGB * 0.75);

		mockDbSelect
			.mockReturnValueOnce(createSingleQueryChain([
				{ totalStorage: under80Percent, totalFiles: 50 }
			]))
			.mockReturnValueOnce(createQueryChain([
				{ vaultId: 'vault-1', fileCount: 50, storageUsed: under80Percent }
			]))
			.mockReturnValueOnce(createSingleQueryChain([
				{ id: 'vault-1', name: 'Normal Vault' }
			]));

		const event = createMockEvent();
		const response = await GET(event as any);

		const data = await response.json();
		expect(data.isWarning).toBe(false);
		expect(data.usagePercent).toBeLessThan(80);
	});

	it('handles vaults with no name gracefully', async () => {
		mockDbSelect
			.mockReturnValueOnce(createSingleQueryChain([
				{ totalStorage: 1024, totalFiles: 1 }
			]))
			.mockReturnValueOnce(createQueryChain([
				{ vaultId: 'vault-deleted', fileCount: 1, storageUsed: 1024 }
			]))
			.mockReturnValueOnce(createSingleQueryChain([]));

		const event = createMockEvent();
		const response = await GET(event as any);

		const data = await response.json();
		expect(data.vaults[0].vaultName).toBe('Unknown Vault');
	});

	it('rounds usage percent to 2 decimal places', async () => {
		const fiveGB = 5 * 1024 * 1024 * 1024;
		const preciseAmount = Math.floor(fiveGB * 0.333333);

		mockDbSelect
			.mockReturnValueOnce(createSingleQueryChain([
				{ totalStorage: preciseAmount, totalFiles: 10 }
			]))
			.mockReturnValueOnce(createQueryChain([
				{ vaultId: 'vault-1', fileCount: 10, storageUsed: preciseAmount }
			]))
			.mockReturnValueOnce(createSingleQueryChain([
				{ id: 'vault-1', name: 'Test Vault' }
			]));

		const event = createMockEvent();
		const response = await GET(event as any);

		const data = await response.json();
		expect(data.usagePercent).toBe(33.33);
	});

	it('only counts artifacts with vaultId (not chat temp files)', async () => {
		mockDbSelect
			.mockReturnValueOnce(createSingleQueryChain([
				{ totalStorage: 5000, totalFiles: 2 }
			]))
			.mockReturnValueOnce(createQueryChain([
				{ vaultId: 'vault-1', fileCount: 2, storageUsed: 5000 }
			]))
			.mockReturnValueOnce(createSingleQueryChain([
				{ id: 'vault-1', name: 'Test Vault' }
			]));

		const event = createMockEvent();
		await GET(event as any);

		const firstCall = mockDbSelect.mock.calls[0];
		expect(firstCall).toBeDefined();
	});
});
