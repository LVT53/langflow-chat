import { describe, expect, it, vi } from "vitest";
import { runPublicWebDiscoveryPass } from "./discovery";
import type { ResearchPlan } from "./planning";

const approvedPlan: ResearchPlan = {
	goal: "Compare EU and US AI copyright training data rules",
	depth: "standard",
	researchBudget: {
		sourceReviewCeiling: 40,
		synthesisPassCeiling: 2,
	},
	keyQuestions: [
		"What does the EU AI Act require for training data transparency?",
		"What do current US copyright cases say about AI training data?",
	],
	sourceScope: {
		includePublicWeb: true,
		planningContextDisclosure: null,
	},
	reportShape: ["Executive summary", "Comparison", "Source list"],
	constraints: ["Use current public sources."],
	deliverables: ["Cited Research Report"],
};

describe("public web discovery", () => {
	it("discovers public web candidates from an approved Research Plan", async () => {
		const researchWeb = vi.fn().mockResolvedValue({
			sources: [
				{
					url: "https://example.eu/ai-act",
					canonicalUrl: "https://example.eu/ai-act",
					title: "EU AI Act training data guidance",
					provider: "exa",
					snippet: "Transparency obligations for general-purpose AI.",
					publishedAt: "2026-04-30T00:00:00.000Z",
					authorityClass: "authoritative",
					authorityScore: 80,
				},
			],
			diagnostics: {
				providerCalls: [],
			},
		});
		const saveDiscoveredSources = vi.fn(async (sources) =>
			sources.map((source, index) => ({
				...source,
				id: `source-${index + 1}`,
				status: "discovered",
			})),
		);
		const saveTimelineEvent = vi.fn(async (event) => ({
			...event,
			id: "event-1",
			createdAt: event.occurredAt,
		}));

		const result = await runPublicWebDiscoveryPass(
			{
				jobId: "job-1",
				conversationId: "conversation-1",
				userId: "user-1",
				approvedPlan,
				now: new Date("2026-05-05T12:00:00.000Z"),
			},
			{
				researchWeb,
				sourceRepository: { saveDiscoveredSources },
				timelineRepository: { saveTimelineEvent },
			},
		);

		expect(researchWeb).toHaveBeenCalledWith(
			expect.objectContaining({
				query: "Compare EU and US AI copyright training data rules",
				mode: "research",
				sourcePolicy: "general",
				maxSources: 10,
			}),
		);
		expect(saveDiscoveredSources).toHaveBeenCalledWith([
			expect.objectContaining({
				jobId: "job-1",
				conversationId: "conversation-1",
				userId: "user-1",
				url: "https://example.eu/ai-act",
				title: "EU AI Act training data guidance",
				provider: "exa",
				discoveredAt: "2026-05-05T12:00:00.000Z",
				metadata: expect.objectContaining({
					query: "Compare EU and US AI copyright training data rules",
					snippet: "Transparency obligations for general-purpose AI.",
					authorityClass: "authoritative",
					authorityScore: 80,
					publishedAt: "2026-04-30T00:00:00.000Z",
				}),
			}),
		]);
		expect(saveTimelineEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				jobId: "job-1",
				conversationId: "conversation-1",
				userId: "user-1",
				stage: "source_discovery",
				kind: "stage_completed",
				occurredAt: "2026-05-05T12:00:00.000Z",
				sourceCounts: {
					discovered: 1,
					reviewed: 0,
					cited: 0,
				},
			}),
		);
		expect(result.discoveredCount).toBe(1);
		expect(result.savedSources).toHaveLength(1);
	});

	it("normalizes and deduplicates equivalent source URLs before saving", async () => {
		const researchWeb = vi.fn().mockResolvedValue({
			sources: [
				{
					url: "https://Example.com/report?utm_source=newsletter#findings",
					canonicalUrl:
						"https://Example.com/report?utm_source=newsletter#findings",
					title: " Market report ",
					provider: "brave",
					snippet: "Original result.",
					publishedAt: null,
					authorityClass: "standard",
					authorityScore: 50,
				},
				{
					url: "https://example.com/report/",
					canonicalUrl: "https://example.com/report/",
					title: "Market report duplicate",
					provider: "exa",
					snippet: "Duplicate result.",
					publishedAt: null,
					authorityClass: "standard",
					authorityScore: 50,
				},
			],
			diagnostics: {
				providerCalls: [],
			},
		});
		const saveDiscoveredSources = vi.fn(async (sources) => sources);
		const saveTimelineEvent = vi.fn(async (event) => ({
			...event,
			id: "event-1",
			createdAt: event.occurredAt,
		}));

		await runPublicWebDiscoveryPass(
			{
				jobId: "job-1",
				conversationId: "conversation-1",
				userId: "user-1",
				approvedPlan,
				now: new Date("2026-05-05T12:00:00.000Z"),
			},
			{
				researchWeb,
				sourceRepository: { saveDiscoveredSources },
				timelineRepository: { saveTimelineEvent },
			},
		);

		expect(saveDiscoveredSources).toHaveBeenCalledWith([
			expect.objectContaining({
				url: "https://example.com/report",
				title: "Market report",
				provider: "brave",
				metadata: expect.objectContaining({
					canonicalUrl: "https://example.com/report",
				}),
			}),
		]);
		expect(saveTimelineEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				sourceCounts: {
					discovered: 1,
					reviewed: 0,
					cited: 0,
				},
			}),
		);
	});

	it("writes a source-discovery warning when web research fails", async () => {
		const researchWeb = vi
			.fn()
			.mockRejectedValue(new Error("provider unavailable"));
		const saveDiscoveredSources = vi.fn(async (sources) => sources);
		const saveTimelineEvent = vi.fn(async (event) => ({
			...event,
			id: "event-1",
			createdAt: event.occurredAt,
		}));

		const result = await runPublicWebDiscoveryPass(
			{
				jobId: "job-1",
				conversationId: "conversation-1",
				userId: "user-1",
				approvedPlan,
				now: new Date("2026-05-05T12:00:00.000Z"),
			},
			{
				researchWeb,
				sourceRepository: { saveDiscoveredSources },
				timelineRepository: { saveTimelineEvent },
			},
		);

		expect(saveDiscoveredSources).not.toHaveBeenCalled();
		expect(saveTimelineEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				stage: "source_discovery",
				kind: "warning",
				sourceCounts: {
					discovered: 0,
					reviewed: 0,
					cited: 0,
				},
				warnings: ["Public web discovery failed: provider unavailable"],
			}),
		);
		expect(result).toMatchObject({
			discoveredCount: 0,
			savedSources: [],
			warnings: ["Public web discovery failed: provider unavailable"],
		});
	});

	it("bounds discovery queries from the approved plan goal and key questions", async () => {
		const focusedPlan: ResearchPlan = {
			...approvedPlan,
			depth: "focused",
			researchBudget: {
				sourceReviewCeiling: 12,
				synthesisPassCeiling: 1,
			},
			keyQuestions: [
				"Which primary law changed most recently?",
				"Which regulator guidance is authoritative?",
				"Which litigation risk matters?",
			],
		};
		const researchWeb = vi.fn().mockResolvedValue({
			sources: [],
			diagnostics: {
				providerCalls: [],
			},
		});
		const saveDiscoveredSources = vi.fn(async (sources) => sources);
		const saveTimelineEvent = vi.fn(async (event) => ({
			...event,
			id: "event-1",
			createdAt: event.occurredAt,
		}));

		const result = await runPublicWebDiscoveryPass(
			{
				jobId: "job-1",
				conversationId: "conversation-1",
				userId: "user-1",
				approvedPlan: focusedPlan,
				now: new Date("2026-05-05T12:00:00.000Z"),
			},
			{
				researchWeb,
				sourceRepository: { saveDiscoveredSources },
				timelineRepository: { saveTimelineEvent },
			},
		);

		expect(researchWeb).toHaveBeenCalledTimes(2);
		expect(researchWeb).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				query: "Compare EU and US AI copyright training data rules",
				maxSources: 6,
			}),
		);
		expect(researchWeb).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				query: "Which primary law changed most recently?",
				maxSources: 6,
			}),
		);
		expect(result.queries).toEqual([
			"Compare EU and US AI copyright training data rules",
			"Which primary law changed most recently?",
		]);
	});
});
