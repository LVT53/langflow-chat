import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { deepResearchTasks } from "$lib/server/db/schema";
import type {
	DeepResearchTask,
	DeepResearchTaskAssignmentType,
	DeepResearchTaskFailureKind,
	DeepResearchTaskOutput,
	DeepResearchTaskStatus,
} from "$lib/types";

type DeepResearchTaskRow = typeof deepResearchTasks.$inferSelect;

export type CoverageGapSeverity = "critical" | "important" | "minor";

export type CoverageGapForResearchTask = {
	id: string;
	keyQuestion?: string | null;
	summary: string;
	severity: CoverageGapSeverity;
};

export type CoverageGapFromFailedResearchTask = CoverageGapForResearchTask & {
	sourceTaskId: string;
	failureKind: DeepResearchTaskFailureKind;
	failureReason: string;
};

export type CreateResearchTasksFromCoverageGapsInput = {
	userId: string;
	jobId: string;
	conversationId: string;
	passNumber: number;
	gaps: CoverageGapForResearchTask[];
	now?: Date;
};

export type ListResearchTasksInput = {
	userId: string;
	jobId: string;
	passNumber?: number;
};

export type ClaimResearchTasksInput = {
	userId: string;
	jobId: string;
	passNumber: number;
	limit: number;
	claimToken: string;
	now?: Date;
};

export type CompleteResearchTaskInput = {
	userId: string;
	taskId: string;
	output: DeepResearchTaskOutput;
	now?: Date;
};

export type SkipResearchTaskInput = {
	userId: string;
	taskId: string;
	reason: string;
	now?: Date;
};

export type RecordResearchTaskFailureInput = {
	userId: string;
	taskId: string;
	failureKind: DeepResearchTaskFailureKind;
	failureReason: string;
	now?: Date;
};

export type EvaluateResearchPassBarrierInput = {
	userId: string;
	jobId: string;
	passNumber: number;
};

export type ListCoverageGapsFromFailedResearchTasksInput =
	EvaluateResearchPassBarrierInput;

export type ResearchPassBarrier = {
	open: boolean;
	requiredTaskCount: number;
	blockedByTaskIds: string[];
	pendingTaskIds: string[];
	runningTaskIds: string[];
	completedTaskIds: string[];
	skippedTaskIds: string[];
	nonCriticalFailedTaskIds: string[];
	criticalFailedTaskIds: string[];
};

export async function createResearchTasksFromCoverageGaps(
	input: CreateResearchTasksFromCoverageGapsInput,
): Promise<DeepResearchTask[]> {
	if (input.gaps.length === 0) return [];

	const { db } = await import("$lib/server/db");
	const now = input.now ?? new Date();
	const passNumber = normalizePassNumber(input.passNumber);
	const rows = await db
		.insert(deepResearchTasks)
		.values(
			input.gaps.map((gap, index) => ({
				id: randomUUID(),
				jobId: input.jobId,
				conversationId: input.conversationId,
				userId: input.userId,
				passNumber,
				passOrder: index,
				status: "pending",
				assignmentType: "coverage_gap",
				coverageGapId: gap.id,
				keyQuestion: gap.keyQuestion ?? null,
				assignment: normalizeText(gap.summary),
				required: true,
				critical: gap.severity === "critical",
				createdAt: now,
				updatedAt: now,
			})),
		)
		.returning();

	return rows.map(mapResearchTaskRow);
}

export async function listResearchTasks(
	input: ListResearchTasksInput,
): Promise<DeepResearchTask[]> {
	const { db } = await import("$lib/server/db");
	const filters = [
		eq(deepResearchTasks.userId, input.userId),
		eq(deepResearchTasks.jobId, input.jobId),
		input.passNumber !== undefined
			? eq(deepResearchTasks.passNumber, normalizePassNumber(input.passNumber))
			: undefined,
	].filter((filter) => filter !== undefined);

	const rows = await db
		.select()
		.from(deepResearchTasks)
		.where(and(...filters))
		.orderBy(
			asc(deepResearchTasks.passNumber),
			asc(deepResearchTasks.passOrder),
			asc(deepResearchTasks.id),
		);

	return rows.map(mapResearchTaskRow);
}

export async function claimResearchTasks(
	input: ClaimResearchTasksInput,
): Promise<DeepResearchTask[]> {
	const limit = Math.max(0, Math.floor(input.limit));
	if (limit === 0) return [];

	const { db } = await import("$lib/server/db");
	const pendingRows = await db
		.select({ id: deepResearchTasks.id })
		.from(deepResearchTasks)
		.where(
			and(
				eq(deepResearchTasks.userId, input.userId),
				eq(deepResearchTasks.jobId, input.jobId),
				eq(deepResearchTasks.passNumber, normalizePassNumber(input.passNumber)),
				eq(deepResearchTasks.status, "pending"),
			),
		)
		.orderBy(asc(deepResearchTasks.passOrder), asc(deepResearchTasks.id))
		.limit(limit);
	const taskIds = pendingRows.map((row) => row.id);
	if (taskIds.length === 0) return [];

	const now = input.now ?? new Date();
	const rows = await db
		.update(deepResearchTasks)
		.set({
			status: "running",
			claimToken: input.claimToken,
			claimedAt: now,
			updatedAt: now,
		})
		.where(inArray(deepResearchTasks.id, taskIds))
		.returning();
	const byId = new Map(rows.map((row) => [row.id, row]));

	return taskIds
		.map((id) => byId.get(id))
		.filter((row) => row !== undefined)
		.map(mapResearchTaskRow);
}

