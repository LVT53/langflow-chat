import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRunUserMemoryMaintenance = vi.fn();
const mockGetArtifactOwnershipScope = vi.fn();
const mockBuildArtifactVisibilityCondition = vi.fn();
const mockIsArtifactCanonicallyOwned = vi.fn();
const mockListLogicalDocuments = vi.fn();
const mockMapArtifactSummary = vi.fn();
const mockMapWorkCapsuleFromArtifactRow = vi.fn();

const mockOrderBy = vi.fn();
const mockWhere = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn();

vi.mock('$lib/server/db', () => ({
	db: {
		select: (...args: unknown[]) => mockSelect(...args),
	},
}));

vi.mock('./memory-maintenance', () => ({
	runUserMemoryMaintenance: (...args: unknown[]) => mockRunUserMemoryMaintenance(...args),
}));

vi.mock('./knowledge/store', () => ({
	getArtifactOwnershipScope: (...args: unknown[]) => mockGetArtifactOwnershipScope(...args),
	buildArtifactVisibilityCondition: (...args: unknown[]) => mockBuildArtifactVisibilityCondition(...args),
	isArtifactCanonicallyOwned: (...args: unknown[]) => mockIsArtifactCanonicallyOwned(...args),
	knowledgeArtifactListSelection: {},
	listLogicalDocuments: (...args: unknown[]) => mockListLogicalDocuments(...args),
	mapArtifactSummary: (...args: unknown[]) => mockMapArtifactSummary(...args),
}));

vi.mock('./knowledge/capsules', () => ({
	mapWorkCapsuleFromArtifactRow: (...args: unknown[]) => mockMapWorkCapsuleFromArtifactRow(...args),
}));

import { listKnowledgeArtifacts } from './knowledge';

describe('knowledge service listKnowledgeArtifacts', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		mockSelect.mockReturnValue({ from: mockFrom });
		mockFrom.mockReturnValue({ where: mockWhere });
		mockWhere.mockReturnValue({ orderBy: mockOrderBy });

		mockGetArtifactOwnershipScope.mockResolvedValue({});
		mockBuildArtifactVisibilityCondition.mockReturnValue({});
		mockIsArtifactCanonicallyOwned.mockReturnValue(true);
		mockListLogicalDocuments.mockResolvedValue([{ id: 'doc-1', name: 'Doc 1' }]);
		mockMapArtifactSummary.mockImplementation((row: { id: string }) => ({ id: row.id }));
		mockMapWorkCapsuleFromArtifactRow.mockImplementation((row: { id: string }) => ({ artifact: { id: row.id } }));
	});

	it('does not block knowledge reads on maintenance completion', async () => {
		let resolveMaintenance: (() => void) | null = null;
		const maintenancePromise = new Promise<void>((resolve) => {
			resolveMaintenance = resolve;
		});
		mockRunUserMemoryMaintenance.mockReturnValue(maintenancePromise);

		mockOrderBy.mockResolvedValue([
			{ id: 'gen-1', type: 'generated_output', conversationId: 'conv-1' },
			{ id: 'cap-1', type: 'work_capsule', conversationId: 'conv-1' },
		]);

		const result = await listKnowledgeArtifacts('user-1');
		await vi.waitFor(() => {
			expect(mockRunUserMemoryMaintenance).toHaveBeenCalledWith('user-1', 'knowledge_read');
		});
		expect(result.documents).toHaveLength(1);
		expect(result.results).toEqual([{ id: 'gen-1' }]);
		expect(result.workflows).toEqual([{ artifact: { id: 'cap-1' } }]);

		resolveMaintenance?.();
		await maintenancePromise;
	});
});
