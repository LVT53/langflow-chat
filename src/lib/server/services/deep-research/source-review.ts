export type DiscoveredResearchSource = {
	id: string;
	url: string;
	title: string;
	snippet?: string | null;
	sourceText?: string | null;
	supportedKeyQuestions?: string[];
	extractedClaims?: string[];
};

export type TriageSourcesForReviewInput = {
	jobId: string;
	discoveredSources: DiscoveredResearchSource[];
	reviewLimit: number;
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
	supportedKeyQuestions: string[];
	extractedClaims: string[];
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
	const reviewedSources: PersistedReviewedResearchSourceNotes[] = [];

	for (const source of triage.selectedSources) {
		const review = await dependencies.reviewer.reviewSource(source);
		const extractedText = review.extractedText
			? normalizeText(review.extractedText)
			: null;
		const sourceText = extractedText ?? source.sourceText ?? source.snippet ?? "";
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
				requiresKeyQuestionSupport: (input.keyQuestions ?? []).length > 0,
			});
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
			supportedKeyQuestions,
			extractedClaims: normalizeTextList(review.extractedClaims ?? keyFindings),
			rejectedReason,
			openedContentLength: sourceText.length,
		});

		if (!notes.rejectedReason && notes.relevanceScore >= MIN_RELEVANCE_SCORE) {
			reviewedSources.push(notes);
		}
	}

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

function defaultRejectedReason(input: {
	relevanceScore: number;
	supportedKeyQuestions: string[];
	source: SourceReviewCandidate;
	sourceText: string;
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
	if (input.relevanceScore < MIN_RELEVANCE_SCORE) {
		return "Rejected because relevance was below the Deep Research threshold.";
	}
	return null;
}

function normalizeText(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function normalizeTextList(values: string[]): string[] {
	return values.map(normalizeText).filter(Boolean);
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
