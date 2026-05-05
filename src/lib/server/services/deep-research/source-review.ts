import type {
	DeepResearchSourceAuthoritySummary,
	DeepResearchSourceQualitySignals,
} from "$lib/types";
import {
	deriveSourceAuthoritySummary,
	evaluateSourceQualitySignals,
} from "./source-quality";

export type DiscoveredResearchSource = {
	id: string;
	url: string;
	title: string;
	snippet?: string | null;
	sourceText?: string | null;
	supportedKeyQuestions?: string[];
	intendedComparedEntity?: string | null;
	intendedComparisonAxis?: string | null;
	extractedClaims?: string[];
};

export type TriageSourcesForReviewInput = {
	jobId: string;
	discoveredSources: DiscoveredResearchSource[];
	reviewLimit: number;
	sourceProcessingConcurrency?: number;
	planGoal?: string;
	keyQuestions?: string[];
};

export type SourceReviewCandidate = DiscoveredResearchSource & {
	canonicalUrl: string;
	duplicateSourceIds: string[];
	authorityScore: number;
	qualityScore: number;
	reviewScore: number;
};

export type SourceTriageResult = {
	jobId: string;
	discoveredCount: number;
	canonicalSourceCount: number;
	reviewedCount: number;
	selectedSources: SourceReviewCandidate[];
};

export type ReviewedResearchSourceNotes = {
	jobId: string;
	discoveredSourceId: string;
	canonicalUrl: string;
	title: string;
	duplicateSourceIds: string[];
	authorityScore: number;
	qualityScore: number;
	reviewScore: number;
	summary: string;
	keyFindings: string[];
	extractedText: string | null;
	relevanceScore: number;
	topicRelevant: boolean;
	topicRelevanceReason: string | null;
	supportedKeyQuestions: string[];
	intendedComparedEntity?: string | null;
	intendedComparisonAxis?: string | null;
	comparedEntity?: string | null;
	comparisonAxis?: string | null;
	extractedClaims: string[];
	sourceQualitySignals: DeepResearchSourceQualitySignals;
	sourceAuthoritySummary: DeepResearchSourceAuthoritySummary;
	rejectedReason: string | null;
	openedContentLength: number;
};

export type PersistedReviewedResearchSourceNotes =
	ReviewedResearchSourceNotes & {
		id: string;
		createdAt: string;
	};

export type ReviewSourceResult = {
	summary: string;
	keyFindings?: string[];
	extractedText?: string | null;
	relevanceScore?: number;
	supportedKeyQuestions?: string[];
	comparedEntity?: string | null;
	comparisonAxis?: string | null;
	extractedClaims?: string[];
	rejectedReason?: string | null;
};

export type SourceReviewer = {
	reviewSource(source: SourceReviewCandidate): Promise<ReviewSourceResult>;
};

export type ReviewedSourceNotesRepository = {
	saveReviewedSourceNotes(
		notes: ReviewedResearchSourceNotes,
	): Promise<PersistedReviewedResearchSourceNotes>;
};

export type TriageAndReviewSourcesDependencies = {
	reviewer: SourceReviewer;
	repository: ReviewedSourceNotesRepository;
};

export type SourceTriageAndReviewResult = SourceTriageResult & {
	reviewedSources: PersistedReviewedResearchSourceNotes[];
};

export async function triageSourcesForReview(
	input: TriageSourcesForReviewInput,
): Promise<SourceTriageResult> {
	const canonicalSources = deduplicateDiscoveredSources(
		input.discoveredSources,
	).sort(compareSourceReviewCandidates);
	const reviewableSources = canonicalSources.filter(
		(source) => source.reviewScore > 0,
	);
	const reviewLimit = Math.max(0, Math.floor(input.reviewLimit));

	return {
		jobId: input.jobId,
		discoveredCount: input.discoveredSources.length,
		canonicalSourceCount: canonicalSources.length,
		reviewedCount: 0,
		selectedSources: reviewableSources.slice(0, reviewLimit),
	};
}

