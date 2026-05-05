import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "$lib/server/db";
import { deepResearchJobs } from "$lib/server/db/schema";
import type { DeepResearchJob } from "$lib/types";
import { listConversationDeepResearchJobs } from "./index";
import type { ResearchTimelineKind, ResearchTimelineStage } from "./timeline";
import { saveResearchTimelineEvent } from "./timeline";

export type RunNextMockDeepResearchWorkerStepInput = {
	now?: Date;
};

export type RunNextMockDeepResearchWorkerStepResult = {
	job: DeepResearchJob;
	advanced: boolean;
} | null;

export type TriggerMockDeepResearchWorkerForJobInput = {
	userId: string;
	jobId: string;
	now?: Date;
};

export type TriggerMockDeepResearchWorkerForJobResult = {
	job: DeepResearchJob;
	advanced: boolean;
} | null;

type MockWorkerStage = {
	fromStatus: string;
	fromStage: string;
	toStatus: string;
	toStage: string;
	timelineStage: ResearchTimelineStage;
	timelineKind: ResearchTimelineKind;
	messageKey: string;
	summary: string;
};

const MOCK_STAGE_SEQUENCE: MockWorkerStage[] = [
	{
		fromStatus: "approved",
		fromStage: "plan_approved",
		toStatus: "running",
		toStage: "source_discovery",
		timelineStage: "source_discovery",
		timelineKind: "stage_started",
		messageKey: "deepResearch.timeline.sourceDiscoveryStarted",
		summary: "Mock source discovery started.",
	},
	{
		fromStatus: "running",
		fromStage: "source_discovery",
		toStatus: "running",
		toStage: "source_review",
		timelineStage: "source_review",
		timelineKind: "stage_completed",
		messageKey: "deepResearch.timeline.sourceReviewCompleted",
		summary: "Mock source review completed.",
	},
	{
		fromStatus: "running",
		fromStage: "source_review",
		toStatus: "running",
		toStage: "synthesis",
		timelineStage: "synthesis",
		timelineKind: "stage_completed",
		messageKey: "deepResearch.timeline.synthesisCompleted",
		summary: "Mock synthesis completed.",
	},
	{
		fromStatus: "running",
		fromStage: "synthesis",
		toStatus: "running",
		toStage: "report_ready",
		timelineStage: "report_completion",
		timelineKind: "stage_completed",
		messageKey: "deepResearch.timeline.mockReportReady",
		summary: "Mock research is ready for report generation.",
	},
];

export async function runNextMockDeepResearchWorkerStep(
	input: RunNextMockDeepResearchWorkerStepInput = {},
): Promise<RunNextMockDeepResearchWorkerStepResult> {
	const now = input.now ?? new Date();
	const [eligibleJob] = await db
		.select()
		.from(deepResearchJobs)
		.where(
			or(
				eq(deepResearchJobs.status, "approved"),
				and(
					eq(deepResearchJobs.status, "running"),
					inArray(deepResearchJobs.stage, [
						"source_discovery",
						"source_review",
						"synthesis",
					]),
				),
			),
		)
		.orderBy(asc(deepResearchJobs.createdAt))
		.limit(1);

	if (!eligibleJob) return null;
	const nextStage = getNextMockWorkerStage(
		eligibleJob.status,
		eligibleJob.stage,
	);
	if (!nextStage) return null;

	return advanceMockWorkerJob(eligibleJob, nextStage, now);
}

export async function triggerMockDeepResearchWorkerForJob(
	input: TriggerMockDeepResearchWorkerForJobInput,
): Promise<TriggerMockDeepResearchWorkerForJobResult> {
	const now = input.now ?? new Date();
	const [job] = await db
		.select()
		.from(deepResearchJobs)
		.where(
			and(
				eq(deepResearchJobs.id, input.jobId),
				eq(deepResearchJobs.userId, input.userId),
			),
		)
		.limit(1);

	if (!job) return null;
	const nextStage = getNextMockWorkerStage(job.status, job.stage);
	if (!nextStage) {
		const jobs = await listConversationDeepResearchJobs(
			job.userId,
			job.conversationId,
		);
		const currentJob = jobs.find((candidate) => candidate.id === job.id);
		if (!currentJob) return null;
		return {
			job: currentJob,
			advanced: false,
		};
	}

	return advanceMockWorkerJob(job, nextStage, now);
}

async function advanceMockWorkerJob(
	eligibleJob: typeof deepResearchJobs.$inferSelect,
	nextStage: MockWorkerStage,
	now: Date,
): Promise<RunNextMockDeepResearchWorkerStepResult> {
	const [claimedJob] = await db
		.update(deepResearchJobs)
		.set({
			status: nextStage.toStatus,
			stage: nextStage.toStage,
			updatedAt: now,
		})
		.where(
			and(
				eq(deepResearchJobs.id, eligibleJob.id),
				eq(deepResearchJobs.status, nextStage.fromStatus),
				eq(deepResearchJobs.stage, nextStage.fromStage),
			),
		)
		.returning();

	if (!claimedJob) return null;

	await saveResearchTimelineEvent({
		jobId: claimedJob.id,
		conversationId: claimedJob.conversationId,
		userId: claimedJob.userId,
		taskId: null,
		stage: nextStage.timelineStage,
		kind: nextStage.timelineKind,
		occurredAt: now.toISOString(),
		messageKey: nextStage.messageKey,
		messageParams: {},
		sourceCounts: {
			discovered: 0,
			reviewed: 0,
			cited: 0,
		},
		assumptions: [],
		warnings: [],
		summary: nextStage.summary,
	});

	const jobs = await listConversationDeepResearchJobs(
		claimedJob.userId,
		claimedJob.conversationId,
	);
	const job = jobs.find((candidate) => candidate.id === claimedJob.id);
	if (!job) return null;
	return {
		job,
		advanced: true,
	};
}

function getNextMockWorkerStage(
	status: string,
	stage: string | null,
): MockWorkerStage | null {
	return (
		MOCK_STAGE_SEQUENCE.find(
			(candidate) =>
				candidate.fromStatus === status && candidate.fromStage === stage,
		) ?? null
	);
}
