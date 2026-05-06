import { describe, expect, it } from "vitest";
import type {
	DeepResearchEvidenceNote,
	DeepResearchSourceQualitySignals,
	DeepResearchSynthesisClaim,
} from "$lib/types";
import {
	auditDeepResearchClaimGraph,
	auditDeepResearchReportCitations,
} from "./citation-audit";

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

	it("accepts source-supported paraphrases without requiring exact wording", async () => {
		const result = await auditDeepResearchReportCitations({
			jobId: "job-1",
			report: {
				title: "Training data report",
				sections: [
					{
						heading: "Findings",
						claims: [
							{
								id: "claim-1",
								text: "AI copyright rules require training-data provenance and risk review.",
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
					title: "Agency briefing",
					url: "https://agency.gov.example/ai-copyright",
					reviewedAt: "2026-05-05T12:00:00.000Z",
					citedAt: "2026-05-05T12:10:00.000Z",
					reviewedNote:
						"EU and US AI copyright training data rules require provenance records and rights-risk review.",
					extractedClaims: [
						"AI copyright training data rules require provenance records and rights-risk review.",
					],
				},
			],
		});

		expect(result.status).toBe("passed");
		expect(result.canComplete).toBe(true);
		expect(result.auditedReport.sections[0].claims).toHaveLength(1);
	});

	it("uses an audit reviewer to support source-grounded claims before fallback checks", async () => {
		const result = await auditDeepResearchReportCitations({
			jobId: "job-1",
			report: {
				title: "Market report",
				sections: [
					{
						heading: "Findings",
						claims: [
							{
								id: "claim-llm-supported",
								text: "Specialized vendors gained adoption among regulated buyers.",
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
					title: "Vendor adoption briefing",
					url: "https://market.example.test/vendors",
					reviewedAt: "2026-05-05T12:00:00.000Z",
					citedAt: "2026-05-05T12:10:00.000Z",
					reviewedNote:
						"Enterprise procurement teams expanded pilots with domain-specific vendors.",
				},
			],
			reviewClaimSupport: async () => ({
				status: "supported",
				reason: "The model judged the claim as a supported paraphrase.",
				citationSourceIds: ["source-1"],
			}),
		});

		expect(result.status).toBe("passed");
		expect(result.findings).toContainEqual(
			expect.objectContaining({
				claimId: "claim-llm-supported",
				status: "supported",
				reason: "The model judged the claim as a supported paraphrase.",
			}),
		);
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

	it("rejects vendor-page support for independent reliability claims when signals are weak", async () => {
		const result = await auditDeepResearchReportCitations({
			jobId: "job-vendor-reliability",
			report: {
				title: "Model X report",
				sections: [
					{
						heading: "Findings",
						claims: [
							{
								id: "claim-specs",
								text: "Model X includes 16 GB memory and 1 TB storage.",
								core: true,
								citationSourceIds: ["vendor-specs"],
							},
							{
								id: "claim-reliability",
								text: "Model X is independently reliable over long-term use.",
								core: true,
								citationSourceIds: ["vendor-specs"],
							},
						],
					},
				],
				limitations: [],
			},
			citedSources: [
				{
					id: "vendor-specs",
					status: "cited",
					title: "Vendor Model X official specifications",
					url: "https://vendor.example.com/products/model-x/specs",
					reviewedAt: "2026-05-05T12:00:00.000Z",
					citedAt: "2026-05-05T12:10:00.000Z",
					reviewedNote:
						"Model X includes 16 GB memory and 1 TB storage. Vendor claims Model X is reliable over long-term use.",
					extractedClaims: [
						"Model X includes 16 GB memory and 1 TB storage.",
						"Vendor claims Model X is reliable over long-term use.",
					],
					sourceQualitySignals: {
						sourceType: "official_vendor",
						independence: "affiliated",
						freshness: "undated",
						directness: "indirect",
						extractionConfidence: "medium",
						claimFit: "weak",
					},
				},
			],
		});

		expect(result.status).toBe("completed_with_limitations");
		expect(result.auditedReport.sections[0].claims.map((claim) => claim.id)).toEqual([
			"claim-specs",
		]);
		expect(result.findings).toContainEqual(
			expect.objectContaining({
				claimId: "claim-reliability",
				status: "unsupported_claim",
				sourceIds: ["vendor-specs"],
				reason:
					"Claim cited reviewed sources, but Source Quality Signals did not fit the claim.",
			}),
		);
	});

	it("rejects forum support for a central official specification claim", async () => {
		const result = await auditDeepResearchReportCitations({
			jobId: "job-forum-specs",
			report: {
				title: "Model X report",
				sections: [
					{
						heading: "Findings",
						claims: [
							{
								id: "claim-official-spec",
								text: "Model X officially includes 16 GB memory and 1 TB storage.",
								core: true,
								citationSourceIds: ["forum-post"],
							},
						],
					},
				],
				limitations: [],
			},
			citedSources: [
				{
					id: "forum-post",
					status: "cited",
					title: "Owner forum thread",
					url: "https://forum.example.test/model-x-specs",
					reviewedAt: "2026-05-05T12:00:00.000Z",
					citedAt: "2026-05-05T12:10:00.000Z",
					reviewedNote:
						"Model X officially includes 16 GB memory and 1 TB storage.",
					extractedClaims: [
						"Model X officially includes 16 GB memory and 1 TB storage.",
					],
					sourceQualitySignals: {
						sourceType: "forum",
						independence: "community",
						freshness: "recent",
						directness: "anecdotal",
						extractionConfidence: "medium",
						claimFit: "partial",
					},
				},
			],
		});

		expect(result.status).toBe("failed");
		expect(result.canComplete).toBe(false);
		expect(result.auditedReport.sections[0].claims).toEqual([]);
		expect(result.findings).toContainEqual(
			expect.objectContaining({
				claimId: "claim-official-spec",
				status: "unsupported_claim",
				sourceIds: ["forum-post"],
				reason:
					"Claim cited reviewed sources, but Source Quality Signals did not fit the claim.",
			}),
		);
	});

	it("rejects central price claims without fresh dated evidence and timing disclosure", async () => {
		const result = await auditDeepResearchReportCitations({
			jobId: "job-price",
			report: {
				title: "Model X price report",
				sections: [
					{
						heading: "Findings",
						claims: [
							{
								id: "claim-price",
								text: "Model X costs $999.",
								core: true,
								citationSourceIds: ["market-price"],
							},
						],
					},
				],
				limitations: [],
			},
			citedSources: [
				{
					id: "market-price",
					status: "cited",
					title: "Retail listing",
					url: "https://retailer.example.test/model-x",
					reviewedAt: "2026-05-05T12:00:00.000Z",
					citedAt: "2026-05-05T12:10:00.000Z",
					reviewedNote: "Model X costs $999.",
					extractedClaims: ["Model X costs $999."],
					sourceQualitySignals: {
						sourceType: "independent_analysis",
						independence: "independent",
						freshness: "stale",
						directness: "direct",
						extractionConfidence: "high",
						claimFit: "strong",
					},
				},
			],
		});

		expect(result.status).toBe("failed");
		expect(result.findings).toContainEqual(
			expect.objectContaining({
				claimId: "claim-price",
				status: "unsupported_claim",
				sourceIds: ["market-price"],
				reason:
					"Claim cited reviewed sources, but Source Quality Signals did not fit the claim.",
			}),
		);
	});

	it("allows forum evidence for reliability claims when labeled as experiential owner reports", async () => {
		const result = await auditDeepResearchReportCitations({
			jobId: "job-owner-reliability",
			report: {
				title: "Model X owner report",
				sections: [
					{
						heading: "Findings",
						claims: [
							{
								id: "claim-owner-reports",
								text: "Owner reports describe Model X as reliable over long-term use.",
								core: true,
								citationSourceIds: ["owner-thread"],
							},
						],
					},
				],
				limitations: [],
			},
			citedSources: [
				{
					id: "owner-thread",
					status: "cited",
					title: "Owner reliability thread",
					url: "https://forum.example.test/model-x-reliability",
					reviewedAt: "2026-05-05T12:00:00.000Z",
					citedAt: "2026-05-05T12:10:00.000Z",
					reviewedNote:
						"Owner reports describe Model X as reliable over long-term use.",
					extractedClaims: [
						"Owner reports describe Model X as reliable over long-term use.",
					],
					sourceQualitySignals: {
						sourceType: "forum",
						independence: "community",
						freshness: "recent",
						directness: "anecdotal",
						extractionConfidence: "medium",
						claimFit: "partial",
					},
				},
			],
		});

		expect(result.status).toBe("passed");
		expect(result.auditedReport.sections[0].claims).toEqual([
			expect.objectContaining({
				id: "claim-owner-reports",
			}),
		]);
	});

	it("rejects central high-stakes claims without explicit limitations", async () => {
		const result = await auditDeepResearchReportCitations({
			jobId: "job-high-stakes",
			report: {
				title: "Treatment report",
				sections: [
					{
						heading: "Findings",
						claims: [
							{
								id: "claim-treatment",
								text: "Clinical treatment Alpha reduces migraine symptoms.",
								core: true,
								citationSourceIds: ["clinical-guidance"],
							},
						],
					},
				],
				limitations: [],
			},
			citedSources: [
				{
					id: "clinical-guidance",
					status: "cited",
					title: "Clinical guidance",
					url: "https://health.gov.example/migraine",
					reviewedAt: "2026-05-05T12:00:00.000Z",
					citedAt: "2026-05-05T12:10:00.000Z",
					reviewedNote:
						"Clinical treatment Alpha reduces migraine symptoms.",
					extractedClaims: [
						"Clinical treatment Alpha reduces migraine symptoms.",
					],
					sourceQualitySignals: {
						sourceType: "official_government",
						independence: "primary",
						freshness: "recent",
						directness: "direct",
						extractionConfidence: "high",
						claimFit: "strong",
					},
				},
			],
		});

		expect(result.status).toBe("failed");
		expect(result.findings).toContainEqual(
			expect.objectContaining({
				claimId: "claim-treatment",
				status: "unsupported_claim",
				sourceIds: ["clinical-guidance"],
				reason:
					"Claim cited reviewed sources, but Source Quality Signals did not fit the claim.",
			}),
		);
	});

	it("accepts strong direct undated price evidence when the synthesis claim discloses timing", async () => {
		const result = await auditDeepResearchClaimGraph({
			jobId: "job-current-price",
			claims: [
				buildSynthesisClaim({
					id: "claim-current-price",
					statement: "As of 2026, Model X costs $999.",
					claimType: "price_availability",
					evidenceNoteId: "note-current-price",
				}),
			],
			evidenceNotes: [
				buildEvidenceNote({
					id: "note-current-price",
					findingText: "As of 2026, Model X costs $999.",
					sourceQualitySignals: {
						sourceType: "vendor_marketing",
						independence: "affiliated",
						freshness: "undated",
						directness: "direct",
						extractionConfidence: "high",
						claimFit: "strong",
					},
				}),
			],
		});

		expect(result.canRenderMarkdown).toBe(true);
		expect(result.verdicts).toEqual([
			expect.objectContaining({
				claimId: "claim-current-price",
				verdict: "supported",
				evidenceNoteIds: ["note-current-price"],
			}),
		]);
	});

	it("accepts strong direct official specification evidence when source type inference is unknown", async () => {
		const result = await auditDeepResearchClaimGraph({
			jobId: "job-unknown-source-spec",
			claims: [
				buildSynthesisClaim({
					id: "claim-official-memory",
					statement: "Model X officially includes 16 GB memory.",
					claimType: "official_specification",
					evidenceNoteId: "note-official-memory",
				}),
			],
			evidenceNotes: [
				buildEvidenceNote({
					id: "note-official-memory",
					findingText: "Model X officially includes 16 GB memory.",
					sourceQualitySignals: {
						sourceType: "unknown",
						independence: "unknown",
						freshness: "undated",
						directness: "direct",
						extractionConfidence: "high",
						claimFit: "strong",
					},
				}),
			],
		});

		expect(result.canRenderMarkdown).toBe(true);
		expect(result.verdicts).toEqual([
			expect.objectContaining({
				claimId: "claim-official-memory",
				verdict: "supported",
				evidenceNoteIds: ["note-official-memory"],
			}),
		]);
	});

	it("uses claim-graph LLM verdicts as the normal authority for quality-fit judgment", async () => {
		const result = await auditDeepResearchClaimGraph({
			jobId: "job-llm-quality-fit",
			claims: [
				buildSynthesisClaim({
					id: "claim-llm-quality-fit",
					statement: "Model X officially includes 16 GB memory.",
					claimType: "official_specification",
					evidenceNoteId: "note-llm-quality-fit",
				}),
			],
			evidenceNotes: [
				buildEvidenceNote({
					id: "note-llm-quality-fit",
					findingText: "Model X officially includes 16 GB memory.",
					sourceQualitySignals: {
						sourceType: "forum",
						independence: "community",
						freshness: "undated",
						directness: "anecdotal",
						extractionConfidence: "low",
						claimFit: "weak",
					},
				}),
			],
			reviewClaim: () => ({
				claimId: "claim-llm-quality-fit",
				verdict: "supported",
				evidenceNoteIds: ["note-llm-quality-fit"],
				reason:
					"The configured citation-audit model judged the linked note as sufficient.",
			}),
		});

		expect(result.canRenderMarkdown).toBe(true);
		expect(result.verdicts).toEqual([
			expect.objectContaining({
				claimId: "claim-llm-quality-fit",
				verdict: "supported",
				evidenceNoteIds: ["note-llm-quality-fit"],
				reason:
					"The configured citation-audit model judged the linked note as sufficient.",
			}),
		]);
	});

	it("uses claim-graph LLM repair verdicts to request repair", async () => {
		const result = await auditDeepResearchClaimGraph({
			jobId: "job-llm-repair",
			claims: [
				buildSynthesisClaim({
					id: "claim-llm-repair",
					statement: "Model X officially includes 16 GB memory.",
					claimType: "official_specification",
					evidenceNoteId: "note-llm-repair",
				}),
			],
			evidenceNotes: [
				buildEvidenceNote({
					id: "note-llm-repair",
					findingText: "Model X officially includes 16 GB memory.",
					sourceQualitySignals: {
						sourceType: "official_vendor",
						independence: "primary",
						freshness: "current",
						directness: "direct",
						extractionConfidence: "high",
						claimFit: "strong",
					},
				}),
			],
			reviewClaim: () => ({
				claimId: "claim-llm-repair",
				verdict: "needs_repair",
				evidenceNoteIds: ["note-llm-repair"],
				reason: "The citation-audit model requested narrower wording.",
			}),
		});

		expect(result.status).toBe("needs_repair");
		expect(result.canRenderMarkdown).toBe(false);
		expect(result.verdicts).toEqual([
			expect.objectContaining({
				claimId: "claim-llm-repair",
				verdict: "needs_repair",
				reason: "The citation-audit model requested narrower wording.",
			}),
		]);
	});

	it("maps claim-graph LLM source IDs back to linked Evidence Notes", async () => {
		const result = await auditDeepResearchClaimGraph({
			jobId: "job-llm-source-id-evidence",
			claims: [
				buildSynthesisClaim({
					id: "claim-llm-source-id-evidence",
					statement: "Model X officially includes 16 GB memory.",
					claimType: "official_specification",
					evidenceNoteId: "note-linked",
				}),
			],
			evidenceNotes: [
				buildEvidenceNote({
					id: "note-linked",
					findingText: "Model X officially includes 16 GB memory.",
					sourceQualitySignals: {
						sourceType: "official_vendor",
						independence: "primary",
						freshness: "current",
						directness: "direct",
						extractionConfidence: "high",
						claimFit: "strong",
					},
				}),
			],
			reviewClaim: () => ({
				claimId: "claim-llm-source-id-evidence",
				verdict: "supported",
				evidenceNoteIds: ["source-1"],
				reason: "The model cited the source id for the linked note.",
			}),
		});

		expect(result.canRenderMarkdown).toBe(true);
		expect(result.verdicts).toEqual([
			expect.objectContaining({
				claimId: "claim-llm-source-id-evidence",
				verdict: "supported",
				evidenceNoteIds: ["note-linked"],
			}),
		]);
	});

	it("falls back when claim-graph LLM verdicts cite unknown evidence ids", async () => {
		const result = await auditDeepResearchClaimGraph({
			jobId: "job-llm-unknown-evidence",
			claims: [
				buildSynthesisClaim({
					id: "claim-llm-unknown-evidence",
					statement: "Model X officially includes 16 GB memory.",
					claimType: "official_specification",
					evidenceNoteId: "note-linked",
				}),
			],
			evidenceNotes: [
				buildEvidenceNote({
					id: "note-linked",
					findingText: "Model X officially includes 16 GB memory.",
					sourceQualitySignals: {
						sourceType: "forum",
						independence: "community",
						freshness: "undated",
						directness: "anecdotal",
						extractionConfidence: "low",
						claimFit: "weak",
					},
				}),
			],
			reviewClaim: () => ({
				claimId: "claim-llm-unknown-evidence",
				verdict: "supported",
				evidenceNoteIds: ["note-not-linked"],
				reason: "The model cited an invalid note.",
			}),
		});

		expect(result.status).toBe("needs_repair");
		expect(result.verdicts).toEqual([
			expect.objectContaining({
				claimId: "claim-llm-unknown-evidence",
				verdict: "needs_repair",
				reason: expect.stringContaining("Claim Type Evidence Requirements"),
			}),
		]);
	});

	it("falls back conservatively when the claim-graph LLM returns no usable verdict", async () => {
		const result = await auditDeepResearchClaimGraph({
			jobId: "job-llm-missing",
			claims: [
				buildSynthesisClaim({
					id: "claim-llm-missing",
					statement: "Model X officially includes 16 GB memory.",
					claimType: "official_specification",
					evidenceNoteId: "note-llm-missing",
				}),
			],
			evidenceNotes: [
				buildEvidenceNote({
					id: "note-llm-missing",
					findingText: "Model X officially includes 16 GB memory.",
					sourceQualitySignals: {
						sourceType: "forum",
						independence: "community",
						freshness: "undated",
						directness: "anecdotal",
						extractionConfidence: "low",
						claimFit: "weak",
					},
				}),
			],
			reviewClaim: () => null,
		});

		expect(result.status).toBe("needs_repair");
		expect(result.verdicts).toEqual([
			expect.objectContaining({
				claimId: "claim-llm-missing",
				verdict: "needs_repair",
				reason: expect.stringContaining("Claim Type Evidence Requirements"),
			}),
		]);
	});

	it("does not let claim-graph LLM verdicts rescue hard invariant failures", async () => {
		const result = await auditDeepResearchClaimGraph({
			jobId: "job-hard-invariant",
			claims: [
				buildSynthesisClaim({
					id: "claim-hard-invariant",
					statement: "Model X officially includes 16 GB memory.",
					claimType: "official_specification",
					evidenceNoteId: "note-hard-invariant",
					status: "needs-repair",
				}),
			],
			evidenceNotes: [
				buildEvidenceNote({
					id: "note-hard-invariant",
					findingText: "Model X officially includes 16 GB memory.",
					sourceQualitySignals: {
						sourceType: "official_vendor",
						independence: "primary",
						freshness: "current",
						directness: "direct",
						extractionConfidence: "high",
						claimFit: "strong",
					},
				}),
			],
			reviewClaim: () => ({
				claimId: "claim-hard-invariant",
				verdict: "supported",
				evidenceNoteIds: ["note-hard-invariant"],
				reason: "The model tried to support a gated claim.",
			}),
		});

		expect(result.status).toBe("needs_repair");
		expect(result.verdicts).toEqual([
			expect.objectContaining({
				claimId: "claim-hard-invariant",
				verdict: "needs_repair",
				reason: expect.stringContaining("Claim Support Gate failed"),
			}),
		]);
	});

	it("rejects a Markdown-looking citation when linked Evidence Notes do not support the claim", async () => {
		const result = await auditDeepResearchClaimGraph({
			jobId: "job-markdown-citation",
			claims: [
				{
					id: "claim-markdown-citation",
					jobId: "job-markdown-citation",
					conversationId: "conversation-1",
					userId: "user-1",
					passCheckpointId: "pass-1",
					synthesisPass: "synthesis-pass-1",
					planQuestion: "Which US AI copyright cases remain unresolved?",
					reportSection: "Litigation status",
					statement:
						"US courts have already settled every major AI training-data copyright lawsuit. [1]",
					claimType: "general",
					central: true,
					status: "accepted",
					statusReason: null,
					competingClaimGroupId: null,
					evidenceLinks: [
						{
							id: "link-1",
							claimId: "claim-markdown-citation",
							evidenceNoteId: "note-eu-exception",
							jobId: "job-markdown-citation",
							conversationId: "conversation-1",
							userId: "user-1",
							relation: "support",
							rationale: null,
							material: false,
							createdAt: "2026-05-05T10:12:00.000Z",
						},
					],
					createdAt: "2026-05-05T10:12:00.000Z",
					updatedAt: "2026-05-05T10:12:00.000Z",
				},
			],
			evidenceNotes: [
				{
					id: "note-eu-exception",
					jobId: "job-markdown-citation",
					conversationId: "conversation-1",
					userId: "user-1",
					passCheckpointId: "pass-1",
					passNumber: 1,
					sourceId: "source-1",
					taskId: null,
					supportedKeyQuestion: "How does EU law treat AI training data?",
					comparedEntity: "European Union",
					comparisonAxis: "copyright exception",
					findingText:
						"EU text-and-data mining exceptions require rights-reservation checks.",
					sourceSupport: {
						sourceId: "source-1",
						title: "EU AI copyright briefing",
					},
					sourceQualitySignals: null,
					sourceAuthoritySummary: null,
					createdAt: "2026-05-05T10:11:00.000Z",
					updatedAt: "2026-05-05T10:11:00.000Z",
				},
			],
		});

		expect(result.canRenderMarkdown).toBe(false);
		expect(result.verdicts).toEqual([
			expect.objectContaining({
				claimId: "claim-markdown-citation",
				verdict: "needs_repair",
				evidenceNoteIds: ["note-eu-exception"],
				reason: expect.stringContaining("do not support"),
			}),
		]);
	});
});

function buildSynthesisClaim(input: {
	id: string;
	statement: string;
	claimType: DeepResearchSynthesisClaim["claimType"];
	evidenceNoteId: string;
	status?: DeepResearchSynthesisClaim["status"];
}): DeepResearchSynthesisClaim {
	return {
		id: input.id,
		jobId: "job-claim-graph",
		conversationId: "conversation-1",
		userId: "user-1",
		passCheckpointId: "pass-1",
		synthesisPass: "synthesis-pass-1",
		planQuestion: "What is true about Model X?",
		reportSection: "Findings",
		statement: input.statement,
		claimType: input.claimType,
		central: true,
		status: input.status ?? "accepted",
		statusReason: null,
		competingClaimGroupId: null,
		evidenceLinks: [
			{
				id: `link-${input.id}`,
				claimId: input.id,
				evidenceNoteId: input.evidenceNoteId,
				jobId: "job-claim-graph",
				conversationId: "conversation-1",
				userId: "user-1",
				relation: "support",
				rationale: null,
				material: false,
				createdAt: "2026-05-05T10:12:00.000Z",
			},
		],
		createdAt: "2026-05-05T10:12:00.000Z",
		updatedAt: "2026-05-05T10:12:00.000Z",
	};
}

function buildEvidenceNote(input: {
	id: string;
	findingText: string;
	sourceQualitySignals: DeepResearchSourceQualitySignals;
}): DeepResearchEvidenceNote {
	return {
		id: input.id,
		jobId: "job-claim-graph",
		conversationId: "conversation-1",
		userId: "user-1",
		passCheckpointId: "pass-1",
		passNumber: 1,
		sourceId: "source-1",
		taskId: null,
		supportedKeyQuestion: "What is true about Model X?",
		comparedEntity: "Model X",
		comparisonAxis: "product details",
		findingText: input.findingText,
		sourceSupport: {
			sourceId: "source-1",
			title: "Model X product page",
			url: "https://vendor.example.test/model-x",
		},
		sourceQualitySignals: input.sourceQualitySignals,
		sourceAuthoritySummary: null,
		createdAt: "2026-05-05T10:11:00.000Z",
		updatedAt: "2026-05-05T10:11:00.000Z",
	};
}