export async function triageAndReviewSources(
	input: TriageSourcesForReviewInput,
	dependencies: TriageAndReviewSourcesDependencies,
): Promise<SourceTriageAndReviewResult> {
	const triage = await triageSourcesForReview(input);
	const reviewConcurrency = normalizePositiveInteger(
		input.sourceProcessingConcurrency,
		1,
	);

	const reviewedSourceResults = await mapWithConcurrency(
		triage.selectedSources,
		reviewConcurrency,
		async (source) => {
		const review = await dependencies.reviewer.reviewSource(source);
		const extractedText = review.extractedText
			? normalizeText(review.extractedText)
			: null;
		const sourceText = extractedText ?? source.sourceText ?? source.snippet ?? "";
		const topicRelevance = evaluateTopicRelevance({
			planGoal: input.planGoal,
			keyQuestions: input.keyQuestions ?? [],
			source,
			sourceText,
		});
		const supportedKeyQuestions = normalizeSupportedKeyQuestions(
			review.supportedKeyQuestions,
			input.keyQuestions ?? [],
			sourceText,
		);
		const keyFindings = normalizeTextList(review.keyFindings ?? []);
		const relevanceScore = normalizeRelevanceScore(
			review.relevanceScore,
			{
				supportedKeyQuestions,
				keyFindings,
				sourceText,
				title: source.title,
			},
		);
		const rejectedReason =
			normalizeRejectedReason(review.rejectedReason) ??
			defaultRejectedReason({
				relevanceScore,
				supportedKeyQuestions,
				source,
				sourceText,
				topicRelevance,
				requiresKeyQuestionSupport: (input.keyQuestions ?? []).length > 0,
			});
		const sourceQualitySignals = evaluateSourceQualitySignals({
			url: source.canonicalUrl,
			title: source.title,
			snippet: source.snippet,
			sourceText,
			keyFindings,
			supportedKeyQuestions,
			relevanceScore,
		});
		const sourceAuthoritySummary =
			deriveSourceAuthoritySummary(sourceQualitySignals);
		const notes = await dependencies.repository.saveReviewedSourceNotes({
			jobId: input.jobId,
			discoveredSourceId: source.id,
			canonicalUrl: source.canonicalUrl,
			title: source.title,
			duplicateSourceIds: source.duplicateSourceIds,
			authorityScore: source.authorityScore,
			qualityScore: source.qualityScore,
			reviewScore: source.reviewScore,
			summary: normalizeText(review.summary),
			keyFindings,
			extractedText,
			relevanceScore,
			topicRelevant: topicRelevance.relevant,
			topicRelevanceReason: buildTopicRelevanceReason(topicRelevance),
			supportedKeyQuestions,
			intendedComparedEntity: normalizeOptionalText(
				source.intendedComparedEntity,
			),
			intendedComparisonAxis: normalizeOptionalText(
				source.intendedComparisonAxis,
			),
			comparedEntity:
				normalizeOptionalText(review.comparedEntity) ??
				normalizeOptionalText(source.intendedComparedEntity),
			comparisonAxis:
				normalizeOptionalText(review.comparisonAxis) ??
				normalizeOptionalText(source.intendedComparisonAxis),
			extractedClaims: normalizeTextList(review.extractedClaims ?? keyFindings),
			sourceQualitySignals,
			sourceAuthoritySummary: sourceAuthoritySummary ?? {
				label: "Weak source fit",
				score: 0,
				reasons: [],
			},
			rejectedReason,
			openedContentLength: sourceText.length,
		});

			return !notes.rejectedReason && notes.relevanceScore >= MIN_RELEVANCE_SCORE
				? notes
				: null;
		},
	);
	const reviewedSources = reviewedSourceResults.filter(
		(source): source is PersistedReviewedResearchSourceNotes => source !== null,
	);

	return {
		...triage,
		reviewedCount: reviewedSources.length,
		reviewedSources,
	};
}

