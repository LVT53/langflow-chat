import { and, eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { deepResearchJobs } from "$lib/server/db/schema";
import type {
	DeepResearchJob,
	DeepResearchSource,
	DeepResearchTask,
	DeepResearchTaskOutput,
} from "$lib/types";
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
import {
	buildSynthesisNotes,
	type CompletedResearchTaskOutput,
	type ResearchSourceReference,
} from "./synthesis";
import {
	claimResearchTasks,
	completeResearchTask,
	createResearchTasksFromCoverageGaps,
	evaluateResearchPassBarrier,
	listResearchTasks,
	recordResearchTaskFailure,
} from "./tasks";
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
		createResearchTasksFromCoverageGaps?: typeof createResearchTasksFromCoverageGaps;
		listResearchTasks?: typeof listResearchTasks;
		claimResearchTasks?: typeof claimResearchTasks;
		completeResearchTask?: typeof completeResearchTask;
		recordResearchTaskFailure?: typeof recordResearchTaskFailure;
		evaluateResearchPassBarrier?: typeof evaluateResearchPassBarrier;
		executor?: ResearchTaskExecutor;
	};
};

export type ResearchTaskExecutorInput = {
	job: DeepResearchJob;
	approvedPlan: ResearchPlan;
	task: DeepResearchTask;
	reviewedSources: DeepResearchSource[];
	allSources: DeepResearchSource[];
	now: Date;
};

