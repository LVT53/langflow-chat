import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { deepResearchUsageRecords } from "$lib/server/db/schema";
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

export type PersistedResearchUsageRecord = ResearchUsageRecord & {
	id: string;
	createdAt: string;
};

export type ListResearchUsageRecordsInput = {
	userId: string;
	jobId: string;
};

type DeepResearchUsageRecordRow = typeof deepResearchUsageRecords.$inferSelect;

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

export async function saveResearchUsageRecord(
	record: ResearchUsageRecord,
): Promise<PersistedResearchUsageRecord> {
	const { db } = await import("$lib/server/db");
	const [row] = await db
		.insert(deepResearchUsageRecords)
		.values({
			id: randomUUID(),
			jobId: record.jobId,
			taskId: record.taskId,
			conversationId: record.conversationId,
			userId: record.userId,
			stage: record.stage,
			operation: record.operation,
			modelId: record.modelId,
			modelDisplayName: record.modelDisplayName,
			providerId: record.providerId,
			providerDisplayName: record.providerDisplayName,
			billingMonth: record.billingMonth,
			occurredAt: new Date(record.occurredAt),
			promptTokens: record.promptTokens,
			cachedInputTokens: record.cachedInputTokens,
			cacheHitTokens: record.cacheHitTokens,
			cacheMissTokens: record.cacheMissTokens,
			completionTokens: record.completionTokens,
			reasoningTokens: record.reasoningTokens,
			totalTokens: record.totalTokens,
			usageSource: record.usageSource,
			runtimeMs: record.runtimeMs,
			costUsdMicros: record.costUsdMicros,
		})
		.returning();

	return mapUsageRecordRow(row);
}

export async function listResearchUsageRecords(
	input: ListResearchUsageRecordsInput,
): Promise<PersistedResearchUsageRecord[]> {
	const { db } = await import("$lib/server/db");
	const rows = await db
		.select()
		.from(deepResearchUsageRecords)
		.where(
			and(
				eq(deepResearchUsageRecords.userId, input.userId),
				eq(deepResearchUsageRecords.jobId, input.jobId),
			),
		)
		.orderBy(asc(deepResearchUsageRecords.occurredAt));

	return rows.map(mapUsageRecordRow);
}

function mapUsageRecordRow(
	row: DeepResearchUsageRecordRow,
): PersistedResearchUsageRecord {
	return {
		id: row.id,
		jobId: row.jobId,
		taskId: row.taskId,
		conversationId: row.conversationId,
		userId: row.userId,
		stage: row.stage as ResearchTimelineStage,
		operation: row.operation as ResearchUsageOperation,
		modelId: row.modelId,
		modelDisplayName: row.modelDisplayName,
		providerId: row.providerId,
		providerDisplayName: row.providerDisplayName,
		billingMonth: row.billingMonth,
		occurredAt: row.occurredAt.toISOString(),
		promptTokens: row.promptTokens,
		cachedInputTokens: row.cachedInputTokens,
		cacheHitTokens: row.cacheHitTokens,
		cacheMissTokens: row.cacheMissTokens,
		completionTokens: row.completionTokens,
		reasoningTokens: row.reasoningTokens,
		totalTokens: row.totalTokens,
		usageSource: row.usageSource as ResearchUsageSource,
		runtimeMs: row.runtimeMs,
		costUsdMicros: row.costUsdMicros,
		createdAt: row.createdAt.toISOString(),
	};
}

function normalizeCount(value: unknown): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}
