import { describe, expect, it } from "vitest";
import type { StreamToolCallDetails } from "./tool-call-markers";
import { processToolCallMarkers } from "./tool-call-markers";

describe("processToolCallMarkers", () => {
	it("inherits parent source type for tool candidates", () => {
		const emitted: Array<{
			name: string;
			status: "running" | "done";
			details?: StreamToolCallDetails;
		}> = [];
		const payload = JSON.stringify({
			name: "research_web",
			sourceType: "web",
			candidates: [
				{
					id: "src-1",
					title: "Official Product",
					url: "https://example.com/product",
				},
			],
		});

		const output = processToolCallMarkers(
			`Before\u0002TOOL_END\u001f${payload}\u0003After`,
			(name, _input, status, details) => {
				emitted.push({ name, status, details });
			},
		);

		expect(output).toBe("BeforeAfter");
		expect(emitted).toEqual([
			{
				name: "research_web",
				status: "done",
				details: {
					outputSummary: null,
					sourceType: "web",
					candidates: [
						{
							id: "src-1",
							title: "Official Product",
							url: "https://example.com/product",
							snippet: null,
							sourceType: "web",
						},
					],
				},
			},
		]);
	});

	it("parses project_context detail memory candidates", () => {
		const emitted: Array<{
			name: string;
			status: "running" | "done";
			details?: StreamToolCallDetails;
		}> = [];
		const payload = JSON.stringify({
			name: "project_context",
			sourceType: "memory",
			candidates: [
				{
					id: "project-context-detail:conv-pricing",
					title: "Pricing",
					snippet: "Stable pricing brief.",
				},
			],
		});

		processToolCallMarkers(
			`\u0002TOOL_END\u001f${payload}\u0003`,
			(name, _input, status, details) => {
				emitted.push({ name, status, details });
			},
		);

		expect(emitted).toEqual([
			{
				name: "project_context",
				status: "done",
				details: {
					outputSummary: null,
					sourceType: "memory",
					candidates: [
						{
							id: "project-context-detail:conv-pricing",
							title: "Pricing",
							url: null,
							snippet: "Stable pricing brief.",
							sourceType: "memory",
						},
					],
				},
			},
		]);
	});
});
