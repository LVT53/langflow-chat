import type { DeepResearchSourceStatus } from "$lib/types";

export type DeepResearchReportClaim = {
	id: string;
	text: string;
	core?: boolean;
	citationSourceIds: string[];
};

export type DeepResearchReportSection = {
	heading: string;
	claims: DeepResearchReportClaim[];
};

export type DeepResearchReportDraft = {
	title: string;
	sections: DeepResearchReportSection[];
	limitations: string[];
};

export type CitationAuditSource = {
	id: string;
	status: DeepResearchSourceStatus;
	title: string;
	url: string;
	reviewedAt: string | null;
	citedAt: string | null;
	reviewedNote?: string | null;
	citationNote?: string | null;
	snippet?: string | null;
	sourceText?: string | null;
	supportedKeyQuestions?: string[];
	extractedClaims?: string[];
};

export type CitationAuditFindingStatus =
	| "supported"
	| "repaired"
	| "unsupported_source"
	| "unsupported_claim"
	| "limited";

export type CitationAuditFinding = {
	claimId: string;
	status: CitationAuditFindingStatus;
	sourceIds: string[];
	reason: string;
};

export type CitationAuditStatus =
	| "passed"
	| "completed_with_limitations"
	| "failed";

export type CitationAuditInput = {
	jobId: string;
	report: DeepResearchReportDraft;
	citedSources: CitationAuditSource[];
	reviewClaimSupport?: (
		input: CitationAuditClaimReviewInput,
	) => Promise<CitationAuditClaimReviewResult | null>;
	repairUnsupportedClaim?: (
		input: CitationAuditRepairInput,
	) => Promise<CitationAuditRepairResult | null>;
};

export type CitationAuditClaimReviewInput = {
	claim: DeepResearchReportClaim;
	reviewedCitedSources: CitationAuditSource[];
};

export type CitationAuditClaimReviewResult = {
	status: "supported" | "repaired" | "unsupported";
	reason: string;
	citationSourceIds?: string[];
	text?: string;
};

export type CitationAuditRepairInput = {
	claim: DeepResearchReportClaim;
	reviewedCitedSources: CitationAuditSource[];
};

export type CitationAuditRepairResult = {
	text: string;
	citationSourceIds?: string[];
};

export type CitationAuditResult = {
	jobId: string;
	status: CitationAuditStatus;
	canComplete: boolean;
	auditedReport: DeepResearchReportDraft;
	limitations: string[];
	findings: CitationAuditFinding[];
};

