import { and, eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { deepResearchJobs } from "$lib/server/db/schema";
import type { DeepResearchJob, DeepResearchSource } from "$lib/types";
import { assessResearchCoverage } from "./coverage";
import { runPublicWebDiscoveryPass } from "./discovery";
import {
	completeDeepResearchJobWithAuditedReport,
	listConversationDeepResearchJobs,
} from "./index";
import type { ResearchPlan } from "./planning";
import type { PersistedReviewedResearchSourceNotes } from "./source-review";
import { listResearchSources } from "./sources";
import { buildSynthesisNotes } from "./synthesis";
import { createResearchTasksFromCoverageGaps } from "./tasks";
import { saveResearchTimelineEvent } from "./timeline";

export type RunDeepResearchWorkflowStepInput = {
	userId: string;
	jobId: string;
	now?: Date;
};

export type DeepResearchWorkflowOutcome =
	| "discovery_completed"
	| "report_completed"
	| "coverage_continuation_created"
	| "not_eligible";

export type RunDeepResearchWorkflowStepResult = {
	job: DeepResearchJob;
	advanced: boolean;
	outcome: DeepResearchWorkflowOutcome;
} | null;

export type DeepResearchWorkflowDependencies = {
	discovery?: {
		runPublicWebDiscoveryPass: typeof runPublicWebDiscoveryPass;
	};
	sources?: {
		listResearchSources: typeof listResearchSources;
	};
	coverage?: {
		assessResearchCoverage: typeof assessResearchCoverage;
	};
	synthesis?: {
		buildSynthesisNotes: typeof buildSynthesisNotes;
	};
	reportCompletion?: {
		completeDeepResearchJobWithAuditedReport: typeof completeDeepResearchJobWithAuditedReport;
	};
	tasks?: {
		createResearchTasksFromCoverageGaps: typeof createResearchTasksFromCoverageGaps;
	};
};

export async function runDeepResearchWorkflowStep(
	input: RunDeepResearchWorkflowStepInput,
	dependencies: DeepResearchWorkflowDependencies = {},
): Promise<RunDeepResearchWorkflowStepResult> {
	const now = input.now ?? new Date();
	const [jobRow] = await db
		.select()
		.from(deepResearchJobs)
		.where(
			and(
				eq(deepResearchJobs.id, input.jobId),
				eq(deepResearchJobs.userId, input.userId),
			),
		)
		.limit(1);

	if (!jobRow) return null;
	if (jobRow.status === "approved" && jobRow.stage === "plan_approved") {
		return runDiscoveryStep(jobRow, now, dependencies);
	}
	if (jobRow.status === "running" && jobRow.stage === "source_review") {
		return runSourceReviewStep(jobRow, now, dependencies);
	}

	const job = await reloadWorkflowJob(
		jobRow.userId,
		jobRow.conversationId,
		jobRow.id,
	);
	if (!job) return null;
	return {
		job,
		advanced: false,
		outcome: "not_eligible",
	};
}

async function runSourceReviewStep(
	jobRow: typeof deepResearchJobs.$inferSelect,
	now: Date,
	dependencies: DeepResearchWorkflowDependencies,
): Promise<RunDeepResearchWorkflowStepResult> {
	const job = await reloadWorkflowJob(
		jobRow.userId,
		jobRow.conversationId,
		jobRow.id,
	);
	const approvedPlan = job?.currentPlan?.rawPlan;
	if (!job || !approvedPlan) {
		return job ? { job, advanced: false, outcome: "not_eligible" } : null;
	}

	const sources = await (
		dependencies.sources?.listResearchSources ?? listResearchSources
	)({
		userId: jobRow.userId,
		jobId: jobRow.id,
	});
	const reviewedSources = sources.filter((source) => source.reviewedAt);
	const coverageAssessment = (
		dependencies.coverage?.assessResearchCoverage ?? assessResearchCoverage
	)({
		jobId: jobRow.id,
		conversationId: jobRow.conversationId,
		plan: approvedPlan as ResearchPlan,
		reviewedSources: reviewedSources.map((source) =>
			mapReviewedSourceForCoverage(source, approvedPlan as ResearchPlan),
		),
		signals: {
			freshnessRequired: false,
		},
		remainingBudget: {
			sourceReviews: Math.max(
				0,
				approvedPlan.researchBudget.sourceReviewCeiling -
					reviewedSources.length,
			),
			synthesisPasses: approvedPlan.researchBudget.synthesisPassCeiling,
		},
	});

	await saveResearchTimelineEvent({
		jobId: jobRow.id,
		conversationId: jobRow.conversationId,
		userId: jobRow.userId,
		taskId: null,
		...coverageAssessment.timelineSummary,
		occurredAt: now.toISOString(),
	});

	if (coverageAssessment.status !== "sufficient") {
		if (coverageAssessment.canContinue) {
			await (
				dependencies.tasks?.createResearchTasksFromCoverageGaps ??
				createResearchTasksFromCoverageGaps
			)({
				userId: jobRow.userId,
				jobId: jobRow.id,
				conversationId: jobRow.conversationId,
				passNumber: 1,
				gaps: coverageAssessment.coverageGaps.map((gap, index) => ({
					id: `coverage-gap-${index + 1}`,
					keyQuestion: gap.keyQuestion,
					summary: gap.recommendedNextAction,
					severity:
						gap.reason === "insufficient_reviewed_sources"
							? "critical"
							: "important",
				})),
				now,
			});
			await db
				.update(deepResearchJobs)
				.set({
					status: "running",
					stage: "research_tasks",
					updatedAt: now,
				})
				.where(
					and(
						eq(deepResearchJobs.id, jobRow.id),
						eq(deepResearchJobs.userId, jobRow.userId),
						eq(deepResearchJobs.status, "running"),
						eq(deepResearchJobs.stage, "source_review"),
					),
				);
			const reloaded = await reloadWorkflowJob(
				jobRow.userId,
				jobRow.conversationId,
				jobRow.id,
			);
			return reloaded
				? {
						job: reloaded,
						advanced: true,
						outcome: "coverage_continuation_created",
					}
				: null;
		}
		const reloaded = await reloadWorkflowJob(
			jobRow.userId,
			jobRow.conversationId,
			jobRow.id,
		);
		return reloaded
			? { job: reloaded, advanced: false, outcome: "not_eligible" }
			: null;
	}

	await db
		.update(deepResearchJobs)
		.set({
			status: "running",
			stage: "synthesis",
			updatedAt: now,
		})
		.where(
			and(
				eq(deepResearchJobs.id, jobRow.id),
				eq(deepResearchJobs.userId, jobRow.userId),
				eq(deepResearchJobs.status, "running"),
				eq(deepResearchJobs.stage, "source_review"),
			),
		);
	const synthesisNotes = await (
		dependencies.synthesis?.buildSynthesisNotes ?? buildSynthesisNotes
	)({
		jobId: jobRow.id,
		reviewedSources: reviewedSources.map(mapReviewedSourceForSynthesis),
		completedTasks: [],
	});
	const completedJob = await (
		dependencies.reportCompletion?.completeDeepResearchJobWithAuditedReport ??
		completeDeepResearchJobWithAuditedReport
	)({
		userId: jobRow.userId,
		jobId: jobRow.id,
		synthesisNotes,
		limitations: coverageAssessment.reportLimitations.map(
			(limitation) => limitation.limitation,
		),
		now,
	});
	if (!completedJob) return null;
	return {
		job: completedJob,
		advanced: true,
		outcome: "report_completed",
	};
}

async function runDiscoveryStep(
	jobRow: typeof deepResearchJobs.$inferSelect,
	now: Date,
	dependencies: DeepResearchWorkflowDependencies,
): Promise<RunDeepResearchWorkflowStepResult> {
	const job = await reloadWorkflowJob(
		jobRow.userId,
		jobRow.conversationId,
		jobRow.id,
	);
	const approvedPlan = job?.currentPlan?.rawPlan;
	if (!job || !approvedPlan) {
		return job ? { job, advanced: false, outcome: "not_eligible" } : null;
	}

	const [claimedJob] = await db
		.update(deepResearchJobs)
		.set({
			status: "running",
			stage: "source_discovery",
			updatedAt: now,
		})
		.where(
			and(
				eq(deepResearchJobs.id, jobRow.id),
				eq(deepResearchJobs.userId, jobRow.userId),
				eq(deepResearchJobs.status, "approved"),
				eq(deepResearchJobs.stage, "plan_approved"),
			),
		)
		.returning();
	if (!claimedJob) return null;

	await (
		dependencies.discovery?.runPublicWebDiscoveryPass ??
		runPublicWebDiscoveryPass
	)({
		jobId: claimedJob.id,
		conversationId: claimedJob.conversationId,
		userId: claimedJob.userId,
		approvedPlan: approvedPlan as ResearchPlan,
		now,
	});

	const [updatedJob] = await db
		.update(deepResearchJobs)
		.set({
			status: "running",
			stage: "source_review",
			updatedAt: now,
		})
		.where(
			and(
				eq(deepResearchJobs.id, claimedJob.id),
				eq(deepResearchJobs.userId, claimedJob.userId),
				eq(deepResearchJobs.status, "running"),
				eq(deepResearchJobs.stage, "source_discovery"),
			),
		)
		.returning();
	if (!updatedJob) return null;

	const reloaded = await reloadWorkflowJob(
		updatedJob.userId,
		updatedJob.conversationId,
		updatedJob.id,
	);
	if (!reloaded) return null;
	return {
		job: reloaded,
		advanced: true,
		outcome: "discovery_completed",
	};
}

async function reloadWorkflowJob(
	userId: string,
	conversationId: string,
	jobId: string,
): Promise<DeepResearchJob | null> {
	const jobs = await listConversationDeepResearchJobs(userId, conversationId);
	return jobs.find((job) => job.id === jobId) ?? null;
}

function mapReviewedSourceForCoverage(
	source: DeepResearchSource,
	plan: ResearchPlan,
) {
	return {
		id: source.id,
		canonicalUrl: source.url,
		url: source.url,
		title: source.title ?? source.url,
		reviewedAt: source.reviewedAt ?? undefined,
		supportedKeyQuestions: plan.keyQuestions,
		keyFindings: source.reviewedNote ? [source.reviewedNote] : [],
		qualityScore: 80,
	};
}

function mapReviewedSourceForSynthesis(
	source: DeepResearchSource,
): PersistedReviewedResearchSourceNotes {
	const reviewedAt =
		source.reviewedAt ?? source.updatedAt ?? source.discoveredAt;
	return {
		id: source.id,
		jobId: source.jobId,
		discoveredSourceId: source.id,
		canonicalUrl: source.url,
		title: source.title ?? source.url,
		duplicateSourceIds: [],
		authorityScore: 0,
		qualityScore: 80,
		reviewScore: 80,
		summary:
			source.reviewedNote ?? source.snippet ?? source.title ?? source.url,
		keyFindings: [
			source.reviewedNote ?? source.snippet ?? source.title ?? source.url,
		],
		extractedText: source.reviewedNote ?? null,
		createdAt: reviewedAt,
	};
}
