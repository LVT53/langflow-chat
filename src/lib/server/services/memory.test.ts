import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockGetPeerContext,
	mockForgetAllPersonaMemories,
	mockForgetPersonaMemory,
	mockGetHonchoAssistantPeerId,
	mockGetHonchoUserPeerId,
	mockRunUserMemoryMaintenance,
	mockDeletePersonaMemoryClustersForConclusionIds,
	mockEnsurePersonaMemoryClustersReady,
	mockGetPersonaMemoryClusterConclusionIds,
	mockListPersonaMemoryClusters,
	mockForgetFocusContinuity,
	mockForgetTaskMemory,
	mockListFocusContinuityItems,
	mockListTaskMemoryItems,
} = vi.hoisted(() => ({
	mockGetPeerContext: vi.fn(async () => null),
	mockForgetAllPersonaMemories: vi.fn(async () => undefined),
	mockForgetPersonaMemory: vi.fn(async () => undefined),
	mockGetHonchoAssistantPeerId: vi.fn(() => 'assistant_user-1'),
	mockGetHonchoUserPeerId: vi.fn(() => 'user-1'),
	mockRunUserMemoryMaintenance: vi.fn(async () => undefined),
	mockDeletePersonaMemoryClustersForConclusionIds: vi.fn(async () => undefined),
	mockEnsurePersonaMemoryClustersReady: vi.fn(async () => undefined),
	mockGetPersonaMemoryClusterConclusionIds: vi.fn(async () => []),
	mockListPersonaMemoryClusters: vi.fn(async () => []),
	mockForgetFocusContinuity: vi.fn(async () => undefined),
	mockForgetTaskMemory: vi.fn(async () => undefined),
	mockListFocusContinuityItems: vi.fn(async () => []),
	mockListTaskMemoryItems: vi.fn(async () => []),
}));

vi.mock('$lib/server/db', () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn().mockReturnThis(),
			where: vi.fn().mockResolvedValue([]),
		})),
	},
}));

vi.mock('$lib/server/db/schema', () => ({
	conversations: {
		id: 'id',
		title: 'title',
	},
}));

vi.mock('./honcho', () => ({
	forgetAllPersonaMemories: mockForgetAllPersonaMemories,
	forgetPersonaMemory: mockForgetPersonaMemory,
	getHonchoAssistantPeerId: mockGetHonchoAssistantPeerId,
	getHonchoUserPeerId: mockGetHonchoUserPeerId,
	getPeerContext: mockGetPeerContext,
}));

vi.mock('./memory-maintenance', () => ({
	runUserMemoryMaintenance: mockRunUserMemoryMaintenance,
}));

vi.mock('./persona-memory', () => ({
	deletePersonaMemoryClustersForConclusionIds: mockDeletePersonaMemoryClustersForConclusionIds,
	ensurePersonaMemoryClustersReady: mockEnsurePersonaMemoryClustersReady,
	getPersonaMemoryClusterConclusionIds: mockGetPersonaMemoryClusterConclusionIds,
	listPersonaMemoryClusters: mockListPersonaMemoryClusters,
}));

vi.mock('./task-state', () => ({
	forgetFocusContinuity: mockForgetFocusContinuity,
	forgetTaskMemory: mockForgetTaskMemory,
	listFocusContinuityItems: mockListFocusContinuityItems,
	listTaskMemoryItems: mockListTaskMemoryItems,
}));

describe('knowledge memory service', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mockGetPeerContext.mockResolvedValue(null);
		mockEnsurePersonaMemoryClustersReady.mockResolvedValue(undefined);
		mockListPersonaMemoryClusters.mockResolvedValue([]);
		mockListTaskMemoryItems.mockResolvedValue([]);
		mockListFocusContinuityItems.mockResolvedValue([]);
	});

	it('returns stored memory data without awaiting background persona refresh', async () => {
		mockEnsurePersonaMemoryClustersReady.mockImplementationOnce(
			() => new Promise(() => undefined)
		);

		const { getKnowledgeMemory } = await import('./memory');

		const payload = await getKnowledgeMemory('user-1', 'Test User');

		expect(payload.summary).toEqual({
			personaCount: 0,
			taskCount: 0,
			focusContinuityCount: 0,
			overview: null,
		});
		expect(mockEnsurePersonaMemoryClustersReady).toHaveBeenCalledWith('user-1', 'knowledge_read');
	});
});
