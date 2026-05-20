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

	it("parses memory_context memory candidates across modes", () => {
		const emitted: Array<{
			name: string;
			status: "running" | "done";
			details?: StreamToolCallDetails;
		}> = [];
		const payload = JSON.stringify({
			name: "memory_context",
			sourceType: "memory",
			candidates: [
				{
					id: "memory-context:project:conv-pricing",
					title: "Pricing project",
					snippet: "Stable pricing brief.",
				},
				{
					id: "memory-context:persona:user-1",
					title: "Honcho persona recall",
					snippet: "Prefers concise answers.",
				},
				{
					id: "memory-context:history:conv-cycling",
					title: "Cycling history",
					snippet: "Older non-project cycling discussion.",
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
				name: "memory_context",
				status: "done",
				details: {
					outputSummary: null,
					sourceType: "memory",
					candidates: [
						{
							id: "memory-context:project:conv-pricing",
							title: "Pricing project",
							url: null,
							snippet: "Stable pricing brief.",
							sourceType: "memory",
						},
						{
							id: "memory-context:persona:user-1",
							title: "Honcho persona recall",
							url: null,
							snippet: "Prefers concise answers.",
							sourceType: "memory",
						},
						{
							id: "memory-context:history:conv-cycling",
							title: "Cycling history",
							url: null,
							snippet: "Older non-project cycling discussion.",
							sourceType: "memory",
						},
					],
				},
			},
		]);
	});

	it("parses scalar memory_context metadata from tool markers", () => {
		const emitted: Array<{
			name: string;
			status: "running" | "done";
			details?: StreamToolCallDetails;
		}> = [];
		const payload = JSON.stringify({
			name: "memory_context",
			sourceType: "memory",
			metadata: {
				mode: "history",
				appliedMaxHistoryConversations: 3,
				omittedConversationCount: 2,
				nested: { ignored: true },
			},
		});

		processToolCallMarkers(
			`\u0002TOOL_END\u001f${payload}\u0003`,
			(name, _input, status, details) => {
				emitted.push({ name, status, details });
			},
		);

		expect(emitted).toEqual([
			{
				name: "memory_context",
				status: "done",
				details: {
					outputSummary: null,
					sourceType: "memory",
					candidates: [],
					metadata: {
						mode: "history",
						appliedMaxHistoryConversations: 3,
						omittedConversationCount: 2,
					},
				},
			},
		]);
	});

	it("preserves tool call ids on start and end markers", () => {
		const emitted: Array<{
			name: string;
			status: "running" | "done";
			details?: StreamToolCallDetails;
		}> = [];
		const startPayload = JSON.stringify({
			callId: "tool-call-1",
			name: "research_web",
			input: { query: "SvelteKit streaming docs" },
		});
		const endPayload = JSON.stringify({
			callId: "tool-call-1",
			name: "research_web",
			sourceType: "web",
		});

		processToolCallMarkers(
			`\u0002TOOL_START\u001f${startPayload}\u0003\u0002TOOL_END\u001f${endPayload}\u0003`,
			(name, _input, status, details) => {
				emitted.push({ name, status, details });
			},
		);

		expect(emitted).toEqual([
			{
				name: "research_web",
				status: "running",
				details: { callId: "tool-call-1" },
			},
			{
				name: "research_web",
				status: "done",
				details: {
					callId: "tool-call-1",
					outputSummary: null,
					sourceType: "web",
					candidates: [],
				},
			},
		]);
	});
});
