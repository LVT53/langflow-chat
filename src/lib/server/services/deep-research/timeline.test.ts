import { describe, expect, it } from "vitest";
import { createPlanGenerationTimelineEvent } from "./timeline";

describe("createPlanGenerationTimelineEvent", () => {
	it("records a plan-generation timeline event without exposing private reasoning", () => {
		const event = createPlanGenerationTimelineEvent({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			stage: "plan_generation",
			researchLanguage: "en",
			occurredAt: new Date("2026-05-05T10:15:00.000Z"),
			sourceCounts: {
				discovered: 0,
				reviewed: 0,
				cited: 0,
			},
			assumptions: [
				"Current chat and library summaries are planning context only.",
			],
			warnings: ["No source-heavy research has started before approval."],
			privateReasoning:
				"The planner internally compared alternative source strategies.",
		});

		expect(event).toEqual({
			jobId: "job-1",
			conversationId: "conversation-1",
			userId: "user-1",
			taskId: null,
			stage: "plan_generation",
			kind: "plan_generated",
			occurredAt: "2026-05-05T10:15:00.000Z",
			messageKey: "deepResearch.timeline.planGenerated",
			messageParams: {
				discoveredSources: 0,
				reviewedSources: 0,
				citedSources: 0,
			},
			sourceCounts: {
				discovered: 0,
				reviewed: 0,
				cited: 0,
			},
			assumptions: [
				"Current chat and library summaries are planning context only.",
			],
			warnings: ["No source-heavy research has started before approval."],
			summary: "Research Plan drafted for approval.",
		});
		expect(JSON.stringify(event)).not.toContain("private");
		expect(JSON.stringify(event)).not.toContain(
			"alternative source strategies",
		);
	});
});
