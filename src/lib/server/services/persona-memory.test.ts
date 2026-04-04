import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockCanUseContextSummarizer,
	mockRequestStructuredControlModel,
	mockSelectQuery,
	mockListPersonaMemories,
	insertedClusterRows,
	insertedMemberRows,
} = vi.hoisted(() => ({
	mockCanUseContextSummarizer: vi.fn(() => true),
	mockRequestStructuredControlModel: vi.fn(),
	mockSelectQuery: vi.fn(),
	mockListPersonaMemories: vi.fn(async () => []),
	insertedClusterRows: [] as any[],
	insertedMemberRows: [] as any[],
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
					onConflictDoNothing: vi.fn(async () => undefined),
					returning: vi.fn(async () => []),
				};
			},
		}),
		update: () => ({
			set: () => ({
				where: vi.fn(async () => undefined),
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

vi.mock('./task-state', () => ({
	canUseContextSummarizer: mockCanUseContextSummarizer,
	requestStructuredControlModel: mockRequestStructuredControlModel,
}));

vi.mock('./working-set', () => ({
	scoreMatch: vi.fn(() => 0),
}));

describe('persona-memory temporal safeguards', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.clearAllMocks();
		mockSelectQuery.mockImplementation(() => createSelectChain([]));
		mockListPersonaMemories.mockResolvedValue([]);
		insertedClusterRows.splice(0, insertedClusterRows.length);
		insertedMemberRows.splice(0, insertedMemberRows.length);
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
					scope: 'session',
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
			scope: 'session',
			sessionId: 'conversation-1',
		});
		expect(payload.rawMemories[0]).not.toHaveProperty('createdAt');
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
					scope: 'session',
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
					scope: 'session',
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
	});

	it('filters artifact-derived Honcho memories before persona clustering', async () => {
		mockCanUseContextSummarizer.mockReturnValue(false);
		mockSelectQuery
			.mockImplementationOnce(() =>
				createSelectChain([
					{
						id: 'artifact-identity-pdf',
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
						'The user created an AlfyAI_Identity.pdf document describing AlfyAI as a personal assistant powered by Qwen 3.5 122B.',
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
				createSelectChain([
					{
						id: 'artifact-1',
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
