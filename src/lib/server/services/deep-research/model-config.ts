import {
	DEEP_RESEARCH_MODEL_ROLES,
	type DeepResearchModelRole,
	type DeepResearchModelSelections,
} from "$lib/deep-research-models";
import type { ModelId } from "$lib/types";
import { getConfig, getProviderById, type RuntimeConfig } from "$lib/server/config-store";

export { DEEP_RESEARCH_MODEL_ROLES };
export type { DeepResearchModelRole, DeepResearchModelSelections };

export type ResolvedDeepResearchModel = {
	role: DeepResearchModelRole;
	modelId: ModelId;
	modelDisplayName: string;
	providerId: string | null;
	providerDisplayName: string | null;
	providerBaseUrl: string | null;
	providerModelName: string | null;
	limits: {
		maxModelContext: number;
		compactionUiThreshold: number;
		targetConstructedContext: number;
		maxMessageLength: number;
		maxTokens: number | null;
	};
};

export async function resolveDeepResearchModel(
	role: DeepResearchModelRole,
	config: RuntimeConfig = getConfig(),
): Promise<ResolvedDeepResearchModel> {
	const configuredModelId = config.deepResearchModels?.[role] ?? "model1";
	if (configuredModelId.startsWith("provider:")) {
		const providerId = configuredModelId.slice("provider:".length);
		const provider = await getProviderById(providerId).catch(() => null);
		if (provider?.enabled) {
			return {
				role,
				modelId: configuredModelId,
				modelDisplayName: provider.displayName,
				providerId,
				providerDisplayName: provider.displayName,
				providerBaseUrl: provider.baseUrl,
				providerModelName: provider.modelName,
				limits: {
					maxModelContext:
						provider.maxModelContext ?? config.maxModelContext,
					compactionUiThreshold:
						provider.compactionUiThreshold ?? config.compactionUiThreshold,
					targetConstructedContext:
						provider.targetConstructedContext ??
						config.targetConstructedContext,
					maxMessageLength:
						provider.maxMessageLength ?? config.maxMessageLength,
					maxTokens: provider.maxTokens ?? null,
				},
			};
		}
	}

	if (configuredModelId === "model2" && config.model2Enabled !== false) {
		return {
			role,
			modelId: "model2",
			modelDisplayName: config.model2.displayName,
			providerId: null,
			providerDisplayName: null,
			providerBaseUrl: config.model2.baseUrl,
			providerModelName: config.model2.modelName,
			limits: {
				maxModelContext: config.model2MaxModelContext,
				compactionUiThreshold: config.model2CompactionUiThreshold,
				targetConstructedContext: config.model2TargetConstructedContext,
				maxMessageLength: config.model2MaxMessageLength,
				maxTokens: config.model2.maxTokens,
			},
		};
	}

	return {
		role,
		modelId: "model1",
		modelDisplayName: config.model1.displayName,
		providerId: null,
		providerDisplayName: null,
		providerBaseUrl: config.model1.baseUrl,
		providerModelName: config.model1.modelName,
		limits: {
			maxModelContext: config.model1MaxModelContext,
			compactionUiThreshold: config.model1CompactionUiThreshold,
			targetConstructedContext: config.model1TargetConstructedContext,
			maxMessageLength: config.model1MaxMessageLength,
			maxTokens: config.model1.maxTokens,
		},
	};
}

export async function resolveAllDeepResearchModels(
	config: RuntimeConfig = getConfig(),
): Promise<Record<DeepResearchModelRole, ResolvedDeepResearchModel>> {
	const entries = await Promise.all(
		DEEP_RESEARCH_MODEL_ROLES.map(async (role) => [
			role.id,
			await resolveDeepResearchModel(role.id, config),
		]),
	);
	return Object.fromEntries(entries) as Record<
		DeepResearchModelRole,
		ResolvedDeepResearchModel
	>;
}
