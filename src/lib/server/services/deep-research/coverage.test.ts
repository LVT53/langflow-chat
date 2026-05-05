import { describe, expect, it } from "vitest";
import type { DeepResearchSourceQualitySignals } from "$lib/types";
import { assessResearchCoverage } from "./coverage";
import type { ResearchPlan } from "./planning";

const standardPlan: ResearchPlan = {
	goal: "Compare the current state of two document automation platforms.",
	depth: "standard",
	researchBudget: {
		sourceReviewCeiling: 40,
		synthesisPassCeiling: 2,
	},
	keyQuestions: [
		"What are the current capabilities?",
		"Where do the platforms differ?",
	],
	sourceScope: {
		includePublicWeb: true,
		planningContextDisclosure: null,
	},
	reportShape: ["Executive summary", "Findings", "Limitations"],
	constraints: [],
	deliverables: ["Cited Research Report"],
};

describe("assessResearchCoverage", () => {
	it("returns sufficient coverage when reviewed evidence supports every key question", () => {
		const assessment = assessResearchCoverage({
			jobId: "job-coverage",
			conversationId: "conversation-coverage",
			plan: standardPlan,
			reviewedSources: [
				reviewedSource({
					id: "source-1",
					canonicalUrl: "https://vendor-a.example/report",
					supportedKeyQuestions: [
						"What are the current capabilities?",
						"Where do the platforms differ?",
					],
				}),
				reviewedSource({
					id: "source-2",
					canonicalUrl: "https://analyst.example/comparison",
					supportedKeyQuestions: [
						"What are the current capabilities?",
						"Where do the platforms differ?",
					],
				}),
			],
			remainingBudget: {
				sourceReviews: 10,
				synthesisPasses: 1,
			},
		});

		expect(assessment.status).toBe("sufficient");
		expect(assessment.coverageGaps).toEqual([]);
		expect(assessment.reportLimitations).toEqual([]);
		expect(assessment.timelineSummary).toMatchObject({
			stage: "coverage_assessment",
			kind: "coverage_assessed",
			messageKey: "deepResearch.timeline.coverageSufficient",
		});
		expect(assessment.timelineSummary).not.toHaveProperty("privateReasoning");
	});

	it("returns Coverage Gaps and recommends continuation when key-question support is missing and budget remains", () => {
		const assessment = assessResearchCoverage({
			jobId: "job-gaps",
			conversationId: "conversation-gaps",
			plan: standardPlan,
			reviewedSources: [
				reviewedSource({
					id: "source-1",
					canonicalUrl: "https://vendor-a.example/report",
					supportedKeyQuestions: ["What are the current capabilities?"],
				}),
				reviewedSource({
					id: "source-2",
					canonicalUrl: "https://analyst.example/capabilities",
					supportedKeyQuestions: ["What are the current capabilities?"],
				}),
			],
			remainingBudget: {
				sourceReviews: 6,
				synthesisPasses: 1,
			},
		});

		expect(assessment.status).toBe("insufficient");
		expect(assessment.canContinue).toBe(true);
		expect(assessment.continuationRecommendation).toBe(
			"Continue source review against 1 Coverage Gap.",
		);
		expect(assessment.coverageGaps).toEqual([
			expect.objectContaining({
				keyQuestion: "Where do the platforms differ?",
				reason: "insufficient_reviewed_sources",
				reviewedSourceCount: 0,
				recommendedNextAction:
					"Review additional sources for: Where do the platforms differ?",
			}),
		]);
		expect(assessment.reportLimitations).toEqual([]);
	});

	it("does not count off-topic reviewed sources toward key-question coverage", () => {
		const assessment = assessResearchCoverage({
			jobId: "job-off-topic",
			conversationId: "conversation-off-topic",
			plan: standardPlan,
			reviewedSources: [
				reviewedSource({
					id: "volkswagen-prices",
					canonicalUrl: "https://cars.example/volkswagen-prices",
					supportedKeyQuestions: standardPlan.keyQuestions,
					topicRelevant: false,
				}),
				reviewedSource({
					id: "washing-machine-tests",
					canonicalUrl: "https://consumer.example/washing-machines",
					supportedKeyQuestions: standardPlan.keyQuestions,
					topicRelevant: false,
				}),
			],
			remainingBudget: {
				sourceReviews: 6,
				synthesisPasses: 1,
			},
		});

		expect(assessment.status).toBe("insufficient");
		expect(assessment.canContinue).toBe(true);
		expect(assessment.coverageGaps).toEqual([
			expect.objectContaining({
				keyQuestion: "What are the current capabilities?",
				reason: "insufficient_reviewed_sources",
				reviewedSourceCount: 0,
			}),
			expect.objectContaining({
				keyQuestion: "Where do the platforms differ?",
				reason: "insufficient_reviewed_sources",
				reviewedSourceCount: 0,
			}),
		]);
	});

	it("creates targeted comparison gaps when one compared entity lacks axis support", () => {
		const assessment = assessResearchCoverage({
			jobId: "job-comparison-gap",
			conversationId: "conversation-comparison-gap",
			plan: {
				...standardPlan,
				depth: "focused",
				reportIntent: "comparison",
				comparedEntities: ["GitHub Copilot", "Cursor"],
				comparisonAxes: ["privacy"],
				keyQuestions: ["How do the tools compare on privacy?"],
				researchBudget: {
					sourceReviewCeiling: 12,
					synthesisPassCeiling: 1,
				},
			},
			reviewedSources: [
				reviewedSource({
					id: "copilot-privacy",
					canonicalUrl: "https://vendor.example/copilot/privacy",
					supportedKeyQuestions: ["How do the tools compare on privacy?"],
					comparedEntity: "GitHub Copilot",
					comparisonAxis: "privacy",
				}),
			],
			remainingBudget: {
				sourceReviews: 4,
				synthesisPasses: 1,
			},
		});

		expect(assessment.status).toBe("insufficient");
		expect(assessment.canContinue).toBe(true);
		expect(assessment.coverageGaps).toEqual([
			expect.objectContaining({
				keyQuestion: "How do the tools compare on privacy?",
				comparedEntity: "Cursor",
				comparisonAxis: "privacy",
				reason: "insufficient_reviewed_sources",
				reviewedSourceCount: 0,
				recommendedNextAction:
					"Review topic-relevant sources for Cursor on privacy.",
			}),
		]);
		expect(assessment.continuationRecommendation).toBe(
			"Continue source review against 1 Coverage Gap.",
		);
	});

	it("does not pass downloaded-report coverage from high-count unrelated reviewed sources", () => {
		const unrelatedSources = Array.from({ length: 12 }, (_, index) =>
			reviewedSource({
				id: `unrelated-${index + 1}`,
				canonicalUrl: `https://unrelated-${index + 1}.example/report`,
				supportedKeyQuestions: standardPlan.keyQuestions,
				topicRelevant: false,
			}),
		);

		const assessment = assessResearchCoverage({
			jobId: "job-downloaded-report-regression",
			conversationId: "conversation-downloaded-report-regression",
			plan: standardPlan,
			reviewedSources: unrelatedSources,
			remainingBudget: {
				sourceReviews: 0,
				synthesisPasses: 0,
			},
		});

		expect(assessment.status).toBe("insufficient");
		expect(assessment.canContinue).toBe(false);
		expect(assessment.coverageGaps).toEqual([]);
		expect(assessment.reportLimitations).toEqual([
			expect.objectContaining({
				keyQuestion: "What are the current capabilities?",
				reviewedSourceCount: 0,
			}),
			expect.objectContaining({
				keyQuestion: "Where do the platforms differ?",
				reviewedSourceCount: 0,
			}),
		]);
		expect(assessment.timelineSummary).toMatchObject({
			messageKey: "deepResearch.timeline.coverageLimited",
			messageParams: {
				reviewedSources: 12,
				coverageGaps: 0,
				reportLimitations: 2,
			},
		});
	});

	it("returns Report Limitations instead of Coverage Gaps when budget is exhausted", () => {
		const assessment = assessResearchCoverage({
			jobId: "job-exhausted",
			conversationId: "conversation-exhausted",
			plan: standardPlan,
			reviewedSources: [
				reviewedSource({
					id: "source-1",
					canonicalUrl: "https://vendor-a.example/report",
					supportedKeyQuestions: ["What are the current capabilities?"],
				}),
				reviewedSource({
					id: "source-2",
					canonicalUrl: "https://analyst.example/capabilities",
					supportedKeyQuestions: ["What are the current capabilities?"],
				}),
			],
			remainingBudget: {
				sourceReviews: 0,
				synthesisPasses: 0,
			},
		});

		expect(assessment.status).toBe("insufficient");
		expect(assessment.canContinue).toBe(false);
		expect(assessment.continuationRecommendation).toBeNull();
		expect(assessment.coverageGaps).toEqual([]);
		expect(assessment.reportLimitations).toEqual([
			{
				keyQuestion: "Where do the platforms differ?",
				limitation:
					"Depth budget is exhausted before enough reviewed evidence could support this key question.",
				reviewedSourceCount: 0,
			},
		]);
		expect(assessment.timelineSummary).toMatchObject({
			messageKey: "deepResearch.timeline.coverageLimited",
			warnings: [
				"Depth budget exhausted; unresolved coverage gaps must be disclosed as report limitations.",
			],
		});
	});

	it("uses Source Quality Signals when assessing vendor evidence for independent reliability", () => {
		const assessment = assessResearchCoverage({
			jobId: "job-vendor-reliability",
			conversationId: "conversation-vendor-reliability",
			plan: {
				...standardPlan,
				keyQuestions: ["Is Model X independently reliable?"],
			},
			reviewedSources: [
				reviewedSource({
					id: "vendor-specs",
					canonicalUrl: "https://vendor.example.com/model-x/specs",
					supportedKeyQuestions: ["Is Model X independently reliable?"],
					qualityScore: 95,
					sourceQualitySignals: {
						sourceType: "official_vendor",
						independence: "affiliated",
						freshness: "undated",
						directness: "indirect",
						extractionConfidence: "medium",
						claimFit: "weak",
					},
				}),
				reviewedSource({
					id: "vendor-warranty",
					canonicalUrl: "https://vendor.example.com/model-x/warranty",
					supportedKeyQuestions: ["Is Model X independently reliable?"],
					qualityScore: 95,
					sourceQualitySignals: {
						sourceType: "official_vendor",
						independence: "affiliated",
						freshness: "undated",
						directness: "indirect",
						extractionConfidence: "medium",
						claimFit: "weak",
					},
				}),
			],
			remainingBudget: {
				sourceReviews: 4,
				synthesisPasses: 1,
			},
			signals: {
				minimumDistinctSourceDomains: 1,
				minimumAverageQualityScore: 60,
			},
		});

		expect(assessment.status).toBe("insufficient");
		expect(assessment.coverageGaps).toContainEqual(
			expect.objectContaining({
				keyQuestion: "Is Model X independently reliable?",
				reason: "low_source_quality",
				reviewedSourceCount: 2,
			}),
		);
	});

	it("treats reviewed-source counts as telemetry when supported Synthesis Claims are missing", () => {
		const assessment = assessResearchCoverage({
			jobId: "job-claim-readiness",
			conversationId: "conversation-claim-readiness",
			plan: standardPlan,
			reviewedSources: [
				reviewedSource({
					id: "source-1",
					canonicalUrl: "https://vendor-a.example/report",
					supportedKeyQuestions: standardPlan.keyQuestions,
				}),
				reviewedSource({
					id: "source-2",
					canonicalUrl: "https://analyst.example/comparison",
					supportedKeyQuestions: standardPlan.keyQuestions,
				}),
			],
			evidenceNotes: [
				{
					id: "note-capabilities",
					supportedKeyQuestion: "What are the current capabilities?",
					findingText: "Both platforms support automated document assembly.",
				},
				{
					id: "note-differences",
					supportedKeyQuestion: "Where do the platforms differ?",
					findingText: "Platform A has stronger workflow controls.",
				},
			],
			synthesisClaims: [
				{
					id: "claim-capabilities",
					planQuestion: "What are the current capabilities?",
					statement: "Both platforms support automated document assembly.",
					central: true,
					status: "accepted",
					evidenceLinks: [
						{
							evidenceNoteId: "note-capabilities",
							relation: "support",
							material: true,
						},
					],
				},
				{
					id: "claim-differences",
					planQuestion: "Where do the platforms differ?",
					statement: "Platform A has stronger workflow controls.",
					central: true,
					status: "needs-repair",
					statusReason: "Linked Evidence Notes do not support the claim.",
					evidenceLinks: [
						{
							evidenceNoteId: "note-differences",
							relation: "support",
							material: true,
						},
					],
				},
			],
			remainingBudget: {
				sourceReviews: 0,
				synthesisPasses: 1,
			},
		});

		expect(assessment.status).toBe("insufficient");
		expect(assessment.canContinue).toBe(true);
		expect(assessment.coverageGaps).toContainEqual(
			expect.objectContaining({
				keyQuestion: "Where do the platforms differ?",
				reason: "insufficient_supported_claims",
				reviewedSourceCount: 2,
				recommendedNextAction:
					"Repair or replace unsupported central Synthesis Claims for: Where do the platforms differ?",
				detail: expect.stringContaining("Claim Support Gate"),
			}),
		);
		expect(assessment.timelineSummary).toMatchObject({
			messageKey: "deepResearch.timeline.coverageInsufficient",
			messageParams: {
				reviewedSources: 2,
				coverageGaps: 1,
				reportLimitations: 0,
			},
		});
	});

	it("creates a Coverage Gap for unresolved material Claim Conflicts", () => {
		const assessment = assessResearchCoverage({
			jobId: "job-claim-conflict",
			conversationId: "conversation-claim-conflict",
			plan: {
				...standardPlan,
				keyQuestions: ["How did battery costs change in 2025?"],
			},
			reviewedSources: [
				reviewedSource({
					id: "source-costs-down",
					canonicalUrl: "https://analyst-a.example/battery-costs",
					supportedKeyQuestions: ["How did battery costs change in 2025?"],
				}),
				reviewedSource({
					id: "source-costs-up",
					canonicalUrl: "https://analyst-b.example/battery-costs",
					supportedKeyQuestions: ["How did battery costs change in 2025?"],
				}),
			],
			evidenceNotes: [
				{
					id: "note-costs-down",
					supportedKeyQuestion: "How did battery costs change in 2025?",
					findingText: "Battery costs decreased in 2025.",
				},
				{
					id: "note-costs-up",
					supportedKeyQuestion: "How did battery costs change in 2025?",
					findingText: "Battery costs increased in 2025.",
				},
			],
			synthesisClaims: [
				{
					id: "claim-costs-down",
					planQuestion: "How did battery costs change in 2025?",
					statement: "Battery costs decreased in 2025.",
					central: true,
					status: "accepted",
					competingClaimGroupId: "cost-direction-conflict",
					evidenceLinks: [
						{
							evidenceNoteId: "note-costs-down",
							relation: "support",
							material: true,
						},
					],
				},
				{
					id: "claim-costs-up",
					planQuestion: "How did battery costs change in 2025?",
					statement: "Battery costs increased in 2025.",
					central: true,
					status: "needs-repair",
					statusReason:
						"Material contradictory evidence competes with another Synthesis Claim.",
					competingClaimGroupId: "cost-direction-conflict",
					evidenceLinks: [
						{
							evidenceNoteId: "note-costs-up",
							relation: "support",
							material: true,
						},
					],
				},
			],
			remainingBudget: {
				sourceReviews: 0,
				synthesisPasses: 1,
			},
		});

		expect(assessment.status).toBe("insufficient");
		expect(assessment.coverageGaps).toContainEqual(
			expect.objectContaining({
				keyQuestion: "How did battery costs change in 2025?",
				reason: "unresolved_conflict",
				recommendedNextAction:
					"Resolve material Claim Conflicts for: How did battery costs change in 2025?",
				detail: expect.stringContaining("cost-direction-conflict"),
			}),
		);
	});

	it("does not block a report for unsupported Non-Central Claims when central claims are ready", () => {
		const assessment = assessResearchCoverage({
			jobId: "job-non-central-claims",
			conversationId: "conversation-non-central-claims",
			plan: {
				...standardPlan,
				keyQuestions: ["What are the current capabilities?"],
			},
			reviewedSources: [
				reviewedSource({
					id: "source-1",
					canonicalUrl: "https://vendor.example/capabilities",
					supportedKeyQuestions: ["What are the current capabilities?"],
				}),
				reviewedSource({
					id: "source-2",
					canonicalUrl: "https://analyst.example/capabilities",
					supportedKeyQuestions: ["What are the current capabilities?"],
				}),
			],
			evidenceNotes: [
				{
					id: "note-capabilities",
					supportedKeyQuestion: "What are the current capabilities?",
					findingText: "The platform supports document automation.",
				},
			],
			synthesisClaims: [
				{
					id: "claim-central",
					planQuestion: "What are the current capabilities?",
					statement: "The platform supports document automation.",
					central: true,
					status: "accepted",
					evidenceLinks: [
						{
							evidenceNoteId: "note-capabilities",
							relation: "support",
							material: true,
						},
					],
				},
				{
					id: "claim-side-note",
					planQuestion: "What are the current capabilities?",
					statement: "The platform also has the fastest onboarding.",
					central: false,
					status: "rejected",
					statusReason: "Linked Evidence Notes do not support the claim.",
					evidenceLinks: [],
				},
			],
			remainingBudget: {
				sourceReviews: 0,
				synthesisPasses: 0,
			},
		});

		expect(assessment.status).toBe("sufficient");
		expect(assessment.coverageGaps).toEqual([]);
		expect(assessment.reportLimitations).toEqual([]);
	});
});

function reviewedSource(input: {
	id: string;
	canonicalUrl: string;
	supportedKeyQuestions: string[];
	comparedEntity?: string | null;
	comparisonAxis?: string | null;
	topicRelevant?: boolean;
	qualityScore?: number;
	sourceQualitySignals?: DeepResearchSourceQualitySignals;
}) {
	return {
		id: input.id,
		canonicalUrl: input.canonicalUrl,
		title: input.id,
		reviewedAt: "2026-05-05T10:00:00.000Z",
		publishedAt: "2026-04-01",
		supportedKeyQuestions: input.supportedKeyQuestions,
		comparedEntity: input.comparedEntity,
		comparisonAxis: input.comparisonAxis,
		keyFindings: input.supportedKeyQuestions.map(
			(question) => `Finding for ${question}`,
		),
		qualityScore: input.qualityScore,
		sourceQualitySignals: input.sourceQualitySignals,
		topicRelevant: input.topicRelevant,
	};
}
