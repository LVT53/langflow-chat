import { describe, expect, it } from "vitest";
import type { ResearchPlan } from "./planning";
import { writeResearchReport } from "./report-writer";
import type { SynthesisNotes } from "./synthesis";

const basePlan: ResearchPlan = {
	goal: "Compare private AI coding assistants for a small engineering team.",
	depth: "standard",
	researchBudget: {
		sourceReviewCeiling: 40,
		synthesisPassCeiling: 2,
	},
	keyQuestions: [
		"Which products have the strongest repository-aware coding workflow?",
		"Which pricing and compliance differences matter for a small team?",
	],
	sourceScope: {
		includePublicWeb: true,
		planningContextDisclosure: null,
	},
	reportShape: [
		"Executive summary",
		"Key findings",
		"Main comparison",
		"Source list",
		"Limitations",
	],
	constraints: ["Prefer primary vendor and documentation sources."],
	deliverables: ["Cited Research Report"],
};

const baseSynthesisNotes: SynthesisNotes = {
	jobId: "job-1",
	findings: [
		{
			kind: "supported",
			statement:
				"Repository-aware coding assistants differ most on index freshness and permission controls.",
			sourceRefs: [
				{
					reviewedSourceId: "reviewed-1",
					discoveredSourceId: "source-1",
					canonicalUrl: "https://docs.example.com/ai-coding/security",
					title: "AI coding security documentation",
				},
			],
		},
	],
	supportedFindings: [
		{
			kind: "supported",
			statement:
				"Repository-aware coding assistants differ most on index freshness and permission controls.",
			sourceRefs: [
				{
					reviewedSourceId: "reviewed-1",
					discoveredSourceId: "source-1",
					canonicalUrl: "https://docs.example.com/ai-coding/security",
					title: "AI coding security documentation",
				},
			],
		},
	],
	conflicts: [],
	assumptions: [],
	reportLimitations: [],
};

describe("Deep Research report writer", () => {
	it("writes a durable markdown report from supported synthesis notes with citations and source list", () => {
		const report = writeResearchReport({
			jobId: "job-1",
			plan: basePlan,
			synthesisNotes: baseSynthesisNotes,
			sources: [
				{
					id: "source-1",
					reviewedSourceId: "reviewed-1",
					status: "cited",
					title: "AI coding security documentation",
					url: "https://docs.example.com/ai-coding/security",
				},
			],
		});

		expect(report.title).toBe(
			"Research Report: Compare private AI coding assistants for a small engineering team.",
		);
		expect(report.markdown).toContain(`# ${report.title}`);
		expect(report.markdown).toContain("## Executive Summary");
		expect(report.markdown).toContain("## Key Findings");
		expect(report.markdown).toContain("## Main Body");
		expect(report.markdown).toContain(
			"- Repository-aware coding assistants differ most on index freshness and permission controls. [1]",
		);
		expect(report.markdown).toContain("## Sources");
		expect(report.markdown).toContain(
			"[1] AI coding security documentation - https://docs.example.com/ai-coding/security",
		);
		expect(report.sources).toEqual([
			expect.objectContaining({
				id: "source-1",
				citationNumber: 1,
				status: "cited",
			}),
		]);
	});

	it("honors plan-specific sections such as methodology, comparison, and recommendations", () => {
		const report = writeResearchReport({
			jobId: "job-1",
			plan: {
				...basePlan,
				reportShape: [
					"Executive summary",
					"Methodology",
					"Comparison",
					"Recommendations",
					"Source list",
				],
			},
			synthesisNotes: baseSynthesisNotes,
			sources: [
				{
					id: "source-1",
					reviewedSourceId: "reviewed-1",
					status: "cited",
					title: "AI coding security documentation",
					url: "https://docs.example.com/ai-coding/security",
				},
			],
		});

		expect(report.sections.map((section) => section.heading)).toEqual([
			"Methodology",
			"Comparison",
			"Recommendations",
		]);
		expect(report.markdown).toContain("## Methodology");
		expect(report.markdown).toContain(
			"Review scope followed the approved Standard Deep Research plan.",
		);
		expect(report.markdown).toContain("## Comparison");
		expect(report.markdown).toContain(
			"Repository-aware coding assistants differ most on index freshness and permission controls. [1]",
		);
		expect(report.markdown).toContain("## Recommendations");
		expect(report.markdown).toContain(
			"Use the supported findings above to choose next actions.",
		);
	});

	it("preserves Report Limitations visibly", () => {
		const report = writeResearchReport({
			jobId: "job-1",
			plan: basePlan,
			synthesisNotes: {
				...baseSynthesisNotes,
				reportLimitations: [
					{
						kind: "report_limitation",
						statement:
							"No primary vendor pricing dataset was available within the Research Budget.",
						sourceRefs: [],
					},
				],
			},
			sources: [
				{
					id: "source-1",
					reviewedSourceId: "reviewed-1",
					status: "cited",
					title: "AI coding security documentation",
					url: "https://docs.example.com/ai-coding/security",
				},
			],
			limitations: [
				"Coverage for Hungarian-language procurement references remained incomplete.",
			],
		});

		expect(report.limitations).toEqual([
			"No primary vendor pricing dataset was available within the Research Budget.",
			"Coverage for Hungarian-language procurement references remained incomplete.",
		]);
		expect(report.markdown).toContain("## Report Limitations");
		expect(report.markdown).toContain(
			"- No primary vendor pricing dataset was available within the Research Budget.",
		);
		expect(report.markdown).toContain(
			"- Coverage for Hungarian-language procurement references remained incomplete.",
		);
	});
});
