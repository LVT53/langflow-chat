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
	linkDocumentsAsVersions,
	linkDuplicateDocument,
	getDocumentVersions,
	getNextVersionNumber,
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
					metadataJson: JSON.stringify({ documentFamilyId: 'family-1', versionNumber: 1 }),
					createdAt: new Date('2024-01-01'),
					updatedAt: new Date('2024-01-01'),
				},
				{
					id: 'artifact-2',
					metadataJson: JSON.stringify({ documentFamilyId: 'family-1', versionNumber: 2 }),
					createdAt: new Date('2024-01-02'),
					updatedAt: new Date('2024-01-02'),
				},
			];

			mockDb.select
				.mockReturnValueOnce({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							orderBy: vi.fn(() => Promise.resolve(mockArtifacts)),
						})),
					})),
				})
				.mockReturnValue({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							limit: vi.fn(() => Promise.resolve([mockArtifacts[0]])),
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

	describe('getNextVersionNumber', () => {
		it('should return 1 for new family', async () => {
			mockDb.select.mockReturnValue({
				from: vi.fn(() => ({
					where: vi.fn(() => ({
						orderBy: vi.fn(() => Promise.resolve([])),
					})),
				})),
			});

			const version = await getNextVersionNumber('new-family');
			expect(version).toBe(1);
		});

		it('should increment from highest version', async () => {
			const mockArtifacts = [
				{
					id: 'artifact-1',
					metadataJson: JSON.stringify({ documentFamilyId: 'existing-family', versionNumber: 1 }),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: 'artifact-2',
					metadataJson: JSON.stringify({ documentFamilyId: 'existing-family', versionNumber: 3 }),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

			mockDb.select
				.mockReturnValueOnce({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							orderBy: vi.fn(() => Promise.resolve(mockArtifacts)),
						})),
					})),
				})
				.mockReturnValue({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							limit: vi.fn(() => Promise.resolve([mockArtifacts[0]])),
						})),
					})),
				});

			const version = await getNextVersionNumber('existing-family');
			expect(version).toBe(4);
		});
	});

	describe('linkDocumentsAsVersions', () => {
		it('should throw error when no artifact IDs provided', async () => {
			await expect(
				linkDocumentsAsVersions({ artifactIds: [] })
			).rejects.toThrow('At least one artifact ID is required');
		});

		it('should create new family when no existing family ID provided', async () => {
			const mockArtifacts = [
				{
					id: 'artifact-1',
					metadataJson: null,
					createdAt: new Date('2024-01-01'),
					updatedAt: new Date('2024-01-01'),
				},
			];

			mockDb.select
				.mockReturnValueOnce({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							orderBy: vi.fn(() => Promise.resolve(mockArtifacts)),
						})),
					})),
				})
				.mockReturnValue({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							limit: vi.fn(() => Promise.resolve([mockArtifacts[0]])),
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

			const result = await linkDocumentsAsVersions({
				artifactIds: ['artifact-1'],
			});

			expect(typeof result.familyId).toBe('string');
			expect(result.familyId.length).toBeGreaterThan(0);
			expect(result.linkedArtifacts).toHaveLength(1);
			expect(result.linkedArtifacts[0].isOriginal).toBe(true);
			expect(result.linkedArtifacts[0].versionNumber).toBe(1);
		});

		it('should mark first artifact as original', async () => {
			const mockArtifacts = [
				{
					id: 'artifact-1',
					metadataJson: null,
					createdAt: new Date('2024-01-01'),
					updatedAt: new Date('2024-01-01'),
				},
				{
					id: 'artifact-2',
					metadataJson: null,
					createdAt: new Date('2024-01-02'),
					updatedAt: new Date('2024-01-02'),
				},
			];

			mockDb.select.mockReturnValue({
				from: vi.fn(() => ({
					where: vi.fn(() => ({
						orderBy: vi.fn(() => Promise.resolve(mockArtifacts)),
						limit: vi.fn(() => Promise.resolve(mockArtifacts)),
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

			const result = await linkDocumentsAsVersions({
				artifactIds: ['artifact-1', 'artifact-2'],
			});

			expect(result.linkedArtifacts[0].isOriginal).toBe(true);
			expect(result.linkedArtifacts[1].isOriginal).toBe(false);
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
							limit: vi.fn(() => Promise.resolve([{ id: 'duplicate-1' }])),
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
			expect(result.originalVersionNumber).toBe(1);
			expect(result.duplicateVersionNumber).toBe(1);
		});

		it('should use existing family when original has one', async () => {
			const mockOriginal = {
				id: 'original-1',
				metadataJson: JSON.stringify({
					documentFamilyId: 'existing-family',
					versionNumber: 1,
				}),
				createdAt: new Date('2024-01-01'),
				updatedAt: new Date('2024-01-01'),
			};

			const mockVersions = [
				{
					id: 'original-1',
					metadataJson: JSON.stringify({ documentFamilyId: 'existing-family', versionNumber: 1 }),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: 'artifact-2',
					metadataJson: JSON.stringify({ documentFamilyId: 'existing-family', versionNumber: 2 }),
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			];

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
							orderBy: vi.fn(() => Promise.resolve(mockVersions)),
						})),
					})),
				})
				.mockReturnValue({
					from: vi.fn(() => ({
						where: vi.fn(() => ({
							limit: vi.fn(() => Promise.resolve([mockOriginal])),
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
			expect(result.duplicateVersionNumber).toBe(3);
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
