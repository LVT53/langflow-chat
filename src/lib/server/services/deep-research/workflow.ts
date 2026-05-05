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
import {
	type PersistedReviewedResearchSourceNotes,
	type SourceReviewer,
	triageAndReviewSources,
} from "./source-review";
import { listResearchSources, markResearchSourceReviewed } from "./sources";
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
	sourceReview?: {
		triageAndReviewSources?: typeof triageAndReviewSources;
		reviewer?: SourceReviewer;
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

	let sources = await (
		dependencies.sources?.listResearchSources ?? listResearchSources
	)({
		userId: jobRow.userId,
		jobId: jobRow.id,
	});
	const alreadyReviewedCount = sources.filter(
		(source) => source.reviewedAt,
	).length;
	const reviewLimit = Math.max(
		0,
		(approvedPlan as ResearchPlan).researchBudget.sourceReviewCeiling -
			alreadyReviewedCount,
	);
	const reviewWarnings: string[] = [];
	if (reviewLimit > 0) {
		try {
			await (
				dependencies.sourceReview?.triageAndReviewSources ??
				triageAndReviewSources
			)(
				{
					jobId: jobRow.id,
					discoveredSources: sources
						.filter((source) => !source.reviewedAt)
						.map((source) => ({
							id: source.id,
							url: source.url,
							title: source.title ?? source.url,
							snippet: source.snippet,
						})),
					reviewLimit,
				},
				{
					reviewer:
						dependencies.sourceReview?.reviewer ?? defaultSourceReviewer,
					repository: {
						saveReviewedSourceNotes: async (notes) => {
							const reviewedSource = await markResearchSourceReviewed({
								userId: jobRow.userId,
								sourceId: notes.discoveredSourceId,
								reviewedAt: now,
								reviewedNote:
									notes.keyFindings[0] ?? notes.summary ?? notes.extractedText,
							});

							return {
								...notes,
								id: reviewedSource.id,
								createdAt: reviewedSource.reviewedAt ?? now.toISOString(),
							};
						},
					},
				},
			);
		} catch (error) {
			reviewWarnings.push(
				`Source review could not complete: ${getErrorMessage(error)}`,
			);
		}
		sources = await (
			dependencies.sources?.listResearchSources ?? listResearchSources
		)({
			userId: jobRow.userId,
			jobId: jobRow.id,
		});
	}
	const reviewedSources = sources.filter((source) => source.reviewedAt);
	if (reviewWarnings.length > 0) {
		await saveResearchTimelineEvent({
			jobId: jobRow.id,
			conversationId: jobRow.conversationId,
			userId: jobRow.userId,
			taskId: null,
			stage: "source_review",
			kind: "warning",
			occurredAt: now.toISOString(),
			messageKey: "deepResearch.timeline.sourceReviewWarning",
			messageParams: {
				discoveredSources: sources.length,
				reviewedSources: reviewedSources.length,
			},
			sourceCounts: {
				discovered: sources.length,
				reviewed: reviewedSources.length,
				cited: sources.filter((source) => source.citedAt).length,
			},
			assumptions: [],
			warnings: reviewWarnings,
			summary: reviewWarnings[0],
		});
	}
	await saveResearchTimelineEvent({
		jobId: jobRow.id,
		conversationId: jobRow.conversationId,
		userId: jobRow.userId,
		taskId: null,
		stage: "source_review",
		kind: "stage_completed",
		occurredAt: now.toISOString(),
		messageKey: "deepResearch.timeline.sourceReviewCompleted",
		messageParams: {
			discoveredSources: sources.length,
			reviewedSources: reviewedSources.length,
		},
		sourceCounts: {
			discovered: sources.length,
			reviewed: reviewedSources.length,
			cited: sources.filter((source) => source.citedAt).length,
		},
		assumptions: [],
		warnings: [],
		summary: `Source review completed for ${reviewedSources.length} reviewed source${reviewedSources.length === 1 ? "" : "s"}.`,
	});
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

const defaultSourceReviewer: SourceReviewer = {
	async reviewSource(source) {
		const summary = source.snippet?.trim() || source.title.trim();
		return {
			summary,
			keyFindings: [summary],
			extractedText: source.snippet ?? null,
		};
	},
};

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : "unknown error";
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
