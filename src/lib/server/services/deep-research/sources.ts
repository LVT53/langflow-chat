import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { deepResearchSources } from "$lib/server/db/schema";
import type {
	DeepResearchSource,
	DeepResearchSourceCounts,
	DeepResearchSourceStatus,
} from "$lib/types";

type DeepResearchSourceRow = typeof deepResearchSources.$inferSelect;

export type SaveDiscoveredResearchSourceInput = {
	jobId: string;
	conversationId: string;
	userId: string;
	url: string;
	title?: string | null;
	provider: string;
	snippet?: string | null;
	sourceText?: string | null;
	discoveredAt?: Date;
};

export type ListResearchSourcesInput = {
	userId: string;
	jobId?: string;
	conversationId?: string;
};

export type CountResearchSourcesInput = ListResearchSourcesInput;

export type MarkResearchSourceCitedInput = {
	userId: string;
	sourceId: string;
	citedAt?: Date;
	citationNote?: string | null;
};

export type MarkResearchSourceReviewedInput = {
	userId: string;
	sourceId: string;
	reviewedAt?: Date;
	reviewedNote?: string | null;
	relevanceScore?: number | null;
	supportedKeyQuestions?: string[];
	extractedClaims?: string[];
	openedContentLength?: number;
};

export type MarkResearchSourceRejectedInput = {
	userId: string;
	sourceId: string;
	rejectedReason: string;
	relevanceScore?: number | null;
	supportedKeyQuestions?: string[];
	extractedClaims?: string[];
	openedContentLength?: number;
	rejectedAt?: Date;
};

export async function saveDiscoveredResearchSource(
	input: SaveDiscoveredResearchSourceInput,
): Promise<DeepResearchSource> {
	const { db } = await import("$lib/server/db");
	const now = input.discoveredAt ?? new Date();
	const [row] = await db
		.insert(deepResearchSources)
		.values({
			id: randomUUID(),
			jobId: input.jobId,
			conversationId: input.conversationId,
			userId: input.userId,
			status: "discovered",
			url: input.url,
			title: input.title ?? null,
			provider: input.provider,
			snippet: input.snippet ?? null,
			sourceText: input.sourceText ?? null,
			discoveredAt: now,
			updatedAt: now,
		})
		.returning();

	return mapSourceRow(row);
}

export async function listResearchSources(
	input: ListResearchSourcesInput,
): Promise<DeepResearchSource[]> {
	const { db } = await import("$lib/server/db");
	const rows = await db
		.select()
		.from(deepResearchSources)
		.where(and(...buildScopeFilters(input)))
		.orderBy(
			asc(deepResearchSources.discoveredAt),
			asc(deepResearchSources.id),
		);

	return rows.map(mapSourceRow);
}

export async function countResearchSources(
	input: CountResearchSourcesInput,
): Promise<DeepResearchSourceCounts> {
	const { db } = await import("$lib/server/db");
	const filters = buildScopeFilters(input);
	const [row] = await db
		.select({
			discovered: sql<number>`sum(case when ${deepResearchSources.discoveredAt} is not null then 1 else 0 end)`,
			reviewed: sql<number>`sum(case when ${deepResearchSources.reviewedAt} is not null then 1 else 0 end)`,
			cited: sql<number>`sum(case when ${deepResearchSources.citedAt} is not null then 1 else 0 end)`,
		})
		.from(deepResearchSources)
		.where(and(...filters));

	return {
		discovered: normalizeCount(row?.discovered),
		reviewed: normalizeCount(row?.reviewed),
		cited: normalizeCount(row?.cited),
	};
}

export async function markResearchSourceReviewed(
	input: MarkResearchSourceReviewedInput,
): Promise<DeepResearchSource> {
	const { db } = await import("$lib/server/db");
	const [existing] = await db
		.select()
		.from(deepResearchSources)
		.where(
			and(
				eq(deepResearchSources.userId, input.userId),
				eq(deepResearchSources.id, input.sourceId),
			),
		)
		.limit(1);

	if (!existing) {
		throw new Error("Research source not found");
	}

	const reviewedAt = input.reviewedAt ?? new Date();
	const [row] = await db
		.update(deepResearchSources)
		.set({
			status: "reviewed",
			reviewedAt,
			reviewedNote: input.reviewedNote ?? existing.reviewedNote,
			relevanceScore: normalizeNullableScore(input.relevanceScore),
			rejectedReason: null,
			supportedKeyQuestionsJson: JSON.stringify(input.supportedKeyQuestions ?? []),
			extractedClaimsJson: JSON.stringify(input.extractedClaims ?? []),
			openedContentLength: Math.max(0, Math.floor(input.openedContentLength ?? 0)),
			updatedAt: reviewedAt,
		})
		.where(eq(deepResearchSources.id, existing.id))
		.returning();

	return mapSourceRow(row);
}

