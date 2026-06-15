import { describe, expect, it } from "vitest";
import {
	isSourceTopicRelevantToPlan,
	triageAndReviewSources,
	triageSourcesForReview,
} from "./source-review";

describe("Deep Research source triage and review", () => {
	it("deduplicates equivalent Discovered Source URLs and selects one canonical source", async () => {
		const result = await triageSourcesForReview({
			jobId: "job-1",
			discoveredSources: [
				{
					id: "source-a",
					url: "https://example.com/report?utm_source=newsletter#section",
					title: "Market report",
					snippet: "Original report snippet",
				},
				{
					id: "source-b",
					url: "https://example.com/report/",
					title: "Market report duplicate",
					snippet: "Duplicate report snippet",
				},
			],
			reviewLimit: 5,
		});

		expect(result.discoveredCount).toBe(2);
		expect(result.canonicalSourceCount).toBe(1);
		expect(result.selectedSources).toHaveLength(1);
		expect(result.selectedSources[0]).toMatchObject({
			id: "source-a",
			canonicalUrl: "https://example.com/report",
			duplicateSourceIds: ["source-b"],
		});
		expect(result.reviewedCount).toBe(0);
	});

	it("uses authority and quality scoring to select bounded sources for review", async () => {
		const result = await triageSourcesForReview({
			jobId: "job-1",
			discoveredSources: [
				{
					id: "thin-blog",
					url: "https://cheap-example-blog.test/post",
					title: "Shocking claims!!!",
					snippet: "You will not believe this unsourced listicle.",
				},
				{
					id: "official-statistics",
					url: "https://stats.gov.example/releases/labor-market",
					title: "Labor market statistics",
					snippet: "Official monthly release with data tables and methodology.",
				},
				{
					id: "university-paper",
					url: "https://research.example.edu/papers/workforce-study",
					title: "Workforce study",
					snippet:
						"Peer reviewed paper with methodology, limitations, and citations.",
				},
			],
			reviewLimit: 2,
		});

		expect(result.selectedSources.map((source) => source.id)).toEqual([
			"official-statistics",
			"university-paper",
		]);
		expect(result.selectedSources[0].authorityScore).toBeGreaterThan(
			result.selectedSources[1].authorityScore,
		);
		expect(result.selectedSources[1].qualityScore).toBeGreaterThan(0);
		expect(result.canonicalSourceCount).toBe(3);
		expect(result.reviewedCount).toBe(0);
	});

	it("prioritizes official product specification pages for comparison research", async () => {
		const result = await triageSourcesForReview({
			jobId: "job-bike-comparison",
			discoveredSources: [
				{
					id: "dealer-roundup",
					url: "https://dealer.example.test/blog/best-trekking-ebikes",
					title: "Best trekking e-bikes ranked",
					snippet: "A dealer roundup with buying advice and discounts.",
				},
				{
					id: "cube-official-specs",
					url: "https://www.cube.eu/products/kathmandu-hybrid/specs",
					title: "Cube Kathmandu Hybrid official specifications",
					snippet:
						"Technical specs, geometry, Bosch motor, battery, weight, frame, and warranty.",
				},
				{
					id: "forum-thread",
					url: "https://forum.example.test/cube-kathmandu-owner-thread",
					title: "Owner thread: Cube Kathmandu impressions",
					snippet:
						"Forum posts with owner impressions and conflicting details.",
				},
			],
			reviewLimit: 1,
		});

		expect(result.selectedSources.map((source) => source.id)).toEqual([
			"cube-official-specs",
		]);
		expect(result.selectedSources[0].reviewScore).toBeGreaterThan(
			result.selectedSources[0].authorityScore,
		);
	});

	it("persists Reviewed Source notes through an injected repository boundary", async () => {
		const savedNotes: unknown[] = [];

		const result = await triageAndReviewSources(
			{
				jobId: "job-1",
				discoveredSources: [
					{
						id: "primary-source",
						url: "https://agency.gov.example/report?id=42&utm_campaign=feed",
						title: "Agency report",
						snippet: "Official report with methodology and data tables.",
					},
					{
						id: "primary-source-copy",
						url: "https://agency.gov.example/report?id=42#summary",
						title: "Agency report copy",
						snippet: "Duplicate source.",
					},
				],
				reviewLimit: 3,
			},
			{
				reviewer: {
					reviewSource: async (source) => ({
						summary: `Reviewed ${source.title}`,
						keyFindings: ["The source has relevant official data."],
						extractedText: "Official report text.",
					}),
				},
				repository: {
					saveReviewedSourceNotes: async (notes) => {
						savedNotes.push(notes);
						return {
							...notes,
							id: "reviewed-1",
							reviewedAt: "2026-05-05T12:00:00.000Z",
							createdAt: "2026-05-05T12:00:00.000Z",
						};
					},
				},
			},
		);

		expect(result.discoveredCount).toBe(2);
		expect(result.canonicalSourceCount).toBe(1);
		expect(result.reviewedCount).toBe(1);
		expect(savedNotes).toEqual([
			expect.objectContaining({
				jobId: "job-1",
				discoveredSourceId: "primary-source",
				canonicalUrl: "https://agency.gov.example/report?id=42",
				duplicateSourceIds: ["primary-source-copy"],
				summary: "Reviewed Agency report",
				keyFindings: ["The source has relevant official data."],
			}),
		]);
		expect(result.reviewedSources).toEqual([
			expect.objectContaining({
				id: "reviewed-1",
				discoveredSourceId: "primary-source",
				canonicalUrl: "https://agency.gov.example/report?id=42",
				reviewedAt: "2026-05-05T12:00:00.000Z",
			}),
		]);
	});

	it("reviews selected sources up to the source processing concurrency budget", async () => {
		let activeReviews = 0;
		let maxActiveReviews = 0;

		await triageAndReviewSources(
			{
				jobId: "job-1",
				discoveredSources: [
					{
						id: "source-1",
						url: "https://agency.example.test/one",
						title: "Agency report one",
						snippet: "Official report with methodology.",
					},
					{
						id: "source-2",
						url: "https://agency.example.test/two",
						title: "Agency report two",
						snippet: "Official report with methodology.",
					},
					{
						id: "source-3",
						url: "https://agency.example.test/three",
						title: "Agency report three",
						snippet: "Official report with methodology.",
					},
				],
				reviewLimit: 3,
				sourceProcessingConcurrency: 2,
			},
			{
				reviewer: {
					reviewSource: async (source) => {
						activeReviews += 1;
						maxActiveReviews = Math.max(maxActiveReviews, activeReviews);
						await new Promise((resolve) => setTimeout(resolve, 0));
						activeReviews -= 1;
						return {
							summary: `Reviewed ${source.title}`,
							keyFindings: ["The source has relevant official data."],
							extractedText: "Official report text.",
						};
					},
				},
				repository: {
					saveReviewedSourceNotes: async (notes) => ({
						...notes,
						id: `reviewed-${notes.discoveredSourceId}`,
						reviewedAt: "2026-05-05T12:00:00.000Z",
						createdAt: "2026-05-05T12:00:00.000Z",
					}),
				},
			},
		);

		expect(maxActiveReviews).toBe(2);
	});

	it("records source quality signals instead of only one authority score", async () => {
		const savedNotes: unknown[] = [];

		await triageAndReviewSources(
			{
				jobId: "job-1",
				discoveredSources: [
					{
						id: "vendor-specs",
						url: "https://vendor.example.com/products/model-x/specs",
						title: "Vendor Model X official specifications",
						snippet:
							"Official vendor page with dimensions, battery size, warranty, and safety certifications.",
						sourceText:
							"Model X official specifications: 16 GB memory, 1 TB storage, 14 hour battery rating, and vendor warranty terms.",
					},
				],
				reviewLimit: 1,
				planGoal: "Assess Model X specifications and reliability.",
				keyQuestions: [
					"What are the official Model X specifications?",
					"Is Model X independently reliable?",
				],
			},
			{
				reviewer: {
					reviewSource: async (source) => ({
						summary: `Reviewed ${source.title}`,
						keyFindings: ["Model X has 16 GB memory and 1 TB storage."],
						extractedText: source.sourceText,
						relevanceScore: 95,
						supportedKeyQuestions: [
							"What are the official Model X specifications?",
						],
					}),
				},
				repository: {
					saveReviewedSourceNotes: async (notes) => {
						savedNotes.push(notes);
						return {
							...notes,
							id: "reviewed-vendor-specs",
							reviewedAt: "2026-05-05T12:00:00.000Z",
							createdAt: "2026-05-05T12:00:00.000Z",
						};
					},
				},
			},
		);

		expect(savedNotes).toEqual([
			expect.objectContaining({
				discoveredSourceId: "vendor-specs",
				sourceQualitySignals: expect.objectContaining({
					sourceType: "official_vendor",
					independence: "affiliated",
					freshness: "undated",
					directness: "direct",
					extractionConfidence: "high",
					claimFit: "strong",
				}),
				sourceAuthoritySummary: expect.objectContaining({
					label: "Strong for official details",
				}),
			}),
		]);
	});

	it("records intended and actual comparison entity-axis support", async () => {
		const savedNotes: unknown[] = [];

		await triageAndReviewSources(
			{
				jobId: "job-comparison-support",
				planGoal: "Compare GitHub Copilot and Cursor for privacy.",
				keyQuestions: ["How do the tools compare on privacy?"],
				discoveredSources: [
					{
						id: "copilot-privacy",
						url: "https://vendor.example/copilot/privacy",
						title: "GitHub Copilot privacy documentation",
						snippet: "GitHub Copilot privacy controls and data handling.",
						sourceText:
							"GitHub Copilot privacy controls, data retention, and enterprise policy details.",
						intendedComparedEntity: "GitHub Copilot",
						intendedComparisonAxis: "privacy",
					},
				],
				reviewLimit: 1,
			},
			{
				reviewer: {
					reviewSource: async (source) => ({
						summary: `Reviewed ${source.title}`,
						keyFindings: ["Copilot privacy controls are documented."],
						extractedText: source.sourceText,
						relevanceScore: 95,
						supportedKeyQuestions: ["How do the tools compare on privacy?"],
						comparedEntity: "GitHub Copilot",
						comparisonAxis: "privacy",
					}),
				},
				repository: {
					saveReviewedSourceNotes: async (notes) => {
						savedNotes.push(notes);
						return {
							...notes,
							id: "reviewed-copilot-privacy",
							reviewedAt: "2026-05-05T12:00:00.000Z",
							createdAt: "2026-05-05T12:00:00.000Z",
						};
					},
				},
			},
		);

		expect(savedNotes).toEqual([
			expect.objectContaining({
				discoveredSourceId: "copilot-privacy",
				intendedComparedEntity: "GitHub Copilot",
				intendedComparisonAxis: "privacy",
				comparedEntity: "GitHub Copilot",
				comparisonAxis: "privacy",
			}),
		]);
	});

	it("rejects generic comparison sources that only match loose anchors instead of actual entity-axis support", async () => {
		const savedNotes: Array<{
			discoveredSourceId: string;
			comparedEntity?: string | null;
			comparisonAxis?: string | null;
			rejectedReason: string | null;
		}> = [];
		const keyQuestions = [
			"How do Cube Nulane 400X and Cube Kathmandu SLX compare on 2026 model year, pricing, drivetrain, and brakes?",
		];

		const result = await triageAndReviewSources(
			{
				jobId: "job-cube-generic-source-review",
				planGoal:
					"Compare Cube Nulane 400X and Cube Kathmandu SLX for 2026 model year, pricing, availability in Europe, Medium frame size, specs, weight, motor/battery, drivetrain, brakes, geometry, and accessories.",
				keyQuestions,
				discoveredSources: [
					{
						id: "cube-400x-year-generic",
						url: "https://cars.example/2026-model-year-400x-pricing",
						title: "Cube 400X 2026 model year pricing and availability",
						snippet:
							"General 2026 model year pricing and availability in Europe, with no Cube bicycle product support.",
						sourceText:
							"Cube 400X 2026 model year pricing and availability in Europe. This generic car-market article discusses model-year availability and price timing.",
						intendedComparedEntity: "Cube Nulane 400X",
						intendedComparisonAxis: "2026 model year",
					},
					{
						id: "generic-drivetrain-guide",
						url: "https://bike.example/generic-drivetrain-guide",
						title: "Cube drivetrain guide for city bikes",
						snippet:
							"Generic drivetrain terminology for city bikes, brakes, and accessories.",
						sourceText:
							"Cube drivetrain guide explaining chain, cassette, brakes, geometry, and accessories for bikes generally. It does not document Nulane 400X or Kathmandu SLX.",
						intendedComparedEntity: "Cube Kathmandu SLX",
						intendedComparisonAxis: "drivetrain",
					},
				],
				reviewLimit: 2,
			},
			{
				reviewer: {
					reviewSource: async (source) => ({
						summary: `Reviewed ${source.title}`,
						keyFindings: ["The source mentions one loose comparison term."],
						extractedText: source.sourceText,
						relevanceScore: 95,
						supportedKeyQuestions: keyQuestions,
						extractedClaims: [`Claim from ${source.title}`],
					}),
				},
				repository: {
					saveReviewedSourceNotes: async (notes) => {
						savedNotes.push({
							discoveredSourceId: notes.discoveredSourceId,
							comparedEntity: notes.comparedEntity,
							comparisonAxis: notes.comparisonAxis,
							rejectedReason: notes.rejectedReason,
						});
						return {
							...notes,
							id: `reviewed-${notes.discoveredSourceId}`,
							reviewedAt: "2026-05-05T12:00:00.000Z",
							createdAt: "2026-05-05T12:00:00.000Z",
						};
					},
				},
			},
		);

		expect(result.reviewedSources).toEqual([]);
		expect(savedNotes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					discoveredSourceId: "cube-400x-year-generic",
					comparedEntity: null,
					comparisonAxis: null,
					rejectedReason:
						"Rejected because the source does not support the intended comparison entity and axis.",
				}),
				expect.objectContaining({
					discoveredSourceId: "generic-drivetrain-guide",
					comparedEntity: null,
					comparisonAxis: null,
					rejectedReason:
						"Rejected because the source does not support the intended comparison entity and axis.",
				}),
			]),
		);
	});

	it("rejects unrelated software sources that only match generic compliance axes", async () => {
		const savedNotes: Array<{
			discoveredSourceId: string;
			comparedEntity?: string | null;
			comparisonAxis?: string | null;
			rejectedReason: string | null;
		}> = [];
		const keyQuestions = [
			"How do Acme Analytics Pro and Acme Analytics Enterprise compare on SOC 2, data residency, SSO, and audit logs?",
		];

		const result = await triageAndReviewSources(
			{
				jobId: "job-saas-generic-source-review",
				planGoal:
					"Compare Acme Analytics Pro and Acme Analytics Enterprise for SOC 2, data residency, SSO, and audit logs.",
				keyQuestions,
				discoveredSources: [
					{
						id: "generic-soc2-guide",
						url: "https://compliance.example/generic-soc2-guide",
						title: "Generic SOC 2 checklist for SaaS vendors",
						snippet:
							"SOC 2 audit controls, SSO, audit logs, and data residency terms.",
						sourceText:
							"SOC 2 audit controls, SSO, audit logs, and data residency terms for SaaS vendors generally. This page does not document Acme Analytics Pro or Acme Analytics Enterprise.",
						intendedComparedEntity: "Acme Analytics Pro",
						intendedComparisonAxis: "SOC 2",
					},
					{
						id: "other-vendor-data-residency",
						url: "https://other-vendor.example/data-residency",
						title: "OtherVendor data residency documentation",
						snippet:
							"OtherVendor supports EU data residency and enterprise SSO.",
						sourceText:
							"OtherVendor supports EU data residency, SSO, and audit logs. It does not describe Acme Analytics Enterprise.",
						intendedComparedEntity: "Acme Analytics Enterprise",
						intendedComparisonAxis: "data residency",
					},
				],
				reviewLimit: 2,
			},
			{
				reviewer: {
					reviewSource: async (source) => ({
						summary: `Reviewed ${source.title}`,
						keyFindings: ["The source mentions a generic compliance axis."],
						extractedText: source.sourceText,
						relevanceScore: 95,
						supportedKeyQuestions: keyQuestions,
						extractedClaims: [`Claim from ${source.title}`],
					}),
				},
				repository: {
					saveReviewedSourceNotes: async (notes) => {
						savedNotes.push({
							discoveredSourceId: notes.discoveredSourceId,
							comparedEntity: notes.comparedEntity,
							comparisonAxis: notes.comparisonAxis,
							rejectedReason: notes.rejectedReason,
						});
						return {
							...notes,
							id: `reviewed-${notes.discoveredSourceId}`,
							reviewedAt: "2026-05-05T12:00:00.000Z",
							createdAt: "2026-05-05T12:00:00.000Z",
						};
					},
				},
			},
		);

		expect(result.reviewedSources).toEqual([]);
		expect(savedNotes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					discoveredSourceId: "generic-soc2-guide",
					comparedEntity: null,
					comparisonAxis: null,
					rejectedReason:
						"Rejected because the source does not support the intended comparison entity and axis.",
				}),
				expect.objectContaining({
					discoveredSourceId: "other-vendor-data-residency",
					comparedEntity: null,
					comparisonAxis: null,
					rejectedReason:
						"Rejected because the source does not support the intended comparison entity and axis.",
				}),
			]),
		);
	});

	it("rejects off-topic sources even when the reviewer returns strong key-question support", async () => {
		const savedNotes: Array<{
			discoveredSourceId: string;
			rejectedReason: string | null;
			topicRelevant?: boolean | null;
			topicRelevanceReason?: string | null;
		}> = [];
		const keyQuestions = [
			"How do Cube Kathmandu and Cube Nulane specifications differ?",
			"Which model is better for commuting and touring?",
		];

		const result = await triageAndReviewSources(
			{
				jobId: "job-cube-comparison",
				planGoal:
					"Compare Cube Kathmandu and Cube Nulane bicycle models for 2025-2026.",
				keyQuestions,
				discoveredSources: [
					{
						id: "cube-bike-comparison",
						url: "https://bike.example/cube-kathmandu-vs-nulane-2026",
						title: "Cube Kathmandu vs Cube Nulane 2026 comparison",
						snippet:
							"Compares Cube Kathmandu and Cube Nulane frame, drivetrain, tires, and touring use.",
						sourceText:
							"Cube Kathmandu and Cube Nulane bicycle comparison with specifications and commuter touring tradeoffs.",
					},
					{
						id: "volkswagen-ev-prices",
						url: "https://cars.example/volkswagen-electric-car-prices-hungary",
						title: "Volkswagen electric car prices in Hungary",
						snippet:
							"Durván csökkentek a Volkswagen elektromos autók árai Magyarországon.",
						sourceText:
							"Volkswagen ID electric car prices, dealer discounts, Hungarian EV market changes, and battery trim details.",
					},
				],
				reviewLimit: 2,
			},
			{
				reviewer: {
					reviewSource: async (source) => ({
						summary: `Reviewed ${source.title}`,
						keyFindings: ["The source appears to answer the research request."],
						extractedText: source.sourceText,
						relevanceScore: 95,
						supportedKeyQuestions: keyQuestions,
						extractedClaims: [`Claim from ${source.title}`],
					}),
				},
				repository: {
					saveReviewedSourceNotes: async (notes) => {
						savedNotes.push({
							discoveredSourceId: notes.discoveredSourceId,
							rejectedReason: notes.rejectedReason,
							topicRelevant: notes.topicRelevant,
							topicRelevanceReason: notes.topicRelevanceReason,
						});
						return {
							...notes,
							id: `reviewed-${notes.discoveredSourceId}`,
							reviewedAt: "2026-05-05T12:00:00.000Z",
							createdAt: "2026-05-05T12:00:00.000Z",
						};
					},
				},
			},
		);

		expect(
			result.reviewedSources.map((source) => source.discoveredSourceId),
		).toEqual(["cube-bike-comparison"]);
		expect(result.reviewedCount).toBe(1);
		expect(savedNotes).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					discoveredSourceId: "volkswagen-ev-prices",
					topicRelevant: false,
					rejectedReason:
						"Rejected because the source is off-topic for the approved Research Plan.",
				}),
			]),
		);
	});

	it("matches Hungarian topic anchors without requiring identical diacritics", () => {
		expect(
			isSourceTopicRelevantToPlan({
				planGoal:
					"Átfogó összehasonlítás Cube Kathmandu és Cube Nulane kerékpárokról.",
				keyQuestions: [
					"Miben különbözik a Cube Kathmandu és a Cube Nulane felszereltsége?",
				],
				source: {
					id: "cube-topic-anchor",
					title: "Cube Kathmandu es Cube Nulane kerekparok osszehasonlitasa",
					snippet:
						"Felszereltseg, hajtaslanc, varosi ingazas es turazas szempontjai.",
					sourceText:
						"Cube Kathmandu es Cube Nulane kerekpar modellek reszletes osszehasonlitasa.",
				},
			}),
		).toBe(true);
	});
});
