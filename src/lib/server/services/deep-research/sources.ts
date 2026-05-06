import { randomUUID } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { deepResearchSources } from "$lib/server/db/schema";
import type {
	DeepResearchSource,
	DeepResearchSourceCounts,
	DeepResearchSourceQualitySignals,
	DeepResearchSourceStatus,
} from "$lib/types";
import {
	deriveSourceAuthoritySummary,
	normalizeSourceQualitySignals,
	parseSourceQualitySignals,
} from "./source-quality";

type DeepResearchSourceRow = typeof deepResearchSources.$inferSelect;

export type ResearchSourceLedgerEntry = {
	id: string;
	status: DeepResearchSourceStatus;
	url: string;
	faviconUrl?: string | null;
	title?: string | null;
	reviewedNote?: string | null;
	citationNote?: string | null;
	rejectedReason?: string | null;
	topicRelevant?: boolean | null;
	topicRelevanceReason?: string | null;
	reviewedAt?: string | null;
	citedAt?: string | null;
};

export type SaveDiscoveredResearchSourceInput = {
	jobId: string;
	conversationId: string;
	userId: string;
	url: string;
	title?: string | null;
	provider: string;
	snippet?: string | null;
	sourceText?: string | null;
	intendedComparedEntity?: string | null;
	intendedComparisonAxis?: string | null;
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
	topicRelevant?: boolean | null;
	topicRelevanceReason?: string | null;
	supportedKeyQuestions?: string[];
	comparedEntity?: string | null;
	comparisonAxis?: string | null;
	extractedClaims?: string[];
	sourceQualitySignals?: DeepResearchSourceQualitySignals | null;
	openedContentLength?: number;
};

export type MarkResearchSourceRejectedInput = {
	userId: string;
	sourceId: string;
	rejectedReason: string;
	relevanceScore?: number | null;
	topicRelevant?: boolean | null;
	topicRelevanceReason?: string | null;
	supportedKeyQuestions?: string[];
	comparedEntity?: string | null;
	comparisonAxis?: string | null;
	extractedClaims?: string[];
	sourceQualitySignals?: DeepResearchSourceQualitySignals | null;
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
			intendedComparedEntity: normalizeNullableText(
				input.intendedComparedEntity,
			),
			intendedComparisonAxis: normalizeNullableText(
				input.intendedComparisonAxis,
			),
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

export function buildDefaultResearchSourceLedger<T extends ResearchSourceLedgerEntry>(
	sources: T[],
): T[] {
	return sources.filter((source) => {
		if (source.citedAt || source.status === "cited") return true;
		if (
			(source.reviewedAt || source.status === "reviewed") &&
			source.topicRelevant !== false
		) {
			return true;
		}
		if (source.topicRelevant === false && explainsResearchLimitation(source)) {
			return true;
		}
		return false;
	});
}

export function getResearchSourceFaviconUrl(url: string): string | null {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return null;
	}
	if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
		return null;
	}
	if (!isPublicHostname(parsed.hostname)) {
		return null;
	}
	return new URL("/favicon.ico", parsed.origin).toString();
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
			topicRelevant: normalizeNullableBoolean(input.topicRelevant),
			topicRelevanceReason: normalizeNullableText(input.topicRelevanceReason),
			supportedKeyQuestionsJson: JSON.stringify(input.supportedKeyQuestions ?? []),
			comparedEntity: normalizeNullableText(input.comparedEntity),
			comparisonAxis: normalizeNullableText(input.comparisonAxis),
			extractedClaimsJson: JSON.stringify(input.extractedClaims ?? []),
			sourceQualitySignalsJson: stringifySourceQualitySignals(
				input.sourceQualitySignals,
			),
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
			status: "reviewed",
			reviewedAt: rejectedAt,
			rejectedReason: input.rejectedReason,
			relevanceScore: normalizeNullableScore(input.relevanceScore),
			topicRelevant: normalizeNullableBoolean(input.topicRelevant),
			topicRelevanceReason: normalizeNullableText(input.topicRelevanceReason),
			supportedKeyQuestionsJson: JSON.stringify(input.supportedKeyQuestions ?? []),
			comparedEntity: normalizeNullableText(input.comparedEntity),
			comparisonAxis: normalizeNullableText(input.comparisonAxis),
			extractedClaimsJson: JSON.stringify(input.extractedClaims ?? []),
			sourceQualitySignalsJson: stringifySourceQualitySignals(
				input.sourceQualitySignals,
			),
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
	const sourceQualitySignals = parseSourceQualitySignals(
		row.sourceQualitySignalsJson,
	);
	return {
		id: row.id,
		jobId: row.jobId,
		conversationId: row.conversationId,
		userId: row.userId,
		status: row.status as DeepResearchSourceStatus,
		url: row.url,
		faviconUrl: getResearchSourceFaviconUrl(row.url),
		title: row.title,
		provider: row.provider,
		snippet: row.snippet,
		sourceText: row.sourceText,
		reviewedNote: row.reviewedNote,
		citationNote: row.citationNote,
		relevanceScore: row.relevanceScore,
		rejectedReason: row.rejectedReason,
		topicRelevant: row.topicRelevant,
		topicRelevanceReason: row.topicRelevanceReason,
		supportedKeyQuestions: parseStringArray(row.supportedKeyQuestionsJson),
		intendedComparedEntity: row.intendedComparedEntity,
		intendedComparisonAxis: row.intendedComparisonAxis,
		comparedEntity: row.comparedEntity,
		comparisonAxis: row.comparisonAxis,
		extractedClaims: parseStringArray(row.extractedClaimsJson),
		sourceQualitySignals,
		sourceAuthoritySummary: deriveSourceAuthoritySummary(sourceQualitySignals),
		openedContentLength: row.openedContentLength,
		discoveredAt: row.discoveredAt.toISOString(),
		reviewedAt: row.reviewedAt?.toISOString() ?? null,
		citedAt: row.citedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function stringifySourceQualitySignals(
	value: DeepResearchSourceQualitySignals | null | undefined,
): string | null {
	const signals = normalizeSourceQualitySignals(value);
	return signals ? JSON.stringify(signals) : null;
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

function normalizeNullableBoolean(value: unknown): boolean | null {
	if (value === undefined || value === null) return null;
	return Boolean(value);
}

function normalizeNullableText(value: string | null | undefined): string | null {
	const normalized = value?.replace(/\s+/g, " ").trim();
	return normalized ? normalized : null;
}

function explainsResearchLimitation(source: ResearchSourceLedgerEntry): boolean {
	const text = [
		source.rejectedReason,
		source.topicRelevanceReason,
		source.reviewedNote,
		source.citationNote,
	]
		.map((value) => value?.toLowerCase() ?? "")
		.join(" ");
	return /\b(limit|limited|limitation|coverage|gap|missing|insufficient|not enough|could not|unable)\b/.test(
		text,
	);
}

function isPublicHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	if (
		normalized === "localhost" ||
		normalized.endsWith(".localhost") ||
		normalized.endsWith(".local")
	) {
		return false;
	}
	if (normalized.includes(":")) {
		return false;
	}
	const octets = normalized.split(".").map((part) => Number(part));
	if (octets.length === 4 && octets.every((octet) => Number.isInteger(octet))) {
		const [first, second] = octets;
		if (first === 10 || first === 127 || first === 0) return false;
		if (first === 169 && second === 254) return false;
		if (first === 172 && second >= 16 && second <= 31) return false;
		if (first === 192 && second === 168) return false;
	}
	return true;
}
