import { and, eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { deepResearchJobs } from "$lib/server/db/schema";
import { getConfig } from "$lib/server/config-store";
import type {
	DeepResearchJob,
	DeepResearchSource,
	DeepResearchTask,
	DeepResearchTaskOutput,
} from "$lib/types";
import { assessResearchCoverage } from "./coverage";
import { runPublicWebDiscoveryPass } from "./discovery";
import {
	completeDeepResearchJobWithEvidenceLimitationMemo,
	completeDeepResearchJobWithAuditedReport,
	listConversationDeepResearchJobs,
} from "./index";
import type { ResearchPlan } from "./planning";
import {
	isSourceTopicRelevantToPlan,
	type PersistedReviewedResearchSourceNotes,
	type SourceReviewer,
	triageAndReviewSources,
} from "./source-review";
import {
	listResearchSources,
	markResearchSourceRejected,
	markResearchSourceReviewed,
} from "./sources";
import {
	buildSynthesisNotes,
	type CompletedResearchTaskOutput,
	type ResearchSourceReference,
} from "./synthesis";
import {
	buildSynthesisNotesWithLlm,
	executeResearchTaskWithLlm,
	reviewSourceWithLlm,
} from "./llm-steps";
import {
	buildSourceReviewEvidenceNotes,
	listDeepResearchEvidenceNotes,
} from "./evidence-notes";
import {
	listDeepResearchSynthesisClaims,
	saveDeepResearchSynthesisClaimsFromNotes,
} from "./synthesis-claims";
import {
	completeResearchPassCheckpoint,
	listResearchCoverageGaps,
	listResearchPassCheckpoints,
	resolveResearchCoverageGaps,
	saveCoverageGapsForPass,
	upsertResearchPassCheckpoint,
} from "./pass-state";
import {
	claimResearchTasks,
	completeResearchTask,
	createResearchTasksFromCoverageGaps,
	evaluateResearchPassBarrier,
	listResearchTasks,
	recordResearchTaskFailure,
	recoverExpiredResearchTasks,
} from "./tasks";
import {
	saveResearchTimelineEvent,
	saveResearchTimelineEventOnce,
} from "./timeline";
import {
	completeResearchResumePoint,
	getResearchResumePoint,
	upsertResearchResumePoint,
} from "./resume-points";
import type { ResearchCoverageAssessment, CoverageGap } from "./coverage";
import type {
	DeepResearchPassCheckpoint,
	DeepResearchPassDecision,
} from "$lib/types";

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
		completeDeepResearchJobWithEvidenceLimitationMemo?: typeof completeDeepResearchJobWithEvidenceLimitationMemo;
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
	if (
		jobRow.status === "running" &&
		["synthesis", "citation_audit", "report_assembly"].includes(
			jobRow.stage ?? "",
		)
	) {
		return runSynthesisResumeStep(jobRow, now, dependencies);
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
	let allTasks = await listTasks({
		userId: jobRow.userId,
		jobId: jobRow.id,
	});
	const passNumber = currentResearchPassNumber(allTasks);
	const passResumeKey = `pass:${jobRow.id}:${passNumber}:research_tasks`;
	await upsertResearchResumePoint({
		userId: jobRow.userId,
		jobId: jobRow.id,
		conversationId: jobRow.conversationId,
		boundary: "running_pass",
		resumeKey: passResumeKey,
		stage: "research_tasks",
		passNumber,
		payload: { taskCount: allTasks.length },
		now,
	});
	const workflowClaimToken = `workflow:${jobRow.id}:${passNumber}`;
	await recoverExpiredResearchTasks({
		userId: jobRow.userId,
		jobId: jobRow.id,
		passNumber,
		claimToken: workflowClaimToken,
		expiredBefore: new Date(now.getTime() - 30 * 60_000),
		now,
	});
	allTasks = await listTasks({
		userId: jobRow.userId,
		jobId: jobRow.id,
	});
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

	const workflowRunningTasks = passTasks.filter(
		(task) => task.status === "running" && task.claimToken === workflowClaimToken,
	);
	const claimLimit = Math.max(
		0,
		Math.min(
			pendingRequiredTasks.length,
			modelReasoningConcurrencyLimit(approvedPlan as ResearchPlan) -
				workflowRunningTasks.length,
		),
	);
	let claimedTasks: DeepResearchTask[] = [];
	if (claimLimit > 0) {
		claimedTasks = await (
			dependencies.tasks?.claimResearchTasks ?? claimResearchTasks
		)({
			userId: jobRow.userId,
			jobId: jobRow.id,
			passNumber,
			limit: claimLimit,
			claimToken: workflowClaimToken,
			now,
		});
	}
	const executor =
		dependencies.tasks?.executor ?? defaultResearchTaskExecutor(jobRow.userId);

	const tasksToExecute = dedupeTasksById([
		...workflowRunningTasks,
		...claimedTasks,
	]);

	for (const task of tasksToExecute) {
		const taskResumeKey = `task:${task.id}`;
		await upsertResearchResumePoint({
			userId: jobRow.userId,
			jobId: jobRow.id,
			conversationId: jobRow.conversationId,
			boundary: "research_task",
			resumeKey: taskResumeKey,
			stage: "research_tasks",
			passNumber,
			taskId: task.id,
			payload: {
				assignmentType: task.assignmentType,
				coverageGapId: task.coverageGapId,
			},
			now,
		});
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
			await completeResearchResumePoint({
				userId: jobRow.userId,
				jobId: jobRow.id,
				resumeKey: taskResumeKey,
				result: {
					sourceIds: output.sourceIds ?? [],
				},
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
			await completeResearchResumePoint({
				userId: jobRow.userId,
				jobId: jobRow.id,
				resumeKey: taskResumeKey,
				status: "failed",
				result: {
					error: getErrorMessage(error),
				},
				now,
			});
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

	await persistResearchTaskPassDecision({
		jobRow,
		passNumber,
		completedPassTasks,
		completedTasks,
		taskLimitations,
		reviewedSources,
		sources,
		now,
	});
	await completeResearchResumePoint({
		userId: jobRow.userId,
		jobId: jobRow.id,
		resumeKey: passResumeKey,
		result: {
			nextDecision: "synthesize_report",
			completedTasks: completedTasks.length,
			limitedTasks: taskLimitations.length,
		},
		now,
	});

	await saveResearchTimelineEventOnce({
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
	const synthesisInput = {
		jobId: jobRow.id,
		reviewedSources: reviewedSources.map(mapReviewedSourceForSynthesis),
		completedTasks: completedTasks.map((task) =>
			mapCompletedResearchTaskForSynthesis(task, sourceRefsById),
		),
	};
	const synthesisNotes = await buildSynthesisNotesWithResumePoint({
		jobRow,
		passNumber,
		now,
		synthesisInput,
		dependencies,
	});
	const eligibilityResult = await assessReportEligibilityAfterSynthesis({
		jobRow,
		approvedPlan: approvedPlan as ResearchPlan,
		passNumber,
		reviewedSources,
		allSources: sources,
		taskLimitations,
		now,
		dependencies,
	});
	if (eligibilityResult) return eligibilityResult;
	const minimumPassContinuation =
		await createMinimumPassExpectationContinuationIfNeeded({
			jobRow,
			approvedPlan: approvedPlan as ResearchPlan,
			currentPassNumber: passNumber,
			reviewedSources,
			sources,
			now,
			dependencies,
		});
	if (minimumPassContinuation) return minimumPassContinuation;
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

async function runSynthesisResumeStep(
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

	const allTasks = await (dependencies.tasks?.listResearchTasks ?? listResearchTasks)({
		userId: jobRow.userId,
		jobId: jobRow.id,
	});
	const passNumber = currentResearchPassNumber(allTasks);
	const completedPassTasks = allTasks.filter(
		(task) => task.passNumber === passNumber,
	);
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
	const sources = await (
		dependencies.sources?.listResearchSources ?? listResearchSources
	)({
		userId: jobRow.userId,
		jobId: jobRow.id,
	});
	const reviewedSources = sources.filter((source) => source.reviewedAt);
	const synthesisResumeKey = `synthesis:${jobRow.id}:${passNumber}`;
	const existingSynthesis = await getResearchResumePoint({
		userId: jobRow.userId,
		jobId: jobRow.id,
		resumeKey: synthesisResumeKey,
	});
	await upsertResearchResumePoint({
		userId: jobRow.userId,
		jobId: jobRow.id,
		conversationId: jobRow.conversationId,
		boundary: "synthesis",
		resumeKey: synthesisResumeKey,
		stage: "synthesis",
		passNumber,
		payload: {
			reviewedSources: reviewedSources.length,
			completedTasks: completedTasks.length,
		},
		now,
	});
	const sourceRefsById = buildResearchSourceReferenceMap(reviewedSources);
	const synthesisInput = {
		jobId: jobRow.id,
		reviewedSources: reviewedSources.map(mapReviewedSourceForSynthesis),
		completedTasks: completedTasks.map((task) =>
			mapCompletedResearchTaskForSynthesis(task, sourceRefsById),
		),
	};
	const synthesisNotes =
		existingSynthesis?.status === "completed" && existingSynthesis.result?.synthesisNotes
			? (existingSynthesis.result.synthesisNotes as Awaited<
					ReturnType<typeof buildSynthesisNotes>
				>)
			: dependencies.synthesis?.buildSynthesisNotes
				? await dependencies.synthesis.buildSynthesisNotes(synthesisInput)
				: await buildSynthesisNotesWithLlm({
						context: {
							jobId: jobRow.id,
							conversationId: jobRow.conversationId,
							userId: jobRow.userId,
							now,
						},
						reviewedSources: synthesisInput.reviewedSources,
						completedTasks: synthesisInput.completedTasks,
					});
	await persistSynthesisClaimsForPass({
		jobRow,
		passNumber,
		synthesisPass: synthesisResumeKey,
		synthesisNotes,
		now,
	});
	await completeResearchResumePoint({
		userId: jobRow.userId,
		jobId: jobRow.id,
		resumeKey: synthesisResumeKey,
		result: {
			synthesisNotes,
		},
		now,
	});
	const eligibilityResult = await assessReportEligibilityAfterSynthesis({
		jobRow,
		approvedPlan: approvedPlan as ResearchPlan,
		passNumber,
		reviewedSources,
		allSources: sources,
		taskLimitations,
		now,
		dependencies,
	});
	if (eligibilityResult) return eligibilityResult;
	const minimumPassContinuation =
		await createMinimumPassExpectationContinuationIfNeeded({
			jobRow,
			approvedPlan: approvedPlan as ResearchPlan,
			currentPassNumber: passNumber,
			reviewedSources,
			sources,
			now,
			dependencies,
		});
	if (minimumPassContinuation) return minimumPassContinuation;
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

async function assessReportEligibilityAfterSynthesis(input: {
	jobRow: typeof deepResearchJobs.$inferSelect;
	approvedPlan: ResearchPlan;
	passNumber: number;
	reviewedSources: DeepResearchSource[];
	allSources: DeepResearchSource[];
	taskLimitations: string[];
	now: Date;
	dependencies: DeepResearchWorkflowDependencies;
}): Promise<RunDeepResearchWorkflowStepResult | null> {
	const [evidenceNotes, synthesisClaims] = await Promise.all([
		listDeepResearchEvidenceNotes({
			userId: input.jobRow.userId,
			jobId: input.jobRow.id,
		}),
		listDeepResearchSynthesisClaims({
			userId: input.jobRow.userId,
			jobId: input.jobRow.id,
		}),
	]);
	if (evidenceNotes.length === 0) return null;
	if (!hasReportBlockingClaimReadinessIssue(synthesisClaims)) return null;
	const coverageAssessment = (
		input.dependencies.coverage?.assessResearchCoverage ??
		assessResearchCoverage
	)({
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		plan: input.approvedPlan,
		reviewedSources: input.reviewedSources.map((source) =>
			mapReviewedSourceForCoverage(source, input.approvedPlan),
		),
		evidenceNotes,
		synthesisClaims,
		signals: {
			freshnessRequired: false,
		},
		remainingBudget: {
			sourceReviews: Math.max(
				0,
				input.approvedPlan.researchBudget.sourceReviewCeiling -
					input.reviewedSources.length,
			),
			synthesisPasses: Math.max(
				0,
				meaningfulPassCeiling(input.approvedPlan) -
					(await countCompletedMeaningfulResearchPasses({
						userId: input.jobRow.userId,
						jobId: input.jobRow.id,
					})),
			),
		},
	});
	if (coverageAssessment.status === "sufficient") return null;

	await saveResearchTimelineEvent({
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		userId: input.jobRow.userId,
		taskId: null,
		...coverageAssessment.timelineSummary,
		occurredAt: input.now.toISOString(),
	});

	if (!coverageAssessment.canContinue) {
		return completeCoverageExhaustedWithEvidenceLimitationMemo({
			jobRow: input.jobRow,
			now: input.now,
			limitations: [
				...input.taskLimitations,
				...coverageAssessment.reportLimitations.map(
					(limitation) => limitation.limitation,
				),
			],
			sourceCounts: sourceCountsFromResearchSources(input.allSources),
			dependencies: input.dependencies,
		});
	}

	const repairPassNumber = input.passNumber + 1;
	const checkpoint = await upsertResearchPassCheckpoint({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		passNumber: repairPassNumber,
		searchIntent: `Report eligibility repair for pass ${input.passNumber} Claim Readiness gaps`,
		reviewedSourceIds: input.reviewedSources.map((source) => source.id),
		coverageResult: {
			status: coverageAssessment.status,
			canContinue: coverageAssessment.canContinue,
			reviewedSourceCount: input.reviewedSources.length,
			reportLimitationCount: coverageAssessment.reportLimitations.length,
		},
		now: input.now,
	});
	const persistedGaps = await saveCoverageGapsForPass({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		passCheckpointId: checkpoint.id,
		gaps: coverageAssessment.coverageGaps.map((gap) => ({
			keyQuestion: gap.keyQuestion,
			reason: gap.reason,
			reviewedSourceCount: gap.reviewedSourceCount,
			severity: coverageGapSeverity(gap),
			recommendedNextAction: gap.recommendedNextAction,
			detail: gap.detail,
		})),
		now: input.now,
	});
	const decisionSummary = sourceReviewDecisionSummary({
		nextDecision: "continue_research",
		gapCount: persistedGaps.length,
		limitationCount: coverageAssessment.reportLimitations.length,
	});
	await completeResearchPassCheckpoint({
		userId: input.jobRow.userId,
		checkpointId: checkpoint.id,
		coverageGapIds: persistedGaps.map((gap) => gap.id),
		nextDecision: "continue_research",
		decisionSummary,
		now: input.now,
	});
	await saveResearchPassDecisionTimeline({
		jobRow: input.jobRow,
		stage: "coverage_assessment",
		passNumber: repairPassNumber,
		nextDecision: "continue_research",
		decisionSummary,
		sourceCounts: sourceCountsFromResearchSources(input.allSources),
		now: input.now,
	});
	await (
		input.dependencies.tasks?.createResearchTasksFromCoverageGaps ??
		createResearchTasksFromCoverageGaps
	)({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		passNumber: repairPassNumber,
		gaps: persistedGaps.map((gap) => ({
			id: gap.id,
			keyQuestion: gap.keyQuestion,
			summary: gap.recommendedNextAction,
			severity: gap.severity,
		})),
		now: input.now,
	});
	await db
		.update(deepResearchJobs)
		.set({
			status: "running",
			stage: "research_tasks",
			updatedAt: input.now,
		})
		.where(
			and(
				eq(deepResearchJobs.id, input.jobRow.id),
				eq(deepResearchJobs.userId, input.jobRow.userId),
				eq(deepResearchJobs.status, "running"),
			),
		);
	const reloaded = await reloadWorkflowJob(
		input.jobRow.userId,
		input.jobRow.conversationId,
		input.jobRow.id,
	);
	return reloaded
		? {
				job: reloaded,
				advanced: true,
				outcome: "coverage_continuation_created",
			}
		: null;
}

function hasReportBlockingClaimReadinessIssue(
	synthesisClaims: Awaited<ReturnType<typeof listDeepResearchSynthesisClaims>>,
): boolean {
	return synthesisClaims.some(
		(claim) =>
			claim.central &&
			(((claim.status === "needs-repair" || claim.status === "rejected") &&
				claim.evidenceLinks.length > 0) ||
				claim.evidenceLinks.some(
					(link) => link.relation === "contradiction" && link.material,
				)),
	);
}

async function buildSynthesisNotesWithResumePoint(input: {
	jobRow: typeof deepResearchJobs.$inferSelect;
	passNumber: number;
	now: Date;
	synthesisInput: {
		jobId: string;
		reviewedSources: ReturnType<typeof mapReviewedSourceForSynthesis>[];
		completedTasks: CompletedResearchTaskOutput[];
	};
	dependencies: DeepResearchWorkflowDependencies;
}): Promise<Awaited<ReturnType<typeof buildSynthesisNotes>>> {
	const synthesisResumeKey = `synthesis:${input.jobRow.id}:${input.passNumber}`;
	const existingSynthesis = await getResearchResumePoint({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		resumeKey: synthesisResumeKey,
	});
	await upsertResearchResumePoint({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		boundary: "synthesis",
		resumeKey: synthesisResumeKey,
		stage: "synthesis",
		passNumber: input.passNumber,
		payload: {
			reviewedSources: input.synthesisInput.reviewedSources.length,
			completedTasks: input.synthesisInput.completedTasks.length,
		},
		now: input.now,
	});
	if (
		existingSynthesis?.status === "completed" &&
		existingSynthesis.result?.synthesisNotes
	) {
		const synthesisNotes = existingSynthesis.result.synthesisNotes as Awaited<
			ReturnType<typeof buildSynthesisNotes>
		>;
		await persistSynthesisClaimsForPass({
			jobRow: input.jobRow,
			passNumber: input.passNumber,
			synthesisPass: synthesisResumeKey,
			synthesisNotes,
			now: input.now,
		});
		return synthesisNotes;
	}
	const synthesisNotes = input.dependencies.synthesis?.buildSynthesisNotes
		? await input.dependencies.synthesis.buildSynthesisNotes(input.synthesisInput)
		: await buildSynthesisNotesWithLlm({
				context: {
					jobId: input.jobRow.id,
					conversationId: input.jobRow.conversationId,
					userId: input.jobRow.userId,
					now: input.now,
				},
				reviewedSources: input.synthesisInput.reviewedSources,
				completedTasks: input.synthesisInput.completedTasks,
			});
	await persistSynthesisClaimsForPass({
		jobRow: input.jobRow,
		passNumber: input.passNumber,
		synthesisPass: synthesisResumeKey,
		synthesisNotes,
		now: input.now,
	});
	await completeResearchResumePoint({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		resumeKey: synthesisResumeKey,
		result: { synthesisNotes },
		now: input.now,
	});
	return synthesisNotes;
}

async function persistSynthesisClaimsForPass(input: {
	jobRow: typeof deepResearchJobs.$inferSelect;
	passNumber: number;
	synthesisPass: string;
	synthesisNotes: Awaited<ReturnType<typeof buildSynthesisNotes>>;
	now: Date;
}): Promise<void> {
	const [passCheckpoints, evidenceNotes] = await Promise.all([
		listResearchPassCheckpoints({
			userId: input.jobRow.userId,
			jobId: input.jobRow.id,
		}),
		listDeepResearchEvidenceNotes({
			userId: input.jobRow.userId,
			jobId: input.jobRow.id,
		}),
	]);
	const checkpoint = passCheckpoints.find(
		(passCheckpoint) => passCheckpoint.passNumber === input.passNumber,
	);
	await saveDeepResearchSynthesisClaimsFromNotes({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		passCheckpointId: checkpoint?.id ?? null,
		synthesisPass: input.synthesisPass,
		synthesisNotes: input.synthesisNotes,
		evidenceNotes,
		now: input.now,
	});
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
	const passResumeKey = `pass:${jobRow.id}:1:source_review`;
	await upsertResearchResumePoint({
		userId: jobRow.userId,
		jobId: jobRow.id,
		conversationId: jobRow.conversationId,
		boundary: "running_pass",
		resumeKey: passResumeKey,
		stage: "source_review",
		passNumber: 1,
		payload: {
			planVersion: job.currentPlan?.version ?? null,
		},
		now,
	});
	const existingPassDecision = await getTerminalPassDecision({
		userId: jobRow.userId,
		jobId: jobRow.id,
		passNumber: 1,
	});
	if (existingPassDecision) {
		await completeResearchResumePoint({
			userId: jobRow.userId,
			jobId: jobRow.id,
			resumeKey: passResumeKey,
			result: {
				nextDecision: existingPassDecision.nextDecision,
			},
			now,
		});
		return resumeFromTerminalSourceReviewPass({
			jobRow,
			checkpoint: existingPassDecision,
			now,
			dependencies,
		});
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
		const sourceReviewCheckpoint = await upsertResearchPassCheckpoint({
			userId: jobRow.userId,
			jobId: jobRow.id,
			conversationId: jobRow.conversationId,
			passNumber: 1,
			searchIntent: "Initial approved-plan source review",
			reviewedSourceIds: sources
				.filter((source) => source.reviewedAt)
				.map((source) => source.id),
			now,
		});
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
							sourceText: source.sourceText,
							intendedComparedEntity: source.intendedComparedEntity,
							intendedComparisonAxis: source.intendedComparisonAxis,
						})),
					reviewLimit,
					sourceProcessingConcurrency:
						(approvedPlan as ResearchPlan).researchBudget
							.sourceProcessingConcurrency,
					planGoal: (approvedPlan as ResearchPlan).goal,
					keyQuestions: (approvedPlan as ResearchPlan).keyQuestions,
				},
				{
					reviewer:
						dependencies.sourceReview?.reviewer ??
						buildDefaultSourceReviewer({
							jobRow,
							now,
							keyQuestions: (approvedPlan as ResearchPlan).keyQuestions,
						}),
					repository: {
						saveReviewedSourceNotes: async (notes) => {
							const reviewedSource = notes.rejectedReason
								? await markResearchSourceRejected({
										userId: jobRow.userId,
										sourceId: notes.discoveredSourceId,
										rejectedAt: now,
										rejectedReason: notes.rejectedReason,
										relevanceScore: notes.relevanceScore,
										topicRelevant: notes.topicRelevant,
										topicRelevanceReason: notes.topicRelevanceReason,
										supportedKeyQuestions: notes.supportedKeyQuestions,
										comparedEntity: notes.comparedEntity,
										comparisonAxis: notes.comparisonAxis,
										extractedClaims: notes.extractedClaims,
										sourceQualitySignals: notes.sourceQualitySignals,
										openedContentLength: notes.openedContentLength,
									})
								: await markResearchSourceReviewed({
										userId: jobRow.userId,
										sourceId: notes.discoveredSourceId,
										reviewedAt: now,
										reviewedNote:
											notes.keyFindings[0] ?? notes.summary ?? notes.extractedText,
										relevanceScore: notes.relevanceScore,
										topicRelevant: notes.topicRelevant,
										topicRelevanceReason: notes.topicRelevanceReason,
										supportedKeyQuestions: notes.supportedKeyQuestions,
										comparedEntity: notes.comparedEntity,
										comparisonAxis: notes.comparisonAxis,
										extractedClaims: notes.extractedClaims,
										sourceQualitySignals: notes.sourceQualitySignals,
										openedContentLength: notes.openedContentLength,
									});

							if (!notes.rejectedReason) {
								await buildSourceReviewEvidenceNotes({
									userId: jobRow.userId,
									jobId: jobRow.id,
									conversationId: jobRow.conversationId,
									passCheckpointId: sourceReviewCheckpoint.id,
									sourceId: reviewedSource.id,
									title: reviewedSource.title ?? notes.title,
									url: reviewedSource.url,
									summary: notes.summary,
									keyFindings:
										notes.extractedClaims.length > 0
											? notes.extractedClaims
											: notes.keyFindings,
									extractedText: notes.extractedText,
									supportedKeyQuestions: notes.supportedKeyQuestions,
									comparedEntity: notes.comparedEntity,
									comparisonAxis: notes.comparisonAxis,
									sourceQualitySignals: notes.sourceQualitySignals,
									now,
								});
							}

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
	await saveResearchTimelineEventOnce({
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
			synthesisPasses: Math.max(
				0,
				meaningfulPassCeiling(approvedPlan as ResearchPlan) - 1,
			),
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

	const passDecisionState = await persistSourceReviewPassDecision({
		jobRow,
		passNumber: 1,
		reviewedSources,
		sources,
		coverageAssessment,
		now,
	});
	await completeResearchResumePoint({
		userId: jobRow.userId,
		jobId: jobRow.id,
		resumeKey: passResumeKey,
		result: {
			nextDecision: passDecisionState.checkpoint.nextDecision,
			coverageGapIds: passDecisionState.gaps.map((gap) => gap.id),
		},
		now,
	});

	if (coverageAssessment.status !== "sufficient") {
		if (hasDeepResearchRuntimeExpired(jobRow, now)) {
			return completeCoverageExhaustedWithEvidenceLimitationMemo({
				jobRow,
				now,
				limitations: coverageAssessment.reportLimitations.map(
					(limitation) => limitation.limitation,
				),
				sourceCounts: sourceCountsFromResearchSources(sources),
				dependencies,
			});
		}
		if (coverageAssessment.canContinue) {
			await upsertResearchPassCheckpoint({
				userId: jobRow.userId,
				jobId: jobRow.id,
				conversationId: jobRow.conversationId,
				passNumber: 2,
				searchIntent: "Targeted follow-up for pass 1 Coverage Gaps",
				reviewedSourceIds: reviewedSources.map((source) => source.id),
				now,
			});
			await (
				dependencies.tasks?.createResearchTasksFromCoverageGaps ??
				createResearchTasksFromCoverageGaps
			)({
				userId: jobRow.userId,
				jobId: jobRow.id,
				conversationId: jobRow.conversationId,
				passNumber: 2,
				gaps: passDecisionState.gaps.map((gap) => ({
					id: gap.id,
					keyQuestion: gap.keyQuestion,
					summary: gap.recommendedNextAction,
					severity: gap.severity,
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
		if (reviewedSources.length === 0) {
			return completeCoverageExhaustedWithEvidenceLimitationMemo({
				jobRow,
				now,
				limitations: coverageAssessment.reportLimitations.map(
					(limitation) => limitation.limitation,
				),
				sourceCounts: {
					discovered: sources.length,
					reviewed: 0,
					cited: sources.filter((source) => source.citedAt).length,
				},
				dependencies,
			});
		}
		const completedMeaningfulPasses = await countCompletedMeaningfulResearchPasses({
			userId: jobRow.userId,
			jobId: jobRow.id,
		});
		if (completedMeaningfulPasses < meaningfulPassFloor(approvedPlan as ResearchPlan)) {
			return completeCoverageExhaustedWithEvidenceLimitationMemo({
				jobRow,
				now,
				limitations: [
					...coverageAssessment.reportLimitations.map(
						(limitation) => limitation.limitation,
					),
					`Minimum pass expectation was not satisfied: ${completedMeaningfulPasses} of ${meaningfulPassFloor(approvedPlan as ResearchPlan)} meaningful research passes completed.`,
				],
				sourceCounts: sourceCountsFromResearchSources(sources),
				dependencies,
			});
		}

		return completeSourceReviewReport({
			jobRow,
			now,
			reviewedSources,
			limitations: coverageAssessment.reportLimitations.map(
				(limitation) => limitation.limitation,
			),
			dependencies,
		});
	}

	const minimumPassContinuation =
		await createMinimumPassExpectationContinuationIfNeeded({
			jobRow,
			approvedPlan: approvedPlan as ResearchPlan,
			currentPassNumber: 1,
			reviewedSources,
			sources,
			now,
			dependencies,
		});
	if (minimumPassContinuation) return minimumPassContinuation;

	return completeSourceReviewReport({
		jobRow,
		now,
		reviewedSources,
		limitations: coverageAssessment.reportLimitations.map(
			(limitation) => limitation.limitation,
		),
		dependencies,
	});
}

async function createMinimumPassExpectationContinuationIfNeeded(input: {
	jobRow: typeof deepResearchJobs.$inferSelect;
	approvedPlan: ResearchPlan;
	currentPassNumber: number;
	reviewedSources: DeepResearchSource[];
	sources: DeepResearchSource[];
	now: Date;
	dependencies: DeepResearchWorkflowDependencies;
}): Promise<RunDeepResearchWorkflowStepResult | null> {
	const completedMeaningfulPasses = await countCompletedMeaningfulResearchPasses({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
	});
	const passFloor = meaningfulPassFloor(input.approvedPlan);
	if (completedMeaningfulPasses >= passFloor) return null;
	if (completedMeaningfulPasses >= meaningfulPassCeiling(input.approvedPlan)) {
		return completeCoverageExhaustedWithEvidenceLimitationMemo({
			jobRow: input.jobRow,
			now: input.now,
			limitations: [
				`Minimum pass expectation was not satisfied: ${completedMeaningfulPasses} of ${passFloor} meaningful research passes completed.`,
			],
			sourceCounts: sourceCountsFromResearchSources(input.sources),
			dependencies: input.dependencies,
		});
	}

	const nextPassNumber = input.currentPassNumber + 1;
	const checkpoint = await upsertResearchPassCheckpoint({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		passNumber: nextPassNumber,
		searchIntent: `Minimum pass expectation follow-up after pass ${input.currentPassNumber}`,
		reviewedSourceIds: input.reviewedSources.map((source) => source.id),
		coverageResult: {
			status: "minimum_pass_expectation_unmet",
			completedMeaningfulPasses,
			requiredMeaningfulPasses: passFloor,
		},
		now: input.now,
	});
	const persistedGaps = await saveCoverageGapsForPass({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		passCheckpointId: checkpoint.id,
		gaps: input.approvedPlan.keyQuestions.map((keyQuestion) => ({
			keyQuestion,
			reason: "insufficient_supported_claims",
			reviewedSourceCount: input.reviewedSources.length,
			severity: "important",
			recommendedNextAction: `Run another meaningful research pass before report publication: ${keyQuestion}`,
			detail: `${completedMeaningfulPasses} of ${passFloor} required meaningful research passes are complete.`,
		})),
		now: input.now,
	});
	await saveResearchPassDecisionTimeline({
		jobRow: input.jobRow,
		stage: "coverage_assessment",
		passNumber: input.currentPassNumber,
		nextDecision: "continue_research",
		decisionSummary: `Continue research because ${completedMeaningfulPasses} of ${passFloor} minimum meaningful passes are complete.`,
		sourceCounts: sourceCountsFromResearchSources(input.sources),
		now: input.now,
	});
	await (
		input.dependencies.tasks?.createResearchTasksFromCoverageGaps ??
		createResearchTasksFromCoverageGaps
	)({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		passNumber: nextPassNumber,
		gaps: persistedGaps.map((gap) => ({
			id: gap.id,
			keyQuestion: gap.keyQuestion,
			summary: gap.recommendedNextAction,
			severity: gap.severity,
		})),
		now: input.now,
	});
	await db
		.update(deepResearchJobs)
		.set({
			status: "running",
			stage: "research_tasks",
			updatedAt: input.now,
		})
		.where(
			and(
				eq(deepResearchJobs.id, input.jobRow.id),
				eq(deepResearchJobs.userId, input.jobRow.userId),
				eq(deepResearchJobs.status, "running"),
			),
		);
	const reloaded = await reloadWorkflowJob(
		input.jobRow.userId,
		input.jobRow.conversationId,
		input.jobRow.id,
	);
	return reloaded
		? {
				job: reloaded,
				advanced: true,
				outcome: "coverage_continuation_created",
			}
		: null;
}

async function completeSourceReviewReport(input: {
	jobRow: typeof deepResearchJobs.$inferSelect;
	now: Date;
	reviewedSources: DeepResearchSource[];
	limitations: string[];
	dependencies: DeepResearchWorkflowDependencies;
}): Promise<RunDeepResearchWorkflowStepResult> {
	await db
		.update(deepResearchJobs)
		.set({
			status: "running",
			stage: "synthesis",
			updatedAt: input.now,
		})
		.where(
			and(
				eq(deepResearchJobs.id, input.jobRow.id),
				eq(deepResearchJobs.userId, input.jobRow.userId),
				eq(deepResearchJobs.status, "running"),
				eq(deepResearchJobs.stage, "source_review"),
			),
		);
	const synthesisInput = {
		jobId: input.jobRow.id,
		reviewedSources: input.reviewedSources.map(mapReviewedSourceForSynthesis),
		completedTasks: [],
	};
	const synthesisNotes = await buildSynthesisNotesWithResumePoint({
		jobRow: input.jobRow,
		passNumber: 1,
		now: input.now,
		synthesisInput,
		dependencies: input.dependencies,
	});
	const completedJob = await (
		input.dependencies.reportCompletion
			?.completeDeepResearchJobWithAuditedReport ??
		completeDeepResearchJobWithAuditedReport
	)({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		synthesisNotes,
		limitations: input.limitations,
		now: input.now,
	});
	if (!completedJob) return null;
	return {
		job: completedJob,
		advanced: true,
		outcome: "report_completed",
	};
}

async function resumeFromTerminalSourceReviewPass(input: {
	jobRow: typeof deepResearchJobs.$inferSelect;
	checkpoint: DeepResearchPassCheckpoint;
	now: Date;
	dependencies: DeepResearchWorkflowDependencies;
}): Promise<RunDeepResearchWorkflowStepResult> {
	if (input.checkpoint.nextDecision === "continue_research") {
		const allGaps = await listResearchCoverageGaps({
			userId: input.jobRow.userId,
			jobId: input.jobRow.id,
		});
		const checkpointGaps = allGaps.filter((gap) =>
			input.checkpoint.coverageGapIds.includes(gap.id),
		);
		await upsertResearchPassCheckpoint({
			userId: input.jobRow.userId,
			jobId: input.jobRow.id,
			conversationId: input.jobRow.conversationId,
			passNumber: 2,
			searchIntent: "Targeted follow-up for pass 1 Coverage Gaps",
			reviewedSourceIds: input.checkpoint.reviewedSourceIds,
			now: input.now,
		});
		await (
			input.dependencies.tasks?.createResearchTasksFromCoverageGaps ??
			createResearchTasksFromCoverageGaps
		)({
			userId: input.jobRow.userId,
			jobId: input.jobRow.id,
			conversationId: input.jobRow.conversationId,
			passNumber: 2,
			gaps: checkpointGaps.map((gap) => ({
				id: gap.id,
				keyQuestion: gap.keyQuestion,
				summary: gap.recommendedNextAction,
				severity: gap.severity,
			})),
			now: input.now,
		});
		await db
			.update(deepResearchJobs)
			.set({
				status: "running",
				stage: "research_tasks",
				updatedAt: input.now,
			})
			.where(
				and(
					eq(deepResearchJobs.id, input.jobRow.id),
					eq(deepResearchJobs.userId, input.jobRow.userId),
					eq(deepResearchJobs.status, "running"),
				),
			);
		const reloaded = await reloadWorkflowJob(
			input.jobRow.userId,
			input.jobRow.conversationId,
			input.jobRow.id,
		);
		return reloaded
			? {
					job: reloaded,
					advanced: true,
					outcome: "coverage_continuation_created",
				}
			: null;
	}
	if (input.checkpoint.nextDecision === "synthesize_report") {
		await db
			.update(deepResearchJobs)
			.set({
				status: "running",
				stage: "synthesis",
				updatedAt: input.now,
			})
			.where(
				and(
					eq(deepResearchJobs.id, input.jobRow.id),
					eq(deepResearchJobs.userId, input.jobRow.userId),
					eq(deepResearchJobs.status, "running"),
				),
			);
		return runSynthesisResumeStep(
			{ ...input.jobRow, stage: "synthesis", updatedAt: input.now },
			input.now,
			input.dependencies,
		);
	}
	return completeCoverageExhaustedWithEvidenceLimitationMemo({
		jobRow: input.jobRow,
		now: input.now,
		limitations: [input.checkpoint.decisionSummary ?? "Research evidence was insufficient."],
		sourceCounts: {
			discovered: 0,
			reviewed: input.checkpoint.reviewedSourceIds.length,
			cited: 0,
		},
		dependencies: input.dependencies,
	});
}

async function completeCoverageExhaustedWithEvidenceLimitationMemo(input: {
	jobRow: typeof deepResearchJobs.$inferSelect;
	now: Date;
	limitations: string[];
	sourceCounts: {
		discovered: number;
		reviewed: number;
		cited: number;
	};
	dependencies: DeepResearchWorkflowDependencies;
}): Promise<RunDeepResearchWorkflowStepResult> {
	const warning =
		"Depth budget exhausted before any reviewed evidence was available; no useful Research Report can be produced.";
	await saveResearchTimelineEvent({
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		userId: input.jobRow.userId,
		taskId: null,
		stage: "coverage_assessment",
		kind: "warning",
		occurredAt: input.now.toISOString(),
		messageKey: "deepResearch.timeline.coverageFailed",
		messageParams: {
			discoveredSources: input.sourceCounts.discovered,
			reviewedSources: 0,
		},
		sourceCounts: input.sourceCounts,
		assumptions: [],
		warnings: [warning],
		summary: warning,
	});

	const completedJob = await (
		input.dependencies.reportCompletion
			?.completeDeepResearchJobWithEvidenceLimitationMemo ??
		completeDeepResearchJobWithEvidenceLimitationMemo
	)({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		limitations: input.limitations.length > 0 ? input.limitations : [warning],
		now: input.now,
	});
	if (!completedJob) return null;
	return { job: completedJob, advanced: true, outcome: "report_completed" };
}

async function persistSourceReviewPassDecision(input: {
	jobRow: typeof deepResearchJobs.$inferSelect;
	passNumber: number;
	reviewedSources: DeepResearchSource[];
	sources: DeepResearchSource[];
	coverageAssessment: ResearchCoverageAssessment;
	now: Date;
}) {
	const checkpoint = await upsertResearchPassCheckpoint({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		passNumber: input.passNumber,
		searchIntent: "Initial approved-plan source review",
		reviewedSourceIds: input.reviewedSources.map((source) => source.id),
		coverageResult: {
			status: input.coverageAssessment.status,
			canContinue: input.coverageAssessment.canContinue,
			reviewedSourceCount: input.reviewedSources.length,
			reportLimitationCount: input.coverageAssessment.reportLimitations.length,
		},
		now: input.now,
	});
	const persistedGaps = await saveCoverageGapsForPass({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		passCheckpointId: checkpoint.id,
		gaps: input.coverageAssessment.coverageGaps.map((gap) => ({
			keyQuestion: gap.keyQuestion,
			comparedEntity: gap.comparedEntity,
			comparisonAxis: gap.comparisonAxis,
			reason: gap.reason,
			reviewedSourceCount: gap.reviewedSourceCount,
			severity: coverageGapSeverity(gap),
			recommendedNextAction: gap.recommendedNextAction,
			detail: gap.detail,
		})),
		now: input.now,
	});
	const nextDecision = sourceReviewNextDecision({
		coverageAssessment: input.coverageAssessment,
		reviewedSources: input.reviewedSources,
	});
	const decisionSummary = sourceReviewDecisionSummary({
		nextDecision,
		gapCount: persistedGaps.length,
		limitationCount: input.coverageAssessment.reportLimitations.length,
	});
	await completeResearchPassCheckpoint({
		userId: input.jobRow.userId,
		checkpointId: checkpoint.id,
		coverageGapIds: persistedGaps.map((gap) => gap.id),
		nextDecision,
		decisionSummary,
		now: input.now,
	});
	await saveResearchPassDecisionTimeline({
		jobRow: input.jobRow,
		stage: "coverage_assessment",
		passNumber: input.passNumber,
		nextDecision,
		decisionSummary,
		sourceCounts: sourceCountsFromResearchSources(input.sources),
		now: input.now,
	});

	return { checkpoint, gaps: persistedGaps };
}

async function persistResearchTaskPassDecision(input: {
	jobRow: typeof deepResearchJobs.$inferSelect;
	passNumber: number;
	completedPassTasks: DeepResearchTask[];
	completedTasks: DeepResearchTask[];
	taskLimitations: string[];
	reviewedSources: DeepResearchSource[];
	sources: DeepResearchSource[];
	now: Date;
}) {
	const checkpoint = await upsertResearchPassCheckpoint({
		userId: input.jobRow.userId,
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		passNumber: input.passNumber,
		searchIntent:
			input.passNumber === 1
				? "Targeted follow-up for Coverage Gaps"
				: `Targeted follow-up for pass ${input.passNumber - 1} Coverage Gaps`,
		reviewedSourceIds: input.reviewedSources.map((source) => source.id),
		coverageResult: {
			status: "task_pass_completed",
			completedTaskCount: input.completedTasks.length,
			limitedTaskCount: input.taskLimitations.length,
		},
		now: input.now,
	});
	const completedGapIds = input.completedTasks
		.map((task) => task.coverageGapId)
		.filter((gapId) => gapId !== null && gapId !== undefined);
	if (completedGapIds.length > 0) {
		await resolveResearchCoverageGaps({
			userId: input.jobRow.userId,
			gapIds: completedGapIds,
			lifecycleState: "resolved",
			resolutionSummary: "Resolved by completed targeted Research Task output.",
			resolvedByEvidence: {
				taskIds: input.completedTasks.map((task) => task.id),
				sourceIds: [
					...new Set(
						input.completedTasks.flatMap((task) => task.output?.sourceIds ?? []),
					),
				],
			},
			now: input.now,
		});
	}
	const inheritedGapIds = input.completedPassTasks
		.filter(
			(task) =>
				task.required &&
				(task.status === "skipped" ||
					(task.status === "failed" && !task.critical)) &&
				task.coverageGapId,
		)
		.map((task) => task.coverageGapId as string);
	if (inheritedGapIds.length > 0) {
		await resolveResearchCoverageGaps({
			userId: input.jobRow.userId,
			gapIds: inheritedGapIds,
			lifecycleState: "inherited",
			resolutionSummary:
				"Inherited into Report Limitations after targeted Research Task pass.",
			resolvedByLimitations: {
				limitations: input.taskLimitations,
			},
			now: input.now,
		});
	}
	const decisionSummary = `Synthesize report from pass ${input.passNumber} after ${input.completedTasks.length} completed task${input.completedTasks.length === 1 ? "" : "s"}.`;
	await completeResearchPassCheckpoint({
		userId: input.jobRow.userId,
		checkpointId: checkpoint.id,
		coverageGapIds: input.completedPassTasks
			.map((task) => task.coverageGapId)
			.filter((gapId) => gapId !== null && gapId !== undefined),
		nextDecision: "synthesize_report",
		decisionSummary,
		now: input.now,
	});
	await saveResearchPassDecisionTimeline({
		jobRow: input.jobRow,
		stage: "research_tasks",
		passNumber: input.passNumber,
		nextDecision: "synthesize_report",
		decisionSummary,
		sourceCounts: sourceCountsFromResearchSources(input.sources),
		now: input.now,
	});
}

async function saveResearchPassDecisionTimeline(input: {
	jobRow: typeof deepResearchJobs.$inferSelect;
	stage: "coverage_assessment" | "research_tasks";
	passNumber: number;
	nextDecision: DeepResearchPassDecision;
	decisionSummary: string;
	sourceCounts: {
		discovered: number;
		reviewed: number;
		cited: number;
	};
	now: Date;
}) {
	await saveResearchTimelineEventOnce({
		jobId: input.jobRow.id,
		conversationId: input.jobRow.conversationId,
		userId: input.jobRow.userId,
		taskId: null,
		stage: input.stage,
		kind: "pass_decision",
		occurredAt: input.now.toISOString(),
		messageKey: "deepResearch.timeline.passDecision",
		messageParams: {
			passNumber: input.passNumber,
			nextDecision: input.nextDecision,
		},
		sourceCounts: input.sourceCounts,
		assumptions: [],
		warnings: [],
		summary: input.decisionSummary,
	});
}

function sourceReviewNextDecision(input: {
	coverageAssessment: ResearchCoverageAssessment;
	reviewedSources: DeepResearchSource[];
}): DeepResearchPassDecision {
	if (
		input.coverageAssessment.status === "insufficient" &&
		input.coverageAssessment.canContinue
	) {
		return "continue_research";
	}
	if (
		input.coverageAssessment.status === "insufficient" &&
		input.reviewedSources.length === 0
	) {
		return "publish_evidence_limitation_memo";
	}
	return "synthesize_report";
}

function sourceReviewDecisionSummary(input: {
	nextDecision: DeepResearchPassDecision;
	gapCount: number;
	limitationCount: number;
}): string {
	if (input.nextDecision === "continue_research") {
		return `Continue with targeted follow-up work for ${input.gapCount} unresolved Coverage Gap${input.gapCount === 1 ? "" : "s"}.`;
	}
	if (input.nextDecision === "publish_evidence_limitation_memo") {
		return `Publish an Evidence Limitation Memo with ${input.limitationCount} limitation${input.limitationCount === 1 ? "" : "s"}.`;
	}
	return `Synthesize report after source review with ${input.limitationCount} limitation${input.limitationCount === 1 ? "" : "s"}.`;
}

function coverageGapSeverity(gap: CoverageGap) {
	if (gap.reason === "insufficient_reviewed_sources") return "critical";
	if (gap.reason === "insufficient_supported_claims") return "critical";
	if (gap.reason === "low_source_quality") return "important";
	if (gap.reason === "unresolved_conflict") return "critical";
	return "important";
}

function sourceCountsFromResearchSources(sources: DeepResearchSource[]) {
	return {
		discovered: sources.length,
		reviewed: sources.filter((source) => source.reviewedAt).length,
		cited: sources.filter((source) => source.citedAt).length,
	};
}

async function countCompletedMeaningfulResearchPasses(input: {
	userId: string;
	jobId: string;
}): Promise<number> {
	const checkpoints = await listResearchPassCheckpoints(input);
	return checkpoints.filter(
		(checkpoint) =>
			checkpoint.terminalDecision &&
			!isRepairPassCheckpoint(checkpoint.searchIntent),
	).length;
}

function isRepairPassCheckpoint(searchIntent: string): boolean {
	return /\b(repair|citation audit)\b/i.test(searchIntent);
}

function meaningfulPassFloor(plan: ResearchPlan): number {
	return Math.max(
		1,
		Math.floor(
			plan.researchBudget.meaningfulPassFloor ??
				plan.researchBudget.synthesisPassCeiling ??
				1,
		),
	);
}

function meaningfulPassCeiling(plan: ResearchPlan): number {
	return Math.max(
		meaningfulPassFloor(plan),
		Math.floor(
			plan.researchBudget.meaningfulPassCeiling ??
				plan.researchBudget.synthesisPassCeiling ??
				meaningfulPassFloor(plan),
		),
	);
}

function buildDefaultSourceReviewer(input: {
	jobRow: typeof deepResearchJobs.$inferSelect;
	now: Date;
	keyQuestions: string[];
}): SourceReviewer {
	return {
		async reviewSource(source) {
			const llmReview = await reviewSourceWithLlm({
				context: {
					jobId: input.jobRow.id,
					conversationId: input.jobRow.conversationId,
					userId: input.jobRow.userId,
					now: input.now,
				},
				source,
				keyQuestions: input.keyQuestions,
			});
			if (llmReview) return llmReview;

		const summary = source.snippet?.trim() || source.title.trim();
			return {
				summary,
				keyFindings: [summary],
				extractedText: source.snippet ?? null,
				relevanceScore: 80,
				supportedKeyQuestions: input.keyQuestions,
				extractedClaims: [summary],
			};
		},
	};
}

const defaultResearchTaskExecutor =
	(userId: string): ResearchTaskExecutor =>
	async ({ job, approvedPlan, task, reviewedSources, now }) => {
		const llmOutput = await executeResearchTaskWithLlm({
			context: {
				jobId: job.id,
				conversationId: job.conversationId,
				userId,
				taskId: task.id,
				now,
			},
			job,
			approvedPlan,
			task,
			reviewedSources,
		});
		if (llmOutput) return llmOutput;

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

async function getTerminalPassDecision(input: {
	userId: string;
	jobId: string;
	passNumber: number;
}): Promise<DeepResearchPassCheckpoint | null> {
	const checkpoints = await listResearchPassCheckpoints({
		userId: input.userId,
		jobId: input.jobId,
	});
	return (
		checkpoints.find(
			(checkpoint) =>
				checkpoint.passNumber === input.passNumber &&
				checkpoint.terminalDecision,
		) ?? null
	);
}

function dedupeTasksById(tasks: DeepResearchTask[]): DeepResearchTask[] {
	const byId = new Map<string, DeepResearchTask>();
	for (const task of tasks) byId.set(task.id, task);
	return [...byId.values()];
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
		supportedKeyQuestions:
			source.supportedKeyQuestions && source.supportedKeyQuestions.length > 0
				? source.supportedKeyQuestions
				: source.reviewedNote && source.relevanceScore == null
					? plan.keyQuestions
				: plan.keyQuestions.filter((question) =>
						sourceSupportsQuestion(source, question),
					),
		keyFindings:
			source.extractedClaims && source.extractedClaims.length > 0
				? source.extractedClaims
				: source.reviewedNote
					? [source.reviewedNote]
					: [],
		qualityScore: source.relevanceScore ?? 80,
		sourceQualitySignals: source.sourceQualitySignals,
		comparedEntity: source.comparedEntity,
		comparisonAxis: source.comparisonAxis,
		topicRelevant:
			source.topicRelevant ??
			isSourceTopicRelevantToPlan({
				planGoal: plan.goal,
				keyQuestions: plan.keyQuestions,
				source: {
					title: source.title ?? source.url,
					snippet: source.snippet,
					sourceText: [
						source.sourceText,
						source.reviewedNote,
						...(source.extractedClaims ?? []),
					]
						.filter(Boolean)
						.join(" "),
				},
			}),
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
		keyFindings:
			source.extractedClaims && source.extractedClaims.length > 0
				? source.extractedClaims
				: [
						source.reviewedNote ??
							source.snippet ??
							source.title ??
							source.url,
					],
		extractedText: source.reviewedNote ?? null,
		relevanceScore: source.relevanceScore ?? 80,
		topicRelevant: source.topicRelevant ?? true,
		topicRelevanceReason: source.topicRelevanceReason ?? null,
		supportedKeyQuestions: source.supportedKeyQuestions ?? [],
		intendedComparedEntity: source.intendedComparedEntity,
		intendedComparisonAxis: source.intendedComparisonAxis,
		comparedEntity: source.comparedEntity,
		comparisonAxis: source.comparisonAxis,
		extractedClaims: source.extractedClaims ?? [],
		sourceQualitySignals: source.sourceQualitySignals ?? {
			sourceType: "unknown",
			independence: "unknown",
			freshness: "unknown",
			directness: "unknown",
			extractionConfidence: "low",
			claimFit: "unknown",
		},
		sourceAuthoritySummary: source.sourceAuthoritySummary ?? {
			label: "Weak source fit",
			score: 0,
			reasons: [],
		},
		rejectedReason: source.rejectedReason ?? null,
		openedContentLength: source.openedContentLength ?? 0,
		createdAt: reviewedAt,
	};
}

function sourceSupportsQuestion(source: DeepResearchSource, question: string): boolean {
	const text = [
		source.title,
		source.snippet,
		source.sourceText,
		source.reviewedNote,
		...(source.extractedClaims ?? []),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
	const questionTerms = question
		.toLowerCase()
		.split(/[^a-z0-9áéíóöőúüű]+/iu)
		.filter((term) => term.length >= 4);
	if (questionTerms.length === 0) return false;
	const overlap = questionTerms.filter((term) => text.includes(term)).length;
	return overlap >= Math.min(2, questionTerms.length);
}

function modelReasoningConcurrencyLimit(plan: ResearchPlan): number {
	const configured = plan.researchBudget.modelReasoningConcurrency;
	const planLimit =
		configured === undefined || !Number.isFinite(configured)
			? 1
			: Math.max(1, Math.floor(configured));
	const config = getConfig();
	return Math.max(
		0,
		Math.min(
			planLimit,
			Math.max(0, Math.floor(config.deepResearchUserReasoningConcurrency)),
			Math.max(1, Math.floor(config.deepResearchGlobalReasoningConcurrency)),
		),
	);
}

function hasDeepResearchRuntimeExpired(
	jobRow: typeof deepResearchJobs.$inferSelect,
	now: Date,
): boolean {
	const runtimeLimitMs = Math.max(60_000, getConfig().deepResearchJobRuntimeLimitMs);
	return now.getTime() - jobRow.createdAt.getTime() >= runtimeLimitMs;
}
