import { describe, expect, it } from "vitest";
import {
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
			}),
		]);
	});
});
