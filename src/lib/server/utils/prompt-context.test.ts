import { describe, expect, it } from "vitest";
import { estimateTokenCount } from "$lib/utils/tokens";
import {
	compactContextSections,
	serializeBudgetedAttachments,
} from "./prompt-context";
import type { Artifact } from "$lib/types";

function makeAttachment(overrides: Partial<Artifact> = {}): Artifact {
	return {
		id: "attachment-1",
		userId: "user-1",
		type: "source_document",
		retrievalClass: "durable",
		name: "invoice.txt",
		mimeType: "text/plain",
		sizeBytes: 1024,
		conversationId: "conv-1",
		summary: null,
		createdAt: 1,
		updatedAt: 1,
		extension: "txt",
		storagePath: null,
		contentText: null,
		metadata: null,
		...overrides,
	};
}

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

describe("serializeBudgetedAttachments", () => {
	it("uses excerpt context for a targeted question over a large attachment", () => {
		const serialized = serializeBudgetedAttachments({
			artifacts: [
				makeAttachment({
					contentText: [
						"Invoice total is 42 USD.",
						"UNRELATED_TRAILING_BODY ".repeat(4_000),
					].join("\n"),
				}),
			],
			snippets: new Map([["attachment-1", "Invoice total is 42 USD."]]),
			message: "What is the invoice total?",
			totalBudget: 600,
		});

		expect(serialized.body).toContain("Context mode: Excerpt Context");
		expect(serialized.body).toContain("Invoice total is 42 USD.");
		expect(serialized.body).not.toContain("UNRELATED_TRAILING_BODY");
		expect(serialized.estimatedTokens).toBeLessThanOrEqual(600);
		expect(serialized.items).toEqual([
			expect.objectContaining({
				id: "attachment-1",
				title: "invoice.txt",
				inclusionLevel: "excerpt",
				trimmed: false,
			}),
		]);
	});

	it("promotes a direct document task to budgeted task context", () => {
		const serialized = serializeBudgetedAttachments({
			artifacts: [
				makeAttachment({
					contentText: "Project brief section. ".repeat(1_000),
				}),
			],
			message: "Summarize this attached document.",
			totalBudget: 700,
		});

		expect(serialized.body).toContain("Context mode: Task Context");
		expect(serialized.body).toContain("[truncated]");
		expect(serialized.estimatedTokens).toBeLessThanOrEqual(700);
		expect(serialized.items).toEqual([
			expect.objectContaining({
				id: "attachment-1",
				inclusionLevel: "task",
				trimmed: true,
			}),
		]);
	});

	it("preserves breadth across multiple attached files", () => {
		const serialized = serializeBudgetedAttachments({
			artifacts: [
				makeAttachment({
					id: "attachment-1",
					name: "alpha.txt",
					contentText: "Alpha details. ".repeat(1_000),
				}),
				makeAttachment({
					id: "attachment-2",
					name: "beta.txt",
					contentText: "Beta details. ".repeat(1_000),
				}),
				makeAttachment({
					id: "attachment-3",
					name: "gamma.txt",
					contentText: "Gamma details. ".repeat(1_000),
				}),
			],
			message: "Which one mentions beta?",
			totalBudget: 900,
		});

		expect(serialized.body).toContain("Attachment: alpha.txt");
		expect(serialized.body).toContain("Attachment: beta.txt");
		expect(serialized.body).toContain("Attachment: gamma.txt");
		expect(serialized.estimatedTokens).toBeLessThanOrEqual(900);
		expect(serialized.items.map((item) => item.id)).toEqual([
			"attachment-1",
			"attachment-2",
			"attachment-3",
		]);
		for (const item of serialized.items) {
			expect(item.inclusionLevel).toBe("excerpt");
			expect(item.estimatedTokens).toBeLessThanOrEqual(300);
		}
	});
});
