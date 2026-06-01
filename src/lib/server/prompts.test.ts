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

	it("normalizes the old file-production prompt body back to the current key", () => {
		const legacyPrompt = ALFYAI_NEMOTRON_PROMPT.replace(
			"Every produce_file call includes idempotencyKey, requestTitle, requestedOutputs, sourceMode, and documentIntent. Optional fields are templateHint, documentSource, and program. The active conversationId is supplied by the tool runtime, not by you. requestedOutputs remains a JSON-encoded array string because Langflow exposes it as text. Pass documentSource and program as nested objects, not JSON-encoded strings.",
			"Every produce_file call includes idempotencyKey, requestTitle, requestedOutputs, sourceMode, and documentIntent. Optional fields are templateHint, documentSource, and program. The active conversationId is supplied by the tool runtime, not by you. Langflow validates requestedOutputs, documentSource, and program as text fields before the tool runs, so pass each one as a JSON-encoded string rather than a nested object or array.",
		).replace(
			'For CSV, JSON, TXT, Markdown, CSS, JavaScript/TypeScript, shell scripts, SVG, ZIP, XLSX, PPTX, custom DOCX/ODT packaging, and other code-generated artifacts, use sourceMode: "program" with program as an object containing language, sourceCode, and optional filename.',
			'For CSV, JSON, TXT, Markdown, CSS, JavaScript/TypeScript, shell scripts, SVG, ZIP, XLSX, PPTX, custom DOCX/ODT packaging, and other code-generated artifacts, use sourceMode: "program" with program as a JSON string containing language, sourceCode, and optional filename.',
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
		expect(ALFYAI_NEMOTRON_PROMPT).toContain(
			"CSS, JavaScript/TypeScript, shell scripts",
		);
		expect(ALFYAI_NEMOTRON_PROMPT).toContain('"type":"css"');
		expect(ALFYAI_NEMOTRON_PROMPT).toContain('"type":"js"');
		expect(ALFYAI_NEMOTRON_PROMPT).toContain('"type":"sh"');
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("idempotencyKey");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("requestTitle");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("requestedOutputs");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("documentIntent");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain(
			"requestedOutputs remains a JSON-encoded array string",
		);
		expect(ALFYAI_NEMOTRON_PROMPT).toContain(
			"Pass documentSource and program as nested objects",
		);
		expect(ALFYAI_NEMOTRON_PROMPT).not.toContain(
			"documentSource, and program as text fields",
		);
		expect(ALFYAI_NEMOTRON_PROMPT).not.toContain(
			"rather than a nested object or array",
		);
		expect(ALFYAI_NEMOTRON_PROMPT).toContain('"type": "heading"');
		expect(ALFYAI_NEMOTRON_PROMPT).toContain('"level": 2');
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("headers");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain("Chart.js-style data");
		expect(ALFYAI_NEMOTRON_PROMPT).toContain(
			"directly followed by their section content",
		);
		expect(ALFYAI_NEMOTRON_PROMPT).not.toContain("generate_file");
		expect(ALFYAI_NEMOTRON_PROMPT).not.toContain("export_document");
		expect(ALFYAI_NEMOTRON_PROMPT).not.toContain("createPDF");
		expect(ALFYAI_NEMOTRON_PROMPT).not.toContain("Terracotta Crown");
	});

	it("does not force English-only answers in the built-in assistant prompt", () => {
		expect(ALFYAI_NEMOTRON_PROMPT).not.toMatch(
			/always respond in english|every word you write must be in english|never attempt to generate text in hungarian|non-english language|dedicated translation layer/i,
		);
	});

	it("removes the obsolete translation contract from stored prompt bodies", () => {
		const obsoleteTranslationContract = [
			"## Translation Layer Contract — Critical",
			"",
			"You ALWAYS respond in English. Every word you write must be in English.",
			"Never attempt to generate text in Hungarian, German, French, or any other non-English language, even if the user asks you to.",
			"The system has a dedicated translation layer that handles language conversion automatically.",
			"If you write in another language yourself, the output can be garbled.",
		].join("\n");
		const oldBuiltInPrompt = ALFYAI_NEMOTRON_PROMPT.replace(
			"## Content Preservation",
			`${obsoleteTranslationContract}\n\n## Content Preservation`,
		);
		const customPrompt = [
			"You are a custom assistant.",
			"",
			obsoleteTranslationContract,
			"",
			"Respect the user's requested response language.",
		].join("\n");

		expect(normalizeSystemPromptReference(oldBuiltInPrompt)).toBe(
			"alfyai-nemotron",
		);
		expect(getSystemPrompt(oldBuiltInPrompt)).toBe(ALFYAI_NEMOTRON_PROMPT);
		expect(getSystemPrompt(customPrompt)).toBe(
			"You are a custom assistant.\n\nRespect the user's requested response language.",
		);
		expect(getSystemPrompt(customPrompt)).not.toContain(
			"dedicated translation layer",
		);
		expect(getSystemPrompt(customPrompt)).not.toContain(
			"output can be garbled",
		);
	});

	it("removes the obsolete translation contract from stored prompts without the legacy heading", () => {
		const customPrompt = [
			"You are a custom assistant.",
			"",
			"You ALWAYS respond in English. Every word you write must be in English.",
			"Never attempt to generate text in Hungarian, German, French, or any other non-English language, even if the user asks you to.",
			"The system has a dedicated translation layer that handles language conversion automatically.",
			"If you write in another language yourself, the output can be garbled.",
			"",
			"Reply in the latest user-message language by default.",
		].join("\n");

		expect(getSystemPrompt(customPrompt)).toBe(
			"You are a custom assistant.\n\nReply in the latest user-message language by default.",
		);
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
