// Vault feature deprecated - stubs kept for compilation compatibility

export interface Vault {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface VaultUpdates {
  name?: string;
  color?: string | null;
  sortOrder?: number;
}

export interface VaultDeleteResult {
  deleted: boolean;
  fileCount: number;
  deletedArtifactIds: string[];
  deletedStoragePaths: string[];
  failedStoragePaths: string[];
}

export async function createVault(
  _userId: string,
  _name: string,
  _color?: string | null,
): Promise<Vault> {
  throw new Error('Vaults are deprecated and no longer supported');
}

export async function getVaults(_userId: string): Promise<Vault[]> {
  return [];
}

export async function getVault(
  _userId: string,
  _vaultId: string,
): Promise<Vault | null> {
  return null;
}

export async function updateVault(
  _userId: string,
  _vaultId: string,
  _updates: VaultUpdates,
): Promise<Vault | null> {
  return null;
}

export async function deleteVault(
  _userId: string,
  _vaultId: string,
): Promise<VaultDeleteResult | null> {
  return { deleted: false, fileCount: 0, deletedArtifactIds: [], deletedStoragePaths: [], failedStoragePaths: [] };
}
