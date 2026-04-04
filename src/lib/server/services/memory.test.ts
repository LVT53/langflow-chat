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
	mockDeleteAllPersonaMemoryStateForUser,
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
	mockDeleteAllPersonaMemoryStateForUser: vi.fn(async () => undefined),
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
	deleteAllPersonaMemoryStateForUser: mockDeleteAllPersonaMemoryStateForUser,
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

function makeExpiredConstraintMemory() {
	return {
		id: 'deadline-1',
		canonicalText:
			'As of 2026-03-27, The user is time-constrained, working on assessment documentation due in two days.',
		rawCanonicalText:
			'The user is time-constrained, working on assessment documentation due in two days.',
		memoryClass: 'short_term_constraint',
		state: 'archived',
		salienceScore: 80,
		sourceCount: 1,
		conversationTitles: [],
		firstSeenAt: Date.UTC(2026, 2, 27, 10),
		lastSeenAt: Date.UTC(2026, 2, 27, 10),
		pinned: false,
		temporal: {
			kind: 'deadline',
			freshness: 'expired',
			observedAt: Date.UTC(2026, 2, 27, 10),
			effectiveAt: Date.UTC(2026, 2, 27, 10),
			expiresAt: Date.UTC(2026, 2, 29, 10),
			relative: true,
			resolved: false,
		},
		activeConstraint: false,
		topicKey: 'assessment documentation',
		topicStatus: 'historical',
		members: [],
	};
}

function makeActiveConstraintMemory() {
	return {
		id: 'deadline-active',
		canonicalText: 'The user has one week left to finish assessment documentation.',
		rawCanonicalText: 'The user has one week left to finish assessment documentation.',
		memoryClass: 'short_term_constraint',
		state: 'active',
		salienceScore: 86,
		sourceCount: 1,
		conversationTitles: [],
		firstSeenAt: Date.now() - 10_000,
		lastSeenAt: Date.now() - 10_000,
		pinned: false,
		temporal: {
			kind: 'deadline',
			freshness: 'active',
			observedAt: Date.now() - 10_000,
			effectiveAt: Date.now() - 10_000,
			expiresAt: Date.now() + 5 * 86_400_000,
			relative: true,
			resolved: false,
		},
		activeConstraint: true,
		topicKey: 'assessment documentation',
		topicStatus: 'active',
		members: [],
	};
}

