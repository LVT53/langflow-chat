import { beforeEach, describe, expect, it, vi } from 'vitest';

type MessageRow = {
	id: string;
	conversationId: string;
	role: 'user' | 'assistant';
	metadataJson: string | null;
	createdAt: Date;
};

const { mockRows, mockSelect, mockUpdate, mockDelete } = vi.hoisted(() => {
	const mockRows: MessageRow[] = [];

	const applySelection = (selection: Record<string, unknown>) =>
		mockRows.map((row) =>
			Object.fromEntries(
				Object.keys(selection).map((key) => [key, row[key as keyof MessageRow]])
			)
		);

	const mockSelect = vi.fn((selection: Record<string, unknown>) => {
		const builder = {
			from: vi.fn(() => builder),
			where: vi.fn(() => builder),
			orderBy: vi.fn(() => Promise.resolve(applySelection(selection))),
			limit: vi.fn((count: number) => Promise.resolve(applySelection(selection).slice(0, count))),
		};

		return builder;
	});

	const mockUpdate = vi.fn(() => {
		const builder = {
			set: vi.fn((values: { metadataJson: string | null }) => {
				const chain = {
					where: vi.fn(async () => {
						if (mockRows[0]) {
							mockRows[0].metadataJson = values.metadataJson;
						}
					}),
				};
				return chain;
			}),
		};

		return builder;
	});

	const mockDelete = vi.fn(() => {
		const builder = {
			where: vi.fn(async () => undefined),
		};

		return builder;
	});

	return { mockRows, mockSelect, mockUpdate, mockDelete };
});

vi.mock('$lib/server/db', () => ({
	db: {
		select: mockSelect,
		update: mockUpdate,
		delete: mockDelete,
	},
}));

vi.mock('$lib/server/db/schema', () => ({
	conversations: { id: 'id', userId: 'userId' },
	messages: {
		id: 'id',
		conversationId: 'conversationId',
		role: 'role',
		metadataJson: 'metadataJson',
		createdAt: 'createdAt',
	},
	messageAnalytics: {
		model: 'model',
		messageId: 'messageId',
	},
	usageEvents: {
		messageId: 'messageId',
	},
}));

vi.mock('$lib/server/config-store', () => ({
	getConfig: () => ({
		model1: { displayName: 'Model 1' },
		model2: { displayName: 'Model 2' },
	}),
}));

vi.mock('./knowledge', () => ({
	listMessageAttachments: vi.fn(async () => new Map()),
}));

describe('messages Honcho metadata', () => {
	beforeEach(() => {
		mockRows.length = 0;
		vi.clearAllMocks();
	});

	it('deletes message rows without deleting immutable usage events', async () => {
		const { deleteMessages } = await import('./messages');
		const { messages, usageEvents } = await import('$lib/server/db/schema');

		await deleteMessages(['assistant-1', 'assistant-2']);

		expect(mockDelete).toHaveBeenCalledTimes(1);
		expect(mockDelete).toHaveBeenCalledWith(messages);
		expect(mockDelete).not.toHaveBeenCalledWith(usageEvents);
	});

	it('preserves Honcho metadata when evidence metadata is updated', async () => {
		mockRows.push({
			id: 'assistant-1',
			conversationId: 'conv-1',
			role: 'assistant',
			createdAt: new Date('2026-03-29T12:00:00.000Z'),
			metadataJson: JSON.stringify({
				honchoContext: {
					source: 'live',
					waitedMs: 42,
					queuePendingWorkUnits: 0,
					queueInProgressWorkUnits: 0,
					fallbackReason: null,
					snapshotCreatedAt: 111,
				},
				honchoSnapshot: {
					createdAt: 111,
					summary: 'Stored summary',
					messages: [
						{
							role: 'assistant',
							content: 'Stored answer',
							createdAt: Date.parse('2026-03-29T12:00:00.000Z'),
						},
					],
				},
			}),
		});

		const { updateMessageEvidence } = await import('./messages');

		await updateMessageEvidence('assistant-1', {
			evidenceStatus: 'ready',
			evidenceSummary: {
				groups: [
					{
						label: 'Memory',
						items: [],
					},
				],
			},
		});

		const metadata = JSON.parse(String(mockRows[0]?.metadataJson));
		expect(metadata.honchoContext).toMatchObject({ source: 'live' });
		expect(metadata.honchoSnapshot).toMatchObject({ summary: 'Stored summary' });
		expect(metadata.evidenceStatus).toBe('ready');
		expect(metadata.evidenceSummary.groups).toHaveLength(1);
	});

	it('preserves evidence metadata when Honcho metadata is updated', async () => {
		mockRows.push({
			id: 'assistant-1',
			conversationId: 'conv-1',
			role: 'assistant',
			createdAt: new Date('2026-03-29T12:00:00.000Z'),
			metadataJson: JSON.stringify({
				evidenceStatus: 'ready',
				evidenceSummary: {
					groups: [
						{
							label: 'Memory',
							items: [],
						},
					],
				},
			}),
		});

		const { updateMessageHonchoMetadata } = await import('./messages');

		await updateMessageHonchoMetadata('assistant-1', {
			honchoContext: {
				source: 'snapshot',
				waitedMs: 100,
				queuePendingWorkUnits: 1,
				queueInProgressWorkUnits: 0,
				fallbackReason: 'timeout',
				snapshotCreatedAt: 222,
			},
			honchoSnapshot: {
				createdAt: 222,
				summary: 'Snapshot summary',
				messages: [
					{
						role: 'user',
						content: 'Snapshot question',
						createdAt: Date.parse('2026-03-29T12:00:00.000Z'),
					},
				],
			},
		});

		const metadata = JSON.parse(String(mockRows[0]?.metadataJson));
		expect(metadata.evidenceStatus).toBe('ready');
		expect(metadata.evidenceSummary.groups).toHaveLength(1);
		expect(metadata.honchoContext).toMatchObject({
			source: 'snapshot',
			fallbackReason: 'timeout',
		});
		expect(metadata.honchoSnapshot).toMatchObject({ summary: 'Snapshot summary' });
	});

	it('returns the newest available Honcho context and snapshot across assistant messages', async () => {
		mockRows.push(
			{
				id: 'assistant-newest',
				conversationId: 'conv-1',
				role: 'assistant',
				createdAt: new Date('2026-03-29T12:01:00.000Z'),
				metadataJson: JSON.stringify({
					honchoContext: {
						source: 'live',
						waitedMs: 75,
						queuePendingWorkUnits: 0,
						queueInProgressWorkUnits: 0,
						fallbackReason: null,
						snapshotCreatedAt: 333,
					},
				}),
			},
			{
				id: 'assistant-older',
				conversationId: 'conv-1',
				role: 'assistant',
				createdAt: new Date('2026-03-29T12:00:00.000Z'),
				metadataJson: JSON.stringify({
					honchoSnapshot: {
						createdAt: 222,
						summary: 'Older snapshot',
						messages: [
							{
								role: 'assistant',
								content: 'Older answer',
								createdAt: Date.parse('2026-03-29T12:00:00.000Z'),
							},
						],
					},
				}),
			}
		);

		const { getLatestHonchoMetadata } = await import('./messages');

		const metadata = await getLatestHonchoMetadata('conv-1');

		expect(metadata.honchoContext).toMatchObject({
			source: 'live',
			waitedMs: 75,
		});
		expect(metadata.honchoSnapshot).toMatchObject({
			summary: 'Older snapshot',
		});
	});
});
