import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { deepResearchCitationAuditVerdicts } from "$lib/server/db/schema";
import type {
	DeepResearchCitationAuditVerdict as PersistedDeepResearchCitationAuditVerdict,
	DeepResearchClaimType,
	DeepResearchEvidenceNote,
	DeepResearchSourceQualitySignals,
	DeepResearchSourceStatus,
	DeepResearchSynthesisClaim,
} from "$lib/types";
import { classifyDeepResearchClaimType } from "./source-quality";
import { listDeepResearchEvidenceNotes } from "./evidence-notes";
import { listDeepResearchSynthesisClaims } from "./synthesis-claims";

export type DeepResearchReportClaim = {
	id: string;
	text: string;
	core?: boolean;
	claimType?: DeepResearchClaimType;
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
	sourceQualitySignals?: DeepResearchSourceQualitySignals | null;
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

export type DeepResearchCitationAuditVerdictStatus =
	| "supported"
	| "partially_supported"
	| "unsupported"
	| "contradicted"
	| "needs_repair";

export type DeepResearchCitationAuditVerdict = {
	claimId: string;
	verdict: DeepResearchCitationAuditVerdictStatus;
	evidenceNoteIds: string[];
	reason: string;
};

export type DeepResearchClaimGraphReviewInput = {
	claim: DeepResearchSynthesisClaim;
	linkedEvidenceNotes: DeepResearchEvidenceNote[];
};

export type DeepResearchClaimGraphReviewer = (
	input: DeepResearchClaimGraphReviewInput,
) => DeepResearchCitationAuditVerdict | null;

export type DeepResearchClaimGraphAuditInput = {
	jobId: string;
	claims: DeepResearchSynthesisClaim[];
	evidenceNotes: DeepResearchEvidenceNote[];
	reviewClaim?: DeepResearchClaimGraphReviewer;
};

export type DeepResearchClaimGraphAuditResult = {
	jobId: string;
	status: "passed" | "needs_repair" | "failed";
	canRenderMarkdown: boolean;
	verdicts: DeepResearchCitationAuditVerdict[];
};

type DeepResearchCitationAuditVerdictRow =
	typeof deepResearchCitationAuditVerdicts.$inferSelect;

const SQLITE_SAFE_VERDICT_INSERT_CHUNK_SIZE = 80;
const validClaimGraphVerdictStatuses =
	new Set<DeepResearchCitationAuditVerdictStatus>([
		"supported",
		"partially_supported",
		"unsupported",
		"contradicted",
		"needs_repair",
	]);

export type AuditAndPersistDeepResearchClaimGraphInput = {
	userId: string;
	jobId: string;
	now?: Date;
	claims?: DeepResearchSynthesisClaim[];
	evidenceNotes?: DeepResearchEvidenceNote[];
	reviewClaim?: DeepResearchClaimGraphReviewer;
};

export type ListDeepResearchCitationAuditVerdictsInput = {
	userId: string;
	jobId: string;
};

export async function auditDeepResearchClaimGraph(
	input: DeepResearchClaimGraphAuditInput,
): Promise<DeepResearchClaimGraphAuditResult> {
	const evidenceById = new Map(
		input.evidenceNotes.map((evidenceNote) => [evidenceNote.id, evidenceNote]),
	);
	const verdicts = input.claims.map((claim) =>
		auditSynthesisClaim({
			claim,
			evidenceById,
			reviewClaim: input.reviewClaim,
		}),
	);
	const supportedCount = verdicts.filter((verdict) =>
		["supported", "partially_supported"].includes(verdict.verdict),
	).length;
	const repairNeeded = verdicts.some((verdict) =>
		["needs_repair", "contradicted"].includes(verdict.verdict),
	);
	const status = repairNeeded
		? "needs_repair"
		: supportedCount === 0
			? "failed"
			: "passed";

	return {
		jobId: input.jobId,
		status,
		canRenderMarkdown: status === "passed",
		verdicts,
	};
}

export async function auditAndPersistDeepResearchClaimGraph(
	input: AuditAndPersistDeepResearchClaimGraphInput,
): Promise<DeepResearchClaimGraphAuditResult | null> {
	const [claims, evidenceNotes] =
		input.claims && input.evidenceNotes
			? [input.claims, input.evidenceNotes]
			: await Promise.all([
					listDeepResearchSynthesisClaims({
						userId: input.userId,
						jobId: input.jobId,
					}),
					listDeepResearchEvidenceNotes({
						userId: input.userId,
						jobId: input.jobId,
					}),
				]);
	if (claims.length === 0) return null;

	const result = await auditDeepResearchClaimGraph({
		jobId: input.jobId,
		claims,
		evidenceNotes,
		reviewClaim: input.reviewClaim,
	});
	const { db } = await import("$lib/server/db");
	const now = input.now ?? new Date();
	await db
		.delete(deepResearchCitationAuditVerdicts)
		.where(
			and(
				eq(deepResearchCitationAuditVerdicts.userId, input.userId),
				eq(deepResearchCitationAuditVerdicts.jobId, input.jobId),
			),
		);
	const verdictRows = result.verdicts.map((verdict) => {
		const claim = claims.find((item) => item.id === verdict.claimId);
		return {
			id: randomUUID(),
			jobId: input.jobId,
			conversationId: claim?.conversationId ?? "",
			userId: input.userId,
			claimId: verdict.claimId,
			verdict: verdict.verdict,
			evidenceNoteIdsJson: JSON.stringify(verdict.evidenceNoteIds),
			reason: verdict.reason,
			createdAt: now,
			updatedAt: now,
		};
	});
	for (const rowChunk of chunkArray(
		verdictRows,
		SQLITE_SAFE_VERDICT_INSERT_CHUNK_SIZE,
	)) {
		await db.insert(deepResearchCitationAuditVerdicts).values(rowChunk);
	}

	return result;
}

export async function listDeepResearchCitationAuditVerdicts(
	input: ListDeepResearchCitationAuditVerdictsInput,
): Promise<PersistedDeepResearchCitationAuditVerdict[]> {
	const { db } = await import("$lib/server/db");
	const rows = await db
		.select()
		.from(deepResearchCitationAuditVerdicts)
		.where(
			and(
				eq(deepResearchCitationAuditVerdicts.userId, input.userId),
				eq(deepResearchCitationAuditVerdicts.jobId, input.jobId),
			),
		)
		.orderBy(
			asc(deepResearchCitationAuditVerdicts.createdAt),
			asc(deepResearchCitationAuditVerdicts.id),
		);
	return rows.map(mapCitationAuditVerdictRow);
}

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
			const qualityFitSources = supportedSources.filter((source) =>
				sourceQualitySignalsFitClaim(source, claim),
			);
			if (qualityFitSources.length > 0) {
				auditedClaims.push(claim);
				findings.push({
					claimId: claim.id,
					status: "supported",
					sourceIds: qualityFitSources.map((source) => source.id),
					reason: "Claim is supported by at least one reviewed cited source.",
				});
				continue;
			}

			if (supportedSources.length > 0) {
				limitations.push(
					`Removed unsupported core claim after citation audit: ${claim.text}`,
				);
				findings.push({
					claimId: claim.id,
					status: "unsupported_claim",
					sourceIds: supportedSources.map((source) => source.id),
					reason:
						"Claim cited reviewed sources, but Source Quality Signals did not fit the claim.",
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

function mapCitationAuditVerdictRow(
	row: DeepResearchCitationAuditVerdictRow,
): PersistedDeepResearchCitationAuditVerdict {
	return {
		id: row.id,
		jobId: row.jobId,
		conversationId: row.conversationId,
		userId: row.userId,
		claimId: row.claimId,
		verdict:
			row.verdict as PersistedDeepResearchCitationAuditVerdict["verdict"],
		evidenceNoteIds: parseStringArray(row.evidenceNoteIdsJson),
		reason: row.reason,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function auditSynthesisClaim(input: {
	claim: DeepResearchSynthesisClaim;
	evidenceById: Map<string, DeepResearchEvidenceNote>;
	reviewClaim?: DeepResearchClaimGraphReviewer;
}): DeepResearchCitationAuditVerdict {
	const linkedEvidence = input.claim.evidenceLinks.flatMap((link) => {
		const evidence = input.evidenceById.get(link.evidenceNoteId);
		return evidence ? [{ link, evidence }] : [];
	});
	const evidenceNoteIds = linkedEvidence.map((item) => item.evidence.id);
	const missingEvidenceNoteIds = input.claim.evidenceLinks
		.filter((link) => !input.evidenceById.has(link.evidenceNoteId))
		.map((link) => link.evidenceNoteId);

	if (
		input.claim.central &&
		input.claim.status !== "accepted" &&
		input.claim.status !== "limited"
	) {
		return {
			claimId: input.claim.id,
			verdict: "needs_repair",
			evidenceNoteIds,
			reason:
				"Central Claim cannot be marked supported because its Claim Support Gate failed.",
		};
	}
	if (missingEvidenceNoteIds.length > 0) {
		return unsupportedClaimGraphVerdict({
			claim: input.claim,
			evidenceNoteIds: missingEvidenceNoteIds,
			reason: "Synthesis Claim links to missing Evidence Notes.",
		});
	}

	const contradictionLinks = linkedEvidence.filter(
		(item) => item.link.relation === "contradiction",
	);
	if (contradictionLinks.some((item) => item.link.material)) {
		return {
			claimId: input.claim.id,
			verdict: "contradicted",
			evidenceNoteIds: contradictionLinks.map((item) => item.evidence.id),
			reason: "Material contradictory Evidence Notes remain unresolved.",
		};
	}

	const supportLinks = linkedEvidence.filter(
		(item) => item.link.relation === "support",
	);
	if (supportLinks.length === 0) {
		return unsupportedClaimGraphVerdict({
			claim: input.claim,
			evidenceNoteIds,
			reason: "Synthesis Claim has no linked supporting Evidence Notes.",
		});
	}

	const reviewerVerdict = normalizeClaimGraphReviewerVerdict({
		claim: input.claim,
		linkedEvidence,
		verdict:
			input.reviewClaim?.({
				claim: input.claim,
				linkedEvidenceNotes: linkedEvidence.map((item) => item.evidence),
			}) ?? null,
	});
	if (reviewerVerdict) return reviewerVerdict;

	const supportingNotes = supportLinks.filter((item) =>
		evidenceNoteSupportsSynthesisClaim(item.evidence, input.claim),
	);
	if (supportingNotes.length === 0) {
		return unsupportedClaimGraphVerdict({
			claim: input.claim,
			evidenceNoteIds: supportLinks.map((item) => item.evidence.id),
			reason: "Linked Evidence Notes do not support the Synthesis Claim.",
		});
	}

	const qualityFitNotes = supportingNotes.filter((item) =>
		evidenceNoteQualitySignalsFitClaim(item.evidence, input.claim),
	);
	if (qualityFitNotes.length === 0) {
		return unsupportedClaimGraphVerdict({
			claim: input.claim,
			evidenceNoteIds: supportingNotes.map((item) => item.evidence.id),
			reason:
				"Linked Evidence Notes support the claim text, but Claim Type Evidence Requirements were not met.",
		});
	}

	const qualificationLinks = linkedEvidence.filter(
		(item) => item.link.relation === "qualification",
	);
	if (qualificationLinks.length > 0 || input.claim.status === "limited") {
		return {
			claimId: input.claim.id,
			verdict: "partially_supported",
			evidenceNoteIds: uniqueValues([
				...qualityFitNotes.map((item) => item.evidence.id),
				...qualificationLinks.map((item) => item.evidence.id),
			]),
			reason:
				"Synthesis Claim is supported with qualifying Evidence Notes or a limited claim status.",
		};
	}

	return {
		claimId: input.claim.id,
		verdict: "supported",
		evidenceNoteIds: qualityFitNotes.map((item) => item.evidence.id),
		reason:
			"Synthesis Claim is supported by linked Evidence Notes and satisfies Claim Type Evidence Requirements.",
	};
}

function unsupportedClaimGraphVerdict(input: {
	claim: DeepResearchSynthesisClaim;
	evidenceNoteIds: string[];
	reason: string;
}): DeepResearchCitationAuditVerdict {
	return {
		claimId: input.claim.id,
		verdict: input.claim.central ? "needs_repair" : "unsupported",
		evidenceNoteIds: input.evidenceNoteIds,
		reason: input.reason,
	};
}

function normalizeClaimGraphReviewerVerdict(input: {
	claim: DeepResearchSynthesisClaim;
	linkedEvidence: Array<{
		link: DeepResearchSynthesisClaim["evidenceLinks"][number];
		evidence: DeepResearchEvidenceNote;
	}>;
	verdict: DeepResearchCitationAuditVerdict | null;
}): DeepResearchCitationAuditVerdict | null {
	if (!input.verdict || input.verdict.claimId !== input.claim.id) return null;
	if (!validClaimGraphVerdictStatuses.has(input.verdict.verdict)) return null;

	const normalizedEvidenceNoteIds = normalizeReviewerEvidenceNoteIds({
		evidenceNoteIds: input.verdict.evidenceNoteIds,
		linkedEvidence: input.linkedEvidence,
	});
	const supportEvidenceIds = new Set(
		input.linkedEvidence
			.filter((item) => item.link.relation === "support")
			.map((item) => item.evidence.id),
	);
	if (
		input.verdict.verdict === "supported" ||
		input.verdict.verdict === "partially_supported"
	) {
		const supportedEvidenceNoteIds = normalizedEvidenceNoteIds.filter(
			(evidenceNoteId) => supportEvidenceIds.has(evidenceNoteId),
		);
		if (supportedEvidenceNoteIds.length === 0) return null;
		return {
			claimId: input.claim.id,
			verdict: input.verdict.verdict,
			evidenceNoteIds: uniqueValues(supportedEvidenceNoteIds),
			reason:
				input.verdict.reason.trim() ||
				"Citation audit model found the claim supported by linked Evidence Notes.",
		};
	}

	if (input.verdict.verdict === "unsupported") {
		return unsupportedClaimGraphVerdict({
			claim: input.claim,
			evidenceNoteIds:
				normalizedEvidenceNoteIds.length > 0
					? normalizedEvidenceNoteIds
					: [...supportEvidenceIds],
			reason:
				input.verdict.reason.trim() ||
				"Citation audit model found linked Evidence Notes insufficient for this Synthesis Claim.",
		});
	}

	return {
		claimId: input.claim.id,
		verdict: input.verdict.verdict,
		evidenceNoteIds: normalizedEvidenceNoteIds,
		reason:
			input.verdict.reason.trim() ||
			"Citation audit model requested claim repair before report rendering.",
	};
}

function normalizeReviewerEvidenceNoteIds(input: {
	evidenceNoteIds: string[];
	linkedEvidence: Array<{
		link: DeepResearchSynthesisClaim["evidenceLinks"][number];
		evidence: DeepResearchEvidenceNote;
	}>;
}): string[] {
	const aliases = new Map<string, string[]>();
	for (const { evidence } of input.linkedEvidence) {
		const evidenceIds = [
			evidence.id,
			evidence.sourceId,
			...sourceIdsFromEvidenceSupport(evidence.sourceSupport),
		].filter((value): value is string => Boolean(value?.trim()));
		for (const evidenceId of evidenceIds) {
			aliases.set(evidenceId, [
				...(aliases.get(evidenceId) ?? []),
				evidence.id,
			]);
		}
	}
	return uniqueValues(
		input.evidenceNoteIds.flatMap((evidenceNoteId) =>
			aliases.get(evidenceNoteId) ?? [],
		),
	);
}

function sourceIdsFromEvidenceSupport(
	sourceSupport: Record<string, unknown>,
): string[] {
	return [
		sourceSupport.sourceId,
		sourceSupport.reviewedSourceId,
		...(Array.isArray(sourceSupport.sourceIds)
			? sourceSupport.sourceIds
			: []),
	].filter((value): value is string => typeof value === "string");
}

function evidenceNoteSupportsSynthesisClaim(
	evidenceNote: DeepResearchEvidenceNote,
	claim: DeepResearchSynthesisClaim,
): boolean {
	return sourceSupportsClaim(
		{
			id: evidenceNote.id,
			status: "cited",
			title: String(evidenceNote.sourceSupport.title ?? evidenceNote.id),
			url: String(evidenceNote.sourceSupport.url ?? ""),
			reviewedAt: evidenceNote.createdAt,
			citedAt: evidenceNote.createdAt,
			reviewedNote: evidenceNote.findingText,
			citationNote: null,
			snippet: [
				evidenceNote.supportedKeyQuestion,
				evidenceNote.comparedEntity,
				evidenceNote.comparisonAxis,
			]
				.filter(Boolean)
				.join(" "),
			sourceQualitySignals: evidenceNote.sourceQualitySignals,
		},
		{
			id: claim.id,
			text: stripMarkdownCitationMarkers(claim.statement),
			core: claim.central,
			claimType: claim.claimType ?? undefined,
			citationSourceIds: [],
		},
	);
}

function evidenceNoteQualitySignalsFitClaim(
	evidenceNote: DeepResearchEvidenceNote,
	claim: DeepResearchSynthesisClaim,
): boolean {
	return sourceQualitySignalsFitClaim(
		{
			id: evidenceNote.id,
			status: "cited",
			title: String(evidenceNote.sourceSupport.title ?? evidenceNote.id),
			url: String(evidenceNote.sourceSupport.url ?? ""),
			reviewedAt: evidenceNote.createdAt,
			citedAt: evidenceNote.createdAt,
			sourceQualitySignals: evidenceNote.sourceQualitySignals,
		},
		{
			id: claim.id,
			text: stripMarkdownCitationMarkers(claim.statement),
			core: claim.central,
			claimType: claim.claimType ?? undefined,
			citationSourceIds: [],
		},
	);
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
	].filter((segment): segment is string => Boolean(segment?.trim()));

	if (evidenceSegments.length === 0) return false;
	if (
		evidenceSegments.some((segment) =>
			normalizeForComparison(segment).includes(claimText),
		)
	) {
		return true;
	}
	if (
		evidenceSegments.some((segment) => contradictsClaim(segment, claim.text))
	) {
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

function sourceQualitySignalsFitClaim(
	source: CitationAuditSource,
	claim: DeepResearchReportClaim,
): boolean {
	const signals = source.sourceQualitySignals;
	if (!signals) return true;
	if (claim.core === false) return true;
	const claimType =
		claim.claimType ?? classifyDeepResearchClaimType(claim.text);
	if (claimType === "official_specification") {
		return (
			signals.sourceType === "official_vendor" ||
			signals.sourceType === "official_government" ||
			signals.independence === "primary" ||
			hasStrongDirectNonCommunitySupport(signals)
		);
	}
	if (claimType === "price_availability") {
		if (!claimDisclosesTiming(claim.text)) return false;
		if (signals.freshness === "current" || signals.freshness === "recent") {
			return true;
		}
		return (
			signals.freshness === "undated" &&
			hasStrongDirectNonCommunitySupport(signals)
		);
	}
	if (claimType === "high_stakes") {
		return (
			(signals.sourceType === "official_government" ||
				signals.sourceType === "academic" ||
				signals.independence === "primary") &&
			signals.claimFit !== "weak" &&
			signals.claimFit !== "mismatch" &&
			claimDisclosesLimitations(claim.text)
		);
	}
	if (claimType !== "reliability_experience") return true;
	if (signals.claimFit === "weak" || signals.claimFit === "mismatch") {
		return false;
	}
	if (
		signals.independence === "independent" &&
		signals.directness !== "indirect"
	) {
		return true;
	}
	return (
		(signals.independence === "community" || signals.sourceType === "forum") &&
		claimLabelsExperientialEvidence(claim.text)
	);
}

function hasStrongDirectNonCommunitySupport(
	signals: DeepResearchSourceQualitySignals,
): boolean {
	return (
		signals.directness === "direct" &&
		signals.extractionConfidence === "high" &&
		signals.claimFit === "strong" &&
		signals.sourceType !== "forum" &&
		signals.independence !== "community"
	);
}

function claimDisclosesTiming(claimText: string): boolean {
	return /\b(as of|on|today|currently|current|latest|in 20[0-9]{2}|20[0-9]{2})\b/i.test(
		claimText,
	);
}

function claimLabelsExperientialEvidence(claimText: string): boolean {
	return /\b(owner reports?|user reports?|forum reports?|reviews?|experiential|experience reports?)\b/i.test(
		claimText,
	);
}

function claimDisclosesLimitations(claimText: string): boolean {
	return /\b(limited|limitation|limitations|may|might|consult|not (?:medical|legal|financial) advice|evidence varies|not definitive)\b/i.test(
		claimText,
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

	const allowedSourceIds = new Set(
		input.reviewedCitedSources.map((source) => source.id),
	);
	const supportedSourceIds = (
		review.citationSourceIds ?? input.claim.citationSourceIds
	).filter((sourceId) => allowedSourceIds.has(sourceId));
	const reason =
		review.reason.trim() || "Citation audit model reviewed the claim.";

	if (review.status === "supported" && supportedSourceIds.length > 0) {
		return { status: "supported", supportedSourceIds, reason };
	}
	if (
		review.status === "repaired" &&
		review.text?.trim() &&
		supportedSourceIds.length > 0
	) {
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
		.replace(/\[\d+(?:\s*,\s*\d+)*\]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function stripMarkdownCitationMarkers(value: string): string {
	return value.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, "").trim();
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

function uniqueValues<T>(values: T[]): T[] {
	return [...new Set(values)];
}

function parseStringArray(value: string): string[] {
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}

function chunkArray<T>(items: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		chunks.push(items.slice(index, index + size));
	}
	return chunks;
}