function makeActiveProjectContextMemory() {
	return {
		id: 'project-active',
		canonicalText: 'The user is currently working on assessment documentation.',
		rawCanonicalText: 'The user is currently working on assessment documentation.',
		memoryClass: 'active_project_context',
		state: 'active',
		salienceScore: 74,
		sourceCount: 1,
		conversationTitles: [],
		firstSeenAt: Date.now() - 8_000,
		lastSeenAt: Date.now() - 8_000,
		pinned: false,
		temporal: {
			kind: 'project_window',
			freshness: 'active',
			observedAt: Date.now() - 8_000,
			effectiveAt: Date.now() - 8_000,
			expiresAt: null,
			relative: true,
			resolved: true,
		},
		activeConstraint: false,
		topicKey: 'assessment documentation',
		topicStatus: 'active',
		members: [],
	};
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
			activeConstraintCount: 0,
			currentProjectContextCount: 0,
			overview: null,
			overviewSource: null,
			overviewStatus: 'not_enough_durable_memory',
			overviewUpdatedAt: null,
			overviewLastAttemptAt: null,
			durablePersonaCount: 0,
		});
		expect(mockEnsurePersonaMemoryClustersReady).toHaveBeenCalledWith('user-1', 'knowledge_read');
	});

	it('does not start a live Honcho overview refresh when local durable memory is empty', async () => {
		mockGetPeerContext.mockResolvedValue('Stale Honcho profile that should stay hidden.');

		const { getKnowledgeMemory } = await import('./memory');

		const payload = await getKnowledgeMemory('user-1', 'Test User');
		await Promise.resolve();

		expect(payload.summary.overviewSource).toBeNull();
		expect(payload.summary.overviewStatus).toBe('not_enough_durable_memory');
		expect(mockGetPeerContext).not.toHaveBeenCalled();
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

	it('refuses live Honcho overview text when there is not enough local durable memory', async () => {
		mockGetPeerContext.mockResolvedValue('Stale Honcho profile that should stay hidden.');

		const { getKnowledgeMemoryOverview } = await import('./memory');

		const payload = await getKnowledgeMemoryOverview('user-1', 'Test User', {
			awaitLive: true,
			force: true,
		});

		expect(payload.summary.overviewSource).toBeNull();
		expect(payload.summary.overviewStatus).toBe('not_enough_durable_memory');
		expect(payload.summary.overview).toBeNull();
		expect(mockGetPeerContext).not.toHaveBeenCalled();
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

	it('shows active constraints in the local overview and suppresses expired ones', async () => {
		mockListPersonaMemoryClusters.mockResolvedValue([
			makeExpiredConstraintMemory(),
			makeActiveConstraintMemory(),
			...makeDurablePersonaMemories(),
		]);
		mockGetPeerContext.mockResolvedValue('');

		const { getKnowledgeMemory } = await import('./memory');

		const payload = await getKnowledgeMemory('user-1', 'Test User');

		expect(payload.summary.overviewSource).toBe('persona_fallback');
		expect(payload.summary.overview).toContain('Active Constraints');
		expect(payload.summary.overview).toContain(
			'The user has one week left to finish assessment documentation.'
		);
		expect(payload.summary.overview).not.toContain('due in two days');
	});

	it('returns active constraints and current project context as separate memory selections', async () => {
		mockListPersonaMemoryClusters.mockResolvedValue([
			...makeDurablePersonaMemories(),
			makeActiveConstraintMemory(),
			makeActiveProjectContextMemory(),
		]);
		mockGetPeerContext.mockResolvedValue('');

		const { getKnowledgeMemory } = await import('./memory');

		const payload = await getKnowledgeMemory('user-1', 'Test User');

		expect(payload.activeConstraints?.map((memory) => memory.id)).toEqual(['deadline-active']);
		expect(payload.currentProjectContext?.map((memory) => memory.id)).toEqual(['project-active']);
		expect(payload.summary.activeConstraintCount).toBe(1);
		expect(payload.summary.currentProjectContextCount).toBe(1);
	});

	it('rejects a live Honcho overview that repeats expired temporal memory as current truth', async () => {
		mockListPersonaMemoryClusters.mockResolvedValue([
			makeExpiredConstraintMemory(),
			...makeDurablePersonaMemories(),
		]);
		mockGetPeerContext.mockResolvedValue(
			'Currently, he is time-constrained, working on assessment documentation due in two days.'
		);

		const { getKnowledgeMemoryOverview } = await import('./memory');

		const payload = await getKnowledgeMemoryOverview('user-1', 'Test User', {
			awaitLive: true,
			force: true,
		});

		expect(payload.summary.overviewSource).toBe('persona_fallback');
		expect(payload.summary.overview).toContain('Stable Preferences');
		expect(payload.summary.overview).not.toContain('due in two days');
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

	it('clears local persona memory state when forgetting all persona memory', async () => {
		const { applyKnowledgeMemoryAction } = await import('./memory');

		await applyKnowledgeMemoryAction('user-1', 'Test User', {
			action: 'forget_all_persona_memory',
		});

		expect(mockForgetAllPersonaMemories).toHaveBeenCalledWith('user-1');
		expect(mockDeleteAllPersonaMemoryStateForUser).toHaveBeenCalledWith('user-1');
		expect(mockRunUserMemoryMaintenance).toHaveBeenCalledWith(
			'user-1',
			'knowledge_memory:forget_all_persona_memory',
		);
	});
});
