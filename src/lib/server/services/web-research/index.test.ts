import { describe, expect, it, vi } from "vitest";
import {
	classifySourceAuthority,
	planResearchQueries,
	type ResearchEvidence,
	researchWeb,
} from "./index";

const webConfig = {
	exaApiKey: "exa-key",
	braveSearchApiKey: "brave-key",
	webResearchExaSearchType: "auto",
	webResearchExaNumResults: 12,
	webResearchBraveNumResults: 10,
	webResearchMaxSources: 6,
	webResearchHighlightChars: 500,
	webResearchContentChars: 2000,
	webResearchFreshnessHours: 24,
};

describe("web research planning", () => {
	it("plans broad, official, freshness, and exact query variants for volatile facts", () => {
		const queries = planResearchQueries(
			{ query: "latest Framework X Pro price", quoteRequired: true },
			new Date("2026-05-02T12:00:00.000Z"),
		);

		expect(queries).toEqual([
			{ query: "latest Framework X Pro price", purpose: "broad" },
			{
				query: "latest Framework X Pro price official source",
				purpose: "official",
			},
			{ query: "latest Framework X Pro price 2026", purpose: "freshness" },
			{ query: '"latest Framework X Pro price"', purpose: "exact" },
		]);
	});

	it("promotes official technical sources above generic pages", () => {
		expect(
			classifySourceAuthority(
				"https://docs.example.com/reference/search",
				"technical",
			),
		).toMatchObject({
			authorityClass: "primary",
			authorityScore: 90,
		});
		expect(
			classifySourceAuthority("https://reddit.com/r/example", "technical"),
		).toMatchObject({
			authorityClass: "low",
		});
	});
});

describe("researchWeb", () => {
	it("fuses Exa and Brave results, opens selected pages, and reranks evidence chunks", async () => {
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = input.toString();
				if (url === "https://api.exa.ai/search") {
					return new Response(
						JSON.stringify({
							results: [
								{
									title: "Framework X Pro - Official Store",
									url: "https://www.example.com/products/x-pro?utm_source=test",
									summary: "Official listing for the Framework X Pro.",
									highlights: [
										"Framework X Pro starts at $799 from the official store.",
									],
									score: 0.82,
									publishedDate: "2026-05-01T08:00:00.000Z",
								},
							],
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				if (url.startsWith("https://api.search.brave.com/res/v1/web/search")) {
					return new Response(
						JSON.stringify({
							web: {
								results: [
									{
										title: "Framework X Pro price tracker",
										url: "https://prices.example.net/framework-x-pro",
										description: "A tracker mentions older third-party prices.",
										extra_snippets: [
											"Third-party prices may lag behind the official store.",
										],
									},
									{
										title: "Framework X Pro - Official Store Duplicate",
										url: "https://example.com/products/x-pro",
										description:
											"Official duplicate without tracking parameters.",
									},
								],
							},
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				if (url === "https://api.exa.ai/contents") {
					const body = JSON.parse(String(init?.body));
					expect(body.urls).toContain(
						"https://www.example.com/products/x-pro?utm_source=test",
					);
					expect(body.maxAgeHours).toBe(0);
					return new Response(
						JSON.stringify({
							results: [
								{
									url: "https://example.com/products/x-pro",
									text: [
										"Framework X Pro official product page.",
										"The current starting price is $799 before taxes and shipping.",
										"Configurations and availability may change by region.",
									].join(" "),
									highlights: [
										"The current starting price is $799 before taxes and shipping.",
									],
								},
							],
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				throw new Error(`Unexpected fetch: ${url}`);
			},
		);

		const rerank = vi.fn(
			async (params: {
				query: string;
				items: ResearchEvidence[];
				getText: (item: ResearchEvidence) => string;
			}) => ({
				items: params.items
					.map((item, index) => ({
						item,
						index,
						score: params.getText(item).includes("$799") ? 0.98 : 0.2,
					}))
					.sort((left, right) => right.score - left.score),
				confidence: 98,
			}),
		);

		const result = await researchWeb(
			{
				query: "current Framework X Pro price",
				mode: "exact",
				freshness: "live",
				sourcePolicy: "commerce",
				maxSources: 4,
				quoteRequired: true,
			},
			{
				config: webConfig,
				fetch: fetchMock,
				now: new Date("2026-05-02T12:00:00.000Z"),
				rerank,
			},
		);

		expect(result.queries.map((entry) => entry.purpose)).toEqual([
			"broad",
			"official",
			"freshness",
			"exact",
		]);
		expect(result.sources.map((source) => source.canonicalUrl)).toEqual([
			"https://example.com/products/x-pro",
			"https://prices.example.net/framework-x-pro",
		]);
		expect(result.evidence[0]?.quote).toContain("$799");
		expect(result.diagnostics.openedPageCount).toBe(1);
		expect(result.diagnostics.reranked).toBe(true);
		expect(result.diagnostics.providerCalls).toHaveLength(8);
	});
});