function deduplicateDiscoveredSources(
	sources: DiscoveredResearchSource[],
): SourceReviewCandidate[] {
	const byCanonicalUrl = new Map<string, SourceReviewCandidate>();

	for (const source of sources) {
		const canonicalUrl = normalizeResearchSourceUrl(source.url);
		const existing = byCanonicalUrl.get(canonicalUrl);

		if (existing) {
			existing.duplicateSourceIds.push(source.id);
			continue;
		}

		byCanonicalUrl.set(canonicalUrl, {
			...source,
			canonicalUrl,
			duplicateSourceIds: [],
			...scoreDiscoveredSource(source, canonicalUrl),
		});
	}

	return [...byCanonicalUrl.values()];
}

function compareSourceReviewCandidates(
	left: SourceReviewCandidate,
	right: SourceReviewCandidate,
): number {
	return right.reviewScore - left.reviewScore;
}

function scoreDiscoveredSource(
	source: DiscoveredResearchSource,
	canonicalUrl: string,
): Pick<
	SourceReviewCandidate,
	"authorityScore" | "qualityScore" | "reviewScore"
> {
	const authorityScore = scoreSourceAuthority(canonicalUrl);
	const qualityScore = scoreSourceQuality(source);

	return {
		authorityScore,
		qualityScore,
		reviewScore: authorityScore + qualityScore,
	};
}

function scoreSourceAuthority(canonicalUrl: string): number {
	const hostname = new URL(canonicalUrl).hostname.toLowerCase();

	if (hostname.includes(".gov") || hostname.endsWith("gov")) return 80;
	if (hostname.includes(".edu") || hostname.endsWith("edu")) return 60;
	if (hostname.includes("research") || hostname.includes("journal")) return 45;
	if (hostname.includes("blog")) return 10;
	return 25;
}

function scoreSourceQuality(source: DiscoveredResearchSource): number {
	const text = `${source.title} ${source.snippet ?? ""}`.toLowerCase();
	let score = 0;

	if (isBlockedOrNoiseSource(source)) return -100;

	for (const signal of [
		"methodology",
		"data",
		"peer reviewed",
		"citations",
		"limitations",
	]) {
		if (text.includes(signal)) score += 8;
	}

	for (const weakSignal of ["shocking", "unsourced", "listicle"]) {
		if (text.includes(weakSignal)) score -= 10;
	}

	return score;
}

const MIN_RELEVANCE_SCORE = 55;

function isBlockedOrNoiseSource(source: DiscoveredResearchSource): boolean {
	const title = source.title.toLowerCase();
	const content = `${source.title} ${source.snippet ?? ""} ${source.sourceText ?? ""}`.toLowerCase();
	return [
		"request rejected",
		"checking your browser",
		"recaptcha",
		"captcha",
		"access denied",
		"enable javascript",
	].some((signal) => title.includes(signal) || content.includes(signal));
}

function normalizeSupportedKeyQuestions(
	explicitQuestions: string[] | undefined,
	planQuestions: string[],
	sourceText: string,
): string[] {
	const normalizedExplicit = normalizeTextList(explicitQuestions ?? []);
	if (normalizedExplicit.length > 0) {
		return normalizedExplicit.filter((question) =>
			planQuestions.length === 0 ||
			planQuestions.some((planQuestion) => questionsOverlap(question, planQuestion)),
		);
	}
	return planQuestions.filter((question) => sourceSupportsQuestion(sourceText, question));
}

function sourceSupportsQuestion(sourceText: string, question: string): boolean {
	const sourceTerms = importantTerms(sourceText);
	const questionTerms = importantTerms(question);
	if (questionTerms.length === 0) return false;
	const overlap = questionTerms.filter((term) => sourceTerms.has(term)).length;
	return overlap >= Math.min(2, questionTerms.length);
}

function questionsOverlap(left: string, right: string): boolean {
	const leftTerms = importantTerms(left);
	const rightTerms = importantTerms(right);
	let overlap = 0;
	for (const term of leftTerms) {
		if (rightTerms.has(term)) overlap += 1;
	}
	return overlap >= Math.min(2, leftTerms.size, rightTerms.size);
}

function importantTerms(value: string): Set<string> {
	return new Set(
		value
			.toLowerCase()
			.replace(/https?:\/\/\S+/g, " ")
			.split(/[^a-z0-9áéíóöőúüű]+/iu)
			.map((term) => term.trim())
			.filter((term) => term.length >= 4 && !STOP_WORDS.has(term)),
	);
}

