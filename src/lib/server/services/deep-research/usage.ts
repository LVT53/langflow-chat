import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
	conversations,
	deepResearchJobs,
	deepResearchTasks,
	deepResearchUsageRecords,
	users,
} from "$lib/server/db/schema";
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

export type ResearchUsageCostSummary = {
	jobId: string;
	totalCostUsdMicros: number;
	totalTokens: number;
	byModel: Array<{
		modelId: string;
		modelDisplayName: string | null;
		providerId: string | null;
		providerDisplayName: string | null;
		costUsdMicros: number;
		totalTokens: number;
		operationCount: number;
	}>;
};

export type ResearchUsageForeignKeyDiagnostics = {
	foreignKeysEnabled: unknown;
	parentRows: {
		jobExists: boolean;
		conversationExists: boolean;
		userExists: boolean;
		taskExists: boolean | null;
	};
	usageForeignKeys: Record<string, unknown>[];
	usageForeignKeyViolations: Record<string, unknown>[];
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

export type BuildResearchUsageRecordInput = {
	jobId: string;
	taskId?: string | null;
	conversationId: string;
	userId: string;
	stage: ResearchTimelineStage;
	operation: ResearchUsageOperation;
	modelId: string;
	modelDisplayName?: string | null;
	providerId?: string | null;
	providerDisplayName?: string | null;
	providerModelName?: string | null;
	occurredAt?: Date;
	runtimeMs?: number | null;
	providerUsage?: ResearchProviderUsageSnapshot | null;
	costUsdMicros?: number | null;
};

export async function buildResearchUsageRecord(
	input: BuildResearchUsageRecordInput,
): Promise<ResearchUsageRecord> {
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
	const costUsdMicros =
		input.costUsdMicros == null
			? await calculateResearchUsageCostUsdMicros({
					modelId: input.modelId,
					providerId: input.providerId ?? null,
					providerModelName: input.providerModelName ?? null,
					promptTokens,
					cachedInputTokens,
					cacheHitTokens,
					cacheMissTokens,
					completionTokens,
					reasoningTokens,
				})
			: normalizeCount(input.costUsdMicros);

	return {
		jobId: input.jobId,
		taskId: input.taskId ?? null,
		conversationId: input.conversationId,
		userId: input.userId,
		stage: input.stage,
		operation: input.operation,
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
		costUsdMicros,
	};
}

export async function calculateResearchUsageCostUsdMicros(input: {
	modelId: string;
	providerId: string | null;
	providerModelName: string | null;
	promptTokens: number;
	cachedInputTokens: number;
	cacheHitTokens: number;
	cacheMissTokens: number;
	completionTokens: number;
	reasoningTokens: number;
}): Promise<number> {
	const { calculateCostUsdMicros, findPriceRule } = await import(
		"$lib/server/services/analytics"
	);
	const priceRule = await findPriceRule({
		modelId: input.modelId,
		providerId: input.providerId,
		providerModelName: input.providerModelName,
	});
	return calculateCostUsdMicros(priceRule, input);
}

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

export async function getResearchUsageForeignKeyDiagnostics(
	record: ResearchUsageRecord,
): Promise<ResearchUsageForeignKeyDiagnostics> {
	const { db, sqlite } = await import("$lib/server/db");
	const [[job], [conversation], [user], taskRows] = await Promise.all([
		db
			.select({ id: deepResearchJobs.id })
			.from(deepResearchJobs)
			.where(eq(deepResearchJobs.id, record.jobId))
			.limit(1),
		db
			.select({ id: conversations.id })
			.from(conversations)
			.where(eq(conversations.id, record.conversationId))
			.limit(1),
		db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.id, record.userId))
			.limit(1),
		record.taskId
			? db
					.select({ id: deepResearchTasks.id })
					.from(deepResearchTasks)
					.where(eq(deepResearchTasks.id, record.taskId))
					.limit(1)
			: Promise.resolve([]),
	]);

	const foreignKeys = sqlite.prepare("PRAGMA foreign_keys").get() as
		| Record<string, unknown>
		| undefined;

	return {
		foreignKeysEnabled: foreignKeys?.foreign_keys ?? null,
		parentRows: {
			jobExists: !!job,
			conversationExists: !!conversation,
			userExists: !!user,
			taskExists: record.taskId ? taskRows.length > 0 : null,
		},
		usageForeignKeys: sqlite
			.prepare("PRAGMA foreign_key_list(deep_research_usage_records)")
			.all() as Record<string, unknown>[],
		usageForeignKeyViolations: sqlite
			.prepare("PRAGMA foreign_key_check(deep_research_usage_records)")
			.all() as Record<string, unknown>[],
	};
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

export async function getResearchUsageCostSummary(
	input: ListResearchUsageRecordsInput,
): Promise<ResearchUsageCostSummary> {
	const records = await listResearchUsageRecords(input);
	const byModel = new Map<
		string,
		ResearchUsageCostSummary["byModel"][number]
	>();

	for (const record of records) {
		const key = `${record.modelId}\0${record.providerId ?? ""}`;
		const current = byModel.get(key) ?? {
			modelId: record.modelId,
			modelDisplayName: record.modelDisplayName,
			providerId: record.providerId,
			providerDisplayName: record.providerDisplayName,
			costUsdMicros: 0,
			totalTokens: 0,
			operationCount: 0,
		};
		current.costUsdMicros += record.costUsdMicros;
		current.totalTokens += record.totalTokens;
		current.operationCount += 1;
		byModel.set(key, current);
	}

	return {
		jobId: input.jobId,
		totalCostUsdMicros: records.reduce(
			(total, record) => total + record.costUsdMicros,
			0,
		),
		totalTokens: records.reduce(
			(total, record) => total + record.totalTokens,
			0,
		),
		byModel: Array.from(byModel.values()).sort((a, b) =>
			a.modelId.localeCompare(b.modelId),
		),
	};
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
