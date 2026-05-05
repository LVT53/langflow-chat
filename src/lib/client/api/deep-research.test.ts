import { describe, expect, it, vi } from "vitest";
import { approveDeepResearchPlan, editDeepResearchPlan } from "./deep-research";

describe("deep-research client API", () => {
	it("posts Plan Edit instructions and returns the updated job", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						job: {
							id: "job-1",
							conversationId: "conv-1",
							triggerMessageId: "message-1",
							depth: "standard",
							status: "awaiting_approval",
							stage: "plan_drafted",
							title: "Research battery recycling policy",
							plan: {
								version: 2,
								renderedPlan: "Revised Research Plan",
								contextDisclosure: null,
								effortEstimate: {
									selectedDepth: "standard",
									expectedTimeBand: "30-60 minutes",
									sourceReviewCeiling: 40,
									relativeCostWarning: "Moderate relative cost.",
								},
							},
							createdAt: 1,
							updatedAt: 2,
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		);

		await expect(
			editDeepResearchPlan("job-1", "Focus on recent enforcement.", fetchMock),
		).resolves.toMatchObject({
			id: "job-1",
			plan: { version: 2, renderedPlan: "Revised Research Plan" },
		});
		expect(fetchMock).toHaveBeenCalledWith("/api/deep-research/jobs/job-1/plan/edit", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ editInstruction: "Focus on recent enforcement." }),
		});
	});

	it("posts plan approval and returns the updated job", async () => {
		const fetchMock = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						job: {
							id: "job-1",
							conversationId: "conv-1",
							triggerMessageId: "message-1",
							depth: "standard",
							status: "approved",
							stage: "plan_approved",
							title: "Research battery recycling policy",
							plan: null,
							createdAt: 1,
							updatedAt: 2,
						},
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
		);

		await expect(
			approveDeepResearchPlan("job-1", fetchMock),
		).resolves.toMatchObject({
			id: "job-1",
			status: "approved",
			stage: "plan_approved",
		});
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/deep-research/jobs/job-1/plan/approve",
			{
				method: "POST",
			},
		);
	});
});