export type ResearchTaskExecutor = (
	input: ResearchTaskExecutorInput,
) => Promise<DeepResearchTaskOutput>;

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
	if (jobRow.status === "running" && jobRow.stage === "research_tasks") {
		return runResearchTasksStep(jobRow, now, dependencies);
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

async function runResearchTasksStep(
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

	const listTasks =
		dependencies.tasks?.listResearchTasks ?? listResearchTasks;
	const allTasks = await listTasks({
		userId: jobRow.userId,
		jobId: jobRow.id,
	});
	const passNumber = currentResearchPassNumber(allTasks);
	const passTasks = allTasks.filter((task) => task.passNumber === passNumber);
	const pendingRequiredTasks = passTasks.filter(
		(task) => task.required && task.status === "pending",
	);
	const sources = await (
		dependencies.sources?.listResearchSources ?? listResearchSources
	)({
		userId: jobRow.userId,
		jobId: jobRow.id,
	});
	const reviewedSources = sources.filter((source) => source.reviewedAt);

	if (pendingRequiredTasks.length > 0) {
		const claimedTasks = await (
			dependencies.tasks?.claimResearchTasks ?? claimResearchTasks
		)({
			userId: jobRow.userId,
			jobId: jobRow.id,
			passNumber,
			limit: pendingRequiredTasks.length,
			claimToken: `workflow:${jobRow.id}:${passNumber}`,
			now,
		});
		const executor =
			dependencies.tasks?.executor ?? defaultResearchTaskExecutor;

		for (const task of claimedTasks) {
			try {
				const output = await executor({
					job,
					approvedPlan: approvedPlan as ResearchPlan,
					task,
					reviewedSources,
					allSources: sources,
					now,
				});
				await (
					dependencies.tasks?.completeResearchTask ?? completeResearchTask
				)({
					userId: jobRow.userId,
					taskId: task.id,
					output,
					now,
				});
			} catch (error) {
				await (
					dependencies.tasks?.recordResearchTaskFailure ??
					recordResearchTaskFailure
				)({
					userId: jobRow.userId,
					taskId: task.id,
					failureKind: "permanent",
					failureReason: getErrorMessage(error),
					now,
				});
			}
		}
	}

	const barrier = await (
		dependencies.tasks?.evaluateResearchPassBarrier ??
		evaluateResearchPassBarrier
	)({
		userId: jobRow.userId,
		jobId: jobRow.id,
		passNumber,
	});

	if (!barrier.open) {
		const reloaded = await reloadWorkflowJob(
			jobRow.userId,
			jobRow.conversationId,
			jobRow.id,
		);
		return reloaded
			? { job: reloaded, advanced: false, outcome: "not_eligible" }
			: null;
	}

	const completedPassTasks = await listTasks({
		userId: jobRow.userId,
		jobId: jobRow.id,
		passNumber,
	});
	const completedTasks = completedPassTasks.filter(
		(task) => task.status === "completed" && task.output,
	);
	const taskLimitations = completedPassTasks
		.filter(
			(task) =>
				task.required &&
				(task.status === "skipped" ||
					(task.status === "failed" && !task.critical)),
		)
		.map(formatResearchTaskLimitation);

	await saveResearchTimelineEvent({
		jobId: jobRow.id,
		conversationId: jobRow.conversationId,
		userId: jobRow.userId,
		taskId: null,
		stage: "research_tasks",
		kind: "stage_completed",
		occurredAt: now.toISOString(),
		messageKey: "deepResearch.timeline.researchTasksCompleted",
		messageParams: {
			passNumber,
			completedTasks: completedTasks.length,
			limitedTasks: taskLimitations.length,
		},
		sourceCounts: {
			discovered: sources.length,
			reviewed: reviewedSources.length,
			cited: sources.filter((source) => source.citedAt).length,
		},
		assumptions: [],
		warnings: taskLimitations,
		summary: `Research task pass ${passNumber} completed with ${completedTasks.length} completed task${completedTasks.length === 1 ? "" : "s"}.`,
	});

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
				eq(deepResearchJobs.stage, "research_tasks"),
			),
		);

	const sourceRefsById = buildResearchSourceReferenceMap(reviewedSources);
	const synthesisNotes = await (
		dependencies.synthesis?.buildSynthesisNotes ?? buildSynthesisNotes
	)({
		jobId: jobRow.id,
		reviewedSources: reviewedSources.map(mapReviewedSourceForSynthesis),
		completedTasks: completedTasks.map((task) =>
			mapCompletedResearchTaskForSynthesis(task, sourceRefsById),
		),
	});
	const completedJob = await (
		dependencies.reportCompletion?.completeDeepResearchJobWithAuditedReport ??
		completeDeepResearchJobWithAuditedReport
	)({
		userId: jobRow.userId,
		jobId: jobRow.id,
		synthesisNotes,
		limitations: taskLimitations,
		now,
	});
	if (!completedJob) return null;
	return {
		job: completedJob,
		advanced: true,
		outcome: "report_completed",
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

const defaultResearchTaskExecutor: ResearchTaskExecutor = async ({
	task,
	reviewedSources,
}) => {
	const assignment = task.assignment.trim();
	const focus = task.keyQuestion?.trim();
	const sourceIds = reviewedSources.map((source) => source.id);
	const findings =
		reviewedSources.length > 0
			? reviewedSources.map(
					(source) =>
						source.reviewedNote ??
						source.snippet ??
						source.title ??
						source.url,
				)
			: [assignment];

	return {
		summary: focus ? `${focus}: ${assignment}` : assignment,
		findings,
		sourceIds,
	};
};

function currentResearchPassNumber(tasks: DeepResearchTask[]): number {
	if (tasks.length === 0) return 1;
	return Math.max(...tasks.map((task) => task.passNumber));
}

function buildResearchSourceReferenceMap(
	sources: DeepResearchSource[],
): Map<string, ResearchSourceReference> {
	return new Map(
		sources.map((source) => [
			source.id,
			{
				reviewedSourceId: source.id,
				discoveredSourceId: source.id,
				canonicalUrl: source.url,
				title: source.title ?? source.url,
			},
		]),
	);
}

function mapCompletedResearchTaskForSynthesis(
	task: DeepResearchTask,
	sourceRefsById: Map<string, ResearchSourceReference>,
): CompletedResearchTaskOutput {
	const output = task.output;
	const sourceRefs = (output?.sourceIds ?? [])
		.map((sourceId) => sourceRefsById.get(sourceId))
		.filter((sourceRef) => sourceRef !== undefined);
	const findings = output?.findings?.filter(Boolean) ?? [];
	const taskOutput =
		output?.summary ??
		findings[0] ??
		task.keyQuestion ??
		task.assignment;

	return {
		id: task.id,
		output: [taskOutput, ...findings].join(" "),
		supportLevel: sourceRefs.length > 0 ? "strong" : "missing",
		sourceRefs,
	};
}

function formatResearchTaskLimitation(task: DeepResearchTask): string {
	const label = task.keyQuestion ?? task.assignment;
	if (task.status === "skipped") {
		return `Research Task skipped: ${label}${
			task.failureReason ? ` (${task.failureReason})` : ""
		}`;
	}
	return `Research Task failed: ${label}${
		task.failureReason ? ` (${task.failureReason})` : ""
	}`;
}

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