const STOP_WORDS = new Set([
	"what",
	"which",
	"where",
	"when",
	"with",
	"from",
	"this",
	"that",
	"does",
	"current",
	"rules",
	"source",
	"sources",
	"research",
	"report",
	"about",
	"should",
	"could",
	"would",
	"mely",
	"milyen",
	"mik",
	"hol",
	"hogyan",
	"jelenlegi",
	"forras",
	"forrasok",
	"kutatas",
	"jelentes",
]);

const GENERIC_TOPIC_TERMS = new Set([
	"compare",
	"comparison",
	"comparing",
	"osszehasonlitas",
	"osszehasonlitasa",
	"atfogo",
	"model",
	"models",
	"modell",
	"modellek",
	"modelljei",
	"modelljeinek",
	"bike",
	"bikes",
	"bicycle",
	"bicycles",
	"cycling",
	"kerekpar",
	"kerekparok",
	"kerekparmodellek",
	"muszaki",
	"jellemzok",
	"felhasznalasi",
	"teruletek",
	"tapasztalatok",
	"alapjan",
	"magyar",
	"nyelvu",
	"időszak",
	"idoszak",
	"vonatkozoan",
	"arat",
	"arak",
	"price",
	"pricing",
	"value",
]);

function normalizeRelevanceScore(
	score: number | undefined,
	input: {
		supportedKeyQuestions: string[];
		keyFindings: string[];
		sourceText: string;
		title: string;
	},
): number {
	if (typeof score === "number" && Number.isFinite(score)) {
		return Math.max(0, Math.min(100, Math.round(score)));
	}
	let computed = 25;
	if (input.supportedKeyQuestions.length > 0) computed += 35;
	if (input.keyFindings.length > 0) computed += 20;
	if (input.sourceText.length >= 500) computed += 10;
	if (!isBlockedOrNoiseSource({ id: "", url: "https://example.test", title: input.title, sourceText: input.sourceText })) {
		computed += 10;
	}
	return Math.max(0, Math.min(100, computed));
}

function normalizeRejectedReason(reason: string | null | undefined): string | null {
	const normalized = reason?.replace(/\s+/g, " ").trim();
	return normalized ? normalized : null;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
	const normalized = value?.replace(/\s+/g, " ").trim();
	return normalized ? normalized : null;
}

function defaultRejectedReason(input: {
	relevanceScore: number;
	supportedKeyQuestions: string[];
	source: SourceReviewCandidate;
	sourceText: string;
	topicRelevance?: TopicRelevanceResult;
	requiresKeyQuestionSupport?: boolean;
}): string | null {
	if (isBlockedOrNoiseSource(input.source)) {
		return "Rejected because the page appears to be blocked, captcha-protected, or browser-check noise.";
	}
	if (input.sourceText.trim().length === 0) {
		return "Rejected because no usable source content was available.";
	}
	if (input.requiresKeyQuestionSupport && input.supportedKeyQuestions.length === 0) {
		return "Rejected because the source does not support any approved key question.";
	}
	if (input.topicRelevance && !input.topicRelevance.relevant) {
		return "Rejected because the source is off-topic for the approved Research Plan.";
	}
	if (input.relevanceScore < MIN_RELEVANCE_SCORE) {
		return "Rejected because relevance was below the Deep Research threshold.";
	}
	return null;
}

function buildTopicRelevanceReason(result: TopicRelevanceResult): string | null {
	if (result.anchors.length === 0) return null;
	if (result.relevant) {
		return `Matched topic anchors: ${result.matchedAnchors.join(", ")}.`;
	}
	return `Matched ${result.matchedAnchors.length} of ${result.anchors.length} topic anchors: ${result.anchors.join(", ")}.`;
}

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function normalizeTextList(values: string[]): string[] {
	return values.map(normalizeText).filter(Boolean);
}

type TopicRelevanceResult = {
	relevant: boolean;
	anchors: string[];
	matchedAnchors: string[];
};

