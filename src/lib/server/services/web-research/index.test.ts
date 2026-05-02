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
				query: "latest Framework X Pro price official store specifications",
				purpose: "official",
			},
			{
				query: "latest Framework X Pro price manufacturer price availability",
				purpose: "exact",
			},
			{ query: "latest Framework X Pro price 2026", purpose: "freshness" },
			{ query: '"latest Framework X Pro price"', purpose: "exact" },
			{
				query: "latest Framework X Pro price exact value source",
				purpose: "exact",
			},
		]);
	});

	it("plans source-policy variants for technical research", () => {
		const queries = planResearchQueries({
			query: "SvelteKit form actions error handling",
			mode: "research",
			sourcePolicy: "technical",
		});

		expect(queries).toEqual([
			{ query: "SvelteKit form actions error handling", purpose: "broad" },
			{
				query: "SvelteKit form actions error handling official documentation",
				purpose: "technical",
			},
			{
				query:
					"SvelteKit form actions error handling GitHub README release notes",
				purpose: "primary",
			},
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
			"exact",
			"freshness",
			"exact",
			"exact",
		]);
		expect(result.sources.map((source) => source.canonicalUrl)).toEqual([
			"https://example.com/products/x-pro",
			"https://prices.example.net/framework-x-pro",
		]);
		expect(result.evidence[0]?.quote).toContain("$799");
		expect(result.answerBrief.markdown).toContain("Citation rules:");
		expect(result.answerBrief.markdown).toContain(
			"Do not cite URLs that are not listed",
		);
		expect(result.answerBrief.sources[0]).toMatchObject({
			ref: "S1",
			url: "https://www.example.com/products/x-pro?utm_source=test",
			authorityClass: "standard",
		});
		expect(result.answerBrief.evidence[0]).toMatchObject({
			ref: "E1",
			sourceRef: "S1",
		});
		expect(result.answerBrief.evidence[0]?.quote).toContain("$799");
		expect(result.diagnostics.openedPageCount).toBe(1);
		expect(result.diagnostics.reranked).toBe(true);
		expect(result.diagnostics.providerCalls).toHaveLength(12);
	});

	it("selects authoritative sources with host diversity before opening pages", async () => {
		const openedUrls: string[] = [];
		const fetchMock = vi.fn(
			async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = input.toString();
				if (url === "https://api.exa.ai/search") {
					return new Response(
						JSON.stringify({
							results: [
								{
									title: "Example Docs - Routing",
									url: "https://docs.example.com/routing",
									summary: "Official routing documentation.",
									highlights: ["Routing docs for the framework."],
								},
								{
									title: "Example Docs - Loading",
									url: "https://docs.example.com/loading",
									summary: "Official loading documentation.",
									highlights: ["Loading docs for the framework."],
								},
								{
									title: "Example Docs - Actions",
									url: "https://docs.example.com/actions",
									summary: "Official action documentation.",
									highlights: ["Action docs for the framework."],
								},
								{
									title: "Example GitHub README",
									url: "https://github.com/example/framework",
									summary: "Primary README and release notes.",
									highlights: ["Release notes mention the routing change."],
								},
							],
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				if (url === "https://api.exa.ai/contents") {
					const body = JSON.parse(String(init?.body));
					openedUrls.push(...body.urls);
					return new Response(
						JSON.stringify({
							results: body.urls.map((sourceUrl: string) => ({
								url: sourceUrl,
								text: `Fetched content for ${sourceUrl}. The source contains relevant implementation details.`,
								highlights: [`Relevant details from ${sourceUrl}.`],
							})),
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					);
				}

				throw new Error(`Unexpected fetch: ${url}`);
			},
		);

		const result = await researchWeb(
			{
				query: "Example framework routing change",
				mode: "research",
				sourcePolicy: "technical",
				maxSources: 3,
			},
			{
				config: { ...webConfig, braveSearchApiKey: "" },
				fetch: fetchMock,
				now: new Date("2026-05-02T12:00:00.000Z"),
				rerank: async (params) => ({
					items: params.items.map((item, index) => ({
						item,
						index,
						score: 1 - index / 100,
					})),
					confidence: 90,
				}),
			},
		);

		expect(result.sources.map((source) => source.canonicalUrl)).toEqual([
			"https://docs.example.com/routing",
			"https://docs.example.com/loading",
			"https://github.com/example/framework",
		]);
		expect(result.sources).not.toContainEqual(
			expect.objectContaining({
				canonicalUrl: "https://docs.example.com/actions",
			}),
		);
		expect(openedUrls).toContain("https://github.com/example/framework");
	});
});
