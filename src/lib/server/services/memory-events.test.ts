import { beforeEach, describe, expect, it, vi } from 'vitest';

type MemoryEventRow = {
	id: string;
	eventKey: string;
	userId: string;
	conversationId: string | null;
	messageId: string | null;
	domain: string;
	eventType: string;
	subjectId: string | null;
	relatedId: string | null;
	observedAt: Date;
	payloadJson: string | null;
	createdAt: Date;
};

const { rows } = vi.hoisted(() => ({
	rows: [] as MemoryEventRow[],
}));

vi.mock('$lib/server/db', () => ({
	db: {
		insert: () => ({
			values: (values: MemoryEventRow | MemoryEventRow[]) => ({
				onConflictDoNothing: vi.fn(async () => {
					const items = Array.isArray(values) ? values : [values];
					for (const item of items) {
						if (rows.some((row) => row.eventKey === item.eventKey)) continue;
						rows.push({
							...item,
							createdAt: item.createdAt ?? new Date(),
						});
					}
				}),
			}),
		}),
		select: () => ({
			from: () => ({
				where: (conditions: Array<{ field: string; value: string | string[] }>) => ({
					orderBy: () => ({
						limit: async (count: number) =>
							rows
								.slice()
								.filter((row) =>
									conditions.every((condition) => {
										const rowValue = row[condition.field as keyof MemoryEventRow];
										if (Array.isArray(condition.value)) {
											return condition.value.includes(String(rowValue));
										}
										return String(rowValue) === String(condition.value);
									})
								)
								.sort((left, right) => right.observedAt.getTime() - left.observedAt.getTime())
								.slice(0, count),
					}),
				}),
			}),
		}),
	},
}));

vi.mock('$lib/server/db/schema', () => ({
	memoryEvents: {
		eventKey: { name: 'eventKey' },
		userId: { name: 'userId' },
		domain: { name: 'domain' },
		eventType: { name: 'eventType' },
		subjectId: { name: 'subjectId' },
		observedAt: { name: 'observedAt' },
	},
}));

vi.mock('drizzle-orm', () => ({
	and: vi.fn((...conditions: unknown[]) => conditions),
	desc: vi.fn(() => 'desc'),
	eq: vi.fn((field: { name: string }, value: string) => ({ field: field.name, value })),
	inArray: vi.fn((field: { name: string }, value: string[]) => ({ field: field.name, value })),
}));

vi.mock('$lib/server/utils/json', () => ({
	parseJsonRecord: vi.fn((value: string | null) => (value ? JSON.parse(value) : null)),
}));

describe('memory-events service', () => {
	beforeEach(() => {
		rows.splice(0, rows.length);
	});

	it('persists deduplicated events by event key', async () => {
		const { recordMemoryEvent, listMemoryEvents } = await import('./memory-events');

		await recordMemoryEvent({
			eventKey: 'deadline_set:cluster-1',
			userId: 'user-1',
			domain: 'temporal',
			eventType: 'deadline_set',
			subjectId: 'cluster-1',
			payload: { topicKey: 'assessment' },
		});
		await recordMemoryEvent({
			eventKey: 'deadline_set:cluster-1',
			userId: 'user-1',
			domain: 'temporal',
			eventType: 'deadline_set',
			subjectId: 'cluster-1',
			payload: { topicKey: 'assessment' },
		});

		const events = await listMemoryEvents({ userId: 'user-1', limit: 10 });
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			eventKey: 'deadline_set:cluster-1',
			domain: 'temporal',
			eventType: 'deadline_set',
			subjectId: 'cluster-1',
			payload: { topicKey: 'assessment' },
		});
	});

	it('deduplicates event keys per user instead of globally', async () => {
		const { recordMemoryEvent, listMemoryEvents } = await import('./memory-events');

		await recordMemoryEvent({
			eventKey: 'deadline_set:cluster-1',
			userId: 'user-1',
			domain: 'temporal',
			eventType: 'deadline_set',
			subjectId: 'cluster-1',
		});
		await recordMemoryEvent({
			eventKey: 'deadline_set:cluster-1',
			userId: 'user-2',
			domain: 'temporal',
			eventType: 'deadline_set',
			subjectId: 'cluster-1',
		});

		const userOneEvents = await listMemoryEvents({ userId: 'user-1', limit: 10 });
		const userTwoEvents = await listMemoryEvents({ userId: 'user-2', limit: 10 });

		expect(userOneEvents).toHaveLength(1);
		expect(userTwoEvents).toHaveLength(1);
		expect(userOneEvents[0]?.eventKey).toBe('deadline_set:cluster-1');
		expect(userTwoEvents[0]?.eventKey).toBe('deadline_set:cluster-1');
	});

	it('counts recent events by subject within the requested window', async () => {
		const { recordMemoryEvent, countRecentMemoryEventsBySubject } = await import('./memory-events');

		await recordMemoryEvent({
			eventKey: 'document_refined:family-brief:1',
			userId: 'user-1',
			domain: 'document',
			eventType: 'document_refined',
			subjectId: 'family-brief',
			observedAt: Date.UTC(2026, 3, 2),
		});
		await recordMemoryEvent({
			eventKey: 'document_refined:family-brief:2',
			userId: 'user-1',
			domain: 'document',
			eventType: 'document_refined',
			subjectId: 'family-brief',
			observedAt: Date.UTC(2026, 3, 4),
		});
		await recordMemoryEvent({
			eventKey: 'document_refined:family-slides:1',
			userId: 'user-1',
			domain: 'document',
			eventType: 'document_refined',
			subjectId: 'family-slides',
			observedAt: Date.UTC(2026, 2, 10),
		});

		const counts = await countRecentMemoryEventsBySubject({
			userId: 'user-1',
			domain: 'document',
			eventTypes: ['document_refined'],
			subjectIds: ['family-brief', 'family-slides'],
			since: Date.UTC(2026, 3, 1),
		});

		expect(counts.get('family-brief')).toBe(2);
		expect(counts.has('family-slides')).toBe(false);
	});
});
