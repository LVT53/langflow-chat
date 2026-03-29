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
	mockGetConfig,
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
	mockGetConfig: vi.fn(() => ({ honchoOverviewWaitMs: 10_000 })),
}));

const schema = vi.hoisted(() => ({
	conversations: {
		__name: 'conversations',
		id: Symbol('conversation-id'),
		title: Symbol('conversation-title'),
	},
	personaMemoryOverviews: {
		__name: 'persona_memory_overviews',
		userId: Symbol('overview-user-id'),
	},
}));

let conversationRows: Array<{ id: string; title: string | null }> = [];
let overviewRows: Array<{
	userId: string;
	overviewText: string;
	sourceFingerprint: string;
	generatedAt: Date;
	lastAttemptAt: Date | null;
	lastFailureAt: Date | null;
	lastError: string | null;
	updatedAt: Date;
}> = [];

function createSelectChain() {
	let table: { __name?: string } | null = null;
	const chain = {
		from(nextTable: { __name?: string }) {
			table = nextTable;
			return chain;
		},
		where: vi.fn(async () => {
			if (table?.__name === 'conversations') {
				return conversationRows;
			}
			if (table?.__name === 'persona_memory_overviews') {
				return overviewRows;
			}
			return [];
		}),
	};
	return chain;
}

vi.mock('$lib/server/db', () => ({
	db: {
		select: vi.fn(() => createSelectChain()),
		insert: vi.fn(() => ({
			values: (value: any) => ({
				onConflictDoUpdate: vi.fn(async ({ set }: { set: any }) => {
					const row = Array.isArray(value) ? value[0] : value;
					const next = {
						userId: row.userId,
						overviewText: set.overviewText ?? row.overviewText,
						sourceFingerprint: set.sourceFingerprint ?? row.sourceFingerprint,
						generatedAt: set.generatedAt ?? row.generatedAt,
						lastAttemptAt: set.lastAttemptAt ?? row.lastAttemptAt,
						lastFailureAt: set.lastFailureAt ?? row.lastFailureAt ?? null,
						lastError: set.lastError ?? row.lastError ?? null,
						updatedAt: set.updatedAt ?? row.updatedAt,
					};
					overviewRows = [next];
				}),
			}),
		})),
		update: vi.fn(() => ({
			set: (set: any) => ({
				where: vi.fn(async () => {
					overviewRows = overviewRows.map((row) => ({
						...row,
						...set,
					}));
				}),
			}),
		})),
	},
}));

vi.mock('$lib/server/db/schema', () => schema);

