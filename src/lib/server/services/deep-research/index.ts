import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	artifacts,
	conversations,
	deepResearchJobs,
	deepResearchPlanVersions,
} from '$lib/server/db/schema';
import { createConversation, updateConversationTitle } from '$lib/server/services/conversations';
import { createArtifact, createArtifactLink } from '$lib/server/services/knowledge/store';
import { createMessage } from '$lib/server/services/messages';
import type {
	Conversation,
	DeepResearchDepth,
	DeepResearchEffortEstimate,
	DeepResearchEvidenceNote,
	DeepResearchEvidenceLimitationMemo,
	DeepResearchJob,
	DeepResearchRuntimeEstimate,
	DeepResearchPlanRaw,
	DeepResearchPlanSummary,
	DeepResearchCoverageGap,
	DeepResearchPassCheckpoint,
	DeepResearchResumePoint,
	DeepResearchSource,
	DeepResearchSourceCounts,
	DeepResearchTimelineEvent,
	DeepResearchUsageSummary,
} from '$lib/types';
import {
	auditDeepResearchReportCitations,
	type DeepResearchReportDraft,
} from './citation-audit';
import {
	createFirstResearchPlanDraft,
	createRevisedResearchPlanDraft,
	type PlanningContextItem,
	type ReportIntent,
	type ResearchLanguage,
	type ResearchPlanIncludedSource,
	type ResearchPlanDraftRecord,
} from './planning';
import { resolveResearchLanguage } from './language';
import { generateTitle } from '$lib/server/services/title-generator';
import {
	MAX_REPORT_KEY_FINDINGS,
	selectResearchReportFindings,
	writeEvidenceLimitationMemo,
	type ResearchReportDraft,
} from './report-writer';
import { listResearchSources, markResearchSourceCited, saveDiscoveredResearchSource } from './sources';
import { isSourceTopicRelevantToPlan } from './source-review';
import {
	listResearchCoverageGaps,
	listResearchPassCheckpoints,
} from './pass-state';
import {
	completeResearchResumePoint,
	getResearchResumePoint,
	listResearchResumePoints,
	upsertResearchResumePoint,
} from './resume-points';
import { listDeepResearchEvidenceNotes } from './evidence-notes';
import type { SynthesisNotes } from './synthesis';
import {
	buildCitationClaimReviewerWithLlm,
	draftResearchPlanWithLlm,
	writeResearchReportWithLlm,
} from './llm-steps';
import {
	createPlanGenerationTimelineEvent,
	listResearchTimelineEventsForJobs,
	type PersistedResearchTimelineEvent,
	saveResearchTimelineEvent,
} from './timeline';
import {
	buildPlanGenerationResearchUsageRecord,
	getResearchUsageCostSummary,
	saveResearchUsageRecord,
	type ResearchProviderUsageSnapshot,
} from './usage';

export type PlanGenerationUsageInput = {
	modelId: string;
	modelDisplayName?: string | null;
	providerId?: string | null;
	providerDisplayName?: string | null;
	runtimeMs?: number | null;
	providerUsage?: ResearchProviderUsageSnapshot | null;
	costUsdMicros?: number | null;
};

export type StartDeepResearchJobShellInput = {
	userId: string;
	conversationId: string;
	triggerMessageId: string;
	userRequest: string;
	depth: DeepResearchDepth;
	researchLanguage?: ResearchLanguage;
	planningContext?: PlanningContextItem[];
	planGenerationUsage?: PlanGenerationUsageInput | null;
	now?: Date;
};

export type AssertCanStartDeepResearchJobInput = {
	userId: string;
	conversationId: string;
};

export type CancelPrePlanDeepResearchJobInput = {
	userId: string;
	jobId: string;
	now?: Date;
};

export type EditDeepResearchPlanInput = {
	userId: string;
	jobId: string;
	editInstruction: string;
	reportIntent?: ReportIntent;
	researchLanguage?: ResearchLanguage;
	now?: Date;
};

export type ApproveDeepResearchPlanInput = {
	userId: string;
	jobId: string;
	now?: Date;
};

export type CompleteDeepResearchJobWithAuditedReportInput = {
	userId: string;
	jobId: string;
	synthesisNotes: SynthesisNotes;
	limitations?: string[];
	now?: Date;
};

export type CompleteDeepResearchJobWithEvidenceLimitationMemoInput = {
	userId: string;
	jobId: string;
	limitations: string[];
	now?: Date;
};

export type DiscussDeepResearchReportInput = {
	userId: string;
	jobId: string;
	persistSeedMessage?: boolean;
	now?: Date;
};

export type ResearchFurtherFromDeepResearchReportInput = {
	userId: string;
	jobId: string;
	depth?: DeepResearchDepth;
	researchLanguage?: ResearchLanguage;
	now?: Date;
};

export type DeepResearchReportActionResult = {
	sourceJobId: string;
	reportArtifactId: string;
	conversation: Conversation;
	messageId?: string;
	seedMessage: string;
	researchLanguage: ResearchLanguage;
};

export type ResearchFurtherReportActionResult = DeepResearchReportActionResult & {
	job: DeepResearchJob;
};

type DeepResearchJobRow = typeof deepResearchJobs.$inferSelect;
type DeepResearchPlanVersionRow = typeof deepResearchPlanVersions.$inferSelect;
type ResearchReportContext = {
	job: DeepResearchJobRow;
	report: typeof artifacts.$inferSelect;
};

const OPEN_JOB_STATUS_FILTER = sql`${deepResearchJobs.status} NOT IN ('completed', 'failed', 'cancelled')`;

export class DeepResearchJobStartError extends Error {
	constructor(
		public readonly code: 'conversation_not_found' | 'conversation_sealed' | 'active_job_exists',
		message: string,
		public readonly status: number
	) {
		super(message);
		this.name = 'DeepResearchJobStartError';
	}
}

export class DeepResearchPlanActionError extends Error {
	constructor(
		public readonly code:
			| 'plan_already_approved'
			| 'plan_not_editable'
			| 'plan_not_approvable',
		message: string,
		public readonly status: number
	) {
		super(message);
		this.name = 'DeepResearchPlanActionError';
	}
}

export function isDeepResearchJobStartError(
	error: unknown
): error is DeepResearchJobStartError {
	return error instanceof DeepResearchJobStartError;
}

export function isDeepResearchPlanActionError(
	error: unknown
): error is DeepResearchPlanActionError {
	return error instanceof DeepResearchPlanActionError;
}

