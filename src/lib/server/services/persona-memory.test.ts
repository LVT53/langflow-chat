import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockCanUseContextSummarizer,
	mockRequestStructuredControlModel,
	mockSelectQuery,
	mockListPersonaMemories,
	mockRecordMemoryEvents,
	mockShortlistSemanticMatchesBySubject,
	mockCanUseTeiReranker,
	mockRerankItems,
	insertedClusterRows,
	insertedMemberRows,
	updatedClusterRows,
} = vi.hoisted(() => ({
	mockCanUseContextSummarizer: vi.fn(() => true),
	mockRequestStructuredControlModel: vi.fn(),
	mockSelectQuery: vi.fn(),
	mockListPersonaMemories: vi.fn(async () => []),
	mockRecordMemoryEvents: vi.fn(async () => undefined),
	mockShortlistSemanticMatchesBySubject: vi.fn(async () => []),
	mockCanUseTeiReranker: vi.fn(() => false),
	mockRerankItems: vi.fn(async () => null),
	insertedClusterRows: [] as any[],
	insertedMemberRows: [] as any[],
	updatedClusterRows: [] as any[],
}));

function createSelectChain(rows: unknown[]) {
	const chain = {
		from: () => chain,
		leftJoin: () => chain,
		where: () => chain,
		orderBy: () => chain,
		limit: () => Promise.resolve(rows),
		then: (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
			Promise.resolve(rows).then(onFulfilled, onRejected),
	};
	return chain;
}

vi.mock('$lib/server/db', () => ({
	db: {
		select: (...args: unknown[]) => mockSelectQuery(...args),
		delete: () => ({ where: vi.fn(async () => undefined) }),
		insert: (table: any) => ({
			values: (values: any) => {
				if (table?.__name === 'persona_memory_clusters') {
					insertedClusterRows.splice(0, insertedClusterRows.length, ...(Array.isArray(values) ? values : [values]));
				}
				if (table?.__name === 'persona_memory_cluster_members') {
					insertedMemberRows.splice(0, insertedMemberRows.length, ...(Array.isArray(values) ? values : [values]));
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
					updatedClusterRows.push(values);
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
		sessionId: Symbol('session-id'),
		content: Symbol('content'),
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
	normalizeWhitespace: (value: string) => value.replace(/\s+/g, ' ').trim(),
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

vi.mock('./tei-reranker', () => ({
	canUseTeiReranker: mockCanUseTeiReranker,
	rerankItems: mockRerankItems,
}));

vi.mock('./working-set', () => ({
	scoreMatch: vi.fn(() => 0),
}));

describe('persona-memory temporal safeguards', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mockSelectQuery.mockReset();
		mockSelectQuery.mockImplementation(() => createSelectChain([]));
		mockListPersonaMemories.mockReset();
		mockListPersonaMemories.mockResolvedValue([]);
		mockRecordMemoryEvents.mockReset();
		mockRecordMemoryEvents.mockResolvedValue(undefined);
		mockShortlistSemanticMatchesBySubject.mockReset();
		mockShortlistSemanticMatchesBySubject.mockResolvedValue([]);
		mockCanUseTeiReranker.mockReset();
		mockCanUseTeiReranker.mockReturnValue(false);
		mockRerankItems.mockReset();
		mockRerankItems.mockResolvedValue(null);
		insertedClusterRows.splice(0, insertedClusterRows.length);
		insertedMemberRows.splice(0, insertedMemberRows.length);
		updatedClusterRows.splice(0, updatedClusterRows.length);
	});

	it('detects explicit temporal cues in memory text', async () => {
		const { hasExplicitTemporalCue } = await import('./persona-memory');

		expect(hasExplicitTemporalCue('The user has a meeting tomorrow afternoon.')).toBe(true);
		expect(hasExplicitTemporalCue('The user mentioned having a meeting.')).toBe(false);
	});

	it('does not expose Honcho conclusion createdAt timestamps in the dream payload', async () => {
		const { buildDreamClusterPayload } = await import('./persona-memory');

		const payload = buildDreamClusterPayload({
			records: [
				{
					id: 'memory-1',
					content: 'The user mentioned having a date.',
					createdAt: Date.UTC(2026, 2, 28),
					scope: 'self',
					sessionId: 'conversation-1',
				},
			],
			defaultCanonicalText: 'The user mentioned having a date.',
			defaultMemoryClass: 'situational_context',
			defaultSalience: 54,
		});

		expect(payload.rawMemories[0]).toEqual({
			id: 'memory-1',
			content: 'The user mentioned having a date.',
			scope: 'self',
			sessionId: 'conversation-1',
		});
		expect(payload.rawMemories[0]).not.toHaveProperty('createdAt');
	});

	it('uses user-scoped cluster ids for the same memory text across different accounts', async () => {
		const { syncPersonaMemoryClusters } = await import('./persona-memory');

		const sharedRecords = [
			{
				id: 'memory-shared',
				content: 'The user prefers concise responses.',
				createdAt: Date.UTC(2026, 3, 4),
				scope: 'self' as const,
				sessionId: 'conversation-shared',
			},
		];

		await syncPersonaMemoryClusters({
			userId: 'user-a',
			rawRecords: sharedRecords,
			reason: 'test',
			force: true,
		});
		const firstClusterId = insertedClusterRows[0]?.clusterId;

		await syncPersonaMemoryClusters({
			userId: 'user-b',
			rawRecords: sharedRecords,
			reason: 'test',
			force: true,
		});
		const secondClusterId = insertedClusterRows[0]?.clusterId;

		expect(firstClusterId).toBeTruthy();
		expect(secondClusterId).toBeTruthy();
		expect(firstClusterId).not.toBe(secondClusterId);
	});

	it('falls back to the default canonical text when the dreamed text invents a date', async () => {
		const { sanitizeDreamedCanonicalText } = await import('./persona-memory');

		const canonicalText = sanitizeDreamedCanonicalText({
			canonicalText: 'The user had a date today.',
			defaultCanonicalText: 'The user mentioned having a date.',
			records: [
				{
					id: 'memory-1',
					content: 'The user mentioned having a date.',
					createdAt: Date.UTC(2026, 2, 28),
					scope: 'self',
					sessionId: 'conversation-1',
				},
			],
		});

		expect(canonicalText).toBe('The user mentioned having a date.');
	});

	it('preserves temporal wording when the raw memory explicitly includes it', async () => {
		const { sanitizeDreamedCanonicalText } = await import('./persona-memory');

		const canonicalText = sanitizeDreamedCanonicalText({
			canonicalText: 'The user has a meeting on Tuesday.',
			defaultCanonicalText: 'The user has a meeting on Tuesday.',
			records: [
				{
					id: 'memory-1',
					content: 'The user has a meeting on Tuesday.',
					createdAt: Date.UTC(2026, 2, 28),
					scope: 'self',
					sessionId: 'conversation-1',
				},
			],
		});

		expect(canonicalText).toBe('The user has a meeting on Tuesday.');
	});

	it('classifies fridge inventory as a perishable fact', async () => {
		const { classifyMemoryTextDeterministically } = await import('./persona-memory');

		expect(classifyMemoryTextDeterministically('The user has pizza in the fridge tonight.')).toBe(
			'perishable_fact'
		);
	});

	it('classifies short deadlines and current work with the refined temporal classes', async () => {
		const { classifyMemoryTextDeterministically } = await import('./persona-memory');

		expect(
			classifyMemoryTextDeterministically(
				'The user is time-constrained to finish assessment documentation in two days.'
			)
		).toBe('short_term_constraint');
		expect(
			classifyMemoryTextDeterministically(
				'The user is currently working on assessment documentation.'
			)
		).toBe('active_project_context');
	});

	it('does not automatically archive durable preferences just because they are old', async () => {
		const { deriveStateFromDecay } = await import('./persona-memory');
		const now = Date.UTC(2027, 2, 29);
		const lastSeenAt = now - 400 * 86_400_000;

		const result = deriveStateFromDecay({
			memoryClass: 'stable_preference',
			lastSeenAt,
			pinned: false,
			now,
		});

		expect(result.state).toBe('dormant');
		expect(result.archiveAt).toBeNull();
	});

	it('extracts stable-preference slot metadata for framework and communication style memories', async () => {
		const { extractPreferenceSlotMetadata } = await import('./persona-memory');

		expect(extractPreferenceSlotMetadata('The user prefers Laravel for PHP work.')).toMatchObject({
			preferenceDomain: 'php',
			preferenceSlot: 'framework:php',
			preferenceValue: 'laravel',
			preferencePolarity: 'positive',
		});
		expect(extractPreferenceSlotMetadata('The user prefers concise responses.')).toMatchObject({
			preferenceDomain: 'communication',
			preferenceSlot: 'communication_style',
			preferenceValue: 'concise',
			preferencePolarity: 'positive',
		});
	});

	it('extracts deterministic fact-slot metadata for location and role memories', async () => {
		const { extractFactSlotMetadata } = await import('./persona-memory');

		expect(extractFactSlotMetadata('The user lives in Budapest.')).toMatchObject({
			factDomain: 'location',
			factSlot: 'location:current',
			factValue: 'budapest',
		});
		expect(extractFactSlotMetadata('The user works as a designer.')).toMatchObject({
			factDomain: 'role',
			factSlot: 'role:current',
			factValue: 'a designer',
		});
	});

	it('supersedes older same-slot preferences deterministically before semantic reconcile', async () => {
		mockCanUseContextSummarizer.mockReturnValue(false);

		const { syncPersonaMemoryClusters } = await import('./persona-memory');

		await syncPersonaMemoryClusters({
			userId: 'user-pref-slot',
			rawRecords: [
				{
					id: 'pref-old',
					content: 'The user prefers Symfony for PHP work.',
					createdAt: Date.UTC(2026, 2, 20),
					scope: 'self',
					sessionId: 'conversation-1',
				},
				{
					id: 'pref-new',
					content: 'The user prefers Laravel for PHP work.',
					createdAt: Date.UTC(2026, 2, 28),
					scope: 'self',
					sessionId: 'conversation-1',
				},
			],
			reason: 'test',
			force: true,
		});

		expect(insertedClusterRows).toHaveLength(2);
		const archivedCluster = insertedClusterRows.find((row) => row.canonicalText.includes('Symfony'));
		const activeCluster = insertedClusterRows.find((row) => row.canonicalText.includes('Laravel'));
		expect(activeCluster?.memoryClass).toBe('stable_preference');
		expect(archivedCluster?.memoryClass).toBe('stable_preference');
		expect(activeCluster?.state).toBe('active');
		expect(archivedCluster?.state).toBe('archived');
		expect(JSON.parse(String(archivedCluster?.metadataJson))).toMatchObject({
			preferenceSlot: 'framework:php',
			preferenceValue: 'symfony',
			supersededByClusterId: activeCluster?.clusterId,
			supersessionReason: 'preference_slot',
		});
		expect(mockRecordMemoryEvents).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					domain: 'preference',
					eventType: 'preference_updated',
					subjectId: activeCluster?.clusterId,
					relatedId: archivedCluster?.clusterId,
				}),
			])
		);
	});

	it('records deadline events when a new active deadline cluster appears', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(2026, 3, 5, 12, 0, 0)));
		mockCanUseContextSummarizer.mockReturnValue(false);

		const { syncPersonaMemoryClusters } = await import('./persona-memory');

		try {
			await syncPersonaMemoryClusters({
				userId: 'user-deadline',
				rawRecords: [
					{
						id: 'deadline-1',
						content: 'The user is time-constrained to finish assessment documentation in two days.',
						createdAt: Date.UTC(2026, 3, 4),
						scope: 'self',
						sessionId: 'conversation-1',
					},
				],
				reason: 'test',
				force: true,
			});

			expect(mockRecordMemoryEvents).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({
						domain: 'temporal',
						eventType: 'deadline_set',
					}),
				])
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it('supersedes older fact-slot memories deterministically and records a persona fact update', async () => {
		mockCanUseContextSummarizer.mockReturnValue(false);

		const { syncPersonaMemoryClusters } = await import('./persona-memory');

		await syncPersonaMemoryClusters({
			userId: 'user-fact-slot',
			rawRecords: [
				{
					id: 'fact-old',
					content: 'The user lives in Budapest.',
					createdAt: Date.UTC(2026, 2, 20),
					scope: 'self',
					sessionId: 'conversation-1',
				},
				{
					id: 'fact-new',
					content: 'The user moved to Vienna.',
					createdAt: Date.UTC(2026, 2, 28),
					scope: 'self',
					sessionId: 'conversation-2',
				},
			],
			reason: 'test',
			force: true,
		});

		expect(insertedClusterRows).toHaveLength(2);
		const archivedCluster = insertedClusterRows.find((row) =>
			String(row.canonicalText).includes('Budapest')
		);
		const activeCluster = insertedClusterRows.find((row) =>
			String(row.canonicalText).includes('Vienna')
		);
		expect(archivedCluster?.state).toBe('archived');
		expect(JSON.parse(String(archivedCluster?.metadataJson))).toMatchObject({
			factDomain: 'location',
			factSlot: 'location:current',
			factValue: 'budapest',
			supersededByClusterId: activeCluster?.clusterId,
			supersessionReason: 'fact_slot',
		});
		expect(mockRecordMemoryEvents).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					domain: 'persona',
					eventType: 'persona_fact_updated',
					subjectId: activeCluster?.clusterId,
					relatedId: archivedCluster?.clusterId,
				}),
			])
		);
	});

	it('filters artifact-derived Honcho memories before persona clustering', async () => {
		mockCanUseContextSummarizer.mockReturnValue(false);
		mockSelectQuery
			.mockImplementationOnce(() => createSelectChain([]))
			.mockImplementationOnce(() => createSelectChain([{ id: 'conversation-doc' }]))
			.mockImplementationOnce(() => createSelectChain([]))
			.mockImplementationOnce(() =>
				createSelectChain([
					{
						id: 'artifact-identity-pdf',
						userId: 'user-doc-filter',
						conversationId: 'conversation-doc',
						vaultId: null,
						type: 'generated_output',
						name: 'AlfyAI_Identity.pdf generated file',
						summary: 'Identity PDF draft for AlfyAI.',
						contentText:
							'AlfyAI is a personal assistant powered by Qwen 3.5 122B.',
						metadataJson: JSON.stringify({
							documentFamilyId: 'family-identity-pdf',
							documentLabel: 'AlfyAI_Identity.pdf',
							versionNumber: 2,
						}),
						updatedAt: new Date('2026-03-28T12:00:00.000Z'),
					},
				])
			)
			.mockImplementation(() => createSelectChain([]));

		const { syncPersonaMemoryClusters } = await import('./persona-memory');

		await syncPersonaMemoryClusters({
			userId: 'user-doc-filter',
			rawRecords: [
				{
					id: 'doc-memory',
					content:
						'The user created a generated file, AlfyAI_Identity.pdf, describing AlfyAI as a personal assistant powered by Qwen 3.5 122B.',
					createdAt: Date.UTC(2026, 2, 28, 12),
					scope: 'self',
					sessionId: 'conversation-doc',
				},
				{
					id: 'persona-memory',
					content: 'The user prefers concise answers.',
					createdAt: Date.UTC(2026, 2, 28, 12, 5),
					scope: 'self',
					sessionId: 'conversation-doc',
				},
			],
			reason: 'test',
			force: true,
		});

		expect(insertedClusterRows).toHaveLength(1);
		expect(String(insertedClusterRows[0]?.canonicalText)).toContain('prefers concise answers');
		expect(insertedMemberRows).toHaveLength(1);
		expect(insertedMemberRows[0]?.conclusionId).toBe('persona-memory');
	});

	it('returns stored persona clusters without waiting for a background refresh', async () => {
		mockSelectQuery.mockImplementation(() =>
			createSelectChain([
				{
					cluster: {
						clusterId: 'cluster-1',
						canonicalText: 'The user prefers concise answers.',
						memoryClass: 'stable_preference',
						state: 'active',
						salienceScore: 88,
						sourceCount: 2,
						pinned: 0,
						firstSeenAt: new Date('2026-03-20T10:00:00.000Z'),
						lastSeenAt: new Date('2026-03-28T10:00:00.000Z'),
						createdAt: new Date('2026-03-20T10:00:00.000Z'),
						updatedAt: new Date('2026-03-28T10:00:00.000Z'),
					},
					member: null,
					conversationTitle: null,
				},
			])
		);
		mockListPersonaMemories.mockImplementation(() => new Promise(() => undefined));

		const { buildPersonaPromptContext } = await import('./persona-memory');

		const prompt = await buildPersonaPromptContext('user-prompt-fast', 'Keep it concise.');

		expect(prompt).toContain('The user prefers concise answers.');
	});

	it('uses semantic shortlist signals when building persona prompt context', async () => {
		mockSelectQuery.mockImplementation(() =>
			createSelectChain([
				{
					cluster: {
						clusterId: 'cluster-forecast',
						canonicalText: 'The user often works on quarterly revenue forecasting.',
						memoryClass: 'long_term_context',
						state: 'active',
						salienceScore: 72,
						sourceCount: 2,
						pinned: 0,
						firstSeenAt: new Date('2026-03-20T10:00:00.000Z'),
						lastSeenAt: new Date('2026-03-28T10:00:00.000Z'),
						createdAt: new Date('2026-03-20T10:00:00.000Z'),
						updatedAt: new Date('2026-03-28T10:00:00.000Z'),
						metadataJson: JSON.stringify({}),
					},
					member: null,
					conversationTitle: null,
				},
				{
					cluster: {
						clusterId: 'cluster-style',
						canonicalText: 'The user prefers concise answers.',
						memoryClass: 'stable_preference',
						state: 'active',
						salienceScore: 88,
						sourceCount: 2,
						pinned: 0,
						firstSeenAt: new Date('2026-03-20T10:00:00.000Z'),
						lastSeenAt: new Date('2026-03-28T10:00:00.000Z'),
						createdAt: new Date('2026-03-20T10:00:00.000Z'),
						updatedAt: new Date('2026-03-28T10:00:00.000Z'),
						metadataJson: JSON.stringify({}),
					},
					member: null,
					conversationTitle: null,
				},
			])
		);
		mockShortlistSemanticMatchesBySubject.mockResolvedValue([
			{
				item: { id: 'cluster-forecast' },
				subjectId: 'cluster-forecast',
				semanticScore: 0.94,
			},
		]);

		const { buildPersonaPromptContext } = await import('./persona-memory');
		const prompt = await buildPersonaPromptContext('user-persona-semantic', 'revenue forecast');

		expect(prompt).toContain('The user often works on quarterly revenue forecasting.');
		expect(mockShortlistSemanticMatchesBySubject).toHaveBeenCalledTimes(1);
	});

	it('downranks weakly supported dormant memories during refresh', async () => {
		const staleTimestamp = Date.now() - 70 * 86_400_000;
		mockSelectQuery.mockImplementation(() =>
			createSelectChain([
				{
					clusterId: 'cluster-dormant',
					userId: 'user-dormant',
					canonicalText: 'The user is exploring a side initiative.',
					memoryClass: 'long_term_context',
					state: 'active',
					salienceScore: 64,
					sourceCount: 1,
					pinned: 0,
					firstSeenAt: new Date(staleTimestamp),
					lastSeenAt: new Date(staleTimestamp),
					createdAt: new Date(staleTimestamp),
					updatedAt: new Date(staleTimestamp),
					metadataJson: JSON.stringify({}),
					decayAt: null,
					archiveAt: null,
				},
			])
		);

		const { refreshPersonaClusterStates } = await import('./persona-memory');

		await refreshPersonaClusterStates('user-dormant');

		expect(updatedClusterRows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					state: 'dormant',
					salienceScore: 47,
				}),
			])
		);
	});

	it('downranks low-confidence preferences during refresh', async () => {
		mockSelectQuery.mockImplementation(() =>
			createSelectChain([
				{
					clusterId: 'cluster-low-confidence',
					userId: 'user-low-confidence',
					canonicalText: 'The user prefers direct responses.',
					memoryClass: 'stable_preference',
					state: 'active',
					salienceScore: 76,
					sourceCount: 1,
					pinned: 0,
					firstSeenAt: new Date(Date.now() - 3 * 86_400_000),
					lastSeenAt: new Date(Date.now() - 3 * 86_400_000),
					createdAt: new Date(Date.now() - 3 * 86_400_000),
					updatedAt: new Date(Date.now() - 3 * 86_400_000),
					metadataJson: JSON.stringify({
						preferenceDomain: 'communication',
						preferenceSlot: 'communication_style',
						preferenceValue: 'direct',
						preferencePolarity: 'positive',
						preferenceConfidence: 72,
					}),
					decayAt: null,
					archiveAt: null,
				},
			])
		);

		const { refreshPersonaClusterStates } = await import('./persona-memory');

		await refreshPersonaClusterStates('user-low-confidence');

		expect(updatedClusterRows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					state: 'active',
					salienceScore: 66,
				}),
			])
		);
	});

	it('marks overlapping older persona memories as corrected when a newer explicit correction appears', async () => {
		mockCanUseContextSummarizer.mockReturnValue(false);

		const { syncPersonaMemoryClusters } = await import('./persona-memory');

		await syncPersonaMemoryClusters({
			userId: 'user-correction-signal',
			rawRecords: [
				{
					id: 'project-old',
					content: 'The user is working on assessment documentation.',
					createdAt: Date.UTC(2026, 3, 1),
					scope: 'self',
					sessionId: 'conversation-1',
				},
				{
					id: 'project-correction',
					content: 'Actually, the user is not working on assessment documentation anymore.',
					createdAt: Date.UTC(2026, 3, 4),
					scope: 'self',
					sessionId: 'conversation-2',
				},
			],
			reason: 'test',
			force: true,
		});

		expect(insertedClusterRows).toHaveLength(2);
		const correctedCluster = insertedClusterRows.find((row) =>
			String(row.canonicalText).includes('working on assessment documentation.')
		);
		const correctionCluster = insertedClusterRows.find((row) =>
			String(row.canonicalText).includes('not working on assessment documentation anymore')
		);
		expect(correctedCluster).toBeTruthy();
		expect(correctionCluster).toBeTruthy();
		expect(JSON.parse(String(correctedCluster?.metadataJson))).toMatchObject({
			correctionCount: 1,
			correctionReason: 'explicit_user_correction',
			correctedByClusterId: correctionCluster?.clusterId,
			correctionObservedAt: Date.UTC(2026, 3, 4),
		});
		expect(Number(correctedCluster?.salienceScore)).toBeLessThan(Number(correctionCluster?.salienceScore));
	});

	it('only keeps the correction penalty until the memory is reaffirmed later', async () => {
		const now = Date.now();
		const correctionObservedAt = now - 3 * 86_400_000;
		const reaffirmedLastSeenAt = now - 86_400_000;
		mockSelectQuery.mockImplementation(() =>
			createSelectChain([
				{
					clusterId: 'cluster-corrected',
					userId: 'user-corrected-refresh',
					canonicalText: 'The user is currently focused on writing essays.',
					memoryClass: 'active_project_context',
					state: 'active',
					salienceScore: 60,
					sourceCount: 1,
					pinned: 0,
					firstSeenAt: new Date(reaffirmedLastSeenAt - 2 * 86_400_000),
					lastSeenAt: new Date(reaffirmedLastSeenAt),
					createdAt: new Date(reaffirmedLastSeenAt - 2 * 86_400_000),
					updatedAt: new Date(reaffirmedLastSeenAt),
					metadataJson: JSON.stringify({
						correctionObservedAt,
						correctionCount: 1,
						correctionReason: 'explicit_user_correction',
					}),
					decayAt: null,
					archiveAt: null,
				},
				{
					clusterId: 'cluster-still-corrected',
					userId: 'user-corrected-refresh',
					canonicalText: 'The user is currently focused on drafting a report.',
					memoryClass: 'active_project_context',
					state: 'active',
					salienceScore: 60,
					sourceCount: 1,
					pinned: 0,
					firstSeenAt: new Date(correctionObservedAt - 2 * 86_400_000),
					lastSeenAt: new Date(correctionObservedAt - 86_400_000),
					createdAt: new Date(correctionObservedAt - 2 * 86_400_000),
					updatedAt: new Date(correctionObservedAt - 86_400_000),
					metadataJson: JSON.stringify({
						correctionObservedAt,
						correctionCount: 1,
						correctionReason: 'explicit_user_correction',
					}),
					decayAt: null,
					archiveAt: null,
				},
			])
		);

		const { refreshPersonaClusterStates } = await import('./persona-memory');

		await refreshPersonaClusterStates('user-corrected-refresh');

		expect(updatedClusterRows).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					salienceScore: 51,
				}),
				expect.objectContaining({
					salienceScore: 32,
				}),
			])
		);
	});

	it('renders expired temporal memories as historical and excludes them from the prompt context', async () => {
		mockSelectQuery.mockImplementation(() =>
			createSelectChain([
				{
					cluster: {
						clusterId: 'cluster-expired',
						canonicalText:
							'The user is time-constrained, working on assessment documentation due in two days.',
						memoryClass: 'short_term_constraint',
						state: 'active',
						salienceScore: 80,
						sourceCount: 1,
						pinned: 0,
						firstSeenAt: new Date('2026-03-27T10:00:00.000Z'),
						lastSeenAt: new Date('2026-03-27T10:00:00.000Z'),
						createdAt: new Date('2026-03-27T10:00:00.000Z'),
						updatedAt: new Date('2026-03-27T10:00:00.000Z'),
						metadataJson: JSON.stringify({
							temporal: {
								kind: 'deadline',
								freshness: 'active',
								observedAt: Date.UTC(2026, 2, 27, 10),
								effectiveAt: Date.UTC(2026, 2, 27, 10),
								expiresAt: Date.UTC(2026, 2, 29, 10),
								relative: true,
								resolved: false,
							},
							activeConstraint: true,
							topicKey: 'assessment documentation',
						}),
					},
					member: null,
					conversationTitle: null,
				},
				{
					cluster: {
						clusterId: 'cluster-active',
						canonicalText: 'The user prefers concise answers.',
						memoryClass: 'stable_preference',
						state: 'active',
						salienceScore: 88,
						sourceCount: 1,
						pinned: 0,
						firstSeenAt: new Date('2026-03-28T10:00:00.000Z'),
						lastSeenAt: new Date('2026-03-28T10:00:00.000Z'),
						createdAt: new Date('2026-03-28T10:00:00.000Z'),
						updatedAt: new Date('2026-03-28T10:00:00.000Z'),
						metadataJson: JSON.stringify({}),
					},
					member: null,
					conversationTitle: null,
				},
			])
		);

		const { listPersonaMemoryClusters, buildPersonaPromptContext } = await import(
			'./persona-memory'
		);

		const clusters = await listPersonaMemoryClusters('user-expired');
		const expired = clusters.find((cluster) => cluster.id === 'cluster-expired');
		expect(expired?.state).toBe('archived');
		expect(expired?.canonicalText).toContain('As of 2026-03-27');

		const prompt = await buildPersonaPromptContext('user-expired', 'Keep it concise.');
		expect(prompt).toContain('The user prefers concise answers.');
		expect(prompt).not.toContain('assessment documentation due in two days');
	});

	it('filters artifact-derived persona clusters from the read path', async () => {
		mockSelectQuery
			.mockImplementationOnce(() =>
				createSelectChain([
					{
						cluster: {
							clusterId: 'cluster-doc',
							canonicalText: 'Generated file version: Project brief v2 with updated sections.',
							memoryClass: 'long_term_context',
							state: 'active',
							salienceScore: 90,
							sourceCount: 1,
							pinned: 0,
							firstSeenAt: new Date('2026-03-28T10:00:00.000Z'),
							lastSeenAt: new Date('2026-03-28T10:00:00.000Z'),
							createdAt: new Date('2026-03-28T10:00:00.000Z'),
							updatedAt: new Date('2026-03-28T10:00:00.000Z'),
							metadataJson: JSON.stringify({}),
						},
						member: null,
						conversationTitle: null,
					},
					{
						cluster: {
							clusterId: 'cluster-pref',
							canonicalText: 'The user prefers concise answers.',
							memoryClass: 'stable_preference',
							state: 'active',
							salienceScore: 88,
							sourceCount: 1,
							pinned: 0,
							firstSeenAt: new Date('2026-03-28T10:00:00.000Z'),
							lastSeenAt: new Date('2026-03-28T10:00:00.000Z'),
							createdAt: new Date('2026-03-28T10:00:00.000Z'),
							updatedAt: new Date('2026-03-28T10:00:00.000Z'),
							metadataJson: JSON.stringify({}),
						},
						member: null,
						conversationTitle: null,
					},
				])
			)
			.mockImplementationOnce(() =>
				createSelectChain([{ id: 'conversation-doc' }])
			)
			.mockImplementationOnce(() =>
				createSelectChain([])
			)
			.mockImplementationOnce(() =>
				createSelectChain([
					{
						id: 'artifact-1',
						userId: 'user-doc-filter',
						conversationId: 'conversation-doc',
						vaultId: null,
						type: 'generated_output',
						name: 'Project brief v2.pdf',
						summary: 'Updated project brief with revised sections.',
						contentText: 'Project brief v2 with updated sections and refined summary.',
						metadataJson: JSON.stringify({
							documentFamilyId: 'family-brief',
							documentLabel: 'Project brief',
							versionNumber: 2,
						}),
						updatedAt: new Date('2026-03-28T10:00:00.000Z'),
					},
				])
			);

		const { listPersonaMemoryClusters } = await import('./persona-memory');

		const clusters = await listPersonaMemoryClusters('user-doc-filter');

		expect(clusters.map((cluster) => cluster.id)).toEqual(['cluster-pref']);
	});

	it('supersedes older temporal memories for the same topic', async () => {
		mockCanUseContextSummarizer.mockReturnValue(false);

		const { syncPersonaMemoryClusters } = await import('./persona-memory');

		await syncPersonaMemoryClusters({
			userId: 'user-temporal-supersession',
			rawRecords: [
				{
					id: 'deadline-old',
					content:
						'The user is time-constrained, working on assessment documentation due in two days.',
					createdAt: Date.UTC(2026, 2, 27, 10),
					scope: 'self',
					sessionId: 'conversation-1',
				},
				{
					id: 'deadline-new',
					content:
						'The user got one more week to finish assessment documentation.',
					createdAt: Date.UTC(2026, 2, 29, 10),
					scope: 'self',
					sessionId: 'conversation-2',
				},
			],
			reason: 'test',
			force: true,
		});

		expect(insertedClusterRows).toHaveLength(2);
		const archivedCluster = insertedClusterRows.find((row) =>
			String(row.canonicalText).includes('due in two days')
		);
		const activeCluster = insertedClusterRows.find((row) =>
			String(row.canonicalText).includes('one more week')
		);
		expect(activeCluster?.memoryClass).toBe('short_term_constraint');
		expect(archivedCluster?.state).toBe('archived');
		expect(JSON.parse(String(archivedCluster?.metadataJson))).toMatchObject({
			supersededByClusterId: activeCluster?.clusterId,
			supersessionReason: 'temporal_update',
			topicKey: 'assessment documentation',
		});
	});
});