export async function auditDeepResearchReportCitations(
	input: CitationAuditInput,
): Promise<CitationAuditResult> {
	const sourceById = new Map(
		input.citedSources.map((source) => [source.id, source]),
	);
	const findings: CitationAuditFinding[] = [];
	const auditedSections: DeepResearchReportSection[] = [];
	const limitations = [...input.report.limitations];

	for (const section of input.report.sections) {
		const auditedClaims: DeepResearchReportClaim[] = [];

		for (const claim of section.claims) {
			const sources = claim.citationSourceIds
				.map((sourceId) => sourceById.get(sourceId))
				.filter((source): source is CitationAuditSource => Boolean(source));
			const reviewedCitedSources = sources.filter(isReviewedCitedSource);

			if (reviewedCitedSources.length === 0) {
				const sourceIds =
					sources.length > 0
						? sources.map((source) => source.id)
						: claim.citationSourceIds;
				limitations.push(
					`Removed claim because it cited sources that were not both reviewed and cited: ${claim.text}`,
				);
				findings.push({
					claimId: claim.id,
					status: "unsupported_source",
					sourceIds,
					reason:
						"Claim cited no source that had both Reviewed Source and Cited Source status.",
				});
				continue;
			}

			const llmReview = await reviewClaimSupport({
				claim,
				reviewedCitedSources,
				sourceById,
				reviewClaimSupport: input.reviewClaimSupport,
			});
			if (llmReview) {
				if (llmReview.status === "supported") {
					auditedClaims.push({
						...claim,
						citationSourceIds: llmReview.supportedSourceIds,
					});
					findings.push({
						claimId: claim.id,
						status: "supported",
						sourceIds: llmReview.supportedSourceIds,
						reason: llmReview.reason,
					});
					continue;
				}
				if (llmReview.status === "repaired") {
					auditedClaims.push(llmReview.claim);
					limitations.push(
						`Repaired unsupported core claim during citation audit: ${claim.text}`,
					);
					findings.push({
						claimId: claim.id,
						status: "repaired",
						sourceIds: llmReview.supportedSourceIds,
						reason: llmReview.reason,
					});
					continue;
				}
				limitations.push(
					`Removed unsupported core claim after citation audit: ${claim.text}`,
				);
				findings.push({
					claimId: claim.id,
					status: "unsupported_claim",
					sourceIds: reviewedCitedSources.map((source) => source.id),
					reason: llmReview.reason,
				});
				continue;
			}

			const supportedSources = reviewedCitedSources.filter((source) =>
				sourceSupportsClaim(source, claim),
			);
			if (supportedSources.length > 0) {
				auditedClaims.push(claim);
				findings.push({
					claimId: claim.id,
					status: "supported",
					sourceIds: supportedSources.map((source) => source.id),
					reason: "Claim is supported by at least one reviewed cited source.",
				});
				continue;
			}

			const repairedClaim = await repairUnsupportedClaim({
				claim,
				reviewedCitedSources,
				sourceById,
				repairUnsupportedClaim: input.repairUnsupportedClaim,
			});
			if (repairedClaim) {
				auditedClaims.push(repairedClaim.claim);
				limitations.push(
					`Repaired unsupported core claim during citation audit: ${claim.text}`,
				);
				findings.push({
					claimId: claim.id,
					status: "repaired",
					sourceIds: repairedClaim.supportedSourceIds,
					reason:
						"Unsupported claim was repaired and rechecked against reviewed cited sources.",
				});
				continue;
			}

			limitations.push(
				`Removed unsupported core claim after citation audit: ${claim.text}`,
			);
			findings.push({
				claimId: claim.id,
				status: "unsupported_claim",
				sourceIds: reviewedCitedSources.map((source) => source.id),
				reason:
					"Claim cited reviewed sources, but the reviewed source notes did not support the claim.",
			});
		}

		auditedSections.push({ ...section, claims: auditedClaims });
	}
	const retainedClaimCount = findings.filter((finding) =>
		["supported", "repaired"].includes(finding.status),
	).length;
	const removedClaimCount = findings.length - retainedClaimCount;
	const status = determineAuditStatus({
		retainedClaimCount,
		removedClaimCount,
		limitationCount: limitations.length,
	});

	return {
		jobId: input.jobId,
		status,
		canComplete: status === "passed" || status === "completed_with_limitations",
		auditedReport: {
			...input.report,
			sections: auditedSections,
			limitations,
		},
		limitations,
		findings,
	};
}

function isReviewedCitedSource(source: CitationAuditSource): boolean {
	return (
		source.status === "cited" && Boolean(source.reviewedAt && source.citedAt)
	);
}

function sourceSupportsClaim(
	source: CitationAuditSource,
	claim: DeepResearchReportClaim,
): boolean {
	const claimText = normalizeForComparison(claim.text);
	const evidenceSegments = [
		...(source.extractedClaims ?? []),
		source.reviewedNote,
		source.citationNote,
		source.snippet,
		source.sourceText,
		source.title,
	]
		.filter((segment): segment is string => Boolean(segment?.trim()));

	if (evidenceSegments.length === 0) return false;
	if (
		evidenceSegments.some(
			(segment) => normalizeForComparison(segment).includes(claimText),
		)
	) {
		return true;
	}
	if (evidenceSegments.some((segment) => contradictsClaim(segment, claim.text))) {
		return false;
	}

	const claimTerms = importantTerms(claim.text);
	if (claimTerms.length === 0) return false;
	const claimNumbers = extractNumbers(claim.text);

	return evidenceSegments.some((segment) => {
		const segmentTerms = new Set(importantTerms(segment));
		if (segmentTerms.size === 0) return false;
		if (!claimNumbers.every((number) => segment.includes(number))) return false;

		const overlap = claimTerms.filter((term) => segmentTerms.has(term)).length;
		const minimumOverlap = Math.min(3, claimTerms.length);
		const overlapRatio = overlap / claimTerms.length;
		return overlap >= minimumOverlap && overlapRatio >= 0.68;
	});
}

