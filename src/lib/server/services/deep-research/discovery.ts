import type {
	ResearchRequest,
	ResearchResult,
	ResearchSource,
} from "$lib/server/services/web-research";
import { researchWeb as defaultResearchWeb } from "$lib/server/services/web-research";
import type { ResearchPlan } from "./planning";
import { saveDiscoveredResearchSource } from "./sources";
import {
	type ResearchSourceCounts,
	type ResearchTimelineEvent,
	saveResearchTimelineEvent,
} from "./timeline";

export type DiscoveredResearchSourceCandidate = {
	jobId: string;
	conversationId: string;
	userId: string;
	url: string;
	title: string;
	provider: string;
	discoveredAt: string;
	metadata: {
		query: string;
		snippet: string | null;
		text: string | null;
		canonicalUrl: string;
		publishedAt: string | null;
		authorityClass: string | null;
		authorityScore: number | null;
	};
};

export type SavedDiscoveredResearchSource = DiscoveredResearchSourceCandidate &
	Record<string, unknown>;

export type PublicWebDiscoveryInput = {
	jobId: string;
	conversationId: string;
	userId: string;
	approvedPlan: ResearchPlan;
	now?: Date;
};

export type PublicWebDiscoveryDependencies = {
	researchWeb?: (
		request: ResearchRequest,
	) => Promise<Pick<ResearchResult, "sources">>;
	sourceRepository?: {
		saveDiscoveredSources: (
			sources: DiscoveredResearchSourceCandidate[],
		) => Promise<SavedDiscoveredResearchSource[]>;
	};
	timelineRepository?: {
		saveTimelineEvent: (
			event: ResearchTimelineEvent,
		) => Promise<ResearchTimelineEvent & Record<string, unknown>>;
	};
};

export type PublicWebDiscoveryResult = {
	queries: string[];
	discoveredCount: number;
	savedSources: SavedDiscoveredResearchSource[];
	warnings: string[];
};

export async function runPublicWebDiscoveryPass(
	input: PublicWebDiscoveryInput,
	dependencies: PublicWebDiscoveryDependencies = {},
): Promise<PublicWebDiscoveryResult> {
	const now = input.now ?? new Date();
	const occurredAt = now.toISOString();
	const queries = buildDiscoveryQueries(input.approvedPlan);
	const maxSources = maxSourcesPerDiscoveryQuery(
		input.approvedPlan,
		queries.length,
	);
	const researchWeb = dependencies.researchWeb ?? defaultResearchWeb;
	const sourceRepository =
		dependencies.sourceRepository ?? defaultDiscoveredSourceRepository;
	const researchResults: Array<{ query: string; sources: ResearchSource[] }> =
		[];
	const warnings: string[] = [];
	for (const query of queries) {
		try {
			const result = await researchWeb({
				query,
				mode: "research",
				sourcePolicy: "general",
				maxSources,
			});
			researchResults.push({ query, sources: result.sources });
		} catch (error) {
			warnings.push(`Public web discovery failed: ${errorMessage(error)}`);
		}
	}

	if (researchResults.length === 0 && warnings.length > 0) {
		const warning = warnings[0] ?? "Public web discovery failed: unknown error";
		await (
			dependencies.timelineRepository?.saveTimelineEvent ??
			saveResearchTimelineEvent
		)(
			createSourceDiscoveryTimelineEvent({
				...input,
				occurredAt,
				sourceCounts: {
					discovered: 0,
					reviewed: 0,
					cited: 0,
				},
				warnings: [warning],
			}),
		);

		return {
			queries,
			discoveredCount: 0,
			savedSources: [],
			warnings: [warning],
		};
	}
	const candidates = dedupeCandidatesByUrl(
		researchResults.flatMap((result) =>
			result.sources.map((source) =>
				mapResearchSourceToCandidate({
					source,
					query: result.query,
					jobId: input.jobId,
					conversationId: input.conversationId,
					userId: input.userId,
					discoveredAt: occurredAt,
				}),
			),
		),
	);
	const savedSources =
		candidates.length > 0
			? await sourceRepository.saveDiscoveredSources(candidates)
			: [];
	const sourceCounts: ResearchSourceCounts = {
		discovered: savedSources.length,
		reviewed: 0,
		cited: 0,
	};

	await (
		dependencies.timelineRepository?.saveTimelineEvent ??
		saveResearchTimelineEvent
	)(
		createSourceDiscoveryTimelineEvent({
			...input,
			occurredAt,
			sourceCounts,
			warnings,
		}),
	);

	return {
		queries,
		discoveredCount: savedSources.length,
		savedSources,
		warnings,
	};
}

const defaultDiscoveredSourceRepository = {
	async saveDiscoveredSources(
		sources: DiscoveredResearchSourceCandidate[],
	): Promise<SavedDiscoveredResearchSource[]> {
		const savedSources = [];
		for (const source of sources) {
			savedSources.push(
				await saveDiscoveredResearchSource({
					jobId: source.jobId,
					conversationId: source.conversationId,
					userId: source.userId,
					url: source.url,
					title: source.title,
					provider: source.provider,
					snippet: source.metadata.snippet,
					sourceText: source.metadata.text,
					discoveredAt: new Date(source.discoveredAt),
				}),
			);
		}
		return savedSources;
	},
};

