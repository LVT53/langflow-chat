import type { DeepResearchJob } from "$lib/types";
import { requestJson, type FetchLike } from "./http";

interface DeepResearchJobResponse {
	job: DeepResearchJob;
}

export async function cancelDeepResearchJob(
	jobId: string,
	fetchImpl: FetchLike = fetch,
): Promise<DeepResearchJob> {
	const payload = await requestJson<DeepResearchJobResponse>(
		`/api/deep-research/jobs/${encodeURIComponent(jobId)}/cancel`,
		{ method: "POST" },
		"Failed to cancel Deep Research",
		fetchImpl,
	);
	return payload.job;
}