export async function startDeepResearchJobShell(
	input: StartDeepResearchJobShellInput
): Promise<DeepResearchJob> {
	await assertCanStartDeepResearchJob(input);

	const now = input.now ?? new Date();
	const researchLanguage = resolveResearchLanguage({
		userRequest: input.userRequest,
		explicitOutputLanguage: input.researchLanguage,
	});
	const [job] = await db
		.insert(deepResearchJobs)
		.values({
			id: randomUUID(),
			userId: input.userId,
			conversationId: input.conversationId,
			triggerMessageId: input.triggerMessageId,
			depth: input.depth,
			status: 'awaiting_plan',
			stage: 'job_shell_created',
			title: buildJobTitle(input.userRequest),
			userRequest: input.userRequest,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	const draft = await createFirstResearchPlanDraft(
		{
			jobId: job.id,
			userRequest: input.userRequest,
			selectedDepth: input.depth,
			researchLanguage,
			planningContext: input.planningContext,
		},
		{
			structuredPlanner: {
				draftPlan: (plannerInput, context) =>
					draftResearchPlanWithLlm({
						context: {
							jobId: job.id,
							conversationId: input.conversationId,
							userId: input.userId,
							now,
						},
						role: 'plan_generation',
						userRequest: plannerInput.userRequest,
						selectedDepth: plannerInput.selectedDepth,
						researchLanguage: plannerInput.researchLanguage,
						selectedBudget: context.selectedBudget,
						contextDisclosure: context.contextDisclosure,
					}),
			},
			repository: {
				saveResearchPlanDraft: (draftRecord) =>
					saveResearchPlanDraft(draftRecord, now),
			},
		}
	);

	const [updatedJob] = await db
		.update(deepResearchJobs)
		.set({
			status: draft.status,
			stage: 'plan_drafted',
			updatedAt: now,
		})
		.where(eq(deepResearchJobs.id, job.id))
		.returning();

	const titledJob = await applyGeneratedResearchTitle({
		userId: input.userId,
		conversationId: input.conversationId,
		job: updatedJob,
		userRequest: input.userRequest,
		assistantContext: draft.renderedPlan,
		now,
	});

	const timelineEvent = await saveResearchTimelineEvent(
		createPlanGenerationTimelineEvent({
			jobId: job.id,
			conversationId: input.conversationId,
			userId: input.userId,
			stage: 'plan_generation',
			researchLanguage,
			occurredAt: now,
			assumptions: [],
		})
	);

	if (input.planGenerationUsage) {
		await saveResearchUsageRecord(
			buildPlanGenerationResearchUsageRecord({
				jobId: job.id,
				conversationId: input.conversationId,
				userId: input.userId,
				modelId: input.planGenerationUsage.modelId,
				modelDisplayName: input.planGenerationUsage.modelDisplayName,
				providerId: input.planGenerationUsage.providerId,
				providerDisplayName: input.planGenerationUsage.providerDisplayName,
				occurredAt: now,
				runtimeMs: input.planGenerationUsage.runtimeMs,
				providerUsage: input.planGenerationUsage.providerUsage,
				costUsdMicros: input.planGenerationUsage.costUsdMicros,
			})
		);
	}

	return mapDeepResearchJob(titledJob, mapResearchPlanVersionRow(draft), [
		mapTimelineEvent(timelineEvent),
	]);
}

export async function assertCanStartDeepResearchJob(
	input: AssertCanStartDeepResearchJobInput
): Promise<void> {
	const [conversation] = await db
		.select({
			id: conversations.id,
			status: conversations.status,
		})
		.from(conversations)
		.where(and(eq(conversations.id, input.conversationId), eq(conversations.userId, input.userId)))
		.limit(1);

	if (!conversation) {
		throw new DeepResearchJobStartError(
			'conversation_not_found',
			'Conversation not found',
			404
		);
	}
	if (conversation.status === 'sealed') {
		throw new DeepResearchJobStartError(
			'conversation_sealed',
			'Deep Research cannot be started in a sealed conversation',
			409
		);
	}

	const [activeJob] = await db
		.select({ id: deepResearchJobs.id })
		.from(deepResearchJobs)
		.where(
			and(
				eq(deepResearchJobs.userId, input.userId),
				eq(deepResearchJobs.conversationId, input.conversationId),
				OPEN_JOB_STATUS_FILTER
			)
		)
		.limit(1);
	if (activeJob) {
		throw new DeepResearchJobStartError(
			'active_job_exists',
			'This conversation already has an active Deep Research job',
			409
		);
	}
}

export async function listConversationDeepResearchJobs(
	userId: string,
	conversationId: string
): Promise<DeepResearchJob[]> {
	const rows = await db
		.select()
		.from(deepResearchJobs)
		.where(
			and(
				eq(deepResearchJobs.userId, userId),
				eq(deepResearchJobs.conversationId, conversationId)
			)
		)
		.orderBy(asc(deepResearchJobs.createdAt));
	const currentPlans = await loadCurrentPlansByJobId(rows.map((row) => row.id));
	const timelineEvents = await loadTimelineEventsByJobId(userId, rows.map((row) => row.id));
	const sourceLedgers = await loadSourceLedgersByJobId(userId, conversationId, rows.map((row) => row.id));
	const usageSummaries = await loadUsageSummariesByJobId(userId, rows.map((row) => row.id));
	const runtimeEstimates = await loadRuntimeEstimatesByJobId(rows);
	const evidenceLimitationMemos = await loadEvidenceLimitationMemosByJobId(userId, rows);
	const passStates = await loadPassStatesByJobId(userId, rows.map((row) => row.id));
	return rows.map((row) =>
		mapDeepResearchJob(
			row,
			currentPlans.get(row.id) ?? null,
			timelineEvents.get(row.id) ?? [],
			sourceLedgers.get(row.id),
			{
				usageSummary: usageSummaries.get(row.id),
				runtimeEstimate: runtimeEstimates.get(row.id),
				evidenceLimitationMemo: evidenceLimitationMemos.get(row.id) ?? null,
				passCheckpoints: passStates.get(row.id)?.passCheckpoints ?? [],
				coverageGaps: passStates.get(row.id)?.coverageGaps ?? [],
				evidenceNotes: passStates.get(row.id)?.evidenceNotes ?? [],
				resumePoints: passStates.get(row.id)?.resumePoints ?? [],
			}
		)
	);
}

export async function cancelPrePlanDeepResearchJob(
	input: CancelPrePlanDeepResearchJobInput
): Promise<DeepResearchJob | null> {
	const now = input.now ?? new Date();
	const [job] = await db
		.update(deepResearchJobs)
		.set({
			status: 'cancelled',
			stage: 'cancelled_before_approval',
			cancelledAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(deepResearchJobs.id, input.jobId),
				eq(deepResearchJobs.userId, input.userId),
				sql`${deepResearchJobs.status} IN ('awaiting_plan', 'awaiting_approval')`
			)
		)
		.returning();

	if (!job) return null;
	const currentPlans = await loadCurrentPlansByJobId([job.id]);
	const timelineEvents = await loadTimelineEventsByJobId(input.userId, [job.id]);
	return mapDeepResearchJob(
		job,
		currentPlans.get(job.id) ?? null,
		timelineEvents.get(job.id) ?? []
	);
}

export async function editDeepResearchPlan(
	input: EditDeepResearchPlanInput
): Promise<DeepResearchJob | null> {
	const now = input.now ?? new Date();
	const [job] = await db
		.select()
		.from(deepResearchJobs)
		.where(and(eq(deepResearchJobs.id, input.jobId), eq(deepResearchJobs.userId, input.userId)))
		.limit(1);

	if (!job) return null;
	if (job.status === 'approved') {
		throw new DeepResearchPlanActionError(
			'plan_already_approved',
			'Approved Research Plans cannot be edited',
			409
		);
	}
	if (job.status !== 'awaiting_approval') {
		throw new DeepResearchPlanActionError(
			'plan_not_editable',
			'This Deep Research Plan cannot be edited in its current state',
			409
		);
	}

	const [currentPlanRow] = await db
		.select()
		.from(deepResearchPlanVersions)
		.where(eq(deepResearchPlanVersions.jobId, job.id))
		.orderBy(desc(deepResearchPlanVersions.version))
		.limit(1);

	if (!currentPlanRow) return null;

	const currentPlan = mapResearchPlanVersionRow(currentPlanRow);
	if (!currentPlan.rawPlan) return null;

	const draft = await createRevisedResearchPlanDraft(
		{
			jobId: job.id,
			previousPlan: currentPlan.rawPlan,
			previousVersion: currentPlan.version,
			editInstruction: input.editInstruction,
			reportIntent: input.reportIntent,
			selectedDepth: job.depth as DeepResearchDepth,
			researchLanguage:
				input.researchLanguage ?? currentPlan.rawPlan.researchLanguage ?? 'en',
			contextDisclosure: currentPlan.contextDisclosure ?? null,
		},
		{
			structuredPlanner: {
				draftPlan: (plannerInput, context) =>
					draftResearchPlanWithLlm({
						context: {
							jobId: job.id,
							conversationId: job.conversationId,
							userId: input.userId,
							now,
						},
						role: 'plan_revision',
						userRequest: input.editInstruction,
						selectedDepth: plannerInput.selectedDepth,
						researchLanguage: plannerInput.researchLanguage,
						selectedBudget: context.selectedBudget,
						contextDisclosure: context.contextDisclosure,
						previousPlan: currentPlan.rawPlan,
						editInstruction: input.editInstruction,
						reportIntent: input.reportIntent,
					}),
			},
			repository: {
				saveResearchPlanDraft: (draftRecord) =>
					saveResearchPlanDraft(draftRecord, now),
			},
		}
	);

	const [updatedJob] = await db
		.update(deepResearchJobs)
		.set({
			status: 'awaiting_approval',
			stage: 'plan_revised',
			updatedAt: now,
		})
		.where(eq(deepResearchJobs.id, job.id))
		.returning();

	const timelineEvents = await loadTimelineEventsByJobId(input.userId, [job.id]);
	return mapDeepResearchJob(
		updatedJob,
		mapResearchPlanVersionRow(draft),
		timelineEvents.get(job.id) ?? []
	);
}

export async function approveDeepResearchPlan(
	input: ApproveDeepResearchPlanInput
): Promise<DeepResearchJob | null> {
	const now = input.now ?? new Date();
	const [job] = await db
		.select()
		.from(deepResearchJobs)
		.where(and(eq(deepResearchJobs.id, input.jobId), eq(deepResearchJobs.userId, input.userId)))
		.limit(1);

	if (!job) return null;
	if (job.status === 'approved') {
		const currentPlans = await loadCurrentPlansByJobId([job.id]);
		const timelineEvents = await loadTimelineEventsByJobId(input.userId, [job.id]);
		return mapDeepResearchJob(
			job,
			currentPlans.get(job.id) ?? null,
			timelineEvents.get(job.id) ?? []
		);
	}
	if (job.status !== 'awaiting_approval') {
		throw new DeepResearchPlanActionError(
			'plan_not_approvable',
			'This Deep Research Plan cannot be approved in its current state',
			409
		);
	}

	const [currentPlanRow] = await db
		.select()
		.from(deepResearchPlanVersions)
		.where(eq(deepResearchPlanVersions.jobId, job.id))
		.orderBy(desc(deepResearchPlanVersions.version))
		.limit(1);

	if (!currentPlanRow) return null;

	const [approvedPlanRow] = await db
		.update(deepResearchPlanVersions)
		.set({
			status: 'approved',
			updatedAt: now,
		})
		.where(eq(deepResearchPlanVersions.id, currentPlanRow.id))
		.returning();

	const [updatedJob] = await db
		.update(deepResearchJobs)
		.set({
			status: 'approved',
			stage: 'plan_approved',
			updatedAt: now,
		})
		.where(eq(deepResearchJobs.id, job.id))
		.returning();

	await persistApprovedPlanSourceScope({
		userId: input.userId,
		conversationId: job.conversationId,
		jobId: job.id,
		includedSources:
			parseJson<DeepResearchPlanRaw>(approvedPlanRow.rawPlanJson).sourceScope.includedSources ?? [],
		discoveredAt: now,
	});

	const timelineEvents = await loadTimelineEventsByJobId(input.userId, [job.id]);
	return mapDeepResearchJob(
		updatedJob,
		mapResearchPlanVersionRow(approvedPlanRow),
		timelineEvents.get(job.id) ?? []
	);
}

export async function completeDeepResearchJobWithAuditedReport(
	input: CompleteDeepResearchJobWithAuditedReportInput
): Promise<DeepResearchJob | null> {
	const now = input.now ?? new Date();
	const [job] = await db
		.select()
		.from(deepResearchJobs)
		.where(and(eq(deepResearchJobs.id, input.jobId), eq(deepResearchJobs.userId, input.userId)))
		.limit(1);

	if (!job) return null;
	if (job.status === 'completed' && job.reportArtifactId) {
		const currentPlans = await loadCurrentPlansByJobId([job.id]);
		const timelineEvents = await loadTimelineEventsByJobId(input.userId, [job.id]);
		return mapDeepResearchJob(
			job,
			currentPlans.get(job.id) ?? null,
			timelineEvents.get(job.id) ?? []
		);
	}
	if (job.status !== 'approved' && job.status !== 'running') {
		return null;
	}

	const currentPlans = await loadCurrentPlansByJobId([job.id]);
	const currentPlan = currentPlans.get(job.id);
	if (!currentPlan?.rawPlan) return null;
	const reportAssemblyResumeKey = `report:${job.id}:audited`;
	const existingReportAssembly = await getResearchResumePoint({
		userId: input.userId,
		jobId: job.id,
		resumeKey: reportAssemblyResumeKey,
	});
	const existingReportArtifactId =
		typeof existingReportAssembly?.result?.artifactId === 'string'
			? existingReportAssembly.result.artifactId
			: null;
	if (existingReportArtifactId) {
		return finalizeAuditedReportJobFromArtifact({
			job,
			currentPlan,
			artifactId: existingReportArtifactId,
			now,
		});
	}

	const citedAt = now;
	const initialSources = await listResearchSources({
		userId: input.userId,
		jobId: job.id,
	});
	const sourceIdsNeededForReport = new Set(
		input.synthesisNotes.findings.flatMap((finding) =>
			finding.sourceRefs.flatMap((sourceRef) => [
				sourceRef.discoveredSourceId,
				sourceRef.reviewedSourceId,
			])
		)
	);
	await Promise.all(
		initialSources
			.filter(
				(source) =>
					sourceIdsNeededForReport.has(source.id) &&
					source.reviewedAt &&
					!source.citedAt
			)
			.map((source) =>
				markResearchSourceCited({
					userId: input.userId,
					sourceId: source.id,
					citedAt,
					citationNote: `Cited in audited Research Report for ${job.title}`,
				})
			)
	);

	const sources = await listResearchSources({
		userId: input.userId,
		jobId: job.id,
	});
	await upsertResearchResumePoint({
		userId: job.userId,
		jobId: job.id,
		conversationId: job.conversationId,
		boundary: 'report_assembly',
		resumeKey: reportAssemblyResumeKey,
		stage: 'report_assembly',
		payload: {
			synthesisFindingCount: input.synthesisNotes.findings.length,
			limitationCount: input.limitations?.length ?? 0,
		},
		now,
	});
	const reportDraft = await writeResearchReportWithLlm({
		context: {
			jobId: job.id,
			conversationId: job.conversationId,
			userId: job.userId,
			now,
		},
		jobId: job.id,
		plan: currentPlan.rawPlan,
		synthesisNotes: input.synthesisNotes,
		sources: sources.map(mapSourceForReportWriter),
		limitations: input.limitations,
	});
	const citationAuditReportDraft = buildCitationAuditReportDraft(
		reportDraft,
		input.synthesisNotes
	);
	const citationAuditResumeKey = `citation-audit:${job.id}:audited`;
	await upsertResearchResumePoint({
		userId: job.userId,
		jobId: job.id,
		conversationId: job.conversationId,
		boundary: 'citation_audit',
		resumeKey: citationAuditResumeKey,
		stage: 'citation_audit',
		payload: {
			claimCount: citationAuditReportDraft.sections.reduce(
				(count, section) => count + section.claims.length,
				0
			),
			sourceCount: sources.length,
		},
		now,
	});
	const citationAuditSources = sources.map((source) => ({
		id: source.id,
		status: source.status,
		title: source.title ?? source.url,
		url: source.url,
		reviewedAt: source.reviewedAt,
		citedAt: source.citedAt,
		reviewedNote: source.reviewedNote,
		citationNote: source.citationNote,
		snippet: source.snippet,
		sourceText: source.sourceText,
		supportedKeyQuestions: source.supportedKeyQuestions,
		extractedClaims: source.extractedClaims,
	}));
	const llmClaimReviewer = await buildCitationClaimReviewerWithLlm({
		context: {
			jobId: job.id,
			conversationId: job.conversationId,
			userId: job.userId,
			now,
		},
		report: citationAuditReportDraft,
		citedSources: citationAuditSources,
	});
	const auditResult = await auditDeepResearchReportCitations({
		jobId: job.id,
		report: citationAuditReportDraft,
		citedSources: citationAuditSources,
		reviewClaimSupport: llmClaimReviewer
			? async ({ claim }) => llmClaimReviewer(claim.id)
			: undefined,
	});
	await completeResearchResumePoint({
		userId: job.userId,
		jobId: job.id,
		resumeKey: citationAuditResumeKey,
		result: {
			status: auditResult.status,
			canComplete: auditResult.canComplete,
		},
		now,
	});
	const repairResumeKey = `repair:${job.id}:audited`;
	await upsertResearchResumePoint({
		userId: job.userId,
		jobId: job.id,
		conversationId: job.conversationId,
		boundary: 'repair',
		resumeKey: repairResumeKey,
		stage: 'citation_audit',
		payload: {
			auditStatus: auditResult.status,
		},
		now,
	});
	await completeResearchResumePoint({
		userId: job.userId,
		jobId: job.id,
		resumeKey: repairResumeKey,
		result: {
			retainedClaims: auditResult.findings.filter((finding) =>
				['supported', 'repaired'].includes(finding.status)
			).length,
			removedClaims: auditResult.findings.filter((finding) =>
				['unsupported_source', 'unsupported_claim'].includes(finding.status)
			).length,
		},
		now,
	});
	await saveResearchTimelineEvent({
		jobId: job.id,
		conversationId: job.conversationId,
		userId: job.userId,
		taskId: null,
		stage: 'citation_audit',
		kind: auditResult.canComplete ? 'stage_completed' : 'warning',
		occurredAt: now.toISOString(),
		messageKey: auditResult.canComplete
			? 'deepResearch.timeline.citationAuditCompleted'
			: 'deepResearch.timeline.citationAuditFailed',
		messageParams: {
			status: auditResult.status,
			retainedClaims: auditResult.findings.filter((finding) =>
				['supported', 'repaired'].includes(finding.status)
			).length,
			removedClaims: auditResult.findings.filter((finding) =>
				['unsupported_source', 'unsupported_claim'].includes(finding.status)
			).length,
		},
		sourceCounts: sourceCountsFromSources(sources),
		assumptions: [],
		warnings: citationAuditWarnings(auditResult),
		summary: auditResult.canComplete
			? 'Citation audit completed and unsupported claims were removed or retained with citations.'
			: 'Citation audit failed because no credible supported claims remained.',
	});

	if (!auditResult.canComplete) {
		return completeDeepResearchJobWithEvidenceLimitationMemoFromState({
			job,
			currentPlan,
			sources,
			limitations: [...(input.limitations ?? []), ...citationAuditWarnings(auditResult)],
			now,
		});
	}

	const auditedMarkdown = renderAuditedReportMarkdown({
		reportDraft,
		auditedReport: auditResult.auditedReport,
		sources: reportDraft.sources,
		researchLanguage: currentPlan.rawPlan.researchLanguage ?? 'en',
	});
	const reportName = buildReportArtifactName(
		job.title,
		currentPlan.rawPlan.researchLanguage ?? 'en'
	);
	const reportArtifactId = `deep-research-report-${job.id}`;
	const existingReportArtifact = await loadArtifactById({
		userId: job.userId,
		artifactId: reportArtifactId,
	});
	const reportArtifact =
		existingReportArtifact ??
		(await createArtifact({
			id: reportArtifactId,
			userId: job.userId,
			conversationId: job.conversationId,
			type: 'generated_output',
			retrievalClass: 'durable',
			name: reportName,
			mimeType: 'text/markdown',
			extension: 'md',
			sizeBytes: Buffer.byteLength(auditedMarkdown, 'utf8'),
			contentText: auditedMarkdown,
			summary:
				(currentPlan.rawPlan.researchLanguage ?? 'en') === 'hu'
					? `Ellenőrzött kutatási jelentés: ${job.title}`
					: `Audited Research Report for ${job.title}`,
			metadata: {
				deepResearchReport: true,
				deepResearchReportKind: 'audited',
				deepResearchJobId: job.id,
				deepResearchDepth: job.depth,
				documentFamilyId: randomUUID(),
				documentFamilyStatus: 'active',
				documentLabel: reportName,
				documentRole: 'research_report',
				versionNumber: 1,
				originConversationId: job.conversationId,
				citationAuditStatus: auditResult.status,
			},
		}));
	await completeResearchResumePoint({
		userId: job.userId,
		jobId: job.id,
		resumeKey: reportAssemblyResumeKey,
		result: {
			artifactId: reportArtifact.id,
			citationAuditStatus: auditResult.status,
		},
		now,
	});

	return finalizeAuditedReportJobFromArtifact({
		job,
		currentPlan,
		artifactId: reportArtifact.id,
		now,
	});
}

async function finalizeAuditedReportJobFromArtifact(input: {
	job: DeepResearchJobRow;
	currentPlan: DeepResearchPlanSummary;
	artifactId: string;
	now: Date;
}): Promise<DeepResearchJob | null> {
	const [updatedJob] = await db
		.update(deepResearchJobs)
		.set({
			status: 'completed',
			stage: 'report_ready',
			reportArtifactId: input.artifactId,
			completedAt: input.now,
			updatedAt: input.now,
		})
		.where(eq(deepResearchJobs.id, input.job.id))
		.returning();
	if (!updatedJob) return null;

	await db
		.update(conversations)
		.set({
			status: 'sealed',
			sealedAt: input.now,
			updatedAt: input.now,
		})
		.where(
			and(
				eq(conversations.id, input.job.conversationId),
				eq(conversations.userId, input.job.userId)
			)
		);

	const timelineEvents = await loadTimelineEventsByJobId(input.job.userId, [updatedJob.id]);
	return mapDeepResearchJob(
		updatedJob,
		input.currentPlan,
		timelineEvents.get(updatedJob.id) ?? []
	);
}

export async function completeDeepResearchJobWithEvidenceLimitationMemo(
	input: CompleteDeepResearchJobWithEvidenceLimitationMemoInput
): Promise<DeepResearchJob | null> {
	const now = input.now ?? new Date();
	const [job] = await db
		.select()
		.from(deepResearchJobs)
		.where(and(eq(deepResearchJobs.id, input.jobId), eq(deepResearchJobs.userId, input.userId)))
		.limit(1);

	if (!job) return null;
	if (
		job.status === 'completed' &&
		job.stage === 'evidence_limitation_memo_ready' &&
		job.reportArtifactId
	) {
		const currentPlans = await loadCurrentPlansByJobId([job.id]);
		const timelineEvents = await loadTimelineEventsByJobId(input.userId, [job.id]);
		return mapDeepResearchJob(
			job,
			currentPlans.get(job.id) ?? null,
			timelineEvents.get(job.id) ?? []
		);
	}
	if (job.status !== 'approved' && job.status !== 'running') {
		return null;
	}

	const currentPlans = await loadCurrentPlansByJobId([job.id]);
	const currentPlan = currentPlans.get(job.id);
	if (!currentPlan?.rawPlan) return null;
	const sources = await listResearchSources({
		userId: input.userId,
		jobId: job.id,
	});

	return completeDeepResearchJobWithEvidenceLimitationMemoFromState({
		job,
		currentPlan,
		sources,
		limitations: input.limitations,
		now,
	});
}

async function completeDeepResearchJobWithEvidenceLimitationMemoFromState(input: {
	job: DeepResearchJobRow;
	currentPlan: DeepResearchPlanSummary;
	sources: DeepResearchSource[];
	limitations: string[];
	now: Date;
}): Promise<DeepResearchJob | null> {
	if (!input.currentPlan.rawPlan) return null;
	const memoResumeKey = `report:${input.job.id}:evidence_limitation_memo`;
	const existingMemoResumePoint = await getResearchResumePoint({
		userId: input.job.userId,
		jobId: input.job.id,
		resumeKey: memoResumeKey,
	});
	const existingMemoArtifactId =
		typeof existingMemoResumePoint?.result?.artifactId === 'string'
			? existingMemoResumePoint.result.artifactId
			: null;
	if (existingMemoArtifactId) {
		return finalizeEvidenceLimitationMemoJobFromArtifact({
			job: input.job,
			currentPlan: input.currentPlan,
			artifactId: existingMemoArtifactId,
			now: input.now,
		});
	}
	const researchLanguage = input.currentPlan.rawPlan.researchLanguage ?? 'en';
	const reviewedScope = buildEvidenceLimitationReviewedScope({
		plan: input.currentPlan.rawPlan,
		sources: input.sources,
	});
	await upsertResearchResumePoint({
		userId: input.job.userId,
		jobId: input.job.id,
		conversationId: input.job.conversationId,
		boundary: 'report_assembly',
		resumeKey: memoResumeKey,
		stage: 'evidence_limitation_memo',
		payload: {
			limitationCount: input.limitations.length,
			reviewedCount: reviewedScope.reviewedCount,
		},
		now: input.now,
	});
	const memo = writeEvidenceLimitationMemo({
		jobId: input.job.id,
		plan: input.currentPlan.rawPlan,
		reviewedScope,
		limitations: input.limitations,
		nextResearchDirection: buildEvidenceLimitationNextResearchDirection({
			limitations: input.limitations,
			researchLanguage,
		}),
	});
	const memoName = buildEvidenceLimitationMemoArtifactName(input.job.title, researchLanguage);
	const memoArtifactId = `deep-research-memo-${input.job.id}`;
	const existingMemoArtifact = await loadArtifactById({
		userId: input.job.userId,
		artifactId: memoArtifactId,
	});
	const memoArtifact =
		existingMemoArtifact ??
		(await createArtifact({
			id: memoArtifactId,
			userId: input.job.userId,
			conversationId: input.job.conversationId,
			type: 'generated_output',
			retrievalClass: 'durable',
			name: memoName,
			mimeType: 'text/markdown',
			extension: 'md',
			sizeBytes: Buffer.byteLength(memo.markdown, 'utf8'),
			contentText: memo.markdown,
			summary:
				researchLanguage === 'hu'
					? `Bizonyítékkorlát-memó: ${input.job.title}`
					: `Evidence Limitation Memo for ${input.job.title}`,
			metadata: {
				deepResearchEvidenceLimitationMemo: true,
				deepResearchReport: false,
				deepResearchJobId: input.job.id,
				deepResearchDepth: input.job.depth,
				documentFamilyId: randomUUID(),
				documentFamilyStatus: 'active',
				documentLabel: memoName,
				documentRole: 'evidence_limitation_memo',
				memoTitle: memo.title,
				versionNumber: 1,
				originConversationId: input.job.conversationId,
				reviewedScope: memo.reviewedScope,
				groundedLimitationReasons: memo.limitations,
				nextResearchDirection: memo.nextResearchDirection,
				memoRecoveryActions: memo.recoveryActions,
			},
		}));
	await completeResearchResumePoint({
		userId: input.job.userId,
		jobId: input.job.id,
		resumeKey: memoResumeKey,
		result: {
			artifactId: memoArtifact.id,
		},
		now: input.now,
	});

	await saveResearchTimelineEvent({
		jobId: input.job.id,
		conversationId: input.job.conversationId,
		userId: input.job.userId,
		taskId: null,
		stage: 'evidence_limitation_memo',
		kind: 'stage_completed',
		occurredAt: input.now.toISOString(),
		messageKey: 'deepResearch.timeline.evidenceLimitationMemoCompleted',
		messageParams: {
			topicRelevantSources: reviewedScope.topicRelevantCount,
			rejectedOrOffTopicSources: reviewedScope.rejectedOrOffTopicCount,
		},
		sourceCounts: sourceCountsFromSources(input.sources),
		assumptions: [],
		warnings: memo.limitations,
		summary:
			researchLanguage === 'hu'
				? 'A kutatás bizonyítékkorlát-memóval zárult, mert nem volt elég hiteles, témához illeszkedő bizonyíték.'
				: 'Research completed with an Evidence Limitation Memo because there was not enough credible topic-relevant evidence.',
	});

	const [updatedJob] = await db
		.update(deepResearchJobs)
		.set({
			status: 'completed',
			stage: 'evidence_limitation_memo_ready',
			reportArtifactId: memoArtifact.id,
			completedAt: input.now,
			updatedAt: input.now,
		})
		.where(eq(deepResearchJobs.id, input.job.id))
		.returning();
	const timelineEvents = await loadTimelineEventsByJobId(input.job.userId, [updatedJob.id]);
	return mapDeepResearchJob(
		updatedJob,
		input.currentPlan,
		timelineEvents.get(updatedJob.id) ?? [],
		undefined,
		{ evidenceLimitationMemo: toEvidenceLimitationMemoPayload(memo) }
	);
}

async function finalizeEvidenceLimitationMemoJobFromArtifact(input: {
	job: DeepResearchJobRow;
	currentPlan: DeepResearchPlanSummary;
	artifactId: string;
	now: Date;
}): Promise<DeepResearchJob | null> {
	const [updatedJob] = await db
		.update(deepResearchJobs)
		.set({
			status: 'completed',
			stage: 'evidence_limitation_memo_ready',
			reportArtifactId: input.artifactId,
			completedAt: input.now,
			updatedAt: input.now,
		})
		.where(eq(deepResearchJobs.id, input.job.id))
		.returning();
	if (!updatedJob) return null;
	const timelineEvents = await loadTimelineEventsByJobId(input.job.userId, [updatedJob.id]);
	return mapDeepResearchJob(
		updatedJob,
		input.currentPlan,
		timelineEvents.get(updatedJob.id) ?? []
	);
}

function toEvidenceLimitationMemoPayload(input: {
	title: string;
	reviewedScope: DeepResearchEvidenceLimitationMemo['reviewedScope'];
	limitations: string[];
	nextResearchDirection: string;
	recoveryActions: DeepResearchEvidenceLimitationMemo['recoveryActions'];
}): DeepResearchEvidenceLimitationMemo {
	return {
		title: input.title,
		reviewedScope: input.reviewedScope,
		limitations: input.limitations,
		nextResearchDirection: input.nextResearchDirection,
		recoveryActions: input.recoveryActions,
	};
}

export async function discussDeepResearchReport(
	input: DiscussDeepResearchReportInput
): Promise<DeepResearchReportActionResult | null> {
	const context = await loadCompletedResearchReportContext(input);
	if (!context) return null;

	const conversation = await createConversation(
		input.userId,
		buildFollowupConversationTitle('Discuss', context.job.title)
	);
	const researchLanguage = resolveReportLanguage(context);
	const seedMessage = buildDiscussReportSeedMessage(context, researchLanguage);
	const message = input.persistSeedMessage
		? await createMessage(
				conversation.id,
				'user',
				seedMessage,
				undefined,
				undefined,
				{
					deepResearchReportContext: {
						action: 'discuss',
						sourceJobId: context.job.id,
						sourceConversationId: context.job.conversationId,
						reportArtifactId: context.report.id,
					},
				}
			)
		: null;
	await createArtifactLink({
		userId: input.userId,
		artifactId: context.report.id,
		linkType: 'attached_to_conversation',
		conversationId: conversation.id,
		messageId: message?.id,
	});

	return {
		sourceJobId: context.job.id,
		reportArtifactId: context.report.id,
		conversation,
		messageId: message?.id,
		seedMessage,
		researchLanguage,
	};
}

export async function researchFurtherFromDeepResearchReport(
	input: ResearchFurtherFromDeepResearchReportInput
): Promise<ResearchFurtherReportActionResult | null> {
	const context = await loadCompletedResearchReportContext(input);
	if (!context) return null;

	const depth = input.depth ?? (context.job.depth as DeepResearchDepth);
	const researchLanguage = input.researchLanguage ?? resolveReportLanguage(context);
	const conversation = await createConversation(
		input.userId,
		buildFollowupConversationTitle('Research further', context.job.title)
	);
	const userRequest = buildResearchFurtherSeedMessage(context, researchLanguage);
	const message = await createMessage(
		conversation.id,
		'user',
		userRequest,
		undefined,
		undefined,
		{
			deepResearchReportContext: {
				action: 'research_further',
				sourceJobId: context.job.id,
				sourceConversationId: context.job.conversationId,
				reportArtifactId: context.report.id,
			},
		}
	);
	await createArtifactLink({
		userId: input.userId,
		artifactId: context.report.id,
		linkType: 'attached_to_conversation',
		conversationId: conversation.id,
		messageId: message.id,
	});

	const job = await startDeepResearchJobShell({
		userId: input.userId,
		conversationId: conversation.id,
		triggerMessageId: message.id,
		userRequest,
		depth,
		researchLanguage,
		planningContext: [
			{
				type: 'report',
				title: context.report.name,
				summary: context.report.summary ?? context.report.contentText ?? context.job.title,
			},
		],
		now: input.now,
	});

	return {
		sourceJobId: context.job.id,
		reportArtifactId: context.report.id,
		conversation,
		messageId: message.id,
		seedMessage: userRequest,
		researchLanguage,
		job,
	};
}

async function loadCompletedResearchReportContext(input: {
	userId: string;
	jobId: string;
}): Promise<ResearchReportContext | null> {
	const [row] = await db
		.select({
			job: deepResearchJobs,
			report: artifacts,
		})
		.from(deepResearchJobs)
		.innerJoin(artifacts, eq(deepResearchJobs.reportArtifactId, artifacts.id))
		.where(
			and(
				eq(deepResearchJobs.id, input.jobId),
				eq(deepResearchJobs.userId, input.userId),
				eq(deepResearchJobs.status, 'completed'),
				eq(artifacts.userId, input.userId)
			)
		)
		.limit(1);

	if (!row || !isResearchReportArtifactMetadata(row.report.metadataJson)) {
		return null;
	}
	return row;
}

async function loadArtifactById(input: {
	userId: string;
	artifactId: string;
}): Promise<typeof artifacts.$inferSelect | null> {
	const [artifact] = await db
		.select()
		.from(artifacts)
		.where(and(eq(artifacts.id, input.artifactId), eq(artifacts.userId, input.userId)))
		.limit(1);
	return artifact ?? null;
}

function isResearchReportArtifactMetadata(metadataJson: string | null): boolean {
	if (!metadataJson) return false;
	let metadata: unknown;
	try {
		metadata = JSON.parse(metadataJson);
	} catch {
		return false;
	}
	if (!metadata || typeof metadata !== 'object') return false;
	const record = metadata as Record<string, unknown>;
	return (
		record.deepResearchReport === true &&
		record.documentRole === 'research_report' &&
		record.deepResearchEvidenceLimitationMemo !== true
	);
}

async function applyGeneratedResearchTitle(input: {
	userId: string;
	conversationId: string;
	job: DeepResearchJobRow;
	userRequest: string;
	assistantContext: string;
	now: Date;
}): Promise<DeepResearchJobRow> {
	const title = await generateDeepResearchTitle(input.userRequest, input.assistantContext);
	if (title === input.job.title) return input.job;
	const [updatedJob] = await db
		.update(deepResearchJobs)
		.set({ title, updatedAt: input.now })
		.where(eq(deepResearchJobs.id, input.job.id))
		.returning();
	await updateConversationTitle(input.userId, input.conversationId, title).catch(() => null);
	return updatedJob ?? input.job;
}

async function generateDeepResearchTitle(
	userRequest: string,
	assistantContext: string
): Promise<string> {
	const fallback = buildJobTitle(userRequest);
	if (process.env.NODE_ENV === 'test') return fallback;
	try {
		const title = await generateTitle(userRequest, assistantContext);
		return normalizeTitleWithoutEllipsis(title) || fallback;
	} catch {
		return fallback;
	}
}

function buildJobTitle(userRequest: string): string {
	return normalizeTitleWithoutEllipsis(userRequest) || 'Deep Research';
}

function buildFollowupConversationTitle(prefix: string, jobTitle: string): string {
	return normalizeTitleWithoutEllipsis(`${prefix}: ${jobTitle}`) || prefix;
}

function normalizeTitleWithoutEllipsis(value: string): string {
	return value.replace(/\s+/g, ' ').replace(/\.{3,}$/u, '').trim();
}

function resolveReportLanguage(context: ResearchReportContext): ResearchLanguage {
	const text = `${context.job.title}\n${context.job.userRequest}\n${context.report.contentText ?? ''}`;
	return resolveResearchLanguage({ userRequest: text });
}

function buildDiscussReportSeedMessage(
	context: ResearchReportContext,
	researchLanguage: ResearchLanguage
): string {
	if (researchLanguage === 'hu') {
		return [
			`Beszéljük át ezt a kutatási jelentést: ${context.report.name}`,
			'',
			`Forrás mély kutatási téma: ${context.job.title}`,
			'',
			'A csatolt kutatási jelentést használd munkakontextusként, és magyarul válaszolj.',
		].join('\n');
	}
	return [
		`Discuss this Research Report: ${context.report.name}`,
		'',
		`Source Deep Research topic: ${context.job.title}`,
		'',
		'Use the attached Research Report as the working context for this normal chat.',
	].join('\n');
}

function buildResearchFurtherSeedMessage(
	context: ResearchReportContext,
	researchLanguage: ResearchLanguage
): string {
	if (researchLanguage === 'hu') {
		return [
			`Kutass tovább ebből a kutatási jelentésből: ${context.report.name}`,
			'',
			`Forrás mély kutatási téma: ${context.job.title}`,
			'',
			'A csatolt kutatási jelentést használd tervezési kontextusként, készíts új jóváhagyandó mély kutatási tervet, és magyarul válaszolj.',
		].join('\n');
	}
	return [
		`Research further from this Research Report: ${context.report.name}`,
		'',
		`Source Deep Research topic: ${context.job.title}`,
		'',
		'Use the attached Research Report as planning context and draft a new Deep Research Plan for approval.',
	].join('\n');
}

function mapSourceForReportWriter(source: DeepResearchSource) {
	return {
		id: source.id,
		reviewedSourceId: source.id,
		status: source.status,
		title: source.title ?? source.url,
		url: source.url,
		citationNote: source.citationNote,
	};
}

function buildCitationAuditReportDraft(
	reportDraft: ResearchReportDraft,
	synthesisNotes: SynthesisNotes
): DeepResearchReportDraft {
	const visibleFindings = selectResearchReportFindings(synthesisNotes);
	return {
		title: reportDraft.title,
		sections: [
			{
				heading: 'Key Findings',
				claims: visibleFindings.map((finding, index) => ({
					id: `finding-${index + 1}`,
					text: finding.statement,
					core: true,
					citationSourceIds: uniqueValues(
						finding.sourceRefs.flatMap((sourceRef) => [
							sourceRef.discoveredSourceId,
							sourceRef.reviewedSourceId,
						])
					),
				})),
			},
		],
		limitations: reportDraft.limitations,
	};
}

function renderAuditedReportMarkdown(input: {
	reportDraft: ResearchReportDraft;
	auditedReport: DeepResearchReportDraft;
	sources: ResearchReportDraft['sources'];
	researchLanguage: ResearchLanguage;
}): string {
	const labels = auditedReportLabels[input.researchLanguage];
	const retainedClaims = input.auditedReport.sections
		.flatMap((section) => section.claims)
		.slice(0, MAX_REPORT_KEY_FINDINGS);
	const sourceById = new Map(input.sources.map((source) => [source.id, source]));
	const citedSourceIds = new Set(retainedClaims.flatMap((claim) => claim.citationSourceIds));
	const citedSources = input.sources.filter((source) => citedSourceIds.has(source.id));
	const keyFindingLines =
		retainedClaims.length > 0
			? retainedClaims.map((claim) => `- ${formatAuditedClaim(claim, sourceById)}`)
			: [`- ${labels.none}`];
	const lines = [
		`# ${input.reportDraft.title}`,
		'',
		`## ${labels.executiveSummary}`,
		...renderAuditedExecutiveSummary(retainedClaims, sourceById, labels),
		'',
		`## ${labels.keyFindings}`,
		...keyFindingLines,
		'',
	];

	for (const section of input.reportDraft.sections) {
		const sectionBody = renderAuditedSectionBody({
			section,
			retainedClaims,
			sourceById,
			researchLanguage: input.researchLanguage,
			labels,
		});
		if (sectionBody.length > 0) {
			lines.push(`## ${section.heading}`, ...sectionBody, '');
		}
	}

	if (input.auditedReport.limitations.length > 0) {
		lines.push(
			`## ${labels.reportLimitations}`,
			...input.auditedReport.limitations.map(
				(limitation) => `- ${localizeAuditedLimitation(limitation, input.researchLanguage)}`
			),
			''
		);
	}

	lines.push(
		`## ${labels.sources}`,
		...(citedSources.length > 0
			? citedSources.map(
					(source) => `[${source.citationNumber}] ${source.title} - ${source.url}`
				)
			: [`- ${labels.none}`])
	);

	return lines.join('\n');
}

const auditedReportLabels: Record<
	ResearchLanguage,
	{
		executiveSummary: string;
		keyFindings: string;
		sources: string;
		reportLimitations: string;
		none: string;
		noSupportedClaims: string;
		bottomLine: string;
		supportingEvidence: string;
		methodology: string;
		comparison: string;
		recommendations: string;
		analysis: string;
		evidenceBackedPoint: string;
	}
> = {
	en: {
		executiveSummary: 'Executive Summary',
		keyFindings: 'Key Findings',
		sources: 'Sources',
		reportLimitations: 'Report Limitations',
		none: 'None.',
		noSupportedClaims: 'The citation audit found no credible supported claims.',
		bottomLine: 'Bottom line',
		supportingEvidence: 'Supporting evidence',
		methodology: 'Methodology',
		comparison: 'Comparison',
		recommendations: 'Recommendations',
		analysis: 'Analysis',
		evidenceBackedPoint: 'Evidence-backed point',
	},
	hu: {
		executiveSummary: 'Vezetői összefoglaló',
		keyFindings: 'Fő megállapítások',
		sources: 'Források',
		reportLimitations: 'Jelentési korlátok',
		none: 'Nincs.',
		noSupportedClaims:
			'A hivatkozás-ellenőrzés nem talált hitelesen alátámasztott állítást.',
		bottomLine: 'Rövid válasz',
		supportingEvidence: 'Alátámasztó bizonyíték',
		methodology: 'Módszertan',
		comparison: 'Összehasonlítás',
		recommendations: 'Javaslatok',
		analysis: 'Elemzés',
		evidenceBackedPoint: 'Bizonyítékkal alátámasztott pont',
	},
};

function renderAuditedExecutiveSummary(
	retainedClaims: DeepResearchReportDraft['sections'][number]['claims'],
	sourceById: Map<string, ResearchReportDraft['sources'][number]>,
	labels: (typeof auditedReportLabels)[ResearchLanguage]
): string[] {
	if (retainedClaims.length === 0) {
		return [labels.noSupportedClaims];
	}

	const [firstClaim, ...supportingClaims] = retainedClaims;
	const lines = [
		`${labels.bottomLine}: ${formatAuditedClaim(firstClaim, sourceById)}`,
	];
	const supporting = supportingClaims.slice(0, 2);
	if (supporting.length > 0) {
		lines.push(
			`${labels.supportingEvidence}: ${supporting
				.map((claim) => formatAuditedClaim(claim, sourceById))
				.join(' ')}`,
		);
	}
	return lines;
}

function renderAuditedSectionBody(input: {
	section: ResearchReportDraft['sections'][number];
	retainedClaims: DeepResearchReportDraft['sections'][number]['claims'];
	sourceById: Map<string, ResearchReportDraft['sources'][number]>;
	researchLanguage: ResearchLanguage;
	labels: (typeof auditedReportLabels)[ResearchLanguage];
}): string[] {
	const kind = normalizeAuditedSectionKind(input.section.heading, input.researchLanguage);
	if (kind === 'methodology') {
		return input.section.body.split('\n');
	}

	if (input.retainedClaims.length === 0) {
		return [`- ${input.labels.none}`];
	}

	if (kind === 'comparison') {
		return [
			`| # | ${input.labels.evidenceBackedPoint} |`,
			'| --- | --- |',
			...input.retainedClaims.map(
				(claim, index) =>
					`| ${index + 1} | ${escapeMarkdownTableCell(
						formatAuditedClaim(claim, input.sourceById)
					)} |`
			),
		];
	}

	return input.retainedClaims.map(
		(claim) => `- ${formatAuditedClaim(claim, input.sourceById)}`
	);
}

function normalizeAuditedSectionKind(
	heading: string,
	researchLanguage: ResearchLanguage
): 'methodology' | 'comparison' | 'recommendations' | 'analysis' {
	const labels = auditedReportLabels[researchLanguage];
	const normalized = normalizeLabel(heading);
	if (normalized === normalizeLabel(labels.methodology)) return 'methodology';
	if (normalized === normalizeLabel(labels.comparison)) return 'comparison';
	if (normalized === normalizeLabel(labels.recommendations)) return 'recommendations';
	return 'analysis';
}

function localizeAuditedLimitation(
	limitation: string,
	researchLanguage: ResearchLanguage
): string {
	if (researchLanguage !== 'hu') return limitation;
	const removedUnsupported = limitation.match(
		/^Removed unsupported core claim after citation audit:\s*(.+)$/i
	);
	if (removedUnsupported) {
		return `A hivatkozás-ellenőrzés eltávolított egy nem alátámasztott alapállítást: ${removedUnsupported[1]}`;
	}
	const removedSource = limitation.match(
		/^Removed claim because it cited sources that were not both reviewed and cited:\s*(.+)$/i
	);
	if (removedSource) {
		return `A hivatkozás-ellenőrzés eltávolított egy állítást, mert nem áttekintett és idézett forrásra hivatkozott: ${removedSource[1]}`;
	}
	const repaired = limitation.match(
		/^Repaired unsupported core claim during citation audit:\s*(.+)$/i
	);
	if (repaired) {
		return `A hivatkozás-ellenőrzés javított egy nem alátámasztott alapállítást: ${repaired[1]}`;
	}
	return limitation;
}

function formatAuditedClaim(
	claim: DeepResearchReportDraft['sections'][number]['claims'][number],
	sourceById: Map<string, ResearchReportDraft['sources'][number]>
): string {
	const citationNumbers = claim.citationSourceIds
		.map((sourceId) => sourceById.get(sourceId))
		.filter((source): source is ResearchReportDraft['sources'][number] => Boolean(source))
		.map((source) => `[${source.citationNumber}]`);
	const citationSuffix =
		citationNumbers.length > 0 ? ` ${uniqueValues(citationNumbers).join(' ')}` : '';
	return `${claim.text}${citationSuffix}`;
}

function normalizeLabel(value: string): string {
	return value
		.toLowerCase()
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.replace(/[^\p{L}]+/gu, ' ')
		.trim();
}

function escapeMarkdownTableCell(value: string): string {
	return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ');
}

function sourceCountsFromSources(sources: DeepResearchSource[]): DeepResearchSourceCounts {
	return {
		discovered: sources.length,
		reviewed: sources.filter((source) => source.reviewedAt).length,
		cited: sources.filter((source) => source.citedAt).length,
	};
}

function citationAuditWarnings(auditResult: Awaited<ReturnType<typeof auditDeepResearchReportCitations>>): string[] {
	if (auditResult.limitations.length > 0) return auditResult.limitations.slice(0, 6);
	if (!auditResult.canComplete) {
		return ['No reviewed cited source supported the core claims strongly enough to publish a report.'];
	}
	return [];
}

function uniqueValues<T>(values: T[]): T[] {
	return [...new Set(values)];
}

function buildReportArtifactName(
	jobTitle: string,
	researchLanguage: ResearchLanguage = 'en'
): string {
	const safeTitle = jobTitle
		.replace(/[\\/:*?"<>|]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 96);
	const prefix = researchLanguage === 'hu' ? 'Kutatási jelentés' : 'Research Report';
	return `${prefix} - ${safeTitle || 'Deep Research'}.md`;
}

function buildEvidenceLimitationMemoArtifactName(
	jobTitle: string,
	researchLanguage: ResearchLanguage = 'en'
): string {
	const safeTitle = jobTitle
		.replace(/[\\/:*?"<>|]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 96);
	const prefix =
		researchLanguage === 'hu' ? 'Bizonyítékkorlát-memó' : 'Evidence Limitation Memo';
	return `${prefix} - ${safeTitle || 'Deep Research'}.md`;
}

function buildEvidenceLimitationReviewedScope(input: {
	plan: DeepResearchPlanRaw;
	sources: DeepResearchSource[];
}) {
	let topicRelevantCount = 0;
	let rejectedOrOffTopicCount = 0;

	for (const source of input.sources) {
		if (source.rejectedReason) {
			rejectedOrOffTopicCount += 1;
			continue;
		}
		if (!source.reviewedAt) continue;
		const topicRelevant = isSourceTopicRelevantToPlan({
			planGoal: input.plan.goal,
			keyQuestions: input.plan.keyQuestions,
			source: {
				title: source.title ?? source.url,
				snippet: source.snippet,
				sourceText: [
					source.sourceText,
					source.reviewedNote,
					...(source.extractedClaims ?? []),
				]
					.filter(Boolean)
					.join(' '),
			},
		});
		if (topicRelevant) {
			topicRelevantCount += 1;
		} else {
			rejectedOrOffTopicCount += 1;
		}
	}

	return {
		discoveredCount: input.sources.length,
		reviewedCount: input.sources.filter((source) => Boolean(source.reviewedAt)).length,
		topicRelevantCount,
		rejectedOrOffTopicCount,
	};
}

function buildEvidenceLimitationNextResearchDirection(input: {
	limitations: string[];
	researchLanguage: ResearchLanguage;
}): string {
	const primaryLimitation = input.limitations.map((value) => value.trim()).find(Boolean);
	if (input.researchLanguage === 'hu') {
		return primaryLimitation
			? `Következőként ezt a korlátot kezeld célzott tervmódosítással vagy erősebb forrásokkal: ${primaryLimitation}`
			: 'Módosítsd a kutatási tervet, vagy adj hozzá erősebb, témához illeszkedő forrásokat az új futás előtt.';
	}
	return primaryLimitation
		? `Address this limitation with a targeted plan revision or stronger sources before requesting a report: ${primaryLimitation}`
		: 'Revise the Research Plan or add stronger topic-relevant sources before starting a new run.';
}

async function loadCurrentPlansByJobId(
	jobIds: string[]
): Promise<Map<string, DeepResearchPlanSummary>> {
	if (jobIds.length === 0) return new Map();

	const rows = await db
		.select()
		.from(deepResearchPlanVersions)
		.where(inArray(deepResearchPlanVersions.jobId, jobIds))
		.orderBy(asc(deepResearchPlanVersions.jobId), desc(deepResearchPlanVersions.version));

	const plans = new Map<string, DeepResearchPlanSummary>();
	for (const row of rows) {
		if (!plans.has(row.jobId)) {
			plans.set(row.jobId, mapResearchPlanVersionRow(row));
		}
	}
	return plans;
}

async function loadTimelineEventsByJobId(
	userId: string,
	jobIds: string[]
): Promise<Map<string, DeepResearchTimelineEvent[]>> {
	const events = await listResearchTimelineEventsForJobs({ userId, jobIds });
	const timelineByJobId = new Map<string, DeepResearchTimelineEvent[]>();
	for (const event of events) {
		const mapped = mapTimelineEvent(event);
		timelineByJobId.set(event.jobId, [...(timelineByJobId.get(event.jobId) ?? []), mapped]);
	}
	return timelineByJobId;
}

type SourceLedgerForCard = {
	sourceCounts: DeepResearchJob['sourceCounts'];
	sources: DeepResearchSource[];
};

type DeepResearchJobReadModel = {
	usageSummary?: DeepResearchUsageSummary;
	runtimeEstimate?: DeepResearchRuntimeEstimate;
	evidenceLimitationMemo?: DeepResearchEvidenceLimitationMemo | null;
	passCheckpoints?: DeepResearchPassCheckpoint[];
	coverageGaps?: DeepResearchCoverageGap[];
	evidenceNotes?: DeepResearchEvidenceNote[];
	resumePoints?: DeepResearchResumePoint[];
};

type DeepResearchPassStateForCard = {
	passCheckpoints: DeepResearchPassCheckpoint[];
	coverageGaps: DeepResearchCoverageGap[];
	evidenceNotes: DeepResearchEvidenceNote[];
	resumePoints: DeepResearchResumePoint[];
};

async function loadPassStatesByJobId(
	userId: string,
	jobIds: string[]
): Promise<Map<string, DeepResearchPassStateForCard>> {
	const states = new Map<string, DeepResearchPassStateForCard>();
	await Promise.all(
		jobIds.map(async (jobId) => {
			const [passCheckpoints, coverageGaps, evidenceNotes, resumePoints] = await Promise.all([
				listResearchPassCheckpoints({ userId, jobId }),
				listResearchCoverageGaps({ userId, jobId }),
				listDeepResearchEvidenceNotes({ userId, jobId }),
				listResearchResumePoints({ userId, jobId }),
			]);
			states.set(jobId, {
				passCheckpoints,
				coverageGaps,
				evidenceNotes,
				resumePoints,
			});
		})
	);
	return states;
}

async function loadUsageSummariesByJobId(
	userId: string,
	jobIds: string[]
): Promise<Map<string, DeepResearchUsageSummary>> {
	const summaries = new Map<string, DeepResearchUsageSummary>();
	await Promise.all(
		jobIds.map(async (jobId) => {
			const summary = await getResearchUsageCostSummary({ userId, jobId });
			summaries.set(jobId, {
				totalCostUsdMicros: summary.totalCostUsdMicros,
				totalTokens: summary.totalTokens,
				byModel: summary.byModel,
			});
		})
	);
	return summaries;
}

async function loadRuntimeEstimatesByJobId(
	rows: DeepResearchJobRow[]
): Promise<Map<string, DeepResearchRuntimeEstimate>> {
	const estimates = new Map<string, DeepResearchRuntimeEstimate>();
	const calibrated = await loadCalibratedRuntimeStats(rows);
	for (const row of rows) {
		const actualRuntimeMs =
			row.completedAt && row.createdAt
				? Math.max(0, row.completedAt.getTime() - row.createdAt.getTime())
				: undefined;
		const calibratedLabel = calibrated.get(row.depth);
		estimates.set(row.id, {
			label: actualRuntimeMs
				? formatRuntimeRange(actualRuntimeMs, actualRuntimeMs)
				: (calibratedLabel ?? fallbackRuntimeEstimate(row.depth as DeepResearchDepth)),
			source: calibratedLabel ? 'calibrated' : 'fallback',
			...(actualRuntimeMs !== undefined ? { actualRuntimeMs } : {}),
		});
	}
	return estimates;
}

async function loadEvidenceLimitationMemosByJobId(
	userId: string,
	rows: DeepResearchJobRow[]
): Promise<Map<string, DeepResearchEvidenceLimitationMemo>> {
	const memoRows = rows.filter(
		(row) => row.stage === 'evidence_limitation_memo_ready' && row.reportArtifactId
	);
	if (memoRows.length === 0) return new Map();

	const artifactIds = memoRows
		.map((row) => row.reportArtifactId)
		.filter((id): id is string => Boolean(id));
	const artifactRows = await db
		.select({
			id: artifacts.id,
			metadataJson: artifacts.metadataJson,
		})
		.from(artifacts)
		.where(and(eq(artifacts.userId, userId), inArray(artifacts.id, artifactIds)));
	const memoByArtifactId = new Map(
		artifactRows
			.map((row) => [row.id, parseEvidenceLimitationMemoMetadata(row.metadataJson)] as const)
			.filter((entry): entry is readonly [string, DeepResearchEvidenceLimitationMemo] =>
				Boolean(entry[1])
			)
	);
	const memoByJobId = new Map<string, DeepResearchEvidenceLimitationMemo>();
	for (const row of memoRows) {
		const memo = row.reportArtifactId ? memoByArtifactId.get(row.reportArtifactId) : null;
		if (memo) memoByJobId.set(row.id, memo);
	}
	return memoByJobId;
}

function parseEvidenceLimitationMemoMetadata(
	metadataJson: string | null
): DeepResearchEvidenceLimitationMemo | null {
	if (!metadataJson) return null;
	let metadata: unknown;
	try {
		metadata = JSON.parse(metadataJson);
	} catch {
		return null;
	}
	if (!metadata || typeof metadata !== 'object') return null;
	const record = metadata as Record<string, unknown>;
	if (record.deepResearchEvidenceLimitationMemo !== true) return null;
	const reviewedScope = record.reviewedScope;
	if (!reviewedScope || typeof reviewedScope !== 'object') return null;
	const scopeRecord = reviewedScope as Record<string, unknown>;
	const recoveryActions = Array.isArray(record.memoRecoveryActions)
		? record.memoRecoveryActions.filter(isEvidenceLimitationMemoRecoveryAction)
		: [];
	return {
		title:
			readString(record.memoTitle) ??
			readString(record.documentLabel) ??
			'Evidence Limitation Memo',
		reviewedScope: {
			discoveredCount: readNumber(scopeRecord.discoveredCount),
			reviewedCount: readNumber(scopeRecord.reviewedCount),
			topicRelevantCount: readNumber(scopeRecord.topicRelevantCount),
			rejectedOrOffTopicCount: readNumber(scopeRecord.rejectedOrOffTopicCount),
		},
		limitations: readStringArray(record.groundedLimitationReasons),
		nextResearchDirection: readString(record.nextResearchDirection) ?? '',
		recoveryActions,
	};
}

function isEvidenceLimitationMemoRecoveryAction(
	value: unknown
): value is DeepResearchEvidenceLimitationMemo['recoveryActions'][number] {
	if (!value || typeof value !== 'object') return false;
	const record = value as Record<string, unknown>;
	return (
		typeof record.kind === 'string' &&
		typeof record.label === 'string' &&
		typeof record.description === 'string'
	);
}

function readString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value : null;
}

function readNumber(value: unknown): number {
	const parsed = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function readStringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
		: [];
}

async function loadCalibratedRuntimeStats(
	rows: DeepResearchJobRow[]
): Promise<Map<string, string>> {
	const depths = [...new Set(rows.map((row) => row.depth))];
	const estimates = new Map<string, string>();
	for (const depth of depths) {
		const completedRows = await db
			.select({
				createdAt: deepResearchJobs.createdAt,
				completedAt: deepResearchJobs.completedAt,
			})
			.from(deepResearchJobs)
			.where(
				and(
					eq(deepResearchJobs.depth, depth),
					eq(deepResearchJobs.status, 'completed'),
					sql`${deepResearchJobs.completedAt} IS NOT NULL`
				)
			)
			.orderBy(desc(deepResearchJobs.completedAt))
			.limit(50);
		const runtimes = completedRows
			.map((row) =>
				row.completedAt
					? row.completedAt.getTime() - row.createdAt.getTime()
					: 0
			)
			.filter((runtime) => runtime > 0)
			.sort((a, b) => a - b);
		if (runtimes.length < 5) continue;
		estimates.set(depth, formatRuntimeRange(percentile(runtimes, 0.5), percentile(runtimes, 0.9)));
	}
	return estimates;
}

function fallbackRuntimeEstimate(depth: DeepResearchDepth | string): string {
	if (depth === 'focused') return '30-90 sec';
	if (depth === 'max') return '4-12 min';
	return '1-4 min';
}

function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;
	const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * p) - 1));
	return values[index];
}

function formatRuntimeRange(lowMs: number, highMs: number): string {
	const low = formatRuntimeDuration(lowMs);
	const high = formatRuntimeDuration(highMs);
	return low === high ? low : `${low}-${high}`;
}

function formatRuntimeDuration(ms: number): string {
	const seconds = Math.max(1, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds} sec`;
	const minutes = Math.round(seconds / 60);
	return `${minutes} min`;
}

async function loadSourceLedgersByJobId(
	userId: string,
	conversationId: string,
	jobIds: string[]
): Promise<Map<string, SourceLedgerForCard>> {
	if (jobIds.length === 0) return new Map();

	const jobIdSet = new Set(jobIds);
	const sources = (await listResearchSources({ userId, conversationId })).filter((source) =>
		jobIdSet.has(source.jobId)
	);
	const ledgers = new Map<string, SourceLedgerForCard>();
	for (const jobId of jobIds) {
		ledgers.set(jobId, {
			sourceCounts: { discovered: 0, reviewed: 0, cited: 0 },
			sources: [],
		});
	}

	for (const source of sources) {
		const ledger = ledgers.get(source.jobId);
		if (!ledger) continue;
		ledger.sourceCounts.discovered += source.discoveredAt ? 1 : 0;
		ledger.sourceCounts.reviewed += source.reviewedAt ? 1 : 0;
		ledger.sourceCounts.cited += source.citedAt ? 1 : 0;
		if (source.reviewedAt || source.citedAt) {
			ledger.sources.push(mapSourceForCard(source));
		}
	}

	return ledgers;
}

async function saveResearchPlanDraft(
	draft: ResearchPlanDraftRecord,
	now: Date
): Promise<ResearchPlanDraftRecord & { id: string; createdAt: number; updatedAt: number }> {
	const [row] = await db
		.insert(deepResearchPlanVersions)
		.values({
			id: randomUUID(),
			jobId: draft.jobId,
			version: draft.version,
			status: draft.status,
			rawPlanJson: JSON.stringify(draft.rawPlan),
			renderedPlan: draft.renderedPlan,
			contextDisclosure: draft.contextDisclosure,
			effortEstimateJson: JSON.stringify(draft.effortEstimate),
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	return {
		...draft,
		id: row.id,
		createdAt: row.createdAt.getTime(),
		updatedAt: row.updatedAt.getTime(),
	};
}

async function persistApprovedPlanSourceScope(input: {
	userId: string;
	conversationId: string;
	jobId: string;
	includedSources: ResearchPlanIncludedSource[];
	discoveredAt: Date;
}): Promise<void> {
	for (const source of input.includedSources) {
		await saveDiscoveredResearchSource({
			userId: input.userId,
			conversationId: input.conversationId,
			jobId: input.jobId,
			url: `artifact:${source.artifactId}`,
			title: source.title ?? null,
			provider: source.type,
			snippet: source.summary,
			discoveredAt: input.discoveredAt,
		});
	}
}

function mapResearchPlanVersionRow(
	row:
		| DeepResearchPlanVersionRow
		| (ResearchPlanDraftRecord & { id?: string; createdAt?: number; updatedAt?: number })
): DeepResearchPlanSummary {
	if ('rawPlanJson' in row) {
		return {
			id: row.id,
			jobId: row.jobId,
			version: row.version,
			status: row.status as DeepResearchPlanSummary['status'],
			rawPlan: parseJson<DeepResearchPlanRaw>(row.rawPlanJson),
			renderedPlan: row.renderedPlan,
			contextDisclosure: row.contextDisclosure,
			effortEstimate: parseJson<DeepResearchEffortEstimate>(row.effortEstimateJson),
			createdAt: row.createdAt.getTime(),
			updatedAt: row.updatedAt.getTime(),
		};
	}

	return {
		id: row.id,
		jobId: row.jobId,
		version: row.version,
		status: row.status,
		rawPlan: row.rawPlan as DeepResearchPlanRaw,
		renderedPlan: row.renderedPlan,
		contextDisclosure: row.contextDisclosure,
		effortEstimate: row.effortEstimate as DeepResearchEffortEstimate,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

function parseJson<T>(value: string): T {
	return JSON.parse(value) as T;
}

function mapDeepResearchJob(
	row: DeepResearchJobRow,
	currentPlan: DeepResearchPlanSummary | null = null,
	timeline: DeepResearchTimelineEvent[] = [],
	sourceLedger: SourceLedgerForCard | undefined = undefined,
	readModel: DeepResearchJobReadModel = {}
): DeepResearchJob {
	return {
		id: row.id,
		conversationId: row.conversationId,
		triggerMessageId: row.triggerMessageId ?? null,
		depth: row.depth as DeepResearchDepth,
		status: row.status as DeepResearchJob['status'],
		stage: row.stage ?? null,
		title: row.title,
		userRequest: row.userRequest,
		reportArtifactId: row.reportArtifactId ?? null,
		plan: currentPlan,
		currentPlan,
		timeline,
		passCheckpoints: readModel.passCheckpoints ?? [],
		coverageGaps: readModel.coverageGaps ?? [],
		evidenceNotes: readModel.evidenceNotes ?? [],
		resumePoints: readModel.resumePoints ?? [],
		sourceCounts: sourceLedger?.sourceCounts ?? { discovered: 0, reviewed: 0, cited: 0 },
		sources: sourceLedger?.sources ?? [],
		evidenceLimitationMemo: readModel.evidenceLimitationMemo ?? null,
		usageSummary: readModel.usageSummary ?? {
			totalCostUsdMicros: 0,
			totalTokens: 0,
			byModel: [],
		},
		runtimeEstimate:
			readModel.runtimeEstimate ?? {
				label:
					row.completedAt && row.createdAt
						? formatRuntimeRange(
								row.completedAt.getTime() - row.createdAt.getTime(),
								row.completedAt.getTime() - row.createdAt.getTime()
							)
						: fallbackRuntimeEstimate(row.depth),
				source: 'fallback',
				...(row.completedAt
					? {
							actualRuntimeMs:
								row.completedAt.getTime() - row.createdAt.getTime(),
						}
					: {}),
			},
		createdAt: row.createdAt.getTime(),
		updatedAt: row.updatedAt.getTime(),
		completedAt: row.completedAt ? row.completedAt.getTime() : null,
		cancelledAt: row.cancelledAt ? row.cancelledAt.getTime() : null,
	};
}

function mapSourceForCard(source: DeepResearchSource): DeepResearchSource {
	return {
		id: source.id,
		jobId: source.jobId,
		conversationId: source.conversationId,
		status: source.status,
		url: source.url,
		title: source.title,
		provider: source.provider,
		snippet: source.snippet,
		sourceText: source.sourceText,
		reviewedNote: source.reviewedNote,
		citationNote: source.citationNote,
		relevanceScore: source.relevanceScore,
		rejectedReason: source.rejectedReason,
		supportedKeyQuestions: source.supportedKeyQuestions,
		extractedClaims: source.extractedClaims,
		openedContentLength: source.openedContentLength,
		discoveredAt: source.discoveredAt,
		reviewedAt: source.reviewedAt,
		citedAt: source.citedAt,
		createdAt: source.createdAt,
		updatedAt: source.updatedAt,
	};
}

function mapTimelineEvent(event: PersistedResearchTimelineEvent): DeepResearchTimelineEvent {
	return {
		id: event.id,
		jobId: event.jobId,
		conversationId: event.conversationId,
		taskId: event.taskId,
		stage: event.stage,
		kind: event.kind,
		occurredAt: event.occurredAt,
		messageKey: event.messageKey,
		messageParams: event.messageParams,
		sourceCounts: event.sourceCounts,
		assumptions: event.assumptions,
		warnings: event.warnings,
		summary: event.summary,
		createdAt: event.createdAt,
	};
}