async function repairUnsupportedClaim(input: {
	claim: DeepResearchReportClaim;
	reviewedCitedSources: CitationAuditSource[];
	sourceById: Map<string, CitationAuditSource>;
	repairUnsupportedClaim?: CitationAuditInput["repairUnsupportedClaim"];
}): Promise<{
	claim: DeepResearchReportClaim;
	supportedSourceIds: string[];
} | null> {
	if (!input.repairUnsupportedClaim) return null;

	const repair = await input.repairUnsupportedClaim({
		claim: input.claim,
		reviewedCitedSources: input.reviewedCitedSources,
	});
	if (!repair?.text.trim()) return null;

	const repairedClaim: DeepResearchReportClaim = {
		...input.claim,
		text: repair.text.trim(),
		citationSourceIds:
			repair.citationSourceIds ?? input.claim.citationSourceIds,
	};
	const repairedSources = repairedClaim.citationSourceIds
		.map((sourceId) => input.sourceById.get(sourceId))
		.filter((source): source is CitationAuditSource => Boolean(source))
		.filter(
			(source) =>
				isReviewedCitedSource(source) &&
				sourceSupportsClaim(source, repairedClaim),
		);

	if (repairedSources.length === 0) return null;

	return {
		claim: repairedClaim,
		supportedSourceIds: repairedSources.map((source) => source.id),
	};
}

async function reviewClaimSupport(input: {
	claim: DeepResearchReportClaim;
	reviewedCitedSources: CitationAuditSource[];
	sourceById: Map<string, CitationAuditSource>;
	reviewClaimSupport?: CitationAuditInput["reviewClaimSupport"];
}): Promise<
	| {
			status: "supported";
			supportedSourceIds: string[];
			reason: string;
	  }
	| {
			status: "repaired";
			claim: DeepResearchReportClaim;
			supportedSourceIds: string[];
			reason: string;
	  }
	| {
			status: "unsupported";
			reason: string;
	  }
	| null
> {
	if (!input.reviewClaimSupport) return null;
	const review = await input.reviewClaimSupport({
		claim: input.claim,
		reviewedCitedSources: input.reviewedCitedSources,
	});
	if (!review) return null;

	const allowedSourceIds = new Set(input.reviewedCitedSources.map((source) => source.id));
	const supportedSourceIds = (review.citationSourceIds ?? input.claim.citationSourceIds).filter(
		(sourceId) => allowedSourceIds.has(sourceId),
	);
	const reason = review.reason.trim() || "Citation audit model reviewed the claim.";

	if (review.status === "supported" && supportedSourceIds.length > 0) {
		return { status: "supported", supportedSourceIds, reason };
	}
	if (review.status === "repaired" && review.text?.trim() && supportedSourceIds.length > 0) {
		return {
			status: "repaired",
			claim: {
				...input.claim,
				text: review.text.trim(),
				citationSourceIds: supportedSourceIds,
			},
			supportedSourceIds,
			reason,
		};
	}
	if (review.status === "unsupported") {
		return { status: "unsupported", reason };
	}
	return null;
}

function determineAuditStatus(input: {
	retainedClaimCount: number;
	removedClaimCount: number;
	limitationCount: number;
}): CitationAuditStatus {
	if (input.retainedClaimCount === 0) return "failed";
	if (input.removedClaimCount === 0 && input.limitationCount === 0) {
		return "passed";
	}
	return "completed_with_limitations";
}

function normalizeForComparison(value: string): string {
	return value
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
}

function contradictsClaim(evidence: string, claim: string): boolean {
	const normalizedEvidence = normalizeForComparison(evidence);
	const normalizedClaim = normalizeForComparison(claim);

	if (
		/\beliminat\w*\b/.test(normalizedClaim) &&
		/\b(?:did not|does not|do not|not|never|no)\b.{0,32}\beliminat\w*\b/.test(
			normalizedEvidence,
		)
	) {
		return true;
	}
	if (
		/\ball\b/.test(normalizedClaim) &&
		/\b(?:not|never|no)\b.{0,32}\ball\b/.test(normalizedEvidence)
	) {
		return true;
	}
	return false;
}

function importantTerms(value: string): string[] {
	return [
		...new Set(
			normalizeForComparison(value)
				.replace(/https?:\/\/\S+/g, " ")
				.split(/[^a-z0-9áéíóöőúüű]+/iu)
				.map((term) => stemTerm(term.trim()))
				.filter((term) => term.length >= 4 && !STOP_WORDS.has(term)),
		),
	];
}

function stemTerm(term: string): string {
	return term
		.replace(/(ingly|edly|ing|ed|es|s)$/i, "")
		.replace(/(ek|ok|ak|nak|nek|ban|ben|ról|ről|tól|től)$/iu, "");
}

function extractNumbers(value: string): string[] {
	return value.match(/\b\d+(?:[.,]\d+)?\b/g) ?? [];
}

const STOP_WORDS = new Set([
	"about",
	"across",
	"also",
	"because",
	"from",
	"into",
	"that",
	"their",
	"there",
	"these",
	"this",
	"with",
	"without",
	"által",
	"arra",
	"azon",
	"ezek",
	"hogy",
	"mint",
	"vagy",
]);