export function isSourceTopicRelevantToPlan(input: {
	planGoal?: string | null;
	keyQuestions?: string[];
	source: Pick<DiscoveredResearchSource, "title" | "snippet" | "sourceText">;
}): boolean {
	return evaluateTopicRelevance({
		planGoal: input.planGoal ?? undefined,
		keyQuestions: input.keyQuestions ?? [],
		source: {
			id: "",
			url: "https://example.test",
			title: input.source.title,
			snippet: input.source.snippet,
			sourceText: input.source.sourceText,
		},
		sourceText: input.source.sourceText ?? input.source.snippet ?? "",
	}).relevant;
}

function evaluateTopicRelevance(input: {
	planGoal?: string;
	keyQuestions: string[];
	source: Pick<DiscoveredResearchSource, "title" | "snippet" | "sourceText">;
	sourceText: string;
}): TopicRelevanceResult {
	const anchors = extractTopicAnchors(
		[input.planGoal, ...input.keyQuestions].filter(Boolean).join(" "),
	);
	if (anchors.length === 0) {
		return { relevant: true, anchors, matchedAnchors: [] };
	}

	const searchableSourceText = normalizeTopicText(
		[
			input.source.title,
			input.source.snippet,
			input.source.sourceText,
			input.sourceText,
		]
			.filter(Boolean)
			.join(" "),
	);
	const matchedAnchors = anchors.filter((anchor) =>
		searchableSourceText.includes(normalizeTopicText(anchor)),
	);
	const requiredMatches = anchors.length === 1 ? 1 : Math.min(2, anchors.length);
	return {
		relevant: matchedAnchors.length >= requiredMatches,
		anchors,
		matchedAnchors,
	};
}

function extractTopicAnchors(value: string): string[] {
	const normalizedTokens = value
		.split(/[^a-z0-9áéíóöőúüű]+/iu)
		.map((token) => token.trim())
		.filter(Boolean);
	const termCounts = new Map<string, number>();
	for (const token of normalizedTokens) {
		const normalized = normalizeTopicText(token);
		if (!isTopicAnchorTerm(normalized)) continue;
		termCounts.set(normalized, (termCounts.get(normalized) ?? 0) + 1);
	}

	const repeatedAnchors = [...termCounts.entries()]
		.filter(([, count]) => count > 1)
		.map(([term]) => term);
	const uniqueAnchors = [...termCounts.keys()].filter(
		(term) => !repeatedAnchors.includes(term),
	);

	return [...repeatedAnchors, ...uniqueAnchors].slice(0, 8);
}

function isTopicAnchorTerm(term: string): boolean {
	return (
		term.length >= 4 &&
		!STOP_WORDS.has(term) &&
		!GENERIC_TOPIC_TERMS.has(term) &&
		!/^\d+$/.test(term)
	);
}

function normalizeTopicText(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.replace(/\s+/g, " ")
		.trim();
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number.parseInt(value, 10)
				: Number.NaN;
	if (!Number.isFinite(parsed)) return fallback;
	return Math.max(1, Math.floor(parsed));
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T) => Promise<R>,
): Promise<R[]> {
	const limit = Math.max(1, Math.floor(concurrency));
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	const workers = Array.from(
		{ length: Math.min(limit, items.length) },
		async () => {
			while (nextIndex < items.length) {
				const currentIndex = nextIndex;
				nextIndex += 1;
				results[currentIndex] = await mapper(items[currentIndex]);
			}
		},
	);
	await Promise.all(workers);
	return results;
}

function normalizeResearchSourceUrl(url: string): string {
	const parsed = new URL(url);

	parsed.hash = "";
	for (const key of [...parsed.searchParams.keys()]) {
		if (key.toLowerCase().startsWith("utm_")) {
			parsed.searchParams.delete(key);
		}
	}
	parsed.searchParams.sort();

	const withoutTrailingSlash =
		parsed.pathname.length > 1
			? parsed.pathname.replace(/\/+$/, "")
			: parsed.pathname;
	parsed.pathname = withoutTrailingSlash;

	return parsed.toString().replace(/\/$/, "");
}
