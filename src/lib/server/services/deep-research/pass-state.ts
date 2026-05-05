import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import {
	deepResearchCoverageGaps,
	deepResearchPassCheckpoints,
} from "$lib/server/db/schema";
import type {
	DeepResearchCoverageGap,
	DeepResearchCoverageGapLifecycleState,
	DeepResearchCoverageGapSeverity,
	DeepResearchPassCheckpoint,
	DeepResearchPassDecision,
} from "$lib/types";

type DeepResearchPassCheckpointRow =
	typeof deepResearchPassCheckpoints.$inferSelect;
type DeepResearchCoverageGapRow = typeof deepResearchCoverageGaps.$inferSelect;

export class ResearchPassCheckpointImmutableError extends Error {
	constructor(checkpointId: string) {
		super(`Research Pass Checkpoint is immutable after terminal decision: ${checkpointId}`);
		this.name = "ResearchPassCheckpointImmutableError";
	}
}

export type UpsertResearchPassCheckpointInput = {
	userId: string;
	jobId: string;
	conversationId: string;
	passNumber: number;
	searchIntent: string;
	reviewedSourceIds?: string[];
	coverageResult?: Record<string, unknown> | null;
	usageSummary?: Record<string, unknown> | null;
	now?: Date;
};

export type CompleteResearchPassCheckpointInput = {
	userId: string;
	checkpointId: string;
	coverageGapIds?: string[];
	nextDecision: DeepResearchPassDecision;
	decisionSummary: string;
	now?: Date;
};

export type SaveCoverageGapsForPassInput = {
	userId: string;
	jobId: string;
	conversationId: string;
	passCheckpointId: string;
	gaps: Array<{
		keyQuestion?: string | null;
		comparisonAxis?: string | null;
		reason: string;
		reviewedSourceCount: number;
		severity: DeepResearchCoverageGapSeverity;
		recommendedNextAction: string;
		detail?: string | null;
	}>;
	now?: Date;
};

export type ResolveResearchCoverageGapsInput = {
	userId: string;
	gapIds: string[];
	lifecycleState: Extract<
		DeepResearchCoverageGapLifecycleState,
		"resolved" | "inherited"
	>;
	resolutionSummary: string;
	resolvedByEvidence?: Record<string, unknown> | null;
	resolvedByClaims?: Record<string, unknown> | null;
	resolvedByLimitations?: Record<string, unknown> | null;
	now?: Date;
};

export type ListResearchPassStateInput = {
	userId: string;
	jobId: string;
};

export async function upsertResearchPassCheckpoint(
	input: UpsertResearchPassCheckpointInput,
): Promise<DeepResearchPassCheckpoint> {
	const { db } = await import("$lib/server/db");
	const now = input.now ?? new Date();
	const passNumber = normalizePassNumber(input.passNumber);
	const [existing] = await db
		.select()
		.from(deepResearchPassCheckpoints)
		.where(
			and(
				eq(deepResearchPassCheckpoints.userId, input.userId),
				eq(deepResearchPassCheckpoints.jobId, input.jobId),
				eq(deepResearchPassCheckpoints.passNumber, passNumber),
			),
		)
		.limit(1);

	if (existing?.terminalDecision) {
		throw new ResearchPassCheckpointImmutableError(existing.id);
	}

	if (existing) {
		const [row] = await db
			.update(deepResearchPassCheckpoints)
			.set({
				searchIntent: normalizeText(input.searchIntent),
				reviewedSourceIdsJson: JSON.stringify(input.reviewedSourceIds ?? []),
				coverageResultJson: stringifyOptionalJson(input.coverageResult),
				usageSummaryJson: stringifyOptionalJson(input.usageSummary),
				updatedAt: now,
			})
			.where(eq(deepResearchPassCheckpoints.id, existing.id))
			.returning();
		return mapResearchPassCheckpointRow(row);
	}

	const [row] = await db
		.insert(deepResearchPassCheckpoints)
		.values({
			id: randomUUID(),
			jobId: input.jobId,
			conversationId: input.conversationId,
			userId: input.userId,
			passNumber,
			lifecycleState: "running",
			searchIntent: normalizeText(input.searchIntent),
			reviewedSourceIdsJson: JSON.stringify(input.reviewedSourceIds ?? []),
			coverageResultJson: stringifyOptionalJson(input.coverageResult),
			coverageGapIdsJson: "[]",
			usageSummaryJson: stringifyOptionalJson(input.usageSummary),
			terminalDecision: false,
			startedAt: now,
			createdAt: now,
			updatedAt: now,
		})
		.returning();

	return mapResearchPassCheckpointRow(row);
}

