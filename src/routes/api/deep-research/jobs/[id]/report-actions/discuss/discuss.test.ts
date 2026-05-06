import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/hooks', () => ({
	requireAuth: vi.fn(),
}));

vi.mock('$lib/server/services/deep-research', () => ({
	discussDeepResearchReport: vi.fn(),
}));

import { POST } from './+server';
import { requireAuth } from '$lib/server/auth/hooks';
import { discussDeepResearchReport } from '$lib/server/services/deep-research';

type DiscussRouteEvent = Parameters<typeof POST>[0];

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockDiscussDeepResearchReport = discussDeepResearchReport as ReturnType<typeof vi.fn>;

function makeEvent(jobId = 'research-job-1', user = { id: 'user-1', email: 'test@example.com' }) {
	return {
		request: new Request(
			`http://localhost/api/deep-research/jobs/${jobId}/report-actions/discuss`,
			{ method: 'POST' }
		),
		locals: { user },
		params: { id: jobId },
		url: new URL(`http://localhost/api/deep-research/jobs/${jobId}/report-actions/discuss`),
		route: { id: '/api/deep-research/jobs/[id]/report-actions/discuss' },
	} as DiscussRouteEvent;
}

describe('POST /api/deep-research/jobs/[id]/report-actions/discuss', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
		mockDiscussDeepResearchReport.mockResolvedValue({
			sourceJobId: 'research-job-1',
			reportArtifactId: 'artifact-report-1',
			conversation: {
				id: 'conv-discuss-1',
				title: 'Discuss: Research AI copyright rules',
				projectId: null,
				createdAt: 1,
				updatedAt: 1,
			},
			messageId: 'message-discuss-1',
		});
	});

	it('starts a Normal Chat from the completed Research Report for the signed-in user', async () => {
		const response = await POST(makeEvent());
		const data = await response.json();

		expect(response.status).toBe(201);
		expect(data).toMatchObject({
			sourceJobId: 'research-job-1',
			reportArtifactId: 'artifact-report-1',
			conversation: {
				id: 'conv-discuss-1',
				title: 'Discuss: Research AI copyright rules',
			},
			messageId: 'message-discuss-1',
		});
		expect(mockDiscussDeepResearchReport).toHaveBeenCalledWith({
			userId: 'user-1',
			jobId: 'research-job-1',
			persistSeedMessage: true,
		});
	});

	it('returns not found when the completed Research Report or memo is unavailable', async () => {
		mockDiscussDeepResearchReport.mockResolvedValue(null);

		const response = await POST(makeEvent());
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data).toEqual({
			error: 'Completed Research Report or Evidence Limitation Memo not found',
		});
	});
});
