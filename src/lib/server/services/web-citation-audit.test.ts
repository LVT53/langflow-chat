import { describe, expect, it } from "vitest";
import type { ToolCallEntry } from "$lib/types";
import { buildWebCitationAudit } from "./web-citation-audit";

function researchTool(candidates: ToolCallEntry["candidates"]): ToolCallEntry {
	return {
		name: "research_web",
		input: { query: "current price" },
		status: "done",
		sourceType: "web",
		outputSummary: "Found sources",
		candidates,
	};
}

describe("buildWebCitationAudit", () => {
	it("passes when final citations exactly match research_web sources", () => {
		const audit = buildWebCitationAudit({
			assistantResponse:
				"The current price is listed on the [official page](https://example.com/product?utm_source=chat).",
			toolCalls: [
				researchTool([
					{
						id: "src-1",
						title: "Official Product",
						url: "https://www.example.com/product",
						snippet: "Current price details.",
						sourceType: "web",
					},
				]),
			],
		});

		expect(audit).toMatchObject({
			status: "passed",
			retrievedSourceCount: 1,
			citedUrlCount: 1,
			supportedCitationCount: 1,
			unsupportedCitationCount: 0,
		});
		expect(audit?.citations[0]).toMatchObject({
			supported: true,
			matchType: "exact",
			matchedSourceId: "src-1",
		});
	});

	it("warns when research_web was used but the answer has no citations", () => {
		const audit = buildWebCitationAudit({
			assistantResponse: "The current price is $799.",
			toolCalls: [
				researchTool([
					{
						id: "src-1",
						title: "Official Product",
						url: "https://example.com/product",
						sourceType: "web",
					},
				]),
			],
		});

		expect(audit).toMatchObject({
			status: "missing_citations",
			retrievedSourceCount: 1,
			citedUrlCount: 0,
		});
	});

	it("flags unsupported final citations and records host-only matches separately", () => {
		const audit = buildWebCitationAudit({
			assistantResponse:
				"See [homepage](https://example.com/) and [other](https://other.example.net/page).",
			toolCalls: [
				researchTool([
					{
						id: "src-1",
						title: "Official Product",
						url: "https://example.com/product",
						sourceType: "web",
					},
				]),
			],
		});

		expect(audit?.status).toBe("unsupported_citations");
		expect(audit?.unsupportedCitationCount).toBe(2);
		expect(audit?.citations.map((citation) => citation.matchType)).toEqual([
			"host",
			"none",
		]);
	});

	it("returns null when no web research source or final citation exists", () => {
		expect(
			buildWebCitationAudit({
				assistantResponse: "No web claims here.",
				toolCalls: [],
			}),
		).toBeNull();
	});
});
