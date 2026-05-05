import { json } from "@sveltejs/kit";
import { requireAuth } from "$lib/server/auth/hooks";
import { runDeepResearchWorkflowStep } from "$lib/server/services/deep-research/workflow";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user;
	if (!user) {
		return json({ error: "Unauthorized" }, { status: 401 });
	}

	const result = await runDeepResearchWorkflowStep({
		userId: user.id,
		jobId: event.params.id,
	});

	if (!result) {
		return json({ error: "Deep Research job not found" }, { status: 404 });
	}

	return json({
		advanced: result.advanced,
		outcome: result.outcome,
		status: result.job.status,
		stage: result.job.stage,
		job: result.job,
	});
};
