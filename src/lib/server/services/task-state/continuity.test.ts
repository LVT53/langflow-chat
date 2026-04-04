import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockRecordMemoryEvent,
	mockCanUseContextSummarizer,
	insertedProjects,
	projectRows,
	linkRows,
} = vi.hoisted(() => ({
	mockRecordMemoryEvent: vi.fn(async () => undefined),
	mockCanUseContextSummarizer: vi.fn(() => false),
	insertedProjects: [] as Array<Record<string, unknown>>,
	projectRows: [] as Array<Record<string, any>>,
	linkRows: [] as Array<Record<string, unknown>>,
}));

function createQuery(rows: unknown[]) {
	const chain = {
		from: () => chain,
		leftJoin: () => chain,
		innerJoin: () => chain,
		where: () => chain,
		orderBy: () => chain,
		limit: async () => rows,
		then: (onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) =>
			Promise.resolve(rows).then(onFulfilled, onRejected),
	};
	return chain;
}

vi.mock('$lib/server/db', () => ({
	db: {
		select: (_shape?: unknown) => ({
			from: (table: { __name?: string }) => {
				if (table?.__name === 'memory_project_task_links') {
					return createQuery(linkRows);
				}
				if (table?.__name === 'task_checkpoints') {
					return createQuery([]);
				}
				if (table?.__name === 'memory_projects') {
					return createQuery(projectRows);
				}
				if (table?.__name === 'conversations') {
					return createQuery([]);
				}
				return createQuery([]);
			},
		}),
		insert: (table: { __name?: string }) => ({
			values: (values: Record<string, unknown>) => {
				if (table?.__name === 'memory_projects') {
					insertedProjects.push(values);
				}
				if (table?.__name === 'memory_project_task_links') {
					linkRows.splice(0, linkRows.length, values);
				}
				return {
					onConflictDoUpdate: vi.fn(async () => undefined),
				};
			},
		}),
		update: () => ({
			set: () => ({
				where: vi.fn(async () => undefined),
			}),
		}),
		delete: () => ({
			where: vi.fn(async () => undefined),
		}),
	},
}));

vi.mock('$lib/server/db/schema', () => ({
	conversations: {
		__name: 'conversations',
		id: { name: 'id' },
		title: { name: 'title' },
		updatedAt: { name: 'updatedAt' },
	},
	conversationTaskStates: {
		__name: 'conversation_task_states',
		taskId: { name: 'taskId' },
		userId: { name: 'userId' },
		conversationId: { name: 'conversationId' },
		updatedAt: { name: 'updatedAt' },
	},
	memoryProjects: {
		__name: 'memory_projects',
		projectId: { name: 'projectId' },
		userId: { name: 'userId' },
		status: { name: 'status' },
		updatedAt: { name: 'updatedAt' },
		lastActiveAt: { name: 'lastActiveAt' },
		name: { name: 'name' },
		summary: { name: 'summary' },
	},
	memoryProjectTaskLinks: {
		__name: 'memory_project_task_links',
		projectId: { name: 'projectId' },
		taskId: { name: 'taskId' },
		userId: { name: 'userId' },
		conversationId: { name: 'conversationId' },
		updatedAt: { name: 'updatedAt' },
	},
	taskCheckpoints: {
		__name: 'task_checkpoints',
		taskId: { name: 'taskId' },
		taskIdName: 'taskId',
		content: { name: 'content' },
		checkpointType: { name: 'checkpointType' },
		userId: { name: 'userId' },
		updatedAt: { name: 'updatedAt' },
	},
}));

vi.mock('drizzle-orm', () => ({
	and: vi.fn((...conditions: unknown[]) => conditions),
	desc: vi.fn(() => 'desc'),
	eq: vi.fn((field: { name: string }, value: unknown) => ({ field: field.name, value })),
	inArray: vi.fn((field: { name: string }, values: unknown[]) => ({ field: field.name, value: values })),
}));

vi.mock('$lib/server/services/memory-events', () => ({
	recordMemoryEvent: mockRecordMemoryEvent,
}));

vi.mock('./control-model', () => ({
	canUseContextSummarizer: mockCanUseContextSummarizer,
	requestStructuredControlModel: vi.fn(async () => null),
}));

vi.mock('./mappers', () => ({
	mapTaskCheckpoint: vi.fn(),
	mapTaskState: vi.fn((value: unknown) => value),
}));

vi.mock('$lib/server/utils/json', () => ({
	parseJsonStringArray: vi.fn(() => []),
}));

vi.mock('$lib/server/utils/text', () => ({
	clipNullableText: vi.fn((value: string | null | undefined) => value ?? null),
	normalizeWhitespace: vi.fn((value: string) => value.trim()),
}));

vi.mock('$lib/server/services/working-set', () => ({
	scoreMatch: vi.fn(() => 0),
}));

describe('task continuity memory events', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		insertedProjects.splice(0, insertedProjects.length);
		projectRows.splice(0, projectRows.length);
		linkRows.splice(0, linkRows.length);
	});

	it('records a project_started event when creating a new continuity bucket', async () => {
		const { syncTaskContinuityFromTaskState } = await import('./continuity');

		await syncTaskContinuityFromTaskState({
			userId: 'user-1',
			taskState: {
				taskId: 'task-1',
				userId: 'user-1',
				conversationId: 'conv-1',
				status: 'active',
				objective: 'Draft the new launch brief',
				confidence: 88,
				locked: false,
				constraints: [],
				factsToPreserve: [],
				decisions: [],
				openQuestions: [],
				activeArtifactIds: [],
				nextSteps: [],
				lastCheckpointAt: null,
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
		});

		expect(insertedProjects).toHaveLength(1);
		expect(mockRecordMemoryEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				domain: 'task',
				eventType: 'project_started',
				relatedId: 'task-1',
			})
		);
	});

	it('records a project_paused event when project status falls out of active', async () => {
		projectRows.push({
			projectId: 'project-1',
			userId: 'user-1',
			name: 'Launch brief',
			status: 'active',
			lastActiveAt: new Date(Date.now() - 20 * 86_400_000),
			updatedAt: new Date(Date.now() - 20 * 86_400_000),
		});

		const { updateProjectMemoryStatuses } = await import('./continuity');

		await updateProjectMemoryStatuses('user-1');

		expect(mockRecordMemoryEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				domain: 'task',
				eventType: 'project_paused',
				subjectId: 'project-1',
			})
		);
	});
});
