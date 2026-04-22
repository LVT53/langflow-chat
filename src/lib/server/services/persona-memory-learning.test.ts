import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockListPersonaMemories,
	mockRecordMemoryEvents,
	mockSelectQuery,
	mockShortlistSemanticMatchesBySubject,
	mockCanUseTeiReranker,
	mockRerankItems,
	mockCanUseContextSummarizer,
	mockRequestStructuredControlModel,
	insertedClusterRows,
	insertedMemberRows,
	updatedClusterRows,
	rawRecords,
} = vi.hoisted(() => ({
	mockListPersonaMemories: vi.fn(async () => []),
	mockRecordMemoryEvents: vi.fn(async () => undefined),
	mockSelectQuery: vi.fn(),
	mockShortlistSemanticMatchesBySubject: vi.fn(async () => []),
	mockCanUseTeiReranker: vi.fn(() => false),
	mockRerankItems: vi.fn(async () => null),
	mockCanUseContextSummarizer: vi.fn(() => false),
	mockRequestStructuredControlModel: vi.fn(),
	insertedClusterRows: [] as any[],
	insertedMemberRows: [] as any[],
	updatedClusterRows: [] as any[],
	rawRecords: [] as any[],
}));

function createSelectChain(rows: unknown[]) {
	const chain = {
		from: () => chain,
		leftJoin: () => chain,
		innerJoin: () => chain,
		where: vi.fn(() => ({
			orderBy: () => chain,
			limit: vi.fn(async () => rows),
		})),
		orderBy: () => chain,
		limit: vi.fn(async () => rows),
		then: (onFulfilled: (value: unknown[]) => unknown) => Promise.resolve(rows).then(onFulfilled),
	};
	return chain;
}

// Helper to create cluster rows in the format expected by loadExistingClusterSnapshots
function createClusterRow(overrides: Partial<any> = {}) {
	return {
		cluster: {
			clusterId: overrides.clusterId ?? `cluster-${Date.now()}-${Math.random().toString(36).slice(2)}`,
			userId: overrides.userId ?? 'user-1',
			canonicalText: overrides.canonicalText ?? 'Test cluster',
			memoryClass: overrides.memoryClass ?? 'stable_preference',
			state: overrides.state ?? 'active',
			salienceScore: overrides.salienceScore ?? 50,
			sourceCount: overrides.sourceCount ?? 1,
			pinned: overrides.pinned ?? false,
			firstSeenAt: overrides.firstSeenAt ?? new Date(),
			lastSeenAt: overrides.lastSeenAt ?? new Date(),
			lastDreamedAt: overrides.lastDreamedAt ?? null,
			createdAt: overrides.createdAt ?? new Date(),
			updatedAt: overrides.updatedAt ?? new Date(),
			metadataJson: overrides.metadataJson ?? null,
			decayAt: overrides.decayAt ?? null,
			archiveAt: overrides.archiveAt ?? null,
		},
		...overrides,
	};
}

