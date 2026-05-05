import { describe, expect, it } from "vitest";
import { auditDeepResearchReportCitations } from "./citation-audit";

describe("Deep Research citation audit", () => {
	it("passes a report with claims supported by reviewed cited sources", async () => {
		const result = await auditDeepResearchReportCitations({
			jobId: "job-1",
			report: {
				title: "Adoption report",
				sections: [
					{
						heading: "Findings",
						claims: [
							{
								id: "claim-1",
								text: "Adoption increased across regulated providers in 2025.",
								core: true,
								citationSourceIds: ["source-1"],
							},
						],
					},
				],
				limitations: [],
			},
			citedSources: [
				{
					id: "source-1",
					status: "cited",
					title: "Agency report",
					url: "https://agency.gov.example/report",
					reviewedAt: "2026-05-05T12:00:00.000Z",
					citedAt: "2026-05-05T12:10:00.000Z",
					reviewedNote:
						"The agency report states adoption increased across regulated providers in 2025.",
				},
			],
		});

		expect(result.status).toBe("passed");
		expect(result.canComplete).toBe(true);
		expect(result.auditedReport.sections[0].claims).toEqual([
			expect.objectContaining({
				id: "claim-1",
				text: "Adoption increased across regulated providers in 2025.",
			}),
		]);
		expect(result.limitations).toEqual([]);
		expect(result.findings).toEqual([
			expect.objectContaining({
				claimId: "claim-1",
				status: "supported",
				sourceIds: ["source-1"],
			}),
		]);
	});

	it("turns claims that cite discovered-only sources into visible limitations", async () => {
		const result = await auditDeepResearchReportCitations({
			jobId: "job-1",
			report: {
				title: "Adoption report",
				sections: [
					{
						heading: "Findings",
						claims: [
							{
								id: "claim-supported",
								text: "Adoption increased across regulated providers in 2025.",
								core: true,
								citationSourceIds: ["source-reviewed"],
							},
							{
								id: "claim-discovered-only",
								text: "Adoption doubled in unregulated providers in 2025.",
								core: true,
								citationSourceIds: ["source-discovered"],
							},
						],
					},
				],
				limitations: [],
			},
			citedSources: [
				{
					id: "source-reviewed",
					status: "cited",
					title: "Agency report",
					url: "https://agency.gov.example/report",
					reviewedAt: "2026-05-05T12:00:00.000Z",
					citedAt: "2026-05-05T12:10:00.000Z",
					reviewedNote:
						"The agency report states adoption increased across regulated providers in 2025.",
				},
				{
					id: "source-discovered",
					status: "discovered",
					title: "Unreviewed search result",
					url: "https://blog.example.test/adoption",
					reviewedAt: null,
					citedAt: null,
					snippet: "Adoption doubled in unregulated providers in 2025.",
				},
			],
		});

		expect(result.status).toBe("completed_with_limitations");
		expect(result.canComplete).toBe(true);
		expect(
			result.auditedReport.sections[0].claims.map((claim) => claim.id),
		).toEqual(["claim-supported"]);
		expect(result.limitations).toContain(
			"Removed claim because it cited sources that were not both reviewed and cited: Adoption doubled in unregulated providers in 2025.",
		);
		expect(result.findings).toContainEqual(
			expect.objectContaining({
				claimId: "claim-discovered-only",
				status: "unsupported_source",
				sourceIds: ["source-discovered"],
			}),
		);
	});

	it("removes unsupported core claims and completes with limitations when useful support remains", async () => {
		const result = await auditDeepResearchReportCitations({
			jobId: "job-1",
			report: {
				title: "Market report",
				sections: [
					{
						heading: "Findings",
						claims: [
							{
								id: "claim-supported",
								text: "Battery costs decreased in 2025.",
								core: true,
								citationSourceIds: ["source-costs"],
							},
							{
								id: "claim-unsupported-core",
								text: "Battery recycling eliminated all supply risk in 2025.",
								core: true,
								citationSourceIds: ["source-costs"],
							},
						],
					},
				],
				limitations: [],
			},
			citedSources: [
				{
					id: "source-costs",
					status: "cited",
					title: "Cost tracker",
					url: "https://market.example.test/costs",
					reviewedAt: "2026-05-05T12:00:00.000Z",
					citedAt: "2026-05-05T12:10:00.000Z",
					reviewedNote:
						"Battery costs decreased in 2025, while supply risk remained a separate open issue.",
				},
			],
		});

		expect(result.status).toBe("completed_with_limitations");
		expect(result.canComplete).toBe(true);
		expect(
			result.auditedReport.sections[0].claims.map((claim) => claim.id),
		).toEqual(["claim-supported"]);
		expect(result.limitations).toContain(
			"Removed unsupported core claim after citation audit: Battery recycling eliminated all supply risk in 2025.",
		);
		expect(result.findings).toContainEqual(
			expect.objectContaining({
				claimId: "claim-unsupported-core",
				status: "unsupported_claim",
				sourceIds: ["source-costs"],
			}),
		);
	});

	it("accepts a repaired claim when the repair pass makes it source-supported", async () => {
		const result = await auditDeepResearchReportCitations({
			jobId: "job-1",
			report: {
				title: "Market report",
				sections: [
					{
						heading: "Findings",
						claims: [
							{
								id: "claim-repaired",
								text: "Battery recycling eliminated all supply risk in 2025.",
								core: true,
								citationSourceIds: ["source-risk"],
							},
						],
					},
				],
				limitations: [],
			},
			citedSources: [
				{
					id: "source-risk",
					status: "cited",
					title: "Risk tracker",
					url: "https://market.example.test/risk",
					reviewedAt: "2026-05-05T12:00:00.000Z",
					citedAt: "2026-05-05T12:10:00.000Z",
					reviewedNote:
						"Battery recycling reduced supply risk in 2025, but did not eliminate all risk.",
				},
			],
			repairUnsupportedClaim: async () => ({
				text: "Battery recycling reduced supply risk in 2025.",
				citationSourceIds: ["source-risk"],
			}),
		});

		expect(result.status).toBe("completed_with_limitations");
		expect(result.canComplete).toBe(true);
		expect(result.auditedReport.sections[0].claims).toEqual([
			expect.objectContaining({
				id: "claim-repaired",
				text: "Battery recycling reduced supply risk in 2025.",
			}),
		]);
		expect(result.limitations).toContain(
			"Repaired unsupported core claim during citation audit: Battery recycling eliminated all supply risk in 2025.",
		);
		expect(result.findings).toContainEqual(
			expect.objectContaining({
				claimId: "claim-repaired",
				status: "repaired",
				sourceIds: ["source-risk"],
			}),
		);
	});
});
