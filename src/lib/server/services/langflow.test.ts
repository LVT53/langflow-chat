import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	decryptApiKey: vi.fn(),
	getConfig: vi.fn(),
	getProviderWithSecrets: vi.fn(),
	getSystemPrompt: vi.fn(),
}));

vi.mock("../config-store", () => ({
	getConfig: mocks.getConfig,
}));

vi.mock("../prompts", () => ({
	getSystemPrompt: mocks.getSystemPrompt,
}));

vi.mock("./honcho", () => ({
	buildConstructedContext: vi.fn(),
	buildEnhancedSystemPrompt: vi.fn(),
}));

vi.mock("./attachment-trace", () => ({
	logAttachmentTrace: vi.fn(),
	summarizeAttachmentSectionInInput: vi.fn(() => ({
		hasMarker: false,
		preview: "",
		previewHash: "",
	})),
}));

vi.mock("./inference-providers", () => ({
	decryptApiKey: mocks.decryptApiKey,
	getProviderWithSecrets: mocks.getProviderWithSecrets,
}));

import { buildOutboundSystemPrompt, sendMessage } from "./langflow";

const model1 = {
	baseUrl: "http://local-model/v1",
	apiKey: "local-key",
	modelName: "local-model",
	displayName: "Local Model",
	systemPrompt: "alfyai-nemotron",
	flowId: "shared-flow",
	componentId: "ModelNode-1",
	maxTokens: 4096,
};

function mockConfig(overrides: Partial<typeof model1> = {}) {
	mocks.getConfig.mockReturnValue({
		langflowApiUrl: "http://langflow",
		langflowApiKey: "langflow-key",
		langflowFlowId: "fallback-flow",
		requestTimeoutMs: 300000,
		maxModelContext: 262144,
		compactionUiThreshold: 209715,
		targetConstructedContext: 157286,
		model1: { ...model1, ...overrides },
		model2: {
			baseUrl: "",
			apiKey: "",
			modelName: "",
			displayName: "Model 2",
			systemPrompt: "",
			flowId: "",
			componentId: "",
			maxTokens: null,
		},
	});
}

function mockLangflowResponse() {
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						outputs: [
							{
								outputs: [
									{ results: { message: { text: "Provider answer" } } },
								],
							},
						],
					}),
					{
						status: 200,
						headers: { "Content-Type": "application/json" },
					},
				),
		),
	);
}

describe("buildOutboundSystemPrompt", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("keeps always-on date, generated-file, and image-search guidance with custom prompts", () => {
		const prompt = buildOutboundSystemPrompt({
			basePrompt: "Custom system prompt",
			inputValue: "Create a downloadable PDF with photos of Amsterdam.",
			modelDisplayName: "Provider Model",
		});

		expect(prompt).toContain("[MODEL: Provider Model]");
		expect(prompt).toContain("Response language policy");
		expect(prompt).toContain("Detected latest user-message language: English");
		expect(prompt).toContain("Time-sensitive search workflow");
		expect(prompt).toContain("Generated file workflow");
		expect(prompt).toContain("If the user asks for a downloadable file");
		expect(prompt).toContain("Image search workflow");
		expect(prompt).toContain("image_search");
		expect(prompt).toContain("research_web");
		expect(prompt).toContain("Exact web facts and prices");
		expect(prompt).toContain("do not rely on search-result snippets alone");
		expect(prompt).toContain(
			"get_contents` expects a JSON argument like {urls:",
		);
	});

	it("places the selected personality style after generic tool guidance so it controls visible answer style", () => {
		const prompt = buildOutboundSystemPrompt({
			basePrompt: "Base system prompt",
			inputValue: "Explain this briefly.",
			personalityPrompt: "Be extremely concise.",
		});

		expect(prompt).toContain("## Tool And Search Guidance");
		expect(prompt).toContain("## Response Style");
		expect(prompt.indexOf("## Response Style")).toBeGreaterThan(
			prompt.indexOf("## Tool And Search Guidance"),
		);
		expect(prompt).toContain("Be extremely concise.");
	});

	it("uses the raw latest user-message language for visible response guidance", () => {
		const prompt = buildOutboundSystemPrompt({
			basePrompt: "Base system prompt",
			inputValue:
				"Retrieved web context in English.\n\nUser message: Kérlek foglald össze magyarul a termék teszteket.",
			responseLanguage: "hu",
		});

		expect(prompt).toContain(
			"Detected latest user-message language: Hungarian",
		);
		expect(prompt).toContain(
			"Tool outputs, web research briefs, source snippets, source titles, citations, and diagnostics may be in another language",
		);
		expect(prompt).toContain("Do not mix English and Hungarian");
	});
});

