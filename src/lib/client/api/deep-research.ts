import type {
	DeepResearchJob,
	DeepResearchReportActionResult,
	DeepResearchResearchFurtherActionResult,
} from "$lib/types";
import { type FetchLike, requestJson } from "./http";

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

export async function editDeepResearchPlan(
	jobId: string,
	instructions: string,
	fetchImpl: FetchLike = fetch,
): Promise<DeepResearchJob> {
	const payload = await requestJson<DeepResearchJobResponse>(
		`/api/deep-research/jobs/${encodeURIComponent(jobId)}/plan/edit`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ editInstruction: instructions }),
		},
		"Failed to edit Research Plan",
		fetchImpl,
	);
	return payload.job;
}

export async function approveDeepResearchPlan(
	jobId: string,
	fetchImpl: FetchLike = fetch,
): Promise<DeepResearchJob> {
	const payload = await requestJson<DeepResearchJobResponse>(
		`/api/deep-research/jobs/${encodeURIComponent(jobId)}/plan/approve`,
		{ method: "POST" },
		"Failed to approve Research Plan",
		fetchImpl,
	);
	return payload.job;
}

export async function discussDeepResearchReport(
	jobId: string,
	fetchImpl: FetchLike = fetch,
): Promise<DeepResearchReportActionResult> {
	return requestJson<DeepResearchReportActionResult>(
		`/api/deep-research/jobs/${encodeURIComponent(jobId)}/report-actions/discuss`,
		{ method: "POST" },
		"Failed to discuss Research Report",
		fetchImpl,
	);
}

export async function researchFurtherFromDeepResearchReport(
	jobId: string,
	fetchImpl: FetchLike = fetch,
): Promise<DeepResearchResearchFurtherActionResult> {
	return requestJson<DeepResearchResearchFurtherActionResult>(
		`/api/deep-research/jobs/${encodeURIComponent(jobId)}/report-actions/research-further`,
		{ method: "POST" },
		"Failed to research further from Research Report",
		fetchImpl,
	);
}
