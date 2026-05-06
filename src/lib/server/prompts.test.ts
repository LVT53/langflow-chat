import { describe, expect, it } from "vitest";

import {
	ALFYAI_NEMOTRON_PROMPT,
	getSystemPrompt,
	normalizeSystemPromptReference,
	stripDeprecatedPreserveProtocol,
} from "./prompts";

describe("prompts", () => {
	it("leaves an empty prompt unset", () => {
		expect(getSystemPrompt(undefined)).toBe("");
		expect(getSystemPrompt("")).toBe("");
	});

	it("normalizes known prompt text back to its key", () => {
		expect(normalizeSystemPromptReference(ALFYAI_NEMOTRON_PROMPT)).toBe(
			"alfyai-nemotron",
		);
	});

	it("normalizes the old fetch_content prompt body back to the current key", () => {
		const legacyPrompt = ALFYAI_NEMOTRON_PROMPT.replace(
			"| search | Search the web for information | Current events, recent facts, product research, general-topic research, verification, when connected |\n| get_contents | Fetch and read Exa search result content | Search snippets are insufficient or exact page details matter, when connected |\n| find_similar | Find pages similar to a URL | The user gives a source URL and wants similar pages, when connected |",
			"| search | Search the web for information | Current events, recent facts, product research, general-topic research, verification |\n| fetch_content | Fetch and read a specific URL | The user gives a link, search snippets are insufficient, or exact page details matter |",
		).replace(
			"Use search for web research when it is connected. Use get_contents when Exa returned result IDs and snippets are not enough. If a different content-fetching tool is connected, use the exact runtime tool name shown by the tool schema instead of inventing fetch_content.",
			"Use search for web research. Use fetch_content when the user gives a URL or when snippets are not enough.",
		);

		expect(normalizeSystemPromptReference(legacyPrompt)).toBe(
			"alfyai-nemotron",
		);
		expect(getSystemPrompt(legacyPrompt)).toBe(ALFYAI_NEMOTRON_PROMPT);
	});

	it("leaves custom prompt text untouched", () => {
		const customPrompt = "You are a custom assistant.";

		expect(normalizeSystemPromptReference(customPrompt)).toBe(customPrompt);
		expect(getSystemPrompt(customPrompt)).toBe(customPrompt);
	});

	it("teaches the unified produce_file contract in the built-in assistant prompt", () => {
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("produce_file");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("sourceMode");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("document_source");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("documentSource");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("program");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("idempotencyKey");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("requestTitle");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("requestedOutputs");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("documentIntent");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("JSON-encoded string");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("rather than a nested object or array");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain('"type": "heading"');
		expect(ALFYAI_NEMOTRON_PROMPT).toContain('"level": 2');
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("headers");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("Chart.js-style data");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("directly followed by their section content");
		expect(ALFYAI_NEMOTRON_PROMPT).not.toContain("generate_file");
		expect(ALFYAI_NEMOTRON_PROMPT).not.toContain("export_document");
		expect(ALFYAI_NEMOTRON_PROMPT).not.toContain("createPDF");
		expect(ALFYAI_NEMOTRON_PROMPT).not.toContain("Terracotta Crown");
	});

	it("removes deprecated wrapper-tag instructions from custom prompt bodies", () => {
		const legacyTagName = "preserve";
		const customPrompt = [
			"You are a custom assistant.",
			"",
			`When writing final answers, use ${legacyTagName} tags around translated content.`,
			"",
			`Every final response must start with this marker: <${legacyTagName}>.`,
			"",
			"Keep answers concise.",
		].join("\n");

		expect(stripDeprecatedPreserveProtocol(customPrompt)).toBe(
			"You are a custom assistant.\n\nKeep answers concise.",
		);
		expect(normalizeSystemPromptReference(customPrompt)).toBe(
			"You are a custom assistant.\n\nKeep answers concise.",
		);
		expect(getSystemPrompt(customPrompt)).toBe(
			"You are a custom assistant.\n\nKeep answers concise.",
		);
	});
});
