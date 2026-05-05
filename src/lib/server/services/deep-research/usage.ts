import type { ResearchTimelineStage } from "./timeline";

export type ResearchUsageSource = "provider" | "estimated";

export type ResearchProviderUsageSnapshot = {
	promptTokens?: number;
	cachedInputTokens?: number;
	cacheHitTokens?: number;
	cacheMissTokens?: number;
	completionTokens?: number;
	reasoningTokens?: number;
	totalTokens?: number;
	source?: ResearchUsageSource;
};

export type ResearchUsageOperation =
	| "plan_generation"
	| "plan_revision"
	| "source_discovery"
	| "source_review"
	| "coverage_assessment"
	| "synthesis"
	| "citation_audit"
	| "report_writing";

export type ResearchUsageRecord = {
	jobId: string;
	taskId: string | null;
	conversationId: string;
	userId: string;
	stage: ResearchTimelineStage;
	operation: ResearchUsageOperation;
	modelId: string;
	modelDisplayName: string | null;
	providerId: string | null;
	providerDisplayName: string | null;
	billingMonth: string;
	occurredAt: string;
	promptTokens: number;
	cachedInputTokens: number;
	cacheHitTokens: number;
	cacheMissTokens: number;
	completionTokens: number;
	reasoningTokens: number;
	totalTokens: number;
	usageSource: ResearchUsageSource;
	runtimeMs: number | null;
	costUsdMicros: number;
};

export type BuildPlanGenerationResearchUsageRecordInput = {
	jobId: string;
	taskId?: string | null;
	conversationId: string;
	userId: string;
	modelId: string;
	modelDisplayName?: string | null;
	providerId?: string | null;
	providerDisplayName?: string | null;
	occurredAt?: Date;
	runtimeMs?: number | null;
	providerUsage?: ResearchProviderUsageSnapshot | null;
	costUsdMicros?: number | null;
};

export function buildPlanGenerationResearchUsageRecord(
	input: BuildPlanGenerationResearchUsageRecordInput,
): ResearchUsageRecord {
	const occurredAt = input.occurredAt ?? new Date();
	const usage = input.providerUsage ?? {};
	const promptTokens = normalizeCount(usage.promptTokens);
	const cachedInputTokens = normalizeCount(usage.cachedInputTokens);
	const cacheHitTokens = normalizeCount(usage.cacheHitTokens);
	const cacheMissTokens = normalizeCount(usage.cacheMissTokens);
	const completionTokens = normalizeCount(usage.completionTokens);
	const reasoningTokens = normalizeCount(usage.reasoningTokens);
	const totalTokens =
		normalizeCount(usage.totalTokens) ||
		promptTokens + completionTokens + reasoningTokens;

	return {
		jobId: input.jobId,
		taskId: input.taskId ?? null,
		conversationId: input.conversationId,
		userId: input.userId,
		stage: "plan_generation",
		operation: "plan_generation",
		modelId: input.modelId,
		modelDisplayName: input.modelDisplayName ?? null,
		providerId: input.providerId ?? null,
		providerDisplayName: input.providerDisplayName ?? null,
		billingMonth: occurredAt.toISOString().slice(0, 7),
		occurredAt: occurredAt.toISOString(),
		promptTokens,
		cachedInputTokens,
		cacheHitTokens,
		cacheMissTokens,
		completionTokens,
		reasoningTokens,
		totalTokens,
		usageSource: usage.source ?? "estimated",
		runtimeMs: input.runtimeMs ?? null,
		costUsdMicros: normalizeCount(input.costUsdMicros),
	};
}

function normalizeCount(value: unknown): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}
