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
				where: () => ({
					orderBy: () => ({
						limit: async (count: number) =>
							rows
								.slice()
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
});