function mapResearchSourceToCandidate(input: {
	source: ResearchSource;
	query: string;
	jobId: string;
	conversationId: string;
	userId: string;
	discoveredAt: string;
}): DiscoveredResearchSourceCandidate {
	const canonicalUrl = canonicalizeResearchUrl(
		input.source.canonicalUrl || input.source.url,
	);
	return {
		jobId: input.jobId,
		conversationId: input.conversationId,
		userId: input.userId,
		url: canonicalUrl,
		title: input.source.title.trim() || canonicalUrl,
		provider: input.source.provider,
		discoveredAt: input.discoveredAt,
		metadata: {
			query: input.query,
			snippet: input.source.snippet,
			text: buildDiscoverySourceText(input.source),
			canonicalUrl,
			publishedAt: input.source.publishedAt,
			authorityClass: input.source.authorityClass,
			authorityScore: input.source.authorityScore,
		},
	};
}

function buildDiscoverySourceText(source: ResearchSource): string | null {
	const parts = [source.text, ...(source.highlights ?? []), source.snippet]
		.map((part) => part?.trim() ?? "")
		.filter(Boolean);
	return parts.length > 0 ? parts.join("\n\n") : null;
}

function dedupeCandidatesByUrl(
	candidates: DiscoveredResearchSourceCandidate[],
): DiscoveredResearchSourceCandidate[] {
	const byUrl = new Map<string, DiscoveredResearchSourceCandidate>();
	for (const candidate of candidates) {
		if (!byUrl.has(candidate.url)) {
			byUrl.set(candidate.url, candidate);
		}
	}
	return [...byUrl.values()];
}

function canonicalizeResearchUrl(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.protocol = parsed.protocol.toLowerCase();
		parsed.hostname = parsed.hostname.toLowerCase();
		parsed.hash = "";
		for (const key of [...parsed.searchParams.keys()]) {
			if (isTrackingQueryParam(key)) {
				parsed.searchParams.delete(key);
			}
		}
		parsed.searchParams.sort();
		const path =
			parsed.pathname.length > 1
				? parsed.pathname.replace(/\/+$/, "")
				: parsed.pathname;
		parsed.pathname = path || "/";
		const serialized = parsed.toString();
		return serialized.endsWith("/") && parsed.pathname !== "/"
			? serialized.slice(0, -1)
			: serialized;
	} catch {
		return url.trim();
	}
}

function isTrackingQueryParam(key: string): boolean {
	const normalized = key.toLowerCase();
	return (
		normalized.startsWith("utm_") ||
		["fbclid", "gclid", "msclkid", "mc_cid", "mc_eid"].includes(normalized)
	);
}

function errorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim())
		return error.message.trim();
	if (typeof error === "string" && error.trim()) return error.trim();
	return "unknown error";
}

function buildDiscoveryQueries(plan: ResearchPlan): string[] {
	const maxQueryCount = maxDiscoveryQueryCount(plan.depth);
	const candidates = [plan.goal, ...plan.keyQuestions]
		.map((query) => query.replace(/\s+/g, " ").trim())
		.filter(Boolean);
	const uniqueQueries: string[] = [];
	for (const candidate of candidates) {
		if (!uniqueQueries.includes(candidate)) {
			uniqueQueries.push(candidate);
		}
		if (uniqueQueries.length >= maxQueryCount) break;
	}
	return uniqueQueries;
}

function maxDiscoveryQueryCount(depth: ResearchPlan["depth"]): number {
	if (depth === "focused") return 2;
	if (depth === "max") return 6;
	return 4;
}

function createSourceDiscoveryTimelineEvent(
	input: PublicWebDiscoveryInput & {
		occurredAt: string;
		sourceCounts: ResearchSourceCounts;
		warnings: string[];
	},
): ResearchTimelineEvent {
	return {
		jobId: input.jobId,
		conversationId: input.conversationId,
		userId: input.userId,
		taskId: null,
		stage: "source_discovery",
		kind: input.warnings.length > 0 ? "warning" : "stage_completed",
		occurredAt: input.occurredAt,
		messageKey: "deepResearch.timeline.sourceDiscoveryCompleted",
		messageParams: {
			discoveredSources: input.sourceCounts.discovered,
		},
		sourceCounts: input.sourceCounts,
		assumptions: [],
		warnings: input.warnings,
		summary: `Discovered ${input.sourceCounts.discovered} public web source candidates.`,
	};
}

function maxSourcesPerDiscoveryQuery(
	plan: ResearchPlan,
	queryCount: number,
): number {
	const boundedQueryCount = Math.max(1, queryCount);
	return Math.max(
		1,
		Math.min(
			10,
			Math.ceil(plan.researchBudget.sourceReviewCeiling / boundedQueryCount),
		),
	);
}
