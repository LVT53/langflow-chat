import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock crypto before any imports that use it
vi.mock(import('crypto'), async (importOriginal) => {
	const actual = await importOriginal<typeof import('crypto')>();
	return {
		...actual,
		randomUUID: vi.fn().mockReturnValue('family-uuid-123'),
	};
});

const mockDb = {
	select: vi.fn(() => ({
		from: vi.fn(() => ({
			where: vi.fn(() => ({
				orderBy: vi.fn(() => ({
					limit: vi.fn(() => Promise.resolve([])),
				})),
				limit: vi.fn(() => Promise.resolve([])),
			})),
		})),
	})),
	update: vi.fn(() => ({
		set: vi.fn(() => ({
			where: vi.fn(() => ({
				returning: vi.fn(() => Promise.resolve([{}])),
			})),
		})),
	})),
};

vi.mock('../../../db', () => ({
	db: mockDb,
}));

const {
	generateDocumentFamilyId,
	linkDuplicateDocument,
	getDocumentVersions,
} = await import('./document-versioning');

describe('Document Versioning', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDb.select.mockReset();
		mockDb.update.mockReset();
		mockDb.select.mockReturnValue({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					orderBy: vi.fn(() => Promise.resolve([])),
					limit: vi.fn(() => Promise.resolve([])),
				})),
			})),
		});
		mockDb.update.mockReturnValue({
			set: vi.fn(() => ({
				where: vi.fn(() => ({
					returning: vi.fn(() => Promise.resolve([{}])),
				})),
			})),
		});
	});

	describe('generateDocumentFamilyId', () => {
		it('should generate a unique family ID', () => {
			const familyId = generateDocumentFamilyId();
			expect(typeof familyId).toBe('string');
			expect(familyId.length).toBeGreaterThan(0);
		});
	});

	describe('getDocumentVersions', () => {
		it('should return artifacts belonging to a family', async () => {
			const mockArtifacts = [
				{
					id: 'artifact-1',
					metadataJson: JSON.stringify({ documentFamilyId: 'family-1' }),
					createdAt: new Date('2024-01-01'),
					updatedAt: new Date('2024-01-01'),
				},
				{
					id: 'artifact-2',
					metadataJson: JSON.stringify({ documentFamilyId: 'family-1' }),
					createdAt: new Date('2024-01-02'),
					updatedAt: new Date('2024-01-02'),
				},
			];

			mockDb.select.mockReturnValue({
				from: vi.fn(() => ({
					where: vi.fn(() => ({
						orderBy: vi.fn(() => Promise.resolve(mockArtifacts)),
					})),
				})),
			});

			const versions = await getDocumentVersions('family-1');
			expect(versions).toHaveLength(2);
		});

		it('should return empty array when no versions exist', async () => {
			mockDb.select.mockReturnValue({
				from: vi.fn(() => ({
					where: vi.fn(() => ({
						orderBy: vi.fn(() => Promise.resolve([])),
					})),
				})),
			});

			const versions = await getDocumentVersions('nonexistent-family');
			expect(versions).toHaveLength(0);
		});
	});

	describe('linkDuplicateDocument', () => {
		it('should create new family when original has no family', async () => {
			const mockOriginal = {
				id: 'original-1',
				metadataJson: null,
				createdAt: new Date('2024-01-01'),
				updatedAt: new Date('2024-01-01'),
			};

			const mockDuplicate = {
				id: 'duplicate-1',
				metadataJson: null,
				createdAt: new Date('2024-01-02'),
				updatedAt: new Date('2024-01-02'),
			};

			mockDb.select
				.mockReturnValueOnce({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							limit: vi.fn(() => Promise.resolve([mockOriginal])),
						})),
					})),
				})
				.mockReturnValueOnce({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							orderBy: vi.fn(() => Promise.resolve([])),
						})),
					})),
				})
				.mockReturnValueOnce({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							limit: vi.fn(() => Promise.resolve([mockDuplicate])),
						})),
					})),
				});

			mockDb.update.mockReturnValue({
				set: vi.fn(() => ({
					where: vi.fn(() => ({
						returning: vi.fn(() => Promise.resolve([{}])),
					})),
				})),
			});

			const result = await linkDuplicateDocument({
				userId: 'user-1',
				originalArtifactId: 'original-1',
				duplicateArtifactId: 'duplicate-1',
			});

			expect(typeof result.familyId).toBe('string');
			expect(result.familyId.length).toBeGreaterThan(0);
			expect(result.originalSupersedesArtifactId ?? null).toBeNull();
			expect(result.duplicateSupersedesArtifactId).toBe('original-1');
		});

		it('should use existing family when original has one', async () => {
			const mockOriginal = {
				id: 'original-1',
				metadataJson: JSON.stringify({
					documentFamilyId: 'existing-family',
				}),
				createdAt: new Date('2024-01-01'),
				updatedAt: new Date('2024-01-01'),
			};

			const mockDuplicate = {
				id: 'duplicate-1',
				metadataJson: null,
				createdAt: new Date('2024-01-02'),
				updatedAt: new Date('2024-01-02'),
			};

			mockDb.select
				.mockReturnValueOnce({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							limit: vi.fn(() => Promise.resolve([mockOriginal])),
						})),
					})),
				})
				.mockReturnValueOnce({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							limit: vi.fn(() => Promise.resolve([mockDuplicate])),
						})),
					})),
				});

			mockDb.update.mockReturnValue({
				set: vi.fn(() => ({
					where: vi.fn(() => ({
						returning: vi.fn(() => Promise.resolve([{}])),
					})),
				})),
			});

			const result = await linkDuplicateDocument({
				userId: 'user-1',
				originalArtifactId: 'original-1',
				duplicateArtifactId: 'duplicate-1',
			});

			expect(result.familyId).toBe('existing-family');
			expect(result.duplicateSupersedesArtifactId).toBe('original-1');
		});

		it('should throw error when original artifact not found', async () => {
			mockDb.select.mockReturnValue({
				from: vi.fn(() => ({
					where: vi.fn(() => ({
						limit: vi.fn(() => Promise.resolve([])),
					})),
				})),
			});

			await expect(
				linkDuplicateDocument({
					userId: 'user-1',
					originalArtifactId: 'nonexistent',
					duplicateArtifactId: 'duplicate-1',
				})
			).rejects.toThrow('Original artifact nonexistent not found');
		});
	});
});