describe("sendMessage provider routing", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockConfig();
		mockLangflowResponse();
		mocks.getSystemPrompt.mockReturnValue("Base system prompt");
		mocks.decryptApiKey.mockReturnValue("provider-secret");
		mocks.getProviderWithSecrets.mockResolvedValue({
			id: "provider-1",
			name: "fireworks",
			displayName: "Fireworks Model",
			baseUrl: "https://api.fireworks.ai/inference/v1",
			apiKeyEncrypted: "encrypted",
			apiKeyIv: "iv",
			modelName: "accounts/fireworks/models/kimi-k2",
			reasoningEffort: "high",
			thinkingType: "enabled",
			enabled: true,
			sortOrder: 0,
			maxModelContext: null,
			compactionUiThreshold: null,
			targetConstructedContext: null,
			maxMessageLength: null,
			maxTokens: 8192,
			createdAt: new Date(),
			updatedAt: new Date(),
		});
	});

	it("runs provider models through the shared Langflow flow with component-scoped tweaks", async () => {
		await sendMessage("Hello", "conv-1", "provider:provider-1");

		expect(fetch).toHaveBeenCalledWith(
			"http://langflow/api/v1/run/shared-flow",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({ "x-api-key": "langflow-key" }),
			}),
		);

		const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
		expect(body.session_id).toBe("conv-1");
		expect(body.input_value).toBe("Hello");
		expect(body.tweaks).toMatchObject({
			"ModelNode-1": {
				model_name: "accounts/fireworks/models/kimi-k2",
				api_base: "https://api.fireworks.ai/inference/v1",
				api_key: "provider-secret",
				timeout: 300,
				max_tokens: 8192,
				enable_thinking: false,
				thinking_type: "enabled",
			},
		});
		expect(body.tweaks["ModelNode-1"]).not.toHaveProperty("reasoning_effort");
		expect(body.tweaks["ModelNode-1"].system_prompt).toContain(
			"[MODEL: Fireworks Model]",
		);
	});

	it("passes Hungarian response-language policy into Langflow requests", async () => {
		await sendMessage(
			"Kérlek foglald össze magyarul a legfontosabb webes forrásokat.",
			"conv-1",
			"model1",
		);

		const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
		expect(body.tweaks["ModelNode-1"].system_prompt).toContain(
			"Detected latest user-message language: Hungarian",
		);
		expect(body.tweaks["ModelNode-1"].system_prompt).toContain(
			"Tool outputs, web research briefs",
		);
	});

	it("normalizes provider API bases before sending Langflow model tweaks", async () => {
		mocks.getProviderWithSecrets.mockResolvedValueOnce({
			id: "provider-1",
			name: "fireworks",
			displayName: "Fireworks Model",
			baseUrl: "https://api.fireworks.ai/inference",
			apiKeyEncrypted: "encrypted",
			apiKeyIv: "iv",
			modelName: "accounts/fireworks/models/kimi-k2p5",
			reasoningEffort: null,
			thinkingType: null,
			enabled: true,
			sortOrder: 0,
			maxModelContext: null,
			compactionUiThreshold: null,
			targetConstructedContext: null,
			maxMessageLength: null,
			maxTokens: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		await sendMessage("Hello", "conv-1", "provider:provider-1");

		const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
		expect(body.tweaks).toMatchObject({
			"ModelNode-1": {
				model_name: "accounts/fireworks/models/kimi-k2p5",
				api_base: "https://api.fireworks.ai/inference/v1",
				timeout: 300,
				enable_thinking: false,
			},
		});
		expect(body.tweaks["ModelNode-1"]).not.toHaveProperty(
			"chat_template_kwargs",
		);
		expect(body.tweaks["ModelNode-1"]).not.toHaveProperty("thinking_type");
	});

	it("sends provider reasoning effort only when thinking.type is not set", async () => {
		mocks.getProviderWithSecrets.mockResolvedValueOnce({
			id: "provider-1",
			name: "fireworks",
			displayName: "Fireworks Model",
			baseUrl: "https://api.fireworks.ai/inference/v1",
			apiKeyEncrypted: "encrypted",
			apiKeyIv: "iv",
			modelName: "accounts/fireworks/models/kimi-k2p6",
			reasoningEffort: "high",
			thinkingType: null,
			enabled: true,
			sortOrder: 0,
			maxModelContext: null,
			compactionUiThreshold: null,
			targetConstructedContext: null,
			maxMessageLength: null,
			maxTokens: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		await sendMessage("Hello", "conv-1", "provider:provider-1");

		const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
		expect(body.tweaks).toMatchObject({
			"ModelNode-1": {
				enable_thinking: false,
				reasoning_effort: "high",
			},
		});
		expect(body.tweaks["ModelNode-1"]).not.toHaveProperty("thinking_type");
	});

	it("sends reasoning_effort for Mistral Medium 3.5 even when thinking.type is configured", async () => {
		mocks.getProviderWithSecrets.mockResolvedValueOnce({
			id: "provider-1",
			name: "local-vllm",
			displayName: "Mistral Medium 3.5",
			baseUrl: "http://localhost:8000/v1",
			apiKeyEncrypted: "encrypted",
			apiKeyIv: "iv",
			modelName: "mistralai/Mistral-Medium-3.5-128B",
			reasoningEffort: "high",
			thinkingType: "enabled",
			enabled: true,
			sortOrder: 0,
			maxModelContext: null,
			compactionUiThreshold: null,
			targetConstructedContext: null,
			maxMessageLength: null,
			maxTokens: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		});

		await sendMessage("Think carefully", "conv-1", "provider:provider-1");

		const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
		expect(body.tweaks).toMatchObject({
			"ModelNode-1": {
				model_name: "mistralai/Mistral-Medium-3.5-128B",
				api_base: "http://localhost:8000/v1",
				enable_thinking: false,
				reasoning_effort: "high",
			},
		});
		expect(body.tweaks["ModelNode-1"]).not.toHaveProperty("thinking_type");
	});

	it("enables reasoning capture for built-in Qwen models routed through the custom Langflow node", async () => {
		mockConfig({ modelName: "qwen3-6-35b" });

		await sendMessage("Hello", "conv-1", "model1");

		const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
		expect(body.tweaks).toMatchObject({
			"ModelNode-1": {
				model_name: "qwen3-6-35b",
				timeout: 300,
				enable_thinking: true,
			},
		});
	});

	it("fails clearly when provider routing has no shared Langflow component ID", async () => {
		mockConfig({ componentId: "" });

		await expect(
			sendMessage("Hello", "conv-1", "provider:provider-1"),
		).rejects.toThrow(/MODEL_1_COMPONENT_ID/);
		expect(fetch).not.toHaveBeenCalled();
	});
});
