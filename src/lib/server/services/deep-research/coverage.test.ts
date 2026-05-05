import { describe, expect, it } from "vitest";
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
});

function reviewedSource(input: {
	id: string;
	canonicalUrl: string;
	supportedKeyQuestions: string[];
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
	};
}
