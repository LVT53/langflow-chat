import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn(),
}));

vi.mock('$lib/server/services/deep-research', () => ({
	cancelPrePlanDeepResearchJob: vi.fn(),
}));

import { POST } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import { cancelPrePlanDeepResearchJob } from '$lib/server/services/deep-research';

type CancelRouteEvent = Parameters<typeof POST>[0];

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockCancelPrePlanDeepResearchJob = cancelPrePlanDeepResearchJob as ReturnType<typeof vi.fn>;

function makeEvent(jobId = 'research-job-1', user = { id: 'user-1', email: 'test@example.com' }) {
	return {
		request: new Request(`http://localhost/api/deep-research/jobs/${jobId}/cancel`, {
			method: 'POST',
		}),
		locals: { user },
		params: { id: jobId },
		url: new URL(`http://localhost/api/deep-research/jobs/${jobId}/cancel`),
		route: { id: '/api/deep-research/jobs/[id]/cancel' },
	} as CancelRouteEvent;
}

describe('POST /api/deep-research/jobs/[id]/cancel', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
		mockCancelPrePlanDeepResearchJob.mockResolvedValue({
			id: 'research-job-1',
			conversationId: 'conv-1',
			triggerMessageId: 'user-msg-1',
			depth: 'standard',
			status: 'cancelled',
			stage: 'cancelled_before_approval',
			title: 'Research AI copyright rules',
			createdAt: Date.now(),
			updatedAt: Date.now(),
			cancelledAt: Date.now(),
		});
	});

	it('cancels a pre-approval Deep Research job for the signed-in user', async () => {
		const response = await POST(makeEvent());
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data.job).toMatchObject({
			id: 'research-job-1',
			status: 'cancelled',
			stage: 'cancelled_before_approval',
		});
		expect(mockCancelPrePlanDeepResearchJob).toHaveBeenCalledWith({
			userId: 'user-1',
			jobId: 'research-job-1',
		});
	});

	it('returns 404 when the Deep Research job cannot be cancelled', async () => {
		mockCancelPrePlanDeepResearchJob.mockResolvedValue(null);

		const response = await POST(makeEvent('running-job-1'));
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data.error).toMatch(/not found or not cancellable/i);
		expect(mockCancelPrePlanDeepResearchJob).toHaveBeenCalledWith({
			userId: 'user-1',
			jobId: 'running-job-1',
		});
	});
});
