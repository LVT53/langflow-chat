import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCanUseContextSummarizer = vi.fn(() => true);
const mockRequestStructuredControlModel = vi.fn();

vi.mock('$lib/server/db', () => ({
	db: {},
}));

vi.mock('$lib/server/db/schema', () => ({
	conversations: {},
	personaMemoryClusterMembers: {},
	personaMemoryClusters: {},
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
	listPersonaMemories: vi.fn(async () => []),
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
		vi.clearAllMocks();
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
});
