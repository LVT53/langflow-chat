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
			updatedAt: reviewedAt,
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
		reviewedNote: row.reviewedNote,
		citationNote: row.citationNote,
		discoveredAt: row.discoveredAt.toISOString(),
		reviewedAt: row.reviewedAt?.toISOString() ?? null,
		citedAt: row.citedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function normalizeCount(value: unknown): number {
	const parsed = typeof value === "number" ? value : Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}
