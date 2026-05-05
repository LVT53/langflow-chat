import { tryRunAndRecordDeepResearchModel } from "./model-runner";
import {
	booleanValue,
	numberValue,
	objectArrayValue,
	parseModelJsonObject,
	stringArrayValue,
	stringValue,
} from "./llm-json";
import type {
	CitationAuditClaimReviewResult,
	CitationAuditSource,
	DeepResearchReportDraft,
} from "./citation-audit";
import type {
	ReportIntent,
	ResearchLanguage,
	ResearchPlan,
	ResearchPlanIncludedSource,
} from "./planning";
import type { ResearchReportDraft } from "./report-writer";
import { writeResearchReport, type WriteResearchReportInput } from "./report-writer";
import type {
	CompletedResearchTaskOutput,
	ResearchSourceReference,
	SynthesisFinding,
	SynthesisNotes,
} from "./synthesis";
import { buildSynthesisNotes } from "./synthesis";
import { classifyDeepResearchClaimType } from "./source-quality";
import type {
	PersistedReviewedResearchSourceNotes,
	SourceReviewCandidate,
	ReviewSourceResult,
} from "./source-review";
import type { DeepResearchJob, DeepResearchSource, DeepResearchTask, DeepResearchTaskOutput } from "$lib/types";

export type LlmStepContext = {
	jobId: string;
	conversationId: string;
	userId: string;
	now?: Date;
};

export async function draftResearchPlanWithLlm(input: {
	context: LlmStepContext;
	role: "plan_generation" | "plan_revision";
	userRequest: string;
	selectedDepth: ResearchPlan["depth"];
	researchLanguage: ResearchLanguage;
	selectedBudget: ResearchPlan["researchBudget"];
	contextDisclosure: string | null;
	previousPlan?: ResearchPlan | null;
	editInstruction?: string | null;
	reportIntent?: ReportIntent;
	includedSources?: ResearchPlanIncludedSource[];
}): Promise<ResearchPlan | null> {
	const result = await tryRunAndRecordDeepResearchModel({
		role: input.role,
		jobId: input.context.jobId,
		conversationId: input.context.conversationId,
		userId: input.context.userId,
		stage: input.role,
		operation: input.role,
		occurredAt: input.context.now,
		temperature: 0.15,
		maxTokens: 2200,
		messages: [
			{
				role: "system",
				content:
					"Draft a Deep Research plan as strict JSON. Preserve exact user entities, model names, provider names, comparison terms, and requested language. Return only JSON.",
			},
			{
				role: "user",
				content: JSON.stringify({
					userRequest: input.userRequest,
					selectedDepth: input.selectedDepth,
					researchLanguage: input.researchLanguage,
					selectedBudget: input.selectedBudget,
					contextDisclosure: input.contextDisclosure,
					previousPlan: input.previousPlan ?? null,
					editInstruction: input.editInstruction ?? null,
					reportIntent: input.reportIntent ?? null,
					requiredShape: {
						goal: "string",
						reportIntent:
							"comparison|recommendation|investigation|market_scan|product_scan|limitation_focused",
						keyQuestions: ["string"],
						reportShape: ["string"],
						constraints: ["string"],
						deliverables: ["string"],
						includePublicWeb: true,
					},
				}),
			},
		],
	});
	const parsed = result ? parseModelJsonObject(result.content) : null;
	if (!parsed) return null;

	const goal = stringValue(parsed.goal) ?? input.userRequest;
	const keyQuestions = stringArrayValue(parsed.keyQuestions).slice(0, 8);
	const reportIntent =
		input.reportIntent ?? reportIntentValue(stringValue(parsed.reportIntent));
	if (keyQuestions.length === 0) return null;
	return {
		goal,
		depth: input.selectedDepth,
		researchLanguage: input.researchLanguage,
		reportIntent: reportIntent ?? "investigation",
		researchBudget: input.selectedBudget,
		keyQuestions,
		sourceScope: {
			includePublicWeb: booleanValue(parsed.includePublicWeb) ?? true,
			planningContextDisclosure: input.contextDisclosure,
			includedSources: input.includedSources,
		},
		reportShape: stringArrayValue(parsed.reportShape).slice(0, 8),
		constraints: stringArrayValue(parsed.constraints).slice(0, 12),
		deliverables: stringArrayValue(parsed.deliverables).slice(0, 8),
	};
}

