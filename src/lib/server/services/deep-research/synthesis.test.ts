import { describe, expect, it } from "vitest";
import { buildSynthesisNotes } from "./synthesis";

describe("Deep Research synthesis notes", () => {
	it("turns Reviewed Source notes into supported findings with citation metadata", async () => {
		const result = await buildSynthesisNotes({
			jobId: "job-1",
			reviewedSources: [
				{
					id: "reviewed-1",
					jobId: "job-1",
					discoveredSourceId: "source-1",
					canonicalUrl: "https://agency.gov.example/report",
					title: "Agency report",
					duplicateSourceIds: [],
					authorityScore: 80,
					qualityScore: 16,
					reviewScore: 96,
					summary:
						"Official data shows adoption increased across regulated providers.",
					keyFindings: [
						"Adoption increased across regulated providers in 2025.",
					],
					extractedText:
						"The agency report states adoption increased across regulated providers in 2025.",
					createdAt: "2026-05-05T12:00:00.000Z",
				},
			],
			completedTasks: [],
		});

		expect(result.jobId).toBe("job-1");
		expect(result.findings).toEqual([
			expect.objectContaining({
				kind: "supported",
				statement: "Adoption increased across regulated providers in 2025.",
				sourceRefs: [
					{
						reviewedSourceId: "reviewed-1",
						discoveredSourceId: "source-1",
						canonicalUrl: "https://agency.gov.example/report",
						title: "Agency report",
					},
				],
			}),
		]);
		expect(result.supportedFindings).toHaveLength(1);
		expect(result.conflicts).toHaveLength(0);
		expect(result.assumptions).toHaveLength(0);
		expect(result.reportLimitations).toHaveLength(0);
	});

	it("classifies supported report findings by claim type and centrality", async () => {
		const result = await buildSynthesisNotes({
			jobId: "job-claim-types",
			reviewedSources: [
				{
					id: "reviewed-specs",
					jobId: "job-claim-types",
					discoveredSourceId: "source-specs",
					canonicalUrl: "https://vendor.example.com/model-x/specs",
					title: "Model X official specifications",
					duplicateSourceIds: [],
					authorityScore: 80,
					qualityScore: 80,
					reviewScore: 160,
					summary: "Model X official specifications.",
					keyFindings: [
						"Model X officially includes 16 GB memory and 1 TB storage.",
					],
					extractedText:
						"Model X officially includes 16 GB memory and 1 TB storage.",
					createdAt: "2026-05-05T12:00:00.000Z",
				},
			],
			completedTasks: [],
		});

		expect(result.supportedFindings).toEqual([
			expect.objectContaining({
				statement: "Model X officially includes 16 GB memory and 1 TB storage.",
				central: true,
				claimType: "official_specification",
			}),
		]);
	});

	it("keeps conflicting Reviewed Source notes as a conflict finding", async () => {
		const result = await buildSynthesisNotes({
			jobId: "job-1",
			reviewedSources: [
				{
					id: "reviewed-costs-down",
					jobId: "job-1",
					discoveredSourceId: "source-costs-down",
					canonicalUrl: "https://agency.gov.example/costs",
					title: "Agency cost report",
					duplicateSourceIds: [],
					authorityScore: 80,
					qualityScore: 16,
					reviewScore: 96,
					summary: "Official data says battery costs decreased in 2025.",
					keyFindings: ["Battery costs decreased in 2025."],
					extractedText: "Battery costs decreased in 2025.",
					createdAt: "2026-05-05T12:00:00.000Z",
				},
				{
					id: "reviewed-costs-up",
					jobId: "job-1",
					discoveredSourceId: "source-costs-up",
					canonicalUrl: "https://market.example.test/costs",
					title: "Market cost tracker",
					duplicateSourceIds: [],
					authorityScore: 25,
					qualityScore: 8,
					reviewScore: 33,
					summary: "Market tracker says battery costs increased in 2025.",
					keyFindings: ["Battery costs increased in 2025."],
					extractedText: "Battery costs increased in 2025.",
					createdAt: "2026-05-05T12:01:00.000Z",
				},
			],
			completedTasks: [],
		});

		expect(result.conflicts).toEqual([
			expect.objectContaining({
				kind: "conflict",
				statement:
					"Reviewed Sources disagree: Battery costs decreased in 2025. / Battery costs increased in 2025.",
				sourceRefs: [
					expect.objectContaining({
						reviewedSourceId: "reviewed-costs-down",
					}),
					expect.objectContaining({
						reviewedSourceId: "reviewed-costs-up",
					}),
				],
			}),
		]);
		expect(
			result.supportedFindings.map((finding) => finding.statement),
		).toEqual([]);
		expect(result.findings.map((finding) => finding.kind)).toEqual([
			"conflict",
		]);
	});

	it("turns weak or missing Research Task support into assumptions and report limitation candidates", async () => {
		const result = await buildSynthesisNotes({
			jobId: "job-1",
			reviewedSources: [],
			completedTasks: [
				{
					id: "task-weak-pricing",
					output:
						"Vendor-reported pricing appears representative of the broader market.",
					supportLevel: "weak",
					sourceRefs: [],
					limitation:
						"No primary vendor pricing dataset was available within the Research Budget.",
				},
			],
		});

		expect(result.supportedFindings).toHaveLength(0);
		expect(result.assumptions).toEqual([
			{
				kind: "assumption",
				statement:
					"Vendor-reported pricing appears representative of the broader market.",
				sourceRefs: [],
			},
		]);
		expect(result.reportLimitations).toEqual([
			{
				kind: "report_limitation",
				statement:
					"No primary vendor pricing dataset was available within the Research Budget.",
				sourceRefs: [],
			},
		]);
		expect(result.findings.map((finding) => finding.kind)).toEqual([
			"assumption",
			"report_limitation",
		]);
	});

	it("prioritizes synthesized task findings before raw reviewed source notes", async () => {
		const sourceRef = {
			reviewedSourceId: "reviewed-1",
			discoveredSourceId: "source-1",
			canonicalUrl: "https://agency.gov.example/report",
			title: "Agency report",
		};
		const result = await buildSynthesisNotes({
			jobId: "job-1",
			reviewedSources: [
				{
					id: "reviewed-1",
					jobId: "job-1",
					discoveredSourceId: "source-1",
					canonicalUrl: "https://agency.gov.example/report",
					title: "Agency report",
					duplicateSourceIds: [],
					authorityScore: 80,
					qualityScore: 16,
					reviewScore: 96,
					summary: "Raw source note.",
					keyFindings: ["Raw source-level finding."],
					extractedText: "Raw source note.",
					createdAt: "2026-05-05T12:00:00.000Z",
				},
			],
			completedTasks: [
				{
					id: "task-answer",
					output: "Task-level synthesis answers the research question.",
					supportLevel: "strong",
					sourceRefs: [sourceRef],
				},
			],
		});

		expect(
			result.supportedFindings.map((finding) => finding.statement),
		).toEqual([
			"Task-level synthesis answers the research question.",
			"Raw source-level finding.",
		]);
	});

	it("does not let off-topic reviewed sources become accepted findings or task support", async () => {
		const sourceRef = {
			reviewedSourceId: "reviewed-off-topic",
			discoveredSourceId: "source-off-topic",
			canonicalUrl: "https://cars.example.test/volkswagen-ev-prices",
			title: "Volkswagen EV prices",
		};
		const result = await buildSynthesisNotes({
			jobId: "job-cube",
			reviewedSources: [
				{
					id: "reviewed-off-topic",
					jobId: "job-cube",
					discoveredSourceId: "source-off-topic",
					canonicalUrl: "https://cars.example.test/volkswagen-ev-prices",
					title: "Volkswagen EV prices",
					duplicateSourceIds: [],
					authorityScore: 80,
					qualityScore: 80,
					reviewScore: 160,
					summary: "Volkswagen EV prices dropped in Hungary.",
					keyFindings: ["Volkswagen EV prices dropped in Hungary."],
					extractedText: "Volkswagen EV prices dropped in Hungary.",
					relevanceScore: 95,
					topicRelevant: false,
					topicRelevanceReason:
						"Source discusses Volkswagen EV prices, not Cube bicycles.",
					supportedKeyQuestions: [
						"How do Cube Kathmandu and Cube Nulane specifications differ?",
					],
					extractedClaims: [
						"Volkswagen EV prices dropped in Hungary.",
					],
					rejectedReason: null,
					openedContentLength: 740,
					createdAt: "2026-05-05T12:00:00.000Z",
				},
			],
			completedTasks: [
				{
					id: "task-off-topic",
					output: "Cube buyers should choose based on Volkswagen EV discounts.",
					supportLevel: "strong",
					sourceRefs: [sourceRef],
				},
			],
		});

		expect(result.supportedFindings).toEqual([]);
		expect(result.findings).toEqual([
			{
				kind: "assumption",
				statement:
					"Cube buyers should choose based on Volkswagen EV discounts.",
				sourceRefs: [],
			},
		]);
	});
});