export async function completeResearchPassCheckpoint(
	input: CompleteResearchPassCheckpointInput,
): Promise<DeepResearchPassCheckpoint | null> {
	const { db } = await import("$lib/server/db");
	const now = input.now ?? new Date();
	const [existing] = await db
		.select()
		.from(deepResearchPassCheckpoints)
		.where(
			and(
				eq(deepResearchPassCheckpoints.id, input.checkpointId),
				eq(deepResearchPassCheckpoints.userId, input.userId),
			),
		)
		.limit(1);
	if (!existing) return null;
	if (existing.terminalDecision) {
		throw new ResearchPassCheckpointImmutableError(existing.id);
	}

	const [row] = await db
		.update(deepResearchPassCheckpoints)
		.set({
			lifecycleState: "decided",
			coverageGapIdsJson: JSON.stringify(input.coverageGapIds ?? []),
			nextDecision: input.nextDecision,
			decisionSummary: normalizeText(input.decisionSummary),
			terminalDecision: true,
			completedAt: now,
			updatedAt: now,
		})
		.where(eq(deepResearchPassCheckpoints.id, existing.id))
		.returning();

	return mapResearchPassCheckpointRow(row);
}

export async function saveCoverageGapsForPass(
	input: SaveCoverageGapsForPassInput,
): Promise<DeepResearchCoverageGap[]> {
	if (input.gaps.length === 0) return [];

	const { db } = await import("$lib/server/db");
	const now = input.now ?? new Date();
	const rows = await db
		.insert(deepResearchCoverageGaps)
		.values(
			input.gaps.map((gap) => ({
				id: randomUUID(),
				jobId: input.jobId,
				conversationId: input.conversationId,
				userId: input.userId,
				passCheckpointId: input.passCheckpointId,
				lifecycleState: "open",
				severity: gap.severity,
				reason: normalizeText(gap.reason),
				keyQuestion: gap.keyQuestion ?? null,
				comparisonAxis: gap.comparisonAxis ?? null,
				recommendedNextAction: normalizeText(gap.recommendedNextAction),
				detail: gap.detail ? normalizeText(gap.detail) : null,
				reviewedSourceCount: Math.max(
					0,
					Math.floor(gap.reviewedSourceCount),
				),
				createdAt: now,
				updatedAt: now,
			})),
		)
		.returning();

	return rows.map(mapResearchCoverageGapRow);
}

export async function resolveResearchCoverageGaps(
	input: ResolveResearchCoverageGapsInput,
): Promise<DeepResearchCoverageGap[]> {
	if (input.gapIds.length === 0) return [];

	const { db } = await import("$lib/server/db");
	const now = input.now ?? new Date();
	const rows: DeepResearchCoverageGapRow[] = [];
	for (const gapId of input.gapIds) {
		const [row] = await db
			.update(deepResearchCoverageGaps)
			.set({
				lifecycleState: input.lifecycleState,
				resolutionSummary: normalizeText(input.resolutionSummary),
				resolvedByEvidenceJson: stringifyOptionalJson(input.resolvedByEvidence),
				resolvedByClaimsJson: stringifyOptionalJson(input.resolvedByClaims),
				resolvedByLimitationsJson: stringifyOptionalJson(
					input.resolvedByLimitations,
				),
				resolvedAt: now,
				updatedAt: now,
			})
			.where(
				and(
					eq(deepResearchCoverageGaps.id, gapId),
					eq(deepResearchCoverageGaps.userId, input.userId),
				),
			)
			.returning();
		if (row) rows.push(row);
	}

	return rows.map(mapResearchCoverageGapRow);
}