export async function reviewSourceWithLlm(input: {
	context: LlmStepContext;
	source: SourceReviewCandidate;
	keyQuestions: string[];
}): Promise<ReviewSourceResult | null> {
	const result = await tryRunAndRecordDeepResearchModel({
		role: "source_review",
		jobId: input.context.jobId,
		conversationId: input.context.conversationId,
		userId: input.context.userId,
		stage: "source_review",
		operation: "source_review",
		occurredAt: input.context.now,
		temperature: 0,
		maxTokens: 1800,
		messages: [
			{
				role: "system",
				content:
					"Review one research source for relevance and evidence quality. Reject browser checks, captcha, blocked pages, noise, and unrelated high-authority pages. Return only JSON.",
			},
			{
				role: "user",
				content: JSON.stringify({
					keyQuestions: input.keyQuestions,
					source: {
						title: input.source.title,
						url: input.source.canonicalUrl,
						snippet: input.source.snippet,
						sourceText: limitText(input.source.sourceText ?? "", 12000),
					},
					requiredShape: {
						summary: "string",
						keyFindings: ["string"],
						extractedText: "string|null",
						relevanceScore: "0-100",
						supportedKeyQuestions: ["string"],
						extractedClaims: ["string"],
						rejectedReason: "string|null",
					},
				}),
			},
		],
	});
	const parsed = result ? parseModelJsonObject(result.content) : null;
	if (!parsed) return null;
	return {
		summary: stringValue(parsed.summary) ?? input.source.snippet ?? input.source.title,
		keyFindings: stringArrayValue(parsed.keyFindings).slice(0, 12),
		extractedText: stringValue(parsed.extractedText),
		relevanceScore: numberValue(parsed.relevanceScore) ?? undefined,
		supportedKeyQuestions: stringArrayValue(parsed.supportedKeyQuestions),
		extractedClaims: stringArrayValue(parsed.extractedClaims),
		rejectedReason: stringValue(parsed.rejectedReason),
	};
}

export async function executeResearchTaskWithLlm(input: {
	context: LlmStepContext & { taskId: string };
	job: DeepResearchJob;
	approvedPlan: ResearchPlan;
	task: DeepResearchTask;
	reviewedSources: DeepResearchSource[];
}): Promise<DeepResearchTaskOutput | null> {
	const result = await tryRunAndRecordDeepResearchModel({
		role: "research_task",
		jobId: input.context.jobId,
		conversationId: input.context.conversationId,
		userId: input.context.userId,
		taskId: input.context.taskId,
		stage: "research_tasks",
		operation: "research_task",
		occurredAt: input.context.now,
		temperature: 0.1,
		maxTokens: 1800,
		messages: [
			{
				role: "system",
				content:
					"Complete the assigned Deep Research task using only reviewed sources. Return concise JSON with supported findings and source IDs.",
			},
			{
				role: "user",
				content: JSON.stringify({
					researchLanguage: input.approvedPlan.researchLanguage ?? "en",
					planGoal: input.approvedPlan.goal,
					task: {
						assignment: input.task.assignment,
						keyQuestion: input.task.keyQuestion,
						coverageGapId: input.task.coverageGapId,
					},
					reviewedSources: input.reviewedSources.map(sourceForPrompt),
					requiredShape: {
						summary: "string",
						findings: ["string"],
						sourceIds: ["source id strings used by findings"],
					},
				}),
			},
		],
	});
	const parsed = result ? parseModelJsonObject(result.content) : null;
	if (!parsed) return null;
	const allowedSourceIds = new Set(input.reviewedSources.map((source) => source.id));
	const sourceIds = stringArrayValue(parsed.sourceIds).filter((sourceId) =>
		allowedSourceIds.has(sourceId),
	);
	return {
		summary:
			stringValue(parsed.summary) ?? input.task.keyQuestion ?? input.task.assignment,
		findings: stringArrayValue(parsed.findings).slice(0, 10),
		sourceIds,
	};
}

