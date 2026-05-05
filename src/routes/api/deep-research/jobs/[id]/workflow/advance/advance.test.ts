import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/server/auth/hooks", () => ({
	requireAuth: vi.fn(),
}));

vi.mock("$lib/server/services/deep-research/workflow", () => ({
	runDeepResearchWorkflowStep: vi.fn(),
}));

import { requireAuth } from "$lib/server/auth/hooks";
import { runDeepResearchWorkflowStep } from "$lib/server/services/deep-research/workflow";
import { POST } from "./+server";

type WorkflowAdvanceRouteEvent = Parameters<typeof POST>[0];

const mockRequireAuth = requireAuth as ReturnType<typeof vi.fn>;
const mockRunDeepResearchWorkflowStep =
	runDeepResearchWorkflowStep as ReturnType<typeof vi.fn>;

function makeEvent(
	jobId = "research-job-1",
	user = { id: "user-1", email: "test@example.com" },
) {
	return {
		request: new Request(
			`http://localhost/api/deep-research/jobs/${jobId}/workflow/advance`,
			{
				method: "POST",
			},
		),
		locals: { user },
		params: { id: jobId },
		url: new URL(
			`http://localhost/api/deep-research/jobs/${jobId}/workflow/advance`,
		),
		route: { id: "/api/deep-research/jobs/[id]/workflow/advance" },
	} as WorkflowAdvanceRouteEvent;
}

describe("POST /api/deep-research/jobs/[id]/workflow/advance", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockRequireAuth.mockReturnValue(undefined);
		mockRunDeepResearchWorkflowStep.mockResolvedValue({
			advanced: true,
			outcome: "discovery_completed",
			job: {
				id: "research-job-1",
				conversationId: "conv-1",
				triggerMessageId: "user-msg-1",
				depth: "standard",
				status: "running",
				stage: "source_review",
				title: "Research AI copyright rules",
				createdAt: Date.now(),
				updatedAt: Date.now(),
			},
		});
	});

	it("advances one real workflow step for the signed-in job owner", async () => {
		const response = await POST(makeEvent());
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toMatchObject({
			advanced: true,
			outcome: "discovery_completed",
			status: "running",
			stage: "source_review",
			job: {
				id: "research-job-1",
				status: "running",
				stage: "source_review",
			},
		});
		expect(mockRunDeepResearchWorkflowStep).toHaveBeenCalledWith({
			userId: "user-1",
			jobId: "research-job-1",
		});
	});

	it("rejects a missing or unauthorized Deep Research job", async () => {
		mockRunDeepResearchWorkflowStep.mockResolvedValue(null);

		const response = await POST(makeEvent("other-user-job"));
		const data = await response.json();

		expect(response.status).toBe(404);
		expect(data).toEqual({ error: "Deep Research job not found" });
		expect(mockRunDeepResearchWorkflowStep).toHaveBeenCalledWith({
			userId: "user-1",
			jobId: "other-user-job",
		});
	});

	it("requires an authenticated user before advancing workflow state", async () => {
		const response = await POST(makeEvent("research-job-1", null));
		const data = await response.json();

		expect(response.status).toBe(401);
		expect(data).toEqual({ error: "Unauthorized" });
		expect(mockRunDeepResearchWorkflowStep).not.toHaveBeenCalled();
	});

	it("returns a non-advancing workflow state without route-local mutation", async () => {
		mockRunDeepResearchWorkflowStep.mockResolvedValue({
			advanced: false,
			outcome: "not_eligible",
			job: {
				id: "research-job-1",
				conversationId: "conv-1",
				triggerMessageId: "user-msg-1",
				depth: "standard",
				status: "awaiting_approval",
				stage: "plan_drafted",
				title: "Research AI copyright rules",
				createdAt: 1710000000000,
				updatedAt: 1710000000000,
			},
		});

		const response = await POST(makeEvent());
		const data = await response.json();

		expect(response.status).toBe(200);
		expect(data).toMatchObject({
			advanced: false,
			outcome: "not_eligible",
			status: "awaiting_approval",
			stage: "plan_drafted",
			job: {
				id: "research-job-1",
				status: "awaiting_approval",
				stage: "plan_drafted",
			},
		});
		expect(mockRunDeepResearchWorkflowStep).toHaveBeenCalledTimes(1);
		expect(mockRunDeepResearchWorkflowStep).toHaveBeenCalledWith({
			userId: "user-1",
			jobId: "research-job-1",
		});
	});
});
