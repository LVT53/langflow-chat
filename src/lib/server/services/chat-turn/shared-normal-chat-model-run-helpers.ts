import type { RuntimeConfig } from "$lib/server/config-store";
import type { ModelConfig } from "$lib/server/env";
import { inferModelContextWindow } from "$lib/server/services/model-context";
import type { PromptContextLimits } from "$lib/server/services/normal-chat-context";
import type { ModelId, ToolCallEntry } from "$lib/types";
import { deriveModelContextBudget } from "./context-budget";

const UNKNOWN_PROVIDER_MAX_MODEL_CONTEXT_FALLBACK = 150_000;

export function isEvidenceReadyToolCall(toolCall: ToolCallEntry): boolean {
	return (
		toolCall.status === "done" &&
		toolCall.metadata?.ok !== false &&
		toolCall.metadata?.evidenceReady !== false
	);
}

export function createRequestAbortSignal(
	timeoutMs: number,
	signal?: AbortSignal,
): AbortSignal | undefined {
	const timeoutSignal =
		Number.isFinite(timeoutMs) && timeoutMs > 0
			? AbortSignal.timeout(timeoutMs)
			: undefined;
	const signals = [signal, timeoutSignal].filter(
		(value): value is AbortSignal => Boolean(value),
	);
	if (signals.length === 0) return undefined;
	if (signals.length === 1) return signals[0];
	return AbortSignal.any(signals);
}

export function resolvePromptModelConfig(params: {
	modelId: ModelId;
	provider: {
		baseUrl: string;
		apiKey: string;
		modelName: string;
		displayName: string;
		maxOutputTokens?: number;
		maxModelContext?: number;
		compactionUiThreshold?: number;
		targetConstructedContext?: number;
	};
	runtimeConfig: RuntimeConfig;
}): ModelConfig {
	const baseModelConfig =
		params.modelId === "model2"
			? params.runtimeConfig.model2
			: params.runtimeConfig.model1;

	if (params.modelId === "model2") return baseModelConfig;
	if (params.modelId === "model1") return baseModelConfig;

	return {
		...baseModelConfig,
		systemPrompt:
			params.runtimeConfig.systemPrompt || baseModelConfig.systemPrompt,
		baseUrl: params.provider.baseUrl,
		apiKey: params.provider.apiKey,
		modelName: params.provider.modelName,
		displayName: params.provider.displayName,
		maxTokens: params.provider.maxOutputTokens ?? baseModelConfig.maxTokens,
	};
}

export function resolvePromptContextLimits(params: {
	modelId: ModelId;
	provider: {
		modelName?: string | null;
		maxModelContext?: number;
		compactionUiThreshold?: number;
		targetConstructedContext?: number;
	};
	runtimeConfig: RuntimeConfig;
}): PromptContextLimits | undefined {
	if (
		params.modelId !== "model1" &&
		params.modelId !== "model2" &&
		params.modelId !== undefined
	) {
		const providerBudget = deriveModelContextBudget({
			maxModelContext:
				params.provider.maxModelContext ??
				inferModelContextWindow(params.provider.modelName) ??
				UNKNOWN_PROVIDER_MAX_MODEL_CONTEXT_FALLBACK,
			compactionUiThreshold: params.provider.compactionUiThreshold,
			targetConstructedContext: params.provider.targetConstructedContext,
		});
		return {
			maxModelContext: providerBudget.maxModelContext,
			compactionUiThreshold: providerBudget.compactionUiThreshold,
			targetConstructedContext: providerBudget.targetConstructedContext,
		};
	}

	if (params.modelId === "model1") {
		return {
			maxModelContext: params.runtimeConfig.model1MaxModelContext,
			compactionUiThreshold: params.runtimeConfig.model1CompactionUiThreshold,
			targetConstructedContext:
				params.runtimeConfig.model1TargetConstructedContext,
		};
	}

	if (params.modelId === "model2") {
		return {
			maxModelContext: params.runtimeConfig.model2MaxModelContext,
			compactionUiThreshold: params.runtimeConfig.model2CompactionUiThreshold,
			targetConstructedContext:
				params.runtimeConfig.model2TargetConstructedContext,
		};
	}

	return undefined;
}