export async function listResearchPassCheckpoints(
	input: ListResearchPassStateInput,
): Promise<DeepResearchPassCheckpoint[]> {
	const { db } = await import("$lib/server/db");
	const rows = await db
		.select()
		.from(deepResearchPassCheckpoints)
		.where(
			and(
				eq(deepResearchPassCheckpoints.userId, input.userId),
				eq(deepResearchPassCheckpoints.jobId, input.jobId),
			),
		)
		.orderBy(asc(deepResearchPassCheckpoints.passNumber));

	return rows.map(mapResearchPassCheckpointRow);
}

export async function listResearchCoverageGaps(
	input: ListResearchPassStateInput,
): Promise<DeepResearchCoverageGap[]> {
	const { db } = await import("$lib/server/db");
	const rows = await db
		.select()
		.from(deepResearchCoverageGaps)
		.where(
			and(
				eq(deepResearchCoverageGaps.userId, input.userId),
				eq(deepResearchCoverageGaps.jobId, input.jobId),
			),
		)
		.orderBy(
			asc(deepResearchCoverageGaps.createdAt),
			asc(deepResearchCoverageGaps.id),
		);

	return rows.map(mapResearchCoverageGapRow);
}

function mapResearchPassCheckpointRow(
	row: DeepResearchPassCheckpointRow,
): DeepResearchPassCheckpoint {
	return {
		id: row.id,
		jobId: row.jobId,
		conversationId: row.conversationId,
		userId: row.userId,
		passNumber: row.passNumber,
		lifecycleState: row.lifecycleState as DeepResearchPassCheckpoint["lifecycleState"],
		searchIntent: row.searchIntent,
		reviewedSourceIds: parseJson<string[]>(row.reviewedSourceIdsJson),
		coverageResult: parseOptionalJson<Record<string, unknown>>(
			row.coverageResultJson,
		),
		coverageGapIds: parseJson<string[]>(row.coverageGapIdsJson),
		usageSummary: parseOptionalJson<Record<string, unknown>>(
			row.usageSummaryJson,
		),
		nextDecision: row.nextDecision as DeepResearchPassDecision | null,
		decisionSummary: row.decisionSummary,
		terminalDecision: row.terminalDecision,
		startedAt: row.startedAt.toISOString(),
		completedAt: row.completedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function mapResearchCoverageGapRow(
	row: DeepResearchCoverageGapRow,
): DeepResearchCoverageGap {
	return {
		id: row.id,
		jobId: row.jobId,
		conversationId: row.conversationId,
		userId: row.userId,
		passCheckpointId: row.passCheckpointId,
		lifecycleState:
			row.lifecycleState as DeepResearchCoverageGapLifecycleState,
		severity: row.severity as DeepResearchCoverageGapSeverity,
		reason: row.reason,
		keyQuestion: row.keyQuestion,
		comparisonAxis: row.comparisonAxis,
		recommendedNextAction: row.recommendedNextAction,
		detail: row.detail,
		reviewedSourceCount: row.reviewedSourceCount,
		resolvedByEvidence: parseOptionalJson<Record<string, unknown>>(
			row.resolvedByEvidenceJson,
		),
		resolvedByClaims: parseOptionalJson<Record<string, unknown>>(
			row.resolvedByClaimsJson,
		),
		resolvedByLimitations: parseOptionalJson<Record<string, unknown>>(
			row.resolvedByLimitationsJson,
		),
		resolutionSummary: row.resolutionSummary,
		inheritedFromGapId: row.inheritedFromGapId,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		resolvedAt: row.resolvedAt?.toISOString() ?? null,
	};
}

function normalizePassNumber(passNumber: number): number {
	return Math.max(1, Math.floor(passNumber));
}

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function stringifyOptionalJson(value: Record<string, unknown> | null | undefined) {
	return value ? JSON.stringify(value) : null;
}

function parseJson<T>(value: string): T {
	return JSON.parse(value) as T;
}

function parseOptionalJson<T>(value: string | null): T | null {
	if (!value) return null;
	return JSON.parse(value) as T;
}
