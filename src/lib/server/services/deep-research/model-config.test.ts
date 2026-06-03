import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "$lib/server/config-store";

let runtimeConfig: RuntimeConfig;
const getProviderWithSecrets = vi.fn();
const listEnabledProviderModels = vi.fn();

vi.mock("$lib/server/config-store", () => ({
	getConfig: () => runtimeConfig,
}));

vi.mock("$lib/server/services/providers", () => ({
	getProviderWithSecrets: (id: string) => getProviderWithSecrets(id),
}));

vi.mock("$lib/server/services/provider-models", () => ({
	listEnabledProviderModels: (providerId?: string) =>
		listEnabledProviderModels(providerId),
}));

import {
	DEEP_RESEARCH_MODEL_ROLES,
	resolveDeepResearchModel,
} from "./model-config";

function baseConfig(): RuntimeConfig {
	return {
		model1: {
			baseUrl: "https://model-one.example/v1",
			apiKey: "",
			modelName: "model-one",
			displayName: "Model One",
			systemPrompt: "",
			maxTokens: 4096,
			reasoningEffort: null,
			thinkingType: null,
		},
		model2: {
			baseUrl: "https://model-two.example/v1",
			apiKey: "",
			modelName: "model-two",
			displayName: "Model Two",
			systemPrompt: "",
			maxTokens: 8192,
			reasoningEffort: null,
			thinkingType: null,
		},
		model2Enabled: true,
		model1MaxModelContext: 100_000,
		model1CompactionUiThreshold: 80_000,
		model1TargetConstructedContext: 60_000,
		model1MaxMessageLength: 12_000,
		model2MaxModelContext: 200_000,
		model2CompactionUiThreshold: 160_000,
		model2TargetConstructedContext: 120_000,
		model2MaxMessageLength: 24_000,
		maxModelContext: 50_000,
		compactionUiThreshold: 40_000,
		targetConstructedContext: 30_000,
		maxMessageLength: 10_000,
		deepResearchModels: {
			plan_generation: "model1",
			plan_revision: "model1",
			source_review: "model1",
			research_task: "model1",
			synthesis: "model1",
			citation_audit: "model1",
			report_writing: "model1",
		},
	} as RuntimeConfig;
}

describe("Deep Research model configuration", () => {
	beforeEach(() => {
		runtimeConfig = baseConfig();
		getProviderWithSecrets.mockReset();
		listEnabledProviderModels.mockReset();
	});

	it("exposes every model-call role in the current Deep Research workflow", () => {
		expect(DEEP_RESEARCH_MODEL_ROLES.map((role) => role.id)).toEqual([
			"plan_generation",
			"plan_revision",
			"source_review",
			"research_task",
			"synthesis",
			"citation_audit",
			"report_writing",
		]);
	});

	it("resolves provider roles through the existing model list and infers provider limits", async () => {
		runtimeConfig.deepResearchModels.source_review = "provider:openrouter";
		getProviderWithSecrets.mockResolvedValue({
			name: "anthropic/claude-sonnet-4",
			displayName: "OpenRouter Research",
			baseUrl: "https://openrouter.ai/api/v1",
			enabled: true,
		});
		listEnabledProviderModels.mockResolvedValue([
			{
				maxModelContext: 180_000,
				compactionUiThreshold: 144_000,
				targetConstructedContext: 108_000,
			},
		]);

		const resolved = await resolveDeepResearchModel("source_review");

		expect(resolved).toMatchObject({
			role: "source_review",
			modelId: "provider:openrouter",
			modelDisplayName: "OpenRouter Research",
			providerId: "openrouter",
			providerDisplayName: "OpenRouter Research",
			providerModelName: "anthropic/claude-sonnet-4",
			limits: {
				maxModelContext: 180_000,
				compactionUiThreshold: 144_000,
				targetConstructedContext: 108_000,
				maxMessageLength: 10_000,
				maxTokens: null,
			},
		});
	});

	it("derives optional provider target and threshold limits from configured max model context", async () => {
		runtimeConfig.deepResearchModels.research_task = "provider:deep-provider";
		getProviderWithSecrets.mockResolvedValue({
			name: "deep-provider/large-context",
			displayName: "Deep Provider",
			baseUrl: "https://api.deep-provider.example/v1",
			enabled: true,
		});
		listEnabledProviderModels.mockResolvedValue([
			{
				maxModelContext: 1_000_000,
				compactionUiThreshold: null,
				targetConstructedContext: null,
			},
		]);

		await expect(
			resolveDeepResearchModel("research_task"),
		).resolves.toMatchObject({
			modelId: "provider:deep-provider",
			limits: {
				maxModelContext: 1_000_000,
				compactionUiThreshold: 800_000,
				targetConstructedContext: 900_000,
				maxMessageLength: 10_000,
				maxTokens: null,
			},
		});
	});

	it("falls back to the unknown-provider safety default when no model context is configured", async () => {
		runtimeConfig.deepResearchModels.synthesis = "provider:gpt";
		getProviderWithSecrets.mockResolvedValue({
			name: "openai/gpt-4.1",
			displayName: "GPT Provider",
			baseUrl: "https://api.gpt-provider.example/v1",
			enabled: true,
		});
		listEnabledProviderModels.mockResolvedValue([
			{
				maxModelContext: null,
				compactionUiThreshold: null,
				targetConstructedContext: null,
			},
		]);

		await expect(resolveDeepResearchModel("synthesis")).resolves.toMatchObject({
			modelId: "provider:gpt",
			limits: {
				maxModelContext: 150_000,
				compactionUiThreshold: 120_000,
				targetConstructedContext: 135_000,
				maxMessageLength: 10_000,
				maxTokens: null,
			},
		});
	});

	it("uses the provider safety fallback for unknown provider context capacity", async () => {
		runtimeConfig.deepResearchModels.citation_audit = "provider:unknown";
		getProviderWithSecrets.mockResolvedValue({
			name: "vendor/custom-model",
			displayName: "Unknown Provider",
			baseUrl: "https://api.unknown-provider.example/v1",
			enabled: true,
		});
		listEnabledProviderModels.mockResolvedValue([
			{
				maxModelContext: null,
				compactionUiThreshold: null,
				targetConstructedContext: null,
			},
		]);

		await expect(
			resolveDeepResearchModel("citation_audit"),
		).resolves.toMatchObject({
			modelId: "provider:unknown",
			limits: {
				maxModelContext: 150_000,
				compactionUiThreshold: 120_000,
				targetConstructedContext: 135_000,
				maxMessageLength: 10_000,
				maxTokens: null,
			},
		});
	});

	it("falls back to Model 1 when a configured role points at a disabled provider or disabled Model 2", async () => {
		runtimeConfig.deepResearchModels.synthesis = "provider:disabled";
		getProviderWithSecrets.mockResolvedValueOnce({
			name: "disabled",
			displayName: "Disabled",
			enabled: false,
		});

		await expect(resolveDeepResearchModel("synthesis")).resolves.toMatchObject({
			modelId: "model1",
			modelDisplayName: "Model One",
			limits: {
				maxModelContext: 100_000,
				maxTokens: 4096,
			},
		});

		runtimeConfig.model2Enabled = false;
		runtimeConfig.deepResearchModels.report_writing = "model2";

		await expect(
			resolveDeepResearchModel("report_writing"),
		).resolves.toMatchObject({
			modelId: "model1",
			modelDisplayName: "Model One",
		});
	});
});
