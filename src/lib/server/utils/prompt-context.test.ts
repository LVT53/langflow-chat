import { describe, expect, it } from "vitest";
import { estimateTokenCount } from "$lib/utils/tokens";
import { compactContextSections } from "./prompt-context";

describe("compactContextSections", () => {
	it("downgrades protected context before dropping it and stays within budget", () => {
		const compacted = compactContextSections({
			intro: "Context bundle:",
			message: "What should I do next?",
			targetTokens: 80,
			sections: [
				{
					title: "Task State",
					body: "Important task state. ".repeat(400),
					layer: "task_state",
					protected: true,
				},
			],
		});

		expect(compacted.inputValue).toContain("## Task State");
		expect(compacted.inputValue).toContain("[truncated]");
		expect(compacted.estimatedTokens).toBeLessThanOrEqual(80);
		expect(estimateTokenCount(compacted.inputValue)).toBe(
			compacted.estimatedTokens,
		);
		expect(compacted.sectionSelections).toEqual([
			expect.objectContaining({
				title: "Task State",
				protected: true,
				trimmed: true,
				inclusionLevel: "trimmed",
			}),
		]);
	});

	it("preserves the current user message separately from protected context", () => {
		const compacted = compactContextSections({
			intro: "Context bundle:",
			message: "Keep this exact user question.",
			targetTokens: 8,
			sections: [
				{
					title: "Task State",
					body: "Important task state. ".repeat(400),
					layer: "task_state",
					protected: true,
				},
			],
		});

		expect(compacted.inputValue).toContain(
			"## Current User Message\nKeep this exact user question.",
		);
		expect(compacted.inputValue).not.toContain("## Task State");
		expect(compacted.sectionSelections).toEqual([
			expect.objectContaining({
				title: "Task State",
				protected: true,
				trimmed: false,
				inclusionLevel: "omitted",
				estimatedTokens: 0,
			}),
		]);
	});
});
