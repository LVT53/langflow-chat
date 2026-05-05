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
});
