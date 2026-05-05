import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { deepResearchJobs } from "$lib/server/db/schema";
import type { DeepResearchJob } from "$lib/types";
import { listConversationDeepResearchJobs } from "./index";
import type { ResearchTimelineKind, ResearchTimelineStage } from "./timeline";
import { saveResearchTimelineEvent } from "./timeline";

export type RunNextMockDeepResearchWorkerStepInput = {
	now?: Date;
	controls?: DeepResearchWorkerControls;
};

export type RunNextMockDeepResearchWorkerStepResult = {
	job: DeepResearchJob;
	advanced: boolean;
} | null;

export type TriggerMockDeepResearchWorkerForJobInput = {
	userId: string;
	jobId: string;
	now?: Date;
	controls?: DeepResearchWorkerControls;
};

export type TriggerMockDeepResearchWorkerForJobResult = {
	job: DeepResearchJob;
	advanced: boolean;
} | null;

export type RecoverStaleDeepResearchJobsInput = {
	now?: Date;
	timeoutMs: number;
};

export type RecoverStaleDeepResearchJobsResult = {
	recoveredJobs: DeepResearchJob[];
};

export type RequestDeepResearchWorkerCancellationInput = {
	userId: string;
	jobId: string;
	now?: Date;
};

export type DeepResearchWorkerControls = {
	globalConcurrencyLimit?: number;
	userConcurrencyLimit?: number;
};

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
	if (
		!(await canStartApprovedJobWithinConcurrency(
			eligibleJob,
			nextStage,
			input.controls,
		))
	) {
		return null;
	}

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
		const currentJob = await loadDeepResearchJobForWorker(job);
		if (!currentJob) return null;
		return {
			job: currentJob,
			advanced: false,
		};
	}
	if (
		!(await canStartApprovedJobWithinConcurrency(
			job,
			nextStage,
			input.controls,
		))
	) {
		const currentJob = await loadDeepResearchJobForWorker(job);
		if (!currentJob) return null;
		return {
			job: currentJob,
			advanced: false,
		};
	}

	return advanceMockWorkerJob(job, nextStage, now);
}

export async function recoverStaleDeepResearchJobs(
	input: RecoverStaleDeepResearchJobsInput,
): Promise<RecoverStaleDeepResearchJobsResult> {
	const now = input.now ?? new Date();
	const cutoff = new Date(now.getTime() - Math.max(0, input.timeoutMs));
	const staleJobs = await db
		.select()
		.from(deepResearchJobs)
		.where(
			and(
				eq(deepResearchJobs.status, "running"),
				lte(deepResearchJobs.updatedAt, cutoff),
			),
		)
		.orderBy(asc(deepResearchJobs.updatedAt));
	const recoveredJobs: DeepResearchJob[] = [];

	for (const staleJob of staleJobs) {
		const [recoveredJob] = await db
			.update(deepResearchJobs)
			.set({
				status: "failed",
				stage: "stale_recovered_failed",
				updatedAt: now,
			})
			.where(
				and(
					eq(deepResearchJobs.id, staleJob.id),
					eq(deepResearchJobs.status, "running"),
					lte(deepResearchJobs.updatedAt, cutoff),
				),
			)
			.returning();
		if (!recoveredJob) continue;

		await saveResearchTimelineEvent({
			jobId: recoveredJob.id,
			conversationId: recoveredJob.conversationId,
			userId: recoveredJob.userId,
			taskId: null,
			stage: "report_completion",
			kind: "warning",
			occurredAt: now.toISOString(),
			messageKey: "deepResearch.timeline.workerStaleRecovered",
			messageParams: {
				stage: staleJob.stage ?? "unknown",
			},
			sourceCounts: {
				discovered: 0,
				reviewed: 0,
				cited: 0,
			},
			assumptions: [],
			warnings: [
				`Worker timeout exceeded for stage ${staleJob.stage ?? "unknown"}.`,
			],
			summary:
				"Deep Research job marked failed after exceeding the stale worker timeout.",
		});

		const mappedJob = await loadDeepResearchJobForWorker(recoveredJob);
		if (mappedJob) recoveredJobs.push(mappedJob);
	}

	return { recoveredJobs };
}

export async function requestDeepResearchWorkerCancellation(
	input: RequestDeepResearchWorkerCancellationInput,
): Promise<DeepResearchJob | null> {
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

	const previousStage = job.stage ?? "unknown";
	const [cancelledJob] = await db
		.update(deepResearchJobs)
		.set({
			status: "cancelled",
			stage: "cancelled_by_request",
			cancelledAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(deepResearchJobs.id, job.id),
				eq(deepResearchJobs.userId, input.userId),
				sql`${deepResearchJobs.status} IN ('awaiting_plan', 'awaiting_approval', 'approved', 'running')`,
			),
		)
		.returning();
	if (!cancelledJob) return loadDeepResearchJobForWorker(job);

	await saveResearchTimelineEvent({
		jobId: cancelledJob.id,
		conversationId: cancelledJob.conversationId,
		userId: cancelledJob.userId,
		taskId: null,
		stage: "report_completion",
		kind: "warning",
		occurredAt: now.toISOString(),
		messageKey: "deepResearch.timeline.workerCancelled",
		messageParams: {
			stage: previousStage,
		},
		sourceCounts: {
			discovered: 0,
			reviewed: 0,
			cited: 0,
		},
		assumptions: [],
		warnings: [
			`Cancellation requested while job was at stage ${previousStage}.`,
		],
		summary: "Deep Research job cancelled before further worker advancement.",
	});

	return loadDeepResearchJobForWorker(cancelledJob);
}

async function canStartApprovedJobWithinConcurrency(
	job: typeof deepResearchJobs.$inferSelect,
	nextStage: MockWorkerStage,
	controls: DeepResearchWorkerControls | undefined,
): Promise<boolean> {
	if (nextStage.fromStatus !== "approved" || nextStage.toStatus !== "running") {
		return true;
	}
	if (!controls) return true;

	const globalLimit = normalizeConcurrencyLimit(
		controls.globalConcurrencyLimit,
	);
	if (globalLimit !== null) {
		const runningCount = await countRunningJobs();
		if (runningCount >= globalLimit) return false;
	}

	const userLimit = normalizeConcurrencyLimit(controls.userConcurrencyLimit);
	if (userLimit !== null) {
		const runningCount = await countRunningJobs(job.userId);
		if (runningCount >= userLimit) return false;
	}

	return true;
}

async function countRunningJobs(userId?: string): Promise<number> {
	const where = userId
		? and(
				eq(deepResearchJobs.status, "running"),
				eq(deepResearchJobs.userId, userId),
			)
		: eq(deepResearchJobs.status, "running");
	const [result] = await db
		.select({ count: sql<number>`count(*)` })
		.from(deepResearchJobs)
		.where(where);

	return Number(result?.count ?? 0);
}

function normalizeConcurrencyLimit(value: number | undefined): number | null {
	if (value === undefined) return null;
	if (!Number.isFinite(value)) return null;
	return Math.max(0, Math.floor(value));
}

async function loadDeepResearchJobForWorker(
	job: typeof deepResearchJobs.$inferSelect,
): Promise<DeepResearchJob | null> {
	const jobs = await listConversationDeepResearchJobs(
		job.userId,
		job.conversationId,
	);
	return jobs.find((candidate) => candidate.id === job.id) ?? null;
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
