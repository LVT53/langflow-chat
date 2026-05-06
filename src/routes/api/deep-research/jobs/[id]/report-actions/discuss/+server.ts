import { json } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth/hooks';
import { discussDeepResearchReport } from '$lib/server/services/deep-research';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const action = await discussDeepResearchReport({
		userId: user.id,
		jobId: event.params.id,
		persistSeedMessage: true,
	});

	if (!action) {
		return json(
			{ error: 'Completed Research Report or Evidence Limitation Memo not found' },
			{ status: 404 }
		);
	}

	return json(action, { status: 201 });
};
