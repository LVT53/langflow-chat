import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockListPersonaMemories,
	mockForgetPersonaMemory,
	mockBackfillSemanticEmbeddingsForUser,
	mockRepairGeneratedOutputFamilyStatuses,
	mockRepairGeneratedOutputRetrievalClasses,
	mockSyncPersonaMemoryClusters,
	mockRefreshPersonaClusterStates,
	mockUpdateProjectMemoryStatuses,
	mockPruneOrphanProjectMemory,
} = vi.hoisted(() => ({
	mockListPersonaMemories: vi.fn(async () => []),
	mockForgetPersonaMemory: vi.fn(async () => undefined),
	mockBackfillSemanticEmbeddingsForUser: vi.fn(async () => ({
		artifactCount: 0,
		personaClusterCount: 0,
		taskStateCount: 0,
	})),
	mockRepairGeneratedOutputFamilyStatuses: vi.fn(async () => undefined),
	mockRepairGeneratedOutputRetrievalClasses: vi.fn(async () => undefined),
	mockSyncPersonaMemoryClusters: vi.fn(async () => ({
		dreamed: true,
		fullSweep: false,
		clusterCount: 0,
	})),
	mockRefreshPersonaClusterStates: vi.fn(async () => undefined),
	mockUpdateProjectMemoryStatuses: vi.fn(async () => undefined),
	mockPruneOrphanProjectMemory: vi.fn(async () => undefined),
}));

vi.mock('$lib/server/db', () => ({
	db: {
		select: vi.fn(() => {
			const builder = {
				from: vi.fn(() => builder),
				where: vi.fn(() => builder),
				orderBy: vi.fn(async () => []),
				then: (onFulfilled: (value: []) => unknown) => Promise.resolve([]).then(onFulfilled),
			};
			return builder;
		}),
		delete: vi.fn(() => ({
			where: vi.fn(async () => undefined),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({
				where: vi.fn(async () => undefined),
			})),
		})),
	},
}));

vi.mock('$lib/server/db/schema', () => ({
	conversationTaskStates: {},
	taskCheckpoints: {},
	users: { id: 'id' },
}));

vi.mock('$lib/server/config-store', () => ({
	getConfig: () => ({
		memoryMaintenanceIntervalMinutes: 720,
	}),
}));

vi.mock('./evidence-family', () => ({
	areNearDuplicateArtifactTexts: vi.fn(() => false),
	repairGeneratedOutputFamilyStatuses: mockRepairGeneratedOutputFamilyStatuses,
	repairGeneratedOutputRetrievalClasses: mockRepairGeneratedOutputRetrievalClasses,
}));

vi.mock('./honcho', () => ({
	listPersonaMemories: mockListPersonaMemories,
	forgetPersonaMemory: mockForgetPersonaMemory,
}));

vi.mock('./persona-memory', () => ({
	syncPersonaMemoryClusters: mockSyncPersonaMemoryClusters,
	refreshPersonaClusterStates: mockRefreshPersonaClusterStates,
}));

vi.mock('./semantic-embedding-refresh', () => ({
	backfillSemanticEmbeddingsForUser: mockBackfillSemanticEmbeddingsForUser,
}));

vi.mock('./task-state', () => ({
	updateProjectMemoryStatuses: mockUpdateProjectMemoryStatuses,
	pruneOrphanProjectMemory: mockPruneOrphanProjectMemory,
}));

describe('memory-maintenance scheduling', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useRealTimers();
	});

	afterEach(async () => {
		const { stopMemoryMaintenanceScheduler } = await import('./memory-maintenance');
		stopMemoryMaintenanceScheduler();
		vi.useRealTimers();
	});

	it('reruns once immediately when another chat-triggered maintenance request arrives during an in-flight run', async () => {
		let releaseFirstRun!: () => void;
		mockSyncPersonaMemoryClusters
			.mockImplementationOnce(
				() =>
					new Promise((resolve) => {
						releaseFirstRun = () =>
							resolve({
								dreamed: true,
								fullSweep: false,
								clusterCount: 1,
							});
					})
			)
			.mockResolvedValueOnce({
				dreamed: true,
				fullSweep: false,
				clusterCount: 1,
			});

		const { runUserMemoryMaintenance } = await import('./memory-maintenance');

		const firstRun = runUserMemoryMaintenance('user-1', 'chat_stream');
		while (!releaseFirstRun) {
			await Promise.resolve();
		}

		const queuedRun = runUserMemoryMaintenance('user-1', 'chat_send');
		expect(mockSyncPersonaMemoryClusters).toHaveBeenCalledTimes(1);

		releaseFirstRun();
		await firstRun;
		await queuedRun;
		await Promise.resolve();

		expect(mockSyncPersonaMemoryClusters).toHaveBeenCalledTimes(2);
	});

	it('repairs generated-output retrieval classes during maintenance', async () => {
		const { runUserMemoryMaintenance } = await import('./memory-maintenance');

		await runUserMemoryMaintenance('user-1', 'manual');

		expect(mockRepairGeneratedOutputRetrievalClasses).toHaveBeenCalledTimes(1);
		expect(mockRepairGeneratedOutputRetrievalClasses).toHaveBeenCalledWith('user-1');
		expect(mockRepairGeneratedOutputFamilyStatuses).toHaveBeenCalledTimes(1);
		expect(mockRepairGeneratedOutputFamilyStatuses).toHaveBeenCalledWith('user-1');
		expect(mockBackfillSemanticEmbeddingsForUser).toHaveBeenCalledTimes(1);
		expect(mockBackfillSemanticEmbeddingsForUser).toHaveBeenCalledWith('user-1');
	});

	it('debounces consecutive chat-triggered maintenance runs after the last completed pass', async () => {
		vi.useFakeTimers();
		const { runUserMemoryMaintenance } = await import('./memory-maintenance');

		await runUserMemoryMaintenance('user-1', 'chat_stream');
		await runUserMemoryMaintenance('user-1', 'chat_stream');

		expect(mockSyncPersonaMemoryClusters).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(10 * 60_000);

		expect(mockSyncPersonaMemoryClusters).toHaveBeenCalledTimes(2);
	});

	it('does not debounce scheduler-triggered maintenance', async () => {
		const { runUserMemoryMaintenance } = await import('./memory-maintenance');

		await runUserMemoryMaintenance('user-1', 'chat_stream');
		await runUserMemoryMaintenance('user-1', 'scheduler');

		expect(mockSyncPersonaMemoryClusters).toHaveBeenCalledTimes(2);
	});
});