vi.mock('$lib/server/config-store', () => ({
	getConfig: mockGetConfig,
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

function makeDurablePersonaMemories() {
	return [
		{
			id: 'pref-1',
			canonicalText: 'Prefers Laravel for PHP work.',
			memoryClass: 'stable_preference',
			state: 'active',
			salienceScore: 82,
			sourceCount: 2,
			conversationTitles: [],
			firstSeenAt: Date.now() - 1_000,
			lastSeenAt: Date.now() - 1_000,
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
			firstSeenAt: Date.now() - 2_000,
			lastSeenAt: Date.now() - 2_000,
			pinned: false,
			members: [],
		},
	];
}

describe('knowledge memory service', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		conversationRows = [];
		overviewRows = [];
		mockGetPeerContext.mockResolvedValue(null);
		mockIsHonchoEnabled.mockReturnValue(true);
		mockEnsurePersonaMemoryClustersReady.mockResolvedValue(undefined);
		mockListPersonaMemoryClusters.mockResolvedValue([]);
		mockListTaskMemoryItems.mockResolvedValue([]);
		mockListFocusContinuityItems.mockResolvedValue([]);
		mockGetConfig.mockReturnValue({ honchoOverviewWaitMs: 10_000 });
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
			overviewUpdatedAt: null,
			overviewLastAttemptAt: null,
			durablePersonaCount: 0,
		});
		expect(mockEnsurePersonaMemoryClustersReady).toHaveBeenCalledWith('user-1', 'knowledge_read');
	});

	it('returns a live Honcho overview through the overview endpoint when available', async () => {
		mockListPersonaMemoryClusters.mockResolvedValue(makeDurablePersonaMemories());
		mockGetPeerContext.mockResolvedValue('Test User prefers concise responses and Laravel.');

		const { getKnowledgeMemoryOverview } = await import('./memory');

		const payload = await getKnowledgeMemoryOverview('user-1', 'Test User', {
			awaitLive: true,
		});

		expect(payload.summary.overviewSource).toBe('honcho_live');
		expect(payload.summary.overviewStatus).toBe('ready');
		expect(payload.summary.overview).toContain('Test User prefers concise responses');
		expect(payload.summary.overviewUpdatedAt).not.toBeNull();
		expect(overviewRows).toHaveLength(1);
	});

	it('returns a cached Honcho overview when live refresh fails and the fingerprint matches', async () => {
		mockListPersonaMemoryClusters.mockResolvedValue(makeDurablePersonaMemories());
		mockGetPeerContext.mockResolvedValue('Test User prefers concise responses and Laravel.');

		const { getKnowledgeMemoryOverview, getKnowledgeMemory } = await import('./memory');

		await getKnowledgeMemoryOverview('user-1', 'Test User', { awaitLive: true });
		mockGetPeerContext.mockImplementationOnce(() => new Promise(() => undefined));

		const payload = await getKnowledgeMemory('user-1', 'Test User');

		expect(payload.summary.overviewSource).toBe('honcho_cache');
		expect(payload.summary.overviewStatus).toBe('refreshing');
		expect(payload.summary.overview).toContain('Test User prefers concise responses');
	});

	it('falls back to a local durable overview when no valid cached Honcho overview exists', async () => {
		mockListPersonaMemoryClusters.mockResolvedValue(makeDurablePersonaMemories());
		mockGetPeerContext.mockImplementationOnce(() => new Promise(() => undefined));

		const { getKnowledgeMemory } = await import('./memory');

		const payload = await getKnowledgeMemory('user-1', 'Test User');

		expect(payload.summary.overviewSource).toBe('persona_fallback');
		expect(payload.summary.overviewStatus).toBe('refreshing');
		expect(payload.summary.durablePersonaCount).toBe(2);
		expect(payload.summary.overview).toContain('Stable Preferences');
		expect(payload.summary.overview).toContain('Prefers Laravel for PHP work.');
	});

	it('does not start duplicate live overview refreshes for concurrent requests', async () => {
		mockListPersonaMemoryClusters.mockResolvedValue(makeDurablePersonaMemories());
		let resolveOverview: ((value: string) => void) | null = null;
		const liveOverview = new Promise<string>((resolve) => {
			resolveOverview = resolve;
		});
		mockGetPeerContext.mockImplementation(() => liveOverview);

		const { getKnowledgeMemory } = await import('./memory');

		const [firstPayload, secondPayload] = await Promise.all([
			getKnowledgeMemory('user-1', 'Test User'),
			getKnowledgeMemory('user-1', 'Test User'),
		]);

		await vi.waitFor(() => {
			expect(mockGetPeerContext).toHaveBeenCalledTimes(1);
		});
		resolveOverview?.('Test User prefers concise responses and Laravel.');

		expect(mockGetPeerContext).toHaveBeenCalledTimes(1);
		expect(firstPayload.summary.overviewSource).toBe('persona_fallback');
		expect(secondPayload.summary.overviewSource).toBe('persona_fallback');
	});

	it('respects refresh backoff unless a forced overview refresh is requested', async () => {
		mockListPersonaMemoryClusters.mockResolvedValue(makeDurablePersonaMemories());
		overviewRows = [
			{
				userId: 'user-1',
				overviewText: 'Cached overview',
				sourceFingerprint: 'mismatch',
				generatedAt: new Date(),
				lastAttemptAt: new Date(),
				lastFailureAt: new Date(),
				lastError: 'timeout',
				updatedAt: new Date(),
			},
		];

		const { getKnowledgeMemoryOverview } = await import('./memory');

		const backoffPayload = await getKnowledgeMemoryOverview('user-1', 'Test User', {
			awaitLive: true,
		});
		expect(mockGetPeerContext).not.toHaveBeenCalled();
		expect(backoffPayload.summary.overviewSource).toBe('persona_fallback');

		mockGetPeerContext.mockResolvedValueOnce('Fresh live overview');
		const forcedPayload = await getKnowledgeMemoryOverview('user-1', 'Test User', {
			awaitLive: true,
			force: true,
		});
		expect(mockGetPeerContext).toHaveBeenCalledTimes(1);
		expect(forcedPayload.summary.overviewSource).toBe('honcho_live');
	});
});
