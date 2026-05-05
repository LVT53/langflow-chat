import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn(),
}));

vi.mock('$lib/server/services/deep-research/worker', () => ({
	triggerMockDeepResearchWorkerForJob: vi.fn(),
}));

import { POST } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import { triggerMockDeepResearchWorkerForJob } from '$lib/server/services/deep-research/worker';

type AdvanceRouteEvent = Parameters<typeof POST>[0];

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockTriggerMockDeepResearchWorkerForJob =
	triggerMockDeepResearchWorkerForJob as ReturnType<typeof vi.fn>;

function makeEvent(jobId = 'research-job-1', user = { id: 'user-1', email: 'test@example.com' }) {
	return {
		request: new Request(
			`http://localhost/api/deep-research/jobs/${jobId}/worker/advance`,
			{
				method: 'POST',
			}
		),
		locals: { user },
		params: { id: jobId },
		url: new URL(`http://localhost/api/deep-research/jobs/${jobId}/worker/advance`),
		route: { id: '/api/deep-research/jobs/[id]/worker/advance' },
	} as AdvanceRouteEvent;
}

describe('POST /api/deep-research/jobs/[id]/worker/advance', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
		mockTriggerMockDeepResearchWorkerForJob.mockResolvedValue({
			job: {
				id: 'research-job-1',
				conversationId: 'conv-1',
				triggerMessageId: 'user-msg-1',
				depth: 'standard',
				status: 'running',
				stage: 'source_discovery',
				title: 'Research AI copyright rules',
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
			advanced: true,
		});
	});

	it('triggers one mock worker step for the signed-in user without an open chat stream', async () => {
		const response = await POST(makeEvent());
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toMatchObject({
			advanced: true,
			job: {
				id: 'research-job-1',
				status: 'running',
				stage: 'source_discovery',
			},
		});
		expect(mockTriggerMockDeepResearchWorkerForJob).toHaveBeenCalledWith({
			userId: 'user-1',
			jobId: 'research-job-1',
		});
	});
});
