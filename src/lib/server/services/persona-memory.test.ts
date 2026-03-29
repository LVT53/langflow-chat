import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockCanUseContextSummarizer,
	mockRequestStructuredControlModel,
	mockSelectQuery,
	mockListPersonaMemories,
} = vi.hoisted(() => ({
	mockCanUseContextSummarizer: vi.fn(() => true),
	mockRequestStructuredControlModel: vi.fn(),
	mockSelectQuery: vi.fn(),
	mockListPersonaMemories: vi.fn(async () => []),
}));

function createSelectChain(rows: unknown[]) {
	const chain = {
		from: () => chain,
		leftJoin: () => chain,
		where: () => chain,
		orderBy: () => Promise.resolve(rows),
		then: (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
			Promise.resolve(rows).then(onFulfilled, onRejected),
	};
	return chain;
}

vi.mock('$lib/server/db', () => ({
	db: {
		select: (...args: unknown[]) => mockSelectQuery(...args),
		delete: () => ({ where: vi.fn(async () => undefined) }),
		insert: () => ({
			values: () => ({
				onConflictDoNothing: vi.fn(async () => undefined),
				returning: vi.fn(async () => []),
			}),
		}),
		update: () => ({
			set: () => ({
				where: vi.fn(async () => undefined),
			}),
		}),
	},
}));

vi.mock('$lib/server/db/schema', () => ({
	conversations: {
		title: Symbol('title'),
		id: Symbol('conversation-id'),
	},
	personaMemoryClusterMembers: {
		clusterId: Symbol('cluster-id'),
		userId: Symbol('user-id'),
		conclusionId: Symbol('conclusion-id'),
		sessionId: Symbol('session-id'),
		content: Symbol('content'),
		createdAt: Symbol('created-at'),
	},
	personaMemoryClusters: {
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
	parseJsonRecord: vi.fn(() => null),
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
});
