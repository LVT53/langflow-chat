import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	artifacts,
	conversations,
	deepResearchJobs,
	deepResearchPlanVersions,
} from '$lib/server/db/schema';
import { createConversation } from '$lib/server/services/conversations';
import { createArtifact, createArtifactLink } from '$lib/server/services/knowledge/store';
import { createMessage } from '$lib/server/services/messages';
import type {
	Conversation,
	DeepResearchDepth,
	DeepResearchEffortEstimate,
	DeepResearchJob,
	DeepResearchPlanRaw,
	DeepResearchPlanSummary,
	DeepResearchSource,
	DeepResearchTimelineEvent,
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

export type CompleteDeepResearchJobWithFakeReportInput = {
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
	messageId: string;
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

	const timelineEvent = await saveResearchTimelineEvent(
		createPlanGenerationTimelineEvent({
			jobId: job.id,
			conversationId: input.conversationId,
			userId: input.userId,
			stage: 'plan_generation',
			researchLanguage,
			occurredAt: now,
			assumptions: draft.rawPlan.constraints,
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

	return mapDeepResearchJob(updatedJob, mapResearchPlanVersionRow(draft), [
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
	return rows.map((row) =>
		mapDeepResearchJob(row, currentPlans.get(row.id) ?? null, timelineEvents.get(row.id) ?? [])
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

export async function completeDeepResearchJobWithFakeReport(
	input: CompleteDeepResearchJobWithFakeReportInput
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

	const reportName = buildReportArtifactName(job.title);
	const reportArtifact = await createArtifact({
		userId: job.userId,
		conversationId: job.conversationId,
		type: 'generated_output',
		retrievalClass: 'durable',
		name: reportName,
		mimeType: 'text/markdown',
		extension: 'md',
		sizeBytes: Buffer.byteLength(buildFakeResearchReport(job), 'utf8'),
		contentText: buildFakeResearchReport(job),
		summary: `Research Report for ${job.title}`,
		metadata: {
			deepResearchReport: true,
			deepResearchJobId: job.id,
			deepResearchDepth: job.depth,
			documentFamilyId: randomUUID(),
			documentFamilyStatus: 'active',
			documentLabel: reportName,
			documentRole: 'research_report',
			versionNumber: 1,
			originConversationId: job.conversationId,
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

	const currentPlans = await loadCurrentPlansByJobId([updatedJob.id]);
	const timelineEvents = await loadTimelineEventsByJobId(input.userId, [updatedJob.id]);
	return mapDeepResearchJob(
		updatedJob,
		currentPlans.get(updatedJob.id) ?? null,
		timelineEvents.get(updatedJob.id) ?? []
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
	const message = await createMessage(
		conversation.id,
		'user',
		buildDiscussReportSeedMessage(context),
		undefined,
		undefined,
		{
			deepResearchReportContext: {
				action: 'discuss_report',
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

	return {
		sourceJobId: context.job.id,
		reportArtifactId: context.report.id,
		conversation,
		messageId: message.id,
	};
}

export async function researchFurtherFromDeepResearchReport(
	input: ResearchFurtherFromDeepResearchReportInput
): Promise<ResearchFurtherReportActionResult | null> {
	const context = await loadCompletedResearchReportContext(input);
	if (!context) return null;

	const depth = input.depth ?? (context.job.depth as DeepResearchDepth);
	const conversation = await createConversation(
		input.userId,
		buildFollowupConversationTitle('Research further', context.job.title)
	);
	const userRequest = buildResearchFurtherSeedMessage(context);
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
		researchLanguage: input.researchLanguage,
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

function buildJobTitle(userRequest: string): string {
	const normalized = userRequest.replace(/\s+/g, ' ').trim();
	if (normalized.length <= 80) return normalized;
	return `${normalized.slice(0, 77)}...`;
}

function buildFollowupConversationTitle(prefix: string, jobTitle: string): string {
	const title = `${prefix}: ${jobTitle}`.replace(/\s+/g, ' ').trim();
	if (title.length <= 80) return title;
	return `${title.slice(0, 77)}...`;
}

function buildDiscussReportSeedMessage(context: ResearchReportContext): string {
	return [
		`Discuss this Research Report: ${context.report.name}`,
		'',
		`Source Deep Research topic: ${context.job.title}`,
		'',
		'Use the attached Research Report as the working context for this normal chat.',
	].join('\n');
}

function buildResearchFurtherSeedMessage(context: ResearchReportContext): string {
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

function buildFakeResearchReport(job: DeepResearchJobRow): string {
	return [
		'# Research Report',
		'',
		`## Topic`,
		job.title,
		'',
		'## Summary',
		'This is a placeholder Research Report produced by the Deep Research mock completion path.',
		'',
		'## Findings',
		'- The final research synthesis worker has not been enabled yet.',
		'- This artifact exists to exercise the durable Report Boundary and document workspace handoff.',
		'',
		'## Limitations',
		'- No public web sources were reviewed for this placeholder report.',
		'- Replace this report body when the real research worker and citation audit are implemented.',
	].join('\n');
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
	timeline: DeepResearchTimelineEvent[] = []
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
		createdAt: row.createdAt.getTime(),
		updatedAt: row.updatedAt.getTime(),
		completedAt: row.completedAt ? row.completedAt.getTime() : null,
		cancelledAt: row.cancelledAt ? row.cancelledAt.getTime() : null,
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
