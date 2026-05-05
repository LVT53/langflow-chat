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
	repairUnsupportedClaim?: (
		input: CitationAuditRepairInput,
	) => Promise<CitationAuditRepairResult | null>;
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
			const supportedSources = sources.filter(
				(source) =>
					isReviewedCitedSource(source) && sourceSupportsClaim(source, claim),
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
	const sourceText = [
		source.reviewedNote,
		source.citationNote,
		source.snippet,
		source.title,
	]
		.filter(Boolean)
		.join(" ");
	return normalizedWords(claim.text).every((word) =>
		normalizedWords(sourceText).includes(word),
	);
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

function normalizedWords(value: string): string[] {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.split(" ")
		.filter((word) => word.length > 2);
}