export async function markResearchSourceRejected(
	input: MarkResearchSourceRejectedInput,
): Promise<DeepResearchSource> {
	const { db } = await import("$lib/server/db");
	const [existing] = await db
		.select()
		.from(deepResearchSources)
		.where(
			and(
				eq(deepResearchSources.userId, input.userId),
				eq(deepResearchSources.id, input.sourceId),
			),
		)
		.limit(1);

	if (!existing) {
		throw new Error("Research source not found");
	}

	const rejectedAt = input.rejectedAt ?? new Date();
	const [row] = await db
		.update(deepResearchSources)
		.set({
			status: "discovered",
			rejectedReason: input.rejectedReason,
			relevanceScore: normalizeNullableScore(input.relevanceScore),
			supportedKeyQuestionsJson: JSON.stringify(input.supportedKeyQuestions ?? []),
			extractedClaimsJson: JSON.stringify(input.extractedClaims ?? []),
			openedContentLength: Math.max(0, Math.floor(input.openedContentLength ?? 0)),
			updatedAt: rejectedAt,
		})
		.where(eq(deepResearchSources.id, existing.id))
		.returning();

	return mapSourceRow(row);
}

export async function markResearchSourceCited(
	input: MarkResearchSourceCitedInput,
): Promise<DeepResearchSource> {
	const { db } = await import("$lib/server/db");
	const [existing] = await db
		.select()
		.from(deepResearchSources)
		.where(
			and(
				eq(deepResearchSources.userId, input.userId),
				eq(deepResearchSources.id, input.sourceId),
			),
		)
		.limit(1);

	if (!existing) {
		throw new Error("Research source not found");
	}
	if (!existing.reviewedAt) {
		throw new Error("Research source must be reviewed before citation");
	}

	const citedAt = input.citedAt ?? new Date();
	const [row] = await db
		.update(deepResearchSources)
		.set({
			status: "cited",
			citedAt,
			citationNote: input.citationNote ?? existing.citationNote,
			updatedAt: citedAt,
		})
		.where(eq(deepResearchSources.id, existing.id))
		.returning();

	return mapSourceRow(row);
}

function buildScopeFilters(input: ListResearchSourcesInput) {
	return [
		eq(deepResearchSources.userId, input.userId),
		input.jobId ? eq(deepResearchSources.jobId, input.jobId) : undefined,
		input.conversationId
			? eq(deepResearchSources.conversationId, input.conversationId)
			: undefined,
	].filter((filter) => filter !== undefined);
}

function mapSourceRow(row: DeepResearchSourceRow): DeepResearchSource {
	return {
		id: row.id,
		jobId: row.jobId,
		conversationId: row.conversationId,
		userId: row.userId,
		status: row.status as DeepResearchSourceStatus,
		url: row.url,
		title: row.title,
		provider: row.provider,
		snippet: row.snippet,
		sourceText: row.sourceText,
		reviewedNote: row.reviewedNote,
		citationNote: row.citationNote,
		relevanceScore: row.relevanceScore,
		rejectedReason: row.rejectedReason,
		supportedKeyQuestions: parseStringArray(row.supportedKeyQuestionsJson),
		extractedClaims: parseStringArray(row.extractedClaimsJson),
		openedContentLength: row.openedContentLength,
		discoveredAt: row.discoveredAt.toISOString(),
		reviewedAt: row.reviewedAt?.toISOString() ?? null,
		citedAt: row.citedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function parseStringArray(value: string | null): string[] {
	if (!value) return [];
	try {
		const parsed = JSON.parse(value) as unknown;
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}

function normalizeCount(value: unknown): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function normalizeNullableScore(value: unknown): number | null {
	if (value === undefined || value === null) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return null;
	return Math.max(0, Math.min(100, Math.round(parsed)));
}
