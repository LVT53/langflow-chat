export type DiscoveredResearchSource = {
	id: string;
	url: string;
	title: string;
	snippet?: string | null;
};

export type TriageSourcesForReviewInput = {
	jobId: string;
	discoveredSources: DiscoveredResearchSource[];
	reviewLimit: number;
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
			keyFindings: normalizeTextList(review.keyFindings ?? []),
			extractedText: review.extractedText
				? normalizeText(review.extractedText)
				: null,
		});

		reviewedSources.push(notes);
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