export async function completeResearchTask(
	input: CompleteResearchTaskInput,
): Promise<DeepResearchTask | null> {
	const { db } = await import("$lib/server/db");
	const now = input.now ?? new Date();
	const [row] = await db
		.update(deepResearchTasks)
		.set({
			status: "completed",
			outputJson: JSON.stringify(input.output),
			failureKind: null,
			failureReason: null,
			completedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(deepResearchTasks.id, input.taskId),
				eq(deepResearchTasks.userId, input.userId),
			),
		)
		.returning();

	return row ? mapResearchTaskRow(row) : null;
}

export async function skipResearchTask(
	input: SkipResearchTaskInput,
): Promise<DeepResearchTask | null> {
	const { db } = await import("$lib/server/db");
	const now = input.now ?? new Date();
	const [row] = await db
		.update(deepResearchTasks)
		.set({
			status: "skipped",
			failureReason: normalizeText(input.reason),
			skippedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(deepResearchTasks.id, input.taskId),
				eq(deepResearchTasks.userId, input.userId),
			),
		)
		.returning();

	return row ? mapResearchTaskRow(row) : null;
}

export async function recordResearchTaskFailure(
	input: RecordResearchTaskFailureInput,
): Promise<DeepResearchTask | null> {
	const { db } = await import("$lib/server/db");
	const now = input.now ?? new Date();
	const [row] = await db
		.update(deepResearchTasks)
		.set({
			status: "failed",
			failureKind: input.failureKind,
			failureReason: normalizeText(input.failureReason),
			failedAt: now,
			updatedAt: now,
		})
		.where(
			and(
				eq(deepResearchTasks.id, input.taskId),
				eq(deepResearchTasks.userId, input.userId),
			),
		)
		.returning();

	return row ? mapResearchTaskRow(row) : null;
}

export async function evaluateResearchPassBarrier(
	input: EvaluateResearchPassBarrierInput,
): Promise<ResearchPassBarrier> {
	const tasks = await listResearchTasks(input);
	const requiredTasks = tasks.filter((task) => task.required);
	const pendingTaskIds = requiredTasks
		.filter((task) => task.status === "pending")
		.map((task) => task.id);
	const runningTaskIds = requiredTasks
		.filter((task) => task.status === "running")
		.map((task) => task.id);
	const completedTaskIds = requiredTasks
		.filter((task) => task.status === "completed")
		.map((task) => task.id);
	const skippedTaskIds = requiredTasks
		.filter((task) => task.status === "skipped")
		.map((task) => task.id);
	const failedTasks = requiredTasks.filter((task) => task.status === "failed");
	const nonCriticalFailedTaskIds = failedTasks
		.filter((task) => !task.critical)
		.map((task) => task.id);
	const criticalFailedTaskIds = failedTasks
		.filter((task) => task.critical)
		.map((task) => task.id);
	const blockedByTaskIds = [
		...runningTaskIds,
		...pendingTaskIds,
		...criticalFailedTaskIds,
	];

	return {
		open: blockedByTaskIds.length === 0,
		requiredTaskCount: requiredTasks.length,
		blockedByTaskIds,
		pendingTaskIds,
		runningTaskIds,
		completedTaskIds,
		skippedTaskIds,
		nonCriticalFailedTaskIds,
		criticalFailedTaskIds,
	};
}

export async function listCoverageGapsFromFailedResearchTasks(
	input: ListCoverageGapsFromFailedResearchTasksInput,
): Promise<CoverageGapFromFailedResearchTask[]> {
	const tasks = await listResearchTasks(input);

	return tasks
		.filter((task) => task.status === "failed")
		.map((task) => {
			const failureKind = task.failureKind ?? "permanent";
			const failureReason = task.failureReason ?? "Research Task failed.";
			return {
				id: `failed-task-${task.id}`,
				sourceTaskId: task.id,
				keyQuestion: task.keyQuestion,
				summary: `Research Task failed ${failureKind}ly: ${failureReason}`,
				severity: task.critical ? "critical" : "important",
				failureKind,
				failureReason,
			};
		});
}

function mapResearchTaskRow(row: DeepResearchTaskRow): DeepResearchTask {
	return {
		id: row.id,
		jobId: row.jobId,
		conversationId: row.conversationId,
		userId: row.userId,
		passNumber: row.passNumber,
		passOrder: row.passOrder,
		status: row.status as DeepResearchTaskStatus,
		assignmentType: row.assignmentType as DeepResearchTaskAssignmentType,
		coverageGapId: row.coverageGapId,
		keyQuestion: row.keyQuestion,
		assignment: row.assignment,
		required: row.required,
		critical: row.critical,
		output: parseOptionalJson<DeepResearchTaskOutput>(row.outputJson),
		failureKind: row.failureKind as DeepResearchTaskFailureKind | null,
		failureReason: row.failureReason,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		claimedAt: row.claimedAt?.toISOString() ?? null,
		completedAt: row.completedAt?.toISOString() ?? null,
		failedAt: row.failedAt?.toISOString() ?? null,
		skippedAt: row.skippedAt?.toISOString() ?? null,
	};
}

function normalizePassNumber(passNumber: number): number {
	return Math.max(1, Math.floor(passNumber));
}

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function parseOptionalJson<T>(value: string | null): T | null {
	if (!value) return null;
	return JSON.parse(value) as T;
}
