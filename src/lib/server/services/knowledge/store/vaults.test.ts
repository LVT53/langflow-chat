import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockDb = {
  insert: vi.fn(() => ({
    values: vi.fn(() => ({
      returning: vi.fn(),
    })),
  })),
  select: vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({
        orderBy: vi.fn(),
        limit: vi.fn(),
      })),
    })),
  })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
  })),
  delete: vi.fn(() => ({
    where: vi.fn(() => Promise.resolve({ changes: 0 })),
  })),
};

vi.mock('../../../db', () => ({
  db: mockDb,
}));

const { 
  createVault, 
  getVaults, 
  getVault, 
  updateVault, 
  deleteVault,
} = await import('./vaults');

describe('Vault Store CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createVault', () => {
    it('inserts vault and returns it', async () => {
      const mockVault = {
        id: 'vault-123',
        userId: 'user-1',
        name: 'My Test Vault',
        color: '#FF5733',
        sortOrder: 0,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([mockVault])),
        })),
      });

      const result = await createVault('user-1', 'My Test Vault', '#FF5733');

      expect(result.id).toBe('vault-123');
      expect(result.userId).toBe('user-1');
      expect(result.name).toBe('My Test Vault');
      expect(result.color).toBe('#FF5733');
      expect(result.sortOrder).toBe(0);
      expect(result.createdAt).toBeGreaterThan(0);
      expect(result.updatedAt).toBeGreaterThan(0);
    });

    it('creates vault without color', async () => {
      const mockVault = {
        id: 'vault-456',
        userId: 'user-1',
        name: 'No Color Vault',
        color: null,
        sortOrder: 0,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([mockVault])),
        })),
      });

      const result = await createVault('user-1', 'No Color Vault');

      expect(result.name).toBe('No Color Vault');
      expect(result.color).toBeNull();
    });

    it('creates vault with null color explicitly', async () => {
      const mockVault = {
        id: 'vault-789',
        userId: 'user-1',
        name: 'Null Color Vault',
        color: null,
        sortOrder: 0,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([mockVault])),
        })),
      });

      const result = await createVault('user-1', 'Null Color Vault', null);

      expect(result.color).toBeNull();
    });
  });

  describe('getVaults', () => {
    it('returns only users vaults', async () => {
      const mockVaults = [
        {
          id: 'vault-1',
          userId: 'user-1',
          name: 'Vault A',
          color: null,
          sortOrder: 0,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
        {
          id: 'vault-2',
          userId: 'user-1',
          name: 'Vault B',
          color: null,
          sortOrder: 1,
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
        },
      ];

      const orderByMock = vi.fn(() => Promise.resolve(mockVaults));
      const whereMock = vi.fn(() => ({ orderBy: orderByMock }));
      const fromMock = vi.fn(() => ({ where: whereMock }));

      mockDb.select.mockReturnValue({
        from: fromMock,
      });

      const result = await getVaults('user-1');

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Vault A');
      expect(result[1].name).toBe('Vault B');
      expect(whereMock).toHaveBeenCalled();
      expect(orderByMock).toHaveBeenCalled();
    });

    it('returns empty array when user has no vaults', async () => {
      const orderByMock = vi.fn(() => Promise.resolve([]));
      const whereMock = vi.fn(() => ({ orderBy: orderByMock }));
      const fromMock = vi.fn(() => ({ where: whereMock }));

      mockDb.select.mockReturnValue({
        from: fromMock,
      });

      const result = await getVaults('user-no-vaults');

      expect(result).toEqual([]);
    });
  });

  describe('getVault', () => {
    it('returns single vault by id', async () => {
      const mockVault = {
        id: 'vault-123',
        userId: 'user-1',
        name: 'Single Vault',
        color: '#ABC123',
        sortOrder: 0,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      };

      const whereMock = vi.fn(() => Promise.resolve([mockVault]));
      const fromMock = vi.fn(() => ({ where: whereMock }));

      mockDb.select.mockReturnValue({
        from: fromMock,
      });

      const result = await getVault('user-1', 'vault-123');

      expect(result).toBeTruthy();
      expect(result?.id).toBe('vault-123');
      expect(result?.name).toBe('Single Vault');
      expect(result?.color).toBe('#ABC123');
    });

    it('returns null for non-existent vault', async () => {
      const whereMock = vi.fn(() => Promise.resolve([]));
      const fromMock = vi.fn(() => ({ where: whereMock }));

      mockDb.select.mockReturnValue({
        from: fromMock,
      });

      const result = await getVault('user-1', 'non-existent-id');
      expect(result).toBeNull();
    });

    it('returns null when vault belongs to different user', async () => {
      const whereMock = vi.fn(() => Promise.resolve([]));
      const fromMock = vi.fn(() => ({ where: whereMock }));

      mockDb.select.mockReturnValue({
        from: fromMock,
      });

      const result = await getVault('user-2', 'vault-123');
      expect(result).toBeNull();
    });
  });

  describe('updateVault', () => {
    it('updates vault name', async () => {
      const mockVault = {
        id: 'vault-123',
        userId: 'user-1',
        name: 'Updated Name',
        color: null,
        sortOrder: 0,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      const returningMock = vi.fn(() => Promise.resolve([mockVault]));
      const whereMock = vi.fn(() => ({ returning: returningMock }));
      const setMock = vi.fn(() => ({ where: whereMock }));

      mockDb.update.mockReturnValue({
        set: setMock,
      });

      const result = await updateVault('user-1', 'vault-123', { name: 'Updated Name' });

      expect(result).toBeTruthy();
      expect(result?.name).toBe('Updated Name');
      expect(setMock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Updated Name' }));
    });

    it('updates vault color', async () => {
      const mockVault = {
        id: 'vault-123',
        userId: 'user-1',
        name: 'Color Vault',
        color: '#NEW',
        sortOrder: 0,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      const returningMock = vi.fn(() => Promise.resolve([mockVault]));
      const whereMock = vi.fn(() => ({ returning: returningMock }));
      const setMock = vi.fn(() => ({ where: whereMock }));

      mockDb.update.mockReturnValue({
        set: setMock,
      });

      const result = await updateVault('user-1', 'vault-123', { color: '#NEW' });

      expect(result?.color).toBe('#NEW');
      expect(result?.name).toBe('Color Vault');
    });

    it('updates vault sortOrder', async () => {
      const mockVault = {
        id: 'vault-123',
        userId: 'user-1',
        name: 'Sort Vault',
        color: null,
        sortOrder: 5,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      const returningMock = vi.fn(() => Promise.resolve([mockVault]));
      const whereMock = vi.fn(() => ({ returning: returningMock }));
      const setMock = vi.fn(() => ({ where: whereMock }));

      mockDb.update.mockReturnValue({
        set: setMock,
      });

      const result = await updateVault('user-1', 'vault-123', { sortOrder: 5 });

      expect(result?.sortOrder).toBe(5);
    });

    it('updates multiple fields at once', async () => {
      const mockVault = {
        id: 'vault-123',
        userId: 'user-1',
        name: 'New Name',
        color: '#NEW',
        sortOrder: 10,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      };

      const returningMock = vi.fn(() => Promise.resolve([mockVault]));
      const whereMock = vi.fn(() => ({ returning: returningMock }));
      const setMock = vi.fn(() => ({ where: whereMock }));

      mockDb.update.mockReturnValue({
        set: setMock,
      });

      const result = await updateVault('user-1', 'vault-123', {
        name: 'New Name',
        color: '#NEW',
        sortOrder: 10,
      });

      expect(result?.name).toBe('New Name');
      expect(result?.color).toBe('#NEW');
      expect(result?.sortOrder).toBe(10);
    });

    it('returns null when vault not found', async () => {
      const returningMock = vi.fn(() => Promise.resolve([]));
      const whereMock = vi.fn(() => ({ returning: returningMock }));
      const setMock = vi.fn(() => ({ where: whereMock }));

      mockDb.update.mockReturnValue({
        set: setMock,
      });

      const result = await updateVault('user-1', 'non-existent', { name: 'New Name' });
      expect(result).toBeNull();
    });

    it('returns null when vault belongs to different user', async () => {
      const returningMock = vi.fn(() => Promise.resolve([]));
      const whereMock = vi.fn(() => ({ returning: returningMock }));
      const setMock = vi.fn(() => ({ where: whereMock }));

      mockDb.update.mockReturnValue({
        set: setMock,
      });

      const result = await updateVault('user-2', 'vault-123', { name: 'Hacked Name' });
      expect(result).toBeNull();
    });
  });

  describe('deleteVault', () => {
    it('removes vault from queries', async () => {
      mockDb.delete.mockReturnValue({
        where: vi.fn(() => Promise.resolve({ changes: 1 })),
      });

      const result = await deleteVault('user-1', 'vault-123');

      expect(result).toBe(true);
    });

    it('returns false when vault not found', async () => {
      mockDb.delete.mockReturnValue({
        where: vi.fn(() => Promise.resolve({ changes: 0 })),
      });

      const result = await deleteVault('user-1', 'non-existent');
      expect(result).toBe(false);
    });

    it('returns false when vault belongs to different user', async () => {
      mockDb.delete.mockReturnValue({
        where: vi.fn(() => Promise.resolve({ changes: 0 })),
      });

      const result = await deleteVault('user-2', 'vault-123');
      expect(result).toBe(false);
    });
  });
});
