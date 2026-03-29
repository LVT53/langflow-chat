import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockGetPeerContext,
	mockIsHonchoEnabled,
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
	mockIsHonchoEnabled: vi.fn(() => true),
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
	isHonchoEnabled: mockIsHonchoEnabled,
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
		mockIsHonchoEnabled.mockReturnValue(true);
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
			overviewSource: null,
			overviewStatus: 'not_enough_durable_memory',
			durablePersonaCount: 0,
		});
		expect(mockEnsurePersonaMemoryClustersReady).toHaveBeenCalledWith('user-1', 'knowledge_read');
	});

	it('builds a local overview fallback from durable persona memories when Honcho returns no overview', async () => {
		mockListPersonaMemoryClusters.mockResolvedValue([
			{
				id: 'pref-1',
				canonicalText: 'Prefers Laravel for PHP work.',
				memoryClass: 'stable_preference',
				state: 'active',
				salienceScore: 82,
				sourceCount: 2,
				conversationTitles: [],
				firstSeenAt: Date.now() - 1000,
				lastSeenAt: Date.now() - 1000,
				pinned: false,
				members: [],
			},
			{
				id: 'ctx-1',
				canonicalText: 'Builds AI chat products with Langflow and Svelte.',
				memoryClass: 'long_term_context',
				state: 'active',
				salienceScore: 74,
				sourceCount: 2,
				conversationTitles: [],
				firstSeenAt: Date.now() - 2000,
				lastSeenAt: Date.now() - 2000,
				pinned: false,
				members: [],
			},
			{
				id: 'food-1',
				canonicalText: 'Has pizza in the fridge tonight.',
				memoryClass: 'perishable_fact',
				state: 'active',
				salienceScore: 40,
				sourceCount: 1,
				conversationTitles: [],
				firstSeenAt: Date.now() - 500,
				lastSeenAt: Date.now() - 500,
				pinned: false,
				members: [],
			},
		]);

		const { getKnowledgeMemory } = await import('./memory');

		const payload = await getKnowledgeMemory('user-1', 'Test User');

		expect(payload.summary.overviewSource).toBe('persona_fallback');
		expect(payload.summary.overviewStatus).toBe('ready');
		expect(payload.summary.durablePersonaCount).toBe(2);
		expect(payload.summary.overview).toContain('Stable Preferences');
		expect(payload.summary.overview).toContain('Prefers Laravel for PHP work.');
		expect(payload.summary.overview).toContain('Long-Term Context');
		expect(payload.summary.overview).not.toContain('pizza in the fridge');
	});

	it('reports a real durable-memory shortage when only perishable memories exist', async () => {
		mockListPersonaMemoryClusters.mockResolvedValue([
			{
				id: 'food-1',
				canonicalText: 'Has pizza in the fridge tonight.',
				memoryClass: 'perishable_fact',
				state: 'active',
				salienceScore: 40,
				sourceCount: 1,
				conversationTitles: [],
				firstSeenAt: Date.now() - 500,
				lastSeenAt: Date.now() - 500,
				pinned: false,
				members: [],
			},
		]);

		const { getKnowledgeMemory } = await import('./memory');

		const payload = await getKnowledgeMemory('user-1', 'Test User');

		expect(payload.summary.overview).toBeNull();
		expect(payload.summary.overviewSource).toBeNull();
		expect(payload.summary.overviewStatus).toBe('not_enough_durable_memory');
		expect(payload.summary.durablePersonaCount).toBe(0);
	});
});
