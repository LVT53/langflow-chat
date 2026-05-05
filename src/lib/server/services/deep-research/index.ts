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
	DeepResearchJob,
	DeepResearchRuntimeEstimate,
	DeepResearchPlanRaw,
	DeepResearchPlanSummary,
	DeepResearchSource,
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
	type ResearchLanguage,
	type ResearchPlanIncludedSource,
	type ResearchPlanDraftRecord,
} from './planning';
import { resolveResearchLanguage } from './language';
import { generateTitle } from '$lib/server/services/title-generator';
import { writeResearchReport, type ResearchReportDraft } from './report-writer';
import { listResearchSources, markResearchSourceCited, saveDiscoveredResearchSource } from './sources';
import type { SynthesisNotes } from './synthesis';
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

export type DiscussDeepResearchReportInput = {
	userId: string;
	jobId: string;
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
	return rows.map((row) =>
		mapDeepResearchJob(
			row,
			currentPlans.get(row.id) ?? null,
			timelineEvents.get(row.id) ?? [],
			sourceLedgers.get(row.id),
			{
				usageSummary: usageSummaries.get(row.id),
				runtimeEstimate: runtimeEstimates.get(row.id),
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
			selectedDepth: job.depth as DeepResearchDepth,
			researchLanguage:
				input.researchLanguage ?? currentPlan.rawPlan.researchLanguage ?? 'en',
			contextDisclosure: currentPlan.contextDisclosure ?? null,
		},
		{
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
	const reportDraft = writeResearchReport({
		jobId: job.id,
		plan: currentPlan.rawPlan,
		synthesisNotes: input.synthesisNotes,
		sources: sources.map(mapSourceForReportWriter),
		limitations: input.limitations,
	});
	const auditResult = await auditDeepResearchReportCitations({
		jobId: job.id,
		report: buildCitationAuditReportDraft(reportDraft, input.synthesisNotes),
		citedSources: sources.map((source) => ({
			id: source.id,
			status: source.status,
			title: source.title ?? source.url,
			url: source.url,
			reviewedAt: source.reviewedAt,
			citedAt: source.citedAt,
			reviewedNote: source.reviewedNote,
			citationNote: source.citationNote,
			snippet: source.snippet,
		})),
	});

	if (!auditResult.canComplete) {
		const [failedJob] = await db
			.update(deepResearchJobs)
			.set({
				status: 'failed',
				stage: 'citation_audit_failed',
				updatedAt: now,
			})
			.where(eq(deepResearchJobs.id, job.id))
			.returning();
		const timelineEvents = await loadTimelineEventsByJobId(input.userId, [failedJob.id]);
		return mapDeepResearchJob(
			failedJob,
			currentPlan,
			timelineEvents.get(failedJob.id) ?? []
		);
	}

	const auditedMarkdown = renderAuditedReportMarkdown({
		reportDraft,
		auditedReport: auditResult.auditedReport,
		sources: reportDraft.sources,
	});
	const reportName = buildReportArtifactName(job.title);
	const reportArtifact = await createArtifact({
		userId: job.userId,
		conversationId: job.conversationId,
		type: 'generated_output',
		retrievalClass: 'durable',
		name: reportName,
		mimeType: 'text/markdown',
		extension: 'md',
		sizeBytes: Buffer.byteLength(auditedMarkdown, 'utf8'),
		contentText: auditedMarkdown,
		summary: `Audited Research Report for ${job.title}`,
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
	});

	const [updatedJob] = await db
		.update(deepResearchJobs)
		.set({
			status: 'completed',
			stage: 'report_ready',
			reportArtifactId: reportArtifact.id,
			completedAt: now,
			updatedAt: now,
		})
		.where(eq(deepResearchJobs.id, job.id))
		.returning();

	await db
		.update(conversations)
		.set({
			status: 'sealed',
			sealedAt: now,
			updatedAt: now,
		})
		.where(and(eq(conversations.id, job.conversationId), eq(conversations.userId, job.userId)));

	const timelineEvents = await loadTimelineEventsByJobId(input.userId, [updatedJob.id]);
	return mapDeepResearchJob(
		updatedJob,
		currentPlan,
		timelineEvents.get(updatedJob.id) ?? []
	);
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
	await createArtifactLink({
		userId: input.userId,
		artifactId: context.report.id,
		linkType: 'attached_to_conversation',
		conversationId: conversation.id,
	});
	const researchLanguage = resolveReportLanguage(context);
	const seedMessage = buildDiscussReportSeedMessage(context, researchLanguage);

	return {
		sourceJobId: context.job.id,
		reportArtifactId: context.report.id,
		conversation,
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

	return row ?? null;
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
	return {
		title: reportDraft.title,
		sections: [
			{
				heading: 'Key Findings',
				claims: synthesisNotes.supportedFindings.map((finding, index) => ({
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
}): string {
	const retainedClaims = input.auditedReport.sections.flatMap((section) => section.claims);
	const sourceById = new Map(input.sources.map((source) => [source.id, source]));
	const citedSourceIds = new Set(retainedClaims.flatMap((claim) => claim.citationSourceIds));
	const citedSources = input.sources.filter((source) => citedSourceIds.has(source.id));
	const keyFindingLines =
		retainedClaims.length > 0
			? retainedClaims.map((claim) => `- ${formatAuditedClaim(claim, sourceById)}`)
			: ['- None.'];
	const lines = [
		`# ${input.reportDraft.title}`,
		'',
		'## Executive Summary',
		retainedClaims[0]?.text ?? 'The citation audit found no credible supported claims.',
		'',
		'## Key Findings',
		...keyFindingLines,
		'',
	];

	for (const section of input.reportDraft.sections) {
		lines.push(`## ${section.heading}`, ...keyFindingLines, '');
	}

	lines.push(
		'## Sources',
		...(citedSources.length > 0
			? citedSources.map(
					(source) => `[${source.citationNumber}] ${source.title} - ${source.url}`
				)
			: ['- None.'])
	);

	if (input.auditedReport.limitations.length > 0) {
		lines.push(
			'',
			'## Report Limitations',
			...input.auditedReport.limitations.map((limitation) => `- ${limitation}`)
		);
	}

	return lines.join('\n');
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

function uniqueValues<T>(values: T[]): T[] {
	return [...new Set(values)];
}

function buildReportArtifactName(jobTitle: string): string {
	const safeTitle = jobTitle
		.replace(/[\\/:*?"<>|]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 96);
	return `Research Report - ${safeTitle || 'Deep Research'}.md`;
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
};

async function loadUsageSummariesByJobId(
	userId: string,
	jobIds: string[]
): Promise<Map<string, DeepResearchUsageSummary>> {
	const summaries = new Map<string, DeepResearchUsageSummary>();
	await Promise.all(
		jobIds.map(async (jobId) => {
			const summary = await getResearchUsageCostSummary({ userId, jobId });
			summaries.set(jobId, summary);
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
		sourceCounts: sourceLedger?.sourceCounts ?? { discovered: 0, reviewed: 0, cited: 0 },
		sources: sourceLedger?.sources ?? [],
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
