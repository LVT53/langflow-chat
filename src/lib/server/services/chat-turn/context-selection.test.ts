import { describe, expect, it } from "vitest";
import { estimateTokenCount } from "$lib/utils/tokens";
import { selectPromptContext } from "./context-selection";

describe("selectPromptContext", () => {
	it("assembles budgeted prompt context and trace sections from multiple sources", () => {
		const selected = selectPromptContext({
			intro: "Context bundle:",
			message: "What should I do next?",
			targetTokens: 140,
			candidates: [
				{
					title: "Task State",
					body: "Current task: Ship context selection.",
					source: "task_state",
					layer: "task_state",
					protected: true,
					signalReasons: ["active_task"],
				},
				{
					title: "Current Attachments",
					body: "Attachment: plan.md\nContext mode: Excerpt Context\nRelevant plan excerpt.",
					source: "attachment",
					layer: "documents",
					protected: true,
					itemIds: ["artifact-1"],
					itemTitles: ["plan.md"],
					signalReasons: ["attachment_context:excerpt"],
				},
				{
					title: "Honcho Session Context",
					body: "UNRELATED_HISTORY ".repeat(1_000),
					source: "session",
					layer: "session",
					signalReasons: ["recent_turn_context:budgeted"],
				},
			],
		});

		expect(selected.inputValue).toContain("## Task State");
		expect(selected.inputValue).toContain("## Current Attachments");
		expect(selected.inputValue).toContain("## Current User Message");
		expect(selected.inputValue).not.toContain("UNRELATED_HISTORY");
		expect(selected.estimatedTokens).toBeLessThanOrEqual(140);
		expect(estimateTokenCount(selected.inputValue)).toBe(
			selected.estimatedTokens,
		);
		expect(selected.contextTraceSections).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "Task State",
					source: "task_state",
					protected: true,
					inclusionLevel: "legacy_full",
					signalReasons: ["active_task"],
				}),
				expect.objectContaining({
					name: "Current Attachments",
					source: "attachment",
					itemIds: ["artifact-1"],
					itemTitles: ["plan.md"],
					protected: true,
				}),
				expect.objectContaining({
					name: "Honcho Session Context",
					source: "session",
					inclusionLevel: "omitted",
				}),
				expect.objectContaining({
					name: "Current User Message",
					source: "user",
				}),
			]),
		);
	});

	it("drops weaker awareness context before stronger core context under pressure", () => {
		const selected = selectPromptContext({
			intro: "Context bundle:",
			message: "Summarize the attached plan.",
			targetTokens: 70,
			candidates: [
				{
					title: "User Memory",
					body: "Weak preference memory. ".repeat(5),
					source: "memory",
					layer: "session",
					budgetPriority: "awareness",
				},
				{
					title: "Current Attachments",
					body: "Attachment: plan.md\nContext mode: Task Context\nCore attachment excerpt.",
					source: "attachment",
					layer: "documents",
					protected: true,
					budgetPriority: "core",
					signalReasons: ["attachment_context:task"],
				},
			],
		});

		expect(selected.inputValue).toContain("## Current Attachments");
		expect(selected.inputValue).not.toContain("## User Memory");
		expect(selected.contextTraceSections).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "Current Attachments",
					inclusionLevel: "legacy_full",
				}),
				expect.objectContaining({
					name: "User Memory",
					inclusionLevel: "omitted",
				}),
			]),
		);
	});
});