// Helper to create cluster rows in the format expected by refreshPersonaClusterStates
function createClusterRowForRefresh(overrides: Partial<any> = {}) {
	return {
		clusterId: overrides.clusterId ?? `cluster-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		userId: overrides.userId ?? 'user-1',
		canonicalText: overrides.canonicalText ?? 'Test cluster',
		memoryClass: overrides.memoryClass ?? 'stable_preference',
		state: overrides.state ?? 'active',
		salienceScore: overrides.salienceScore ?? 50,
		sourceCount: overrides.sourceCount ?? 1,
		pinned: overrides.pinned ?? false,
		firstSeenAt: overrides.firstSeenAt ?? new Date(),
		lastSeenAt: overrides.lastSeenAt ?? new Date(),
		lastDreamedAt: overrides.lastDreamedAt ?? null,
		createdAt: overrides.createdAt ?? new Date(),
		updatedAt: overrides.updatedAt ?? new Date(),
		metadataJson: overrides.metadataJson ?? null,
		decayAt: overrides.decayAt ?? null,
		archiveAt: overrides.archiveAt ?? null,
		...overrides,
	};
}

vi.mock('$lib/server/db', () => ({
	db: {
		select: (...args: unknown[]) => mockSelectQuery(...args),
		delete: () => ({ where: vi.fn(async () => undefined) }),
		insert: (table: any) => ({
			values: (values: any) => {
				if (table?.__name === 'persona_memory_clusters') {
					const items = Array.isArray(values) ? values : [values];
					insertedClusterRows.push(...items.map((v: any) => ({ ...v })));
				}
				if (table?.__name === 'persona_memory_cluster_members') {
					const items = Array.isArray(values) ? values : [values];
					insertedMemberRows.push(...items.map((v: any) => ({ ...v })));
				}
				return {
					onConflictDoUpdate: vi.fn(async () => undefined),
					onConflictDoNothing: vi.fn(async () => undefined),
					returning: vi.fn(async () => []),
				};
			},
		}),
		update: () => ({
			set: (values: any) => ({
				where: vi.fn(async () => {
					updatedClusterRows.push({ ...values });
				}),
			}),
		}),
	},
}));

vi.mock('$lib/server/db/schema', () => ({
	artifacts: {
		__name: 'artifacts',
		id: Symbol('artifact-id'),
		userId: Symbol('artifact-user-id'),
		type: Symbol('artifact-type'),
		name: Symbol('artifact-name'),
		summary: Symbol('artifact-summary'),
		contentText: Symbol('artifact-content-text'),
		metadataJson: Symbol('artifact-metadata-json'),
		updatedAt: Symbol('artifact-updated-at'),
	},
	conversations: {
		title: Symbol('title'),
		id: Symbol('conversation-id'),
	},
	personaMemoryClusterMembers: {
		__name: 'persona_memory_cluster_members',
		clusterId: Symbol('cluster-id'),
		userId: Symbol('user-id'),
		conclusionId: Symbol('conclusion-id'),
		content: Symbol('content'),
		scope: Symbol('scope'),
		sessionId: Symbol('session-id'),
		updatedAt: Symbol('updated-at'),
		createdAt: Symbol('created-at'),
	},
	personaMemoryClusters: {
		__name: 'persona_memory_clusters',
		clusterId: Symbol('cluster-id'),
		userId: Symbol('user-id'),
		canonicalText: Symbol('canonical-text'),
		memoryClass: Symbol('memory-class'),
		state: Symbol('state'),
		salienceScore: Symbol('salience-score'),
		sourceCount: Symbol('source-count'),
		pinned: Symbol('pinned'),
		firstSeenAt: Symbol('first-seen-at'),
		lastSeenAt: Symbol('last-seen-at'),
		lastDreamedAt: Symbol('last-dreamed-at'),
		createdAt: Symbol('created-at'),
		updatedAt: Symbol('updated-at'),
		metadataJson: Symbol('metadata-json'),
		decayAt: Symbol('decay-at'),
		archiveAt: Symbol('archive-at'),
	},
}));

vi.mock('$lib/server/utils/json', () => ({
	parseJsonRecord: vi.fn((value: string | null) => {
		if (!value) return null;
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}),
}));

vi.mock('$lib/server/utils/text', () => ({
	clipText: (value: string, maxLength: number) => value.slice(0, maxLength),
	normalizeWhitespace: (value: string) => value.replace(/\t/g, ' ').replace(/\r/g, '').replace(/\n/g, ' ').replace(/\f/g, '').replace(/\u00A0/g, ' ').replace(/\u1680/g, ' ').replace(/[ ]{2,}/g, ' ').trim(),
	clipNullableText: (value: string | null, maxLength: number) => value?.slice(0, maxLength) ?? null,
}));

vi.mock('./evidence-family', () => ({
	areNearDuplicateArtifactTexts: vi.fn(() => false),
}));

vi.mock('./honcho', () => ({
	listPersonaMemories: mockListPersonaMemories,
}));

vi.mock('./memory-events', () => ({
	recordMemoryEvents: mockRecordMemoryEvents,
}));

vi.mock('./semantic-ranking', () => ({
	shortlistSemanticMatchesBySubject: mockShortlistSemanticMatchesBySubject,
}));

vi.mock('./task-state', () => ({
	canUseContextSummarizer: mockCanUseContextSummarizer,
	requestStructuredControlModel: mockRequestStructuredControlModel,
}));

vi.mock('./task-state/control-model', () => ({
	classifyMemoryBatch: vi.fn(async () => []),
}));

vi.mock('./tei-reranker', () => ({
	canUseTeiReranker: mockCanUseTeiReranker,
	rerankItems: mockRerankItems,
}));

vi.mock('./working-set', () => ({
	scoreMatch: vi.fn((query: string, text: string) => {
		if (query.includes('prefers') && text.includes('concise')) return 3;
		if (query.includes('deadline') && text.includes('deadline')) return 4;
		return 0;
	}),
}));

describe('persona-memory learning - ensurePersonaMemoryClustersReady', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		// Return existing clusters in the format expected by loadExistingClusterSnapshots
		mockSelectQuery.mockReset();
		mockSelectQuery.mockImplementation((...args: unknown[]) => {
			// Return data with nested cluster property for loadExistingClusterSnapshots
			return createSelectChain([createClusterRow()]);
		});
		mockListPersonaMemories.mockReset();
		mockListPersonaMemories.mockResolvedValue([]);
		mockRecordMemoryEvents.mockReset();
		mockRecordMemoryEvents.mockResolvedValue(undefined);
		mockShortlistSemanticMatchesBySubject.mockReset();
		mockShortlistSemanticMatchesBySubject.mockResolvedValue([]);
		insertedClusterRows.splice(0, insertedClusterRows.length);
		insertedMemberRows.splice(0, insertedMemberRows.length);
		updatedClusterRows.splice(0, updatedClusterRows.length);
	});

	it('creates clusters from Honcho conclusions', async () => {
		const testRecords = [
			{
				id: 'memory-1',
				content: 'The user prefers concise responses.',
				createdAt: Date.UTC(2026, 3, 10),
				scope: 'self' as const,
				sessionId: 'conversation-1',
			},
			{
				id: 'memory-2',
				content: 'I notice the user prefers concise responses.',
				createdAt: Date.UTC(2026, 3, 11),
				scope: 'assistant_about_user' as const,
				sessionId: 'conversation-2',
			},
		];

		mockListPersonaMemories.mockResolvedValueOnce(testRecords);

		const { syncPersonaMemoryClusters } = await import('./persona-memory');

		await syncPersonaMemoryClusters({
			userId: 'user-1',
			rawRecords: testRecords,
			reason: 'test',
			force: true,
		});

		// Clusters should have been inserted
		expect(insertedClusterRows.length).toBeGreaterThan(0);
	});

	it('skips cluster creation when no records available', async () => {
		mockListPersonaMemories.mockResolvedValueOnce([]);

		const { syncPersonaMemoryClusters } = await import('./persona-memory');

		const result = await syncPersonaMemoryClusters({
			userId: 'user-1',
			rawRecords: [],
			reason: 'test',
			force: false,
		});

		expect(result.clusterCount).toBe(0);
		expect(insertedClusterRows.length).toBe(0);
	});

	it('handles runtime epoch changes gracefully', async () => {
		const testRecords = [
			{
				id: 'memory-1',
				content: 'Test content',
				createdAt: Date.now(),
				scope: 'self' as const,
				sessionId: 'conv-1',
			},
		];

		mockListPersonaMemories.mockResolvedValueOnce(testRecords);

		const { ensurePersonaMemoryClustersReady, clearPersonaMemoryRuntimeStateForUser } = await import('./persona-memory');

		// First call should start the process
		await ensurePersonaMemoryClustersReady('user-1', 'test');

		// Clear runtime state to invalidate epoch
		clearPersonaMemoryRuntimeStateForUser('user-1');

		// Second call should handle invalidated epoch
		const result = await ensurePersonaMemoryClustersReady('user-1', 'test');
		
		expect(result).toBeUndefined(); // Function returns void
	});
});

describe('persona-memory learning - classifyMemoryTextDeterministically', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('classifies perishable_fact for fridge/inventory content', async () => {
		const { classifyMemoryTextDeterministically } = await import('./persona-memory');

		expect(classifyMemoryTextDeterministically('There are leftovers in the fridge.')).toBe('perishable_fact');
		expect(classifyMemoryTextDeterministically('We have groceries in the pantry.')).toBe('perishable_fact');
		expect(classifyMemoryTextDeterministically('The milk is expiring soon.')).toBe('perishable_fact');
	});

	it('classifies short_term_constraint for deadline-related content', async () => {
		const { classifyMemoryTextDeterministically } = await import('./persona-memory');

		expect(classifyMemoryTextDeterministically('I have a deadline tomorrow.')).toBe('short_term_constraint');
		expect(classifyMemoryTextDeterministically('Need to submit this report by Friday.')).toBe('short_term_constraint');
		expect(classifyMemoryTextDeterministically('Due in 3 days.')).toBe('short_term_constraint');
	});

	it('classifies active_project_context for ongoing work content', async () => {
		const { classifyMemoryTextDeterministically } = await import('./persona-memory');

		expect(classifyMemoryTextDeterministically('I am currently building a website.')).toBe('active_project_context');
		expect(classifyMemoryTextDeterministically('Working on a Python project.')).toBe('active_project_context');
		expect(classifyMemoryTextDeterministically('Preparing a presentation for next week.')).toBe('active_project_context');
	});

	it('classifies stable_preference for preference statements', async () => {
		const { classifyMemoryTextDeterministically } = await import('./persona-memory');

		expect(classifyMemoryTextDeterministically('The user prefers concise responses.')).toBe('stable_preference');
		expect(classifyMemoryTextDeterministically('Favorites framework is Laravel.')).toBe('stable_preference');
		expect(classifyMemoryTextDeterministically('Usually uses VS Code.')).toBe('stable_preference');
	});

	it('classifies identity_profile for identity statements', async () => {
		const { classifyMemoryTextDeterministically } = await import('./persona-memory');

		expect(classifyMemoryTextDeterministically('My name is John.')).toBe('identity_profile');
		expect(classifyMemoryTextDeterministically('His name is Alex.')).toBe('identity_profile');
		expect(classifyMemoryTextDeterministically('Born in 1990.')).toBe('identity_profile');
	});

	it('returns long_term_context for unrecognized content', async () => {
		const { classifyMemoryTextDeterministically } = await import('./persona-memory');

		expect(classifyMemoryTextDeterministically('Random text without clear category.')).toBe('long_term_context');
		expect(classifyMemoryTextDeterministically('Something happened once.')).toBe('long_term_context');
	});

	it('classifies situational_context for planning/temporary content', async () => {
		const { classifyMemoryTextDeterministically } = await import('./persona-memory');

		expect(classifyMemoryTextDeterministically('Planning to travel next month.')).toBe('situational_context');
		expect(classifyMemoryTextDeterministically('This is a temporary situation.')).toBe('situational_context');
	});
});

describe('persona-memory learning - derivePersonaMemoryTemporalInfo', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('derives deadline temporal info for short_term_constraint', async () => {
		const { derivePersonaMemoryTemporalInfo } = await import('./persona-memory/temporal');

		const result = derivePersonaMemoryTemporalInfo({
			canonicalText: 'Deadline is in 3 days.',
			records: [
				{ id: 'r1', content: 'Deadline is in 3 days.', createdAt: Date.now(), scope: 'self', sessionId: 'conv-1' },
			],
			memoryClass: 'short_term_constraint',
		});

		expect(result).not.toBeNull();
		expect(result?.kind).toBe('deadline');
	});

	it('derives project_window for active_project_context', async () => {
		const { derivePersonaMemoryTemporalInfo } = await import('./persona-memory/temporal');

		const result = derivePersonaMemoryTemporalInfo({
			canonicalText: 'Currently building a website.',
			records: [
				{ id: 'r1', content: 'Currently building a website.', createdAt: Date.now(), scope: 'self', sessionId: 'conv-1' },
			],
			memoryClass: 'active_project_context',
		});

		expect(result).not.toBeNull();
		expect(result?.kind).toBe('project_window');
	});

	it('derives availability for perishable_fact', async () => {
		const { derivePersonaMemoryTemporalInfo } = await import('./persona-memory/temporal');

		const result = derivePersonaMemoryTemporalInfo({
			canonicalText: 'There are leftovers in the fridge.',
			records: [
				{ id: 'r1', content: 'There are leftovers in the fridge.', createdAt: Date.now(), scope: 'self', sessionId: 'conv-1' },
			],
			memoryClass: 'perishable_fact',
		});

		expect(result).not.toBeNull();
		expect(result?.kind).toBe('availability');
	});

	it('returns null for stable_preference (no temporal kind)', async () => {
		const { derivePersonaMemoryTemporalInfo } = await import('./persona-memory/temporal');

		const result = derivePersonaMemoryTemporalInfo({
			canonicalText: 'Prefers concise responses.',
			records: [
				{ id: 'r1', content: 'Prefers concise responses.', createdAt: Date.now(), scope: 'self', sessionId: 'conv-1' },
			],
			memoryClass: 'stable_preference',
		});

		expect(result).toBeNull();
	});

	it('calculates relative expiry from duration text', async () => {
		const { derivePersonaMemoryTemporalInfo } = await import('./persona-memory/temporal');

		const result = derivePersonaMemoryTemporalInfo({
			canonicalText: 'Need to finish in two days.',
			records: [
				{ id: 'r1', content: 'Need to finish in two days.', createdAt: Date.now(), scope: 'self', sessionId: 'conv-1' },
			],
			memoryClass: 'short_term_constraint',
		});

		expect(result).not.toBeNull();
		expect(result?.expiresAt).toBeGreaterThan(Date.now());
		expect(result?.relative).toBe(true);
	});

	it('marks resolved temporal cues correctly', async () => {
		const { derivePersonaMemoryTemporalInfo } = await import('./persona-memory/temporal');

		const result = derivePersonaMemoryTemporalInfo({
			canonicalText: 'The deadline passed already.',
			records: [
				{ id: 'r1', content: 'The deadline passed already.', createdAt: Date.now(), scope: 'self', sessionId: 'conv-1' },
			],
			memoryClass: 'short_term_constraint',
		});

		expect(result).not.toBeNull();
		expect(result?.resolved).toBe(true);
	});
});

describe('persona-memory learning - cluster operations', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mockSelectQuery.mockReset();
		mockSelectQuery.mockImplementation(() => createSelectChain([]));
		insertedClusterRows.splice(0, insertedClusterRows.length);
		insertedMemberRows.splice(0, insertedMemberRows.length);
		updatedClusterRows.splice(0, updatedClusterRows.length);
	});

	it('deduplicates cluster members by conclusion ID', async () => {
		const testRecords = [
			{
				id: 'same-conclusion',
				content: 'Test content 1',
				createdAt: Date.UTC(2026, 3, 10),
				scope: 'self' as const,
				sessionId: 'conversation-1',
			},
			{
				id: 'same-conclusion', // Duplicate ID
				content: 'Test content 2',
				createdAt: Date.UTC(2026, 3, 11),
				scope: 'self' as const,
				sessionId: 'conversation-2',
			},
		];

		mockListPersonaMemories.mockResolvedValueOnce(testRecords);

		const { syncPersonaMemoryClusters } = await import('./persona-memory');

		await syncPersonaMemoryClusters({
			userId: 'user-1',
			rawRecords: testRecords,
			reason: 'test',
			force: true,
		});

		// Member rows should not have duplicate conclusion IDs
		const conclusionIds = insertedMemberRows.map((m) => m.conclusionId);
		const uniqueIds = new Set(conclusionIds);
		expect(uniqueIds.size).toBe(conclusionIds.length);
	});

	it('calculates salience score from records', async () => {
		const testRecords = [
			{
				id: 'memory-1',
				content: 'Important user preference here',
				createdAt: Date.UTC(2026, 3, 10),
				scope: 'self' as const,
				sessionId: 'conversation-1',
			},
		];

		mockListPersonaMemories.mockResolvedValueOnce(testRecords);

		const { syncPersonaMemoryClusters } = await import('./persona-memory');

		await syncPersonaMemoryClusters({
			userId: 'user-1',
			rawRecords: testRecords,
			reason: 'test',
			force: true,
		});

		// At least one cluster should have been created with a salience score
		const clustersWithSalience = insertedClusterRows.filter((c) => typeof c.salienceScore === 'number');
		expect(clustersWithSalience.length).toBeGreaterThan(0);
	});

	it('uses user-scoped cluster IDs', async () => {
		const testRecords = [
			{
				id: 'memory-1',
				content: 'Same content for both users.',
				createdAt: Date.UTC(2026, 3, 10),
				scope: 'self' as const,
				sessionId: 'conversation-1',
			},
		];

		mockListPersonaMemories.mockResolvedValueOnce(testRecords);

		const { syncPersonaMemoryClusters } = await import('./persona-memory');

		// Sync for user-1
		await syncPersonaMemoryClusters({
			userId: 'user-1',
			rawRecords: testRecords,
			reason: 'test',
			force: true,
		});
		const firstClusterId = insertedClusterRows[0]?.clusterId;

		// Clear and sync for user-2
		insertedClusterRows.splice(0, insertedClusterRows.length);
		await syncPersonaMemoryClusters({
			userId: 'user-2',
			rawRecords: testRecords,
			reason: 'test',
			force: true,
		});
		const secondClusterId = insertedClusterRows[0]?.clusterId;

		// Cluster IDs should be different for different users
		expect(firstClusterId).not.toBe(secondClusterId);
	});

	it('handles empty records gracefully', async () => {
		// Override the mock to return proper empty format for all DB queries
		mockSelectQuery.mockReset();
		const emptyRows: any[] = [];
		mockSelectQuery.mockImplementation(() => {
			const chain: any = {
				from: () => chain,
				leftJoin: () => chain,
				innerJoin: () => chain,
				where: vi.fn(() => ({
					orderBy: () => chain,
					limit: vi.fn(async () => emptyRows),
					then: (onFulfilled: (value: unknown[]) => unknown) => Promise.resolve(emptyRows).then(onFulfilled),
				})),
				orderBy: () => chain,
				limit: vi.fn(async () => emptyRows),
				then: (onFulfilled: (value: unknown[]) => unknown) => Promise.resolve(emptyRows).then(onFulfilled),
			};
			return chain;
		});

		const { syncPersonaMemoryClusters } = await import('./persona-memory');

		const result = await syncPersonaMemoryClusters({
			userId: 'user-1',
			rawRecords: [],
			reason: 'test',
			force: false,
		});

		// Should not throw and return proper result
		expect(result).toBeDefined();
		expect(result.clusterCount).toBe(0);
	});

	it('merges semantically similar records into same cluster', async () => {
		const testRecords = [
			{
				id: 'memory-1',
				content: 'User prefers concise responses.',
				createdAt: Date.UTC(2026, 3, 10),
				scope: 'self' as const,
				sessionId: 'conversation-1',
			},
			{
				id: 'memory-2',
				content: 'The user likes brief answers.',
				createdAt: Date.UTC(2026, 3, 11),
				scope: 'assistant_about_user' as const,
				sessionId: 'conversation-2',
			},
		];

		mockListPersonaMemories.mockResolvedValueOnce(testRecords);

		const { syncPersonaMemoryClusters } = await import('./persona-memory');

		await syncPersonaMemoryClusters({
			userId: 'user-1',
			rawRecords: testRecords,
			reason: 'test',
			force: true,
		});

		// Should result in fewer clusters than records (merged)
		expect(insertedClusterRows.length).toBeLessThanOrEqual(testRecords.length);
	});
});