export async function buildSynthesisNotesWithLlm(input: {
	context: LlmStepContext;
	reviewedSources: PersistedReviewedResearchSourceNotes[];
	completedTasks: CompletedResearchTaskOutput[];
}): Promise<SynthesisNotes> {
	const fallback = await buildSynthesisNotes({
		jobId: input.context.jobId,
		reviewedSources: input.reviewedSources,
		completedTasks: input.completedTasks,
	});
	const sourceRefsById = new Map(
		input.reviewedSources.map((source) => [
			source.id,
			{
				reviewedSourceId: source.id,
				discoveredSourceId: source.discoveredSourceId,
				canonicalUrl: source.canonicalUrl,
				title: source.title,
			} satisfies ResearchSourceReference,
		]),
	);
	const result = await tryRunAndRecordDeepResearchModel({
		role: "synthesis",
		jobId: input.context.jobId,
		conversationId: input.context.conversationId,
		userId: input.context.userId,
		stage: "synthesis",
		operation: "synthesis",
		occurredAt: input.context.now,
		temperature: 0.1,
		maxTokens: 2200,
		messages: [
			{
				role: "system",
				content:
					"Synthesize reviewed Deep Research evidence. Keep only claims supported by reviewed source IDs. Return only JSON.",
			},
			{
				role: "user",
				content: JSON.stringify({
					reviewedSources: input.reviewedSources.map((source) => ({
						id: source.id,
						title: source.title,
						keyFindings: source.keyFindings,
						extractedClaims: source.extractedClaims,
						supportedKeyQuestions: source.supportedKeyQuestions,
					})),
					completedTasks: input.completedTasks,
					requiredShape: {
						supportedFindings: [{ statement: "string", sourceIds: ["id"] }],
						conflicts: [{ statement: "string", sourceIds: ["id"] }],
						assumptions: [{ statement: "string", sourceIds: ["id"] }],
						reportLimitations: [{ statement: "string", sourceIds: ["id"] }],
					},
				}),
			},
		],
	});
	const parsed = result ? parseModelJsonObject(result.content) : null;
	if (!parsed) return fallback;
	const supportedFindings = mapLlmFindings(parsed.supportedFindings, "supported", sourceRefsById);
	if (supportedFindings.length === 0) return fallback;
	const conflicts = mapLlmFindings(parsed.conflicts, "conflict", sourceRefsById);
	const assumptions = mapLlmFindings(parsed.assumptions, "assumption", sourceRefsById);
	const reportLimitations = mapLlmFindings(
		parsed.reportLimitations,
		"report_limitation",
		sourceRefsById,
	);
	return {
		jobId: input.context.jobId,
		findings: [...supportedFindings, ...conflicts, ...assumptions, ...reportLimitations],
		supportedFindings,
		conflicts,
		assumptions,
		reportLimitations,
	};
}

export async function buildCitationClaimReviewerWithLlm(input: {
	context: LlmStepContext;
	report: DeepResearchReportDraft;
	citedSources: CitationAuditSource[];
}): Promise<((claimId: string) => CitationAuditClaimReviewResult | null) | null> {
	const result = await tryRunAndRecordDeepResearchModel({
		role: "citation_audit",
		jobId: input.context.jobId,
		conversationId: input.context.conversationId,
		userId: input.context.userId,
		stage: "citation_audit",
		operation: "citation_audit",
		occurredAt: input.context.now,
		temperature: 0,
		maxTokens: 2600,
		messages: [
			{
				role: "system",
				content:
					"Audit report claims against reviewed and cited source evidence. Support, repair, or remove each claim. Return only JSON.",
			},
			{
				role: "user",
				content: JSON.stringify({
					report: input.report,
					citedSources: input.citedSources.map((source) => ({
						id: source.id,
						title: source.title,
						url: source.url,
						reviewedNote: source.reviewedNote,
						citationNote: source.citationNote,
						extractedClaims: source.extractedClaims,
						snippet: source.snippet,
						sourceText: limitText(source.sourceText ?? "", 8000),
					})),
					requiredShape: {
						claims: [
							{
								claimId: "string",
								status: "supported|repaired|unsupported",
								reason: "string",
								text: "repaired text when repaired",
								citationSourceIds: ["reviewed cited source id"],
							},
						],
					},
				}),
			},
		],
	});
	const parsed = result ? parseModelJsonObject(result.content) : null;
	if (!parsed) return null;
	const reviews = new Map<string, CitationAuditClaimReviewResult>();
	for (const item of objectArrayValue(parsed.claims)) {
		const claimId = stringValue(item.claimId);
		const status = stringValue(item.status);
		if (!claimId || !["supported", "repaired", "unsupported"].includes(status ?? "")) {
			continue;
		}
		reviews.set(claimId, {
			status: status as CitationAuditClaimReviewResult["status"],
			reason: stringValue(item.reason) ?? "Citation audit model reviewed this claim.",
			text: stringValue(item.text) ?? undefined,
			citationSourceIds: stringArrayValue(item.citationSourceIds),
		});
	}
	return (claimId) => reviews.get(claimId) ?? null;
}

