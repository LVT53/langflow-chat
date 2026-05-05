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
});

function reviewedSource(input: {
	id: string;
	canonicalUrl: string;
	supportedKeyQuestions: string[];
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
		keyFindings: input.supportedKeyQuestions.map(
			(question) => `Finding for ${question}`,
		),
		qualityScore: input.qualityScore,
		sourceQualitySignals: input.sourceQualitySignals,
		topicRelevant: input.topicRelevant,
	};
}
