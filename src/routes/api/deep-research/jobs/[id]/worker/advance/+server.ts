import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth/hooks';
import { completeDeepResearchJobWithFakeReport } from '$lib/server/services/deep-research';
import { triggerMockDeepResearchWorkerForJob } from '$lib/server/services/deep-research/worker';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const result = await triggerMockDeepResearchWorkerForJob({
		userId: user.id,
		jobId: event.params.id,
	});

	if (!result) {
		return json({ error: 'Deep Research job not found' }, { status: 404 });
	}

	if (!result.advanced && result.job.status === 'running' && result.job.stage === 'report_ready') {
		const completedJob = await completeDeepResearchJobWithFakeReport({
			userId: user.id,
			jobId: event.params.id,
		});
		if (completedJob) {
			return json({
				job: completedJob,
				advanced: false,
				completed: true,
			});
		}
	}

	return json(result);
};