export async function writeResearchReportWithLlm(
	input: WriteResearchReportInput & { context: LlmStepContext },
): Promise<ResearchReportDraft> {
	const fallback = writeResearchReport(input);
	const result = await tryRunAndRecordDeepResearchModel({
		role: "report_writing",
		jobId: input.context.jobId,
		conversationId: input.context.conversationId,
		userId: input.context.userId,
		stage: "report_completion",
		operation: "report_writing",
		occurredAt: input.context.now,
		temperature: 0.2,
		maxTokens: 3000,
		messages: [
			{
				role: "system",
				content:
					"Write a readable Deep Research report draft from the approved plan and supported findings. Lead with the answer, use short descriptive headings, keep findings grouped instead of dumping source notes, disclose methods and limitations, and do not invent claims or citations. Return only JSON.",
			},
			{
				role: "user",
				content: JSON.stringify({
					researchLanguage: input.plan.researchLanguage ?? "en",
					plan: input.plan,
					synthesisNotes: input.synthesisNotes,
					sources: input.sources,
					limitations: input.limitations ?? [],
					requiredShape: {
						title: "short report title, not the whole user request",
						executiveSummary: "string",
						sections: [{ heading: "string", body: "string" }],
					},
				}),
			},
		],
	});
	const parsed = result ? parseModelJsonObject(result.content) : null;
	if (!parsed) return fallback;
	const executiveSummary = stringValue(parsed.executiveSummary);
	const sections = objectArrayValue(parsed.sections)
		.map((section) => ({
			heading: stringValue(section.heading) ?? "",
			body: stringValue(section.body) ?? "",
		}))
		.filter((section) => section.heading && section.body)
		.slice(0, 8);
	if (!executiveSummary || sections.length === 0) return fallback;
	return {
		...fallback,
		executiveSummary,
		sections,
	};
}

function mapLlmFindings(
	value: unknown,
	kind: SynthesisFinding["kind"],
	sourceRefsById: Map<string, ResearchSourceReference>,
): SynthesisFinding[] {
	return objectArrayValue(value)
		.map((item) => {
			const statement = stringValue(item.statement);
			const sourceRefs = stringArrayValue(item.sourceIds)
				.map((sourceId) => sourceRefsById.get(sourceId))
				.filter((sourceRef): sourceRef is ResearchSourceReference =>
					Boolean(sourceRef),
				);
			if (!statement || sourceRefs.length === 0) return null;
			return {
				kind,
				statement,
				sourceRefs,
				claimType:
					kind === "supported"
						? classifyDeepResearchClaimType(statement)
						: undefined,
				central: kind === "supported" ? true : undefined,
			};
		})
		.filter((finding): finding is SynthesisFinding => Boolean(finding));
}

function sourceForPrompt(source: DeepResearchSource) {
	return {
		id: source.id,
		title: source.title ?? source.url,
		url: source.url,
		reviewedNote: source.reviewedNote,
		extractedClaims: source.extractedClaims,
		supportedKeyQuestions: source.supportedKeyQuestions,
		snippet: source.snippet,
		sourceText: limitText(source.sourceText ?? "", 8000),
	};
}

function limitText(value: string, maxLength: number): string {
	return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function reportIntentValue(value: string | null): ResearchPlan["reportIntent"] | null {
	if (
		value === "comparison" ||
		value === "recommendation" ||
		value === "investigation" ||
		value === "market_scan" ||
		value === "product_scan" ||
		value === "limitation_focused"
	) {
		return value;
	}
	return null;
}
