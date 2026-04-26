// Runtime config store: merges env vars with admin_config DB overrides.
// All services should call getConfig() instead of importing from env.ts directly.

import type { ModelConfig } from "./env";
import { config as envConfig } from "./env";

export type { ModelConfig } from "./env";

import type { ModelId } from "$lib/types";
import { db } from "./db";
import { adminConfig } from "./db/schema";
import { getSystemPrompt, normalizeSystemPromptReference } from "./prompts";

export const ADMIN_CONFIG_KEYS = [
	"MAX_MESSAGE_LENGTH",
	"MAX_MODEL_CONTEXT",
	"COMPACTION_UI_THRESHOLD",
	"TARGET_CONSTRUCTED_CONTEXT",
	"MODEL_1_MAX_MODEL_CONTEXT",
	"MODEL_1_COMPACTION_UI_THRESHOLD",
	"MODEL_1_TARGET_CONSTRUCTED_CONTEXT",
	"MODEL_1_MAX_MESSAGE_LENGTH",
	"MODEL_2_MAX_MODEL_CONTEXT",
	"MODEL_2_COMPACTION_UI_THRESHOLD",
	"MODEL_2_TARGET_CONSTRUCTED_CONTEXT",
	"MODEL_2_MAX_MESSAGE_LENGTH",
	"WORKING_SET_DOCUMENT_TOKEN_BUDGET",
	"WORKING_SET_PROMPT_TOKEN_BUDGET",
	"SMALL_FILE_THRESHOLD_CHARS",
	"MODEL_1_BASEURL",
	"MODEL_1_NAME",
	"MODEL_1_DISPLAY_NAME",
	"MODEL_1_SYSTEM_PROMPT",
	"MODEL_1_FLOW_ID",
	"MODEL_1_COMPONENT_ID",
	"MODEL_2_BASEURL",
	"MODEL_2_NAME",
	"MODEL_2_DISPLAY_NAME",
	"MODEL_2_SYSTEM_PROMPT",
	"MODEL_2_FLOW_ID",
	"MODEL_2_COMPONENT_ID",
	"MODEL_2_ENABLED",
	"TRANSLATOR_URL",
	"TRANSLATOR_MODEL",
	"TRANSLATION_MAX_TOKENS",
	"TRANSLATION_TEMPERATURE",
	"TITLE_GEN_URL",
	"TITLE_GEN_MODEL",
	"TITLE_GEN_SYSTEM_PROMPT_EN",
	"TITLE_GEN_SYSTEM_PROMPT_HU",
	"TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_EN",
	"TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_HU",
	"CONTEXT_SUMMARIZER_URL",
	"CONTEXT_SUMMARIZER_MODEL",
	"TEI_EMBEDDER_URL",
	"TEI_EMBEDDER_MODEL",
	"TEI_EMBEDDER_BATCH_SIZE",
	"TEI_RERANKER_URL",
	"TEI_RERANKER_MODEL",
	"TEI_RERANKER_MAX_TEXTS",
	"HONCHO_ENABLED",
	"HONCHO_CONTEXT_WAIT_MS",
	"HONCHO_PERSONA_CONTEXT_WAIT_MS",
	"HONCHO_OVERVIEW_WAIT_MS",
	"MINERU_API_URL",
	"MINERU_TIMEOUT_MS",
	"SYSTEM_PROMPT",
	"MAX_FILE_UPLOAD_SIZE",
	"MAX_PROVIDER_TOOL_ROUNDS",
] as const;

export type AdminConfigKey = (typeof ADMIN_CONFIG_KEYS)[number];

export interface RuntimeConfig {
	langflowApiUrl: string;
	langflowApiKey: string;
	langflowFlowId: string;
	langflowWebhookSecret: string;
	attachmentTraceDebug: boolean;
	translatorUrl: string;
	translatorApiKey: string;
	translatorModel: string;
	translationMaxTokens: number;
	translationTemperature: number;
	titleGenUrl: string;
	titleGenApiKey: string;
	titleGenModel: string;
	titleGenSystemPromptEn: string;
	titleGenSystemPromptHu: string;
	titleGenSystemPromptCodeAppendixEn: string;
	titleGenSystemPromptCodeAppendixHu: string;
	contextSummarizerUrl: string;
	contextSummarizerApiKey: string;
	contextSummarizerModel: string;
	teiEmbedderUrl: string;
	teiEmbedderApiKey: string;
	teiEmbedderModel: string;
	teiEmbedderBatchSize: number;
	teiRerankerUrl: string;
	teiRerankerApiKey: string;
	teiRerankerModel: string;
	teiRerankerMaxTexts: number;
	teiTimeoutMs: number;
	webhookPort: number;
	requestTimeoutMs: number;
	maxMessageLength: number;
	maxModelContext: number;
	compactionUiThreshold: number;
	targetConstructedContext: number;
	model1MaxModelContext: number;
	model1CompactionUiThreshold: number;
	model1TargetConstructedContext: number;
	model1MaxMessageLength: number;
	model2MaxModelContext: number;
	model2CompactionUiThreshold: number;
	model2TargetConstructedContext: number;
	model2MaxMessageLength: number;
	workingSetDocumentTokenBudget: number;
	workingSetPromptTokenBudget: number;
	smallFileThresholdChars: number;
	sessionSecret: string;
	databasePath: string;
	model1: ModelConfig;
	model2: ModelConfig;
	model2Enabled: boolean;
	honchoApiKey: string;
	honchoBaseUrl: string;
	honchoWorkspace: string;
	honchoIdentityNamespace: string;
	honchoEnabled: boolean;
	honchoContextWaitMs: number;
	honchoPersonaContextWaitMs: number;
	honchoOverviewWaitMs: number;
	memoryMaintenanceIntervalMinutes: number;
	mineruApiUrl: string;
	mineruTimeoutMs: number;
	braveSearchApiKey: string;
	concurrentStreamLimit: number;
	perUserStreamLimit: number;
	systemPrompt: string;
	maxFileUploadSize: number;
	maxProviderToolRounds: number;
}

function buildDefaultConfig(): RuntimeConfig {
	return {
		...envConfig,
		model1: { ...envConfig.model1 },
		model2: { ...envConfig.model2 },
		braveSearchApiKey: envConfig.braveSearchApiKey,
	};
}

let runtimeConfig: RuntimeConfig = buildDefaultConfig();

type OverrideApplier = (config: RuntimeConfig, value: string) => void;

function parseIntOverride(value: string): number | undefined {
	const parsed = parseInt(value, 10);
	return Number.isNaN(parsed) ? undefined : parsed;
}

const overrideAppliers: Record<AdminConfigKey, OverrideApplier> = {
	MAX_MESSAGE_LENGTH: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.maxMessageLength = parsed;
	},
	MAX_MODEL_CONTEXT: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.maxModelContext = parsed;
	},
	COMPACTION_UI_THRESHOLD: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.compactionUiThreshold = parsed;
	},
	TARGET_CONSTRUCTED_CONTEXT: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.targetConstructedContext = parsed;
	},
	MODEL_1_MAX_MODEL_CONTEXT: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.model1MaxModelContext = parsed;
	},
	MODEL_1_COMPACTION_UI_THRESHOLD: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.model1CompactionUiThreshold = parsed;
	},
	MODEL_1_TARGET_CONSTRUCTED_CONTEXT: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.model1TargetConstructedContext = parsed;
	},
	MODEL_1_MAX_MESSAGE_LENGTH: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.model1MaxMessageLength = parsed;
	},
	MODEL_2_MAX_MODEL_CONTEXT: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.model2MaxModelContext = parsed;
	},
	MODEL_2_COMPACTION_UI_THRESHOLD: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.model2CompactionUiThreshold = parsed;
	},
	MODEL_2_TARGET_CONSTRUCTED_CONTEXT: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.model2TargetConstructedContext = parsed;
	},
	MODEL_2_MAX_MESSAGE_LENGTH: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.model2MaxMessageLength = parsed;
	},
	WORKING_SET_DOCUMENT_TOKEN_BUDGET: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined)
			config.workingSetDocumentTokenBudget = Math.max(100, parsed);
	},
	WORKING_SET_PROMPT_TOKEN_BUDGET: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined)
			config.workingSetPromptTokenBudget = Math.max(1000, parsed);
	},
	SMALL_FILE_THRESHOLD_CHARS: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined)
			config.smallFileThresholdChars = Math.max(100, parsed);
	},
	MODEL_1_BASEURL: (config, value) => {
		config.model1.baseUrl = value;
	},
	MODEL_1_NAME: (config, value) => {
		config.model1.modelName = value;
	},
	MODEL_1_DISPLAY_NAME: (config, value) => {
		config.model1.displayName = value;
	},
	MODEL_1_SYSTEM_PROMPT: (config, value) => {
		config.model1.systemPrompt = normalizeSystemPromptReference(value) ?? "";
	},
	MODEL_1_FLOW_ID: (config, value) => {
		config.model1.flowId = value;
	},
	MODEL_1_COMPONENT_ID: (config, value) => {
		config.model1.componentId = value;
	},
	MODEL_2_BASEURL: (config, value) => {
		config.model2.baseUrl = value;
	},
	MODEL_2_NAME: (config, value) => {
		config.model2.modelName = value;
	},
	MODEL_2_DISPLAY_NAME: (config, value) => {
		config.model2.displayName = value;
	},
	MODEL_2_SYSTEM_PROMPT: (config, value) => {
		config.model2.systemPrompt = normalizeSystemPromptReference(value) ?? "";
	},
	MODEL_2_FLOW_ID: (config, value) => {
		config.model2.flowId = value;
	},
	MODEL_2_COMPONENT_ID: (config, value) => {
		config.model2.componentId = value;
	},
	MODEL_2_ENABLED: (config, value) => {
		config.model2Enabled = value === "true";
	},
	TRANSLATOR_URL: (config, value) => {
		config.translatorUrl = value;
	},
	TRANSLATOR_MODEL: (config, value) => {
		config.translatorModel = value;
	},
	TRANSLATION_MAX_TOKENS: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.translationMaxTokens = Math.max(1, parsed);
	},
	TRANSLATION_TEMPERATURE: (config, value) => {
		const parsed = Number(value);
		if (Number.isFinite(parsed)) config.translationTemperature = parsed;
	},
	TITLE_GEN_URL: (config, value) => {
		config.titleGenUrl = value;
	},
	TITLE_GEN_MODEL: (config, value) => {
		config.titleGenModel = value;
	},
	TITLE_GEN_SYSTEM_PROMPT_EN: (config, value) => {
		config.titleGenSystemPromptEn = value;
	},
	TITLE_GEN_SYSTEM_PROMPT_HU: (config, value) => {
		config.titleGenSystemPromptHu = value;
	},
	TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_EN: (config, value) => {
		config.titleGenSystemPromptCodeAppendixEn = value;
	},
	TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_HU: (config, value) => {
		config.titleGenSystemPromptCodeAppendixHu = value;
	},
	CONTEXT_SUMMARIZER_URL: (config, value) => {
		config.contextSummarizerUrl = value;
	},
	CONTEXT_SUMMARIZER_MODEL: (config, value) => {
		config.contextSummarizerModel = value;
	},
	TEI_EMBEDDER_URL: (config, value) => {
		config.teiEmbedderUrl = value;
	},
	TEI_EMBEDDER_MODEL: (config, value) => {
		config.teiEmbedderModel = value;
	},
	TEI_EMBEDDER_BATCH_SIZE: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.teiEmbedderBatchSize = Math.max(1, parsed);
	},
	TEI_RERANKER_URL: (config, value) => {
		config.teiRerankerUrl = value;
	},
	TEI_RERANKER_MODEL: (config, value) => {
		config.teiRerankerModel = value;
	},
	TEI_RERANKER_MAX_TEXTS: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.teiRerankerMaxTexts = Math.max(1, parsed);
	},
	HONCHO_ENABLED: (config, value) => {
		config.honchoEnabled = value === "true";
	},
	HONCHO_CONTEXT_WAIT_MS: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.honchoContextWaitMs = Math.max(0, parsed);
	},
	HONCHO_PERSONA_CONTEXT_WAIT_MS: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) {
			config.honchoPersonaContextWaitMs = Math.max(0, parsed);
		}
	},
	HONCHO_OVERVIEW_WAIT_MS: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) {
			config.honchoOverviewWaitMs = Math.max(0, parsed);
		}
	},
	MINERU_API_URL: (config, value) => {
		config.mineruApiUrl = value;
	},
	MINERU_TIMEOUT_MS: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) {
			config.mineruTimeoutMs = Math.max(10000, parsed);
		}
	},
	SYSTEM_PROMPT: (config, value) => {
		config.systemPrompt = normalizeSystemPromptReference(value) ?? "";
	},
	MAX_FILE_UPLOAD_SIZE: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.maxFileUploadSize = Math.max(1048576, parsed);
	},
	MAX_PROVIDER_TOOL_ROUNDS: (config, value) => {
		const parsed = parseIntOverride(value);
		if (parsed !== undefined) config.maxProviderToolRounds = Math.max(1, parsed);
	},

};

export async function refreshConfig(): Promise<void> {
	const rows = await db.select().from(adminConfig);
	const overrides: Record<string, string> = Object.fromEntries(
		rows.map((r) => [r.key, r.value]),
	);

	const base = buildDefaultConfig();

	for (const key of ADMIN_CONFIG_KEYS) {
		const value = overrides[key];
		if (value === undefined) continue;
		overrideAppliers[key](base, value);
	}

	runtimeConfig = base;

	// Cross-field validation: target < threshold < max (per-model)
	function validateTriple(
		max: number,
		threshold: number,
		target: number,
	): boolean {
		return target >= threshold || threshold >= max;
	}

	if (
		validateTriple(
			runtimeConfig.maxModelContext,
			runtimeConfig.compactionUiThreshold,
			runtimeConfig.targetConstructedContext,
		)
	) {
		runtimeConfig.targetConstructedContext = envConfig.targetConstructedContext;
		runtimeConfig.compactionUiThreshold = envConfig.compactionUiThreshold;
		runtimeConfig.maxModelContext = envConfig.maxModelContext;
	}

	if (
		validateTriple(
			runtimeConfig.model1MaxModelContext,
			runtimeConfig.model1CompactionUiThreshold,
			runtimeConfig.model1TargetConstructedContext,
		)
	) {
		runtimeConfig.model1TargetConstructedContext =
			envConfig.model1TargetConstructedContext;
		runtimeConfig.model1CompactionUiThreshold =
			envConfig.model1CompactionUiThreshold;
		runtimeConfig.model1MaxModelContext = envConfig.model1MaxModelContext;
	}

	if (
		validateTriple(
			runtimeConfig.model2MaxModelContext,
			runtimeConfig.model2CompactionUiThreshold,
			runtimeConfig.model2TargetConstructedContext,
		)
	) {
		runtimeConfig.model2TargetConstructedContext =
			envConfig.model2TargetConstructedContext;
		runtimeConfig.model2CompactionUiThreshold =
			envConfig.model2CompactionUiThreshold;
		runtimeConfig.model2MaxModelContext = envConfig.model2MaxModelContext;
	}
	// Global SYSTEM_PROMPT overrides per-model system prompts
	if (runtimeConfig.systemPrompt) {
		runtimeConfig.model1.systemPrompt = runtimeConfig.systemPrompt;
		runtimeConfig.model2.systemPrompt = runtimeConfig.systemPrompt;
	}
}

export function getConfig(): RuntimeConfig {
	return runtimeConfig;
}

export function getDocumentTokenBudget(): number {
	return runtimeConfig.workingSetDocumentTokenBudget;
}

export function getWorkingSetPromptTokenBudget(): number {
	return runtimeConfig.workingSetPromptTokenBudget;
}

export function getSmallFileThreshold(): number {
	return runtimeConfig.smallFileThresholdChars;
}

export function getMaxFileUploadSize(): number {
	return runtimeConfig.maxFileUploadSize;
}

export function getMaxProviderToolRounds(): number {
	return runtimeConfig.maxProviderToolRounds;
}

// Per-model context limit getters

export function getMaxModelContext(modelId?: string): number {
	if (modelId === "model1") return runtimeConfig.model1MaxModelContext;
	if (modelId === "model2") return runtimeConfig.model2MaxModelContext;
	return runtimeConfig.maxModelContext;
}

export function getCompactionUiThreshold(modelId?: string): number {
	if (modelId === "model1") return runtimeConfig.model1CompactionUiThreshold;
	if (modelId === "model2") return runtimeConfig.model2CompactionUiThreshold;
	return runtimeConfig.compactionUiThreshold;
}

export function getTargetConstructedContext(modelId?: string): number {
	if (modelId === "model1") return runtimeConfig.model1TargetConstructedContext;
	if (modelId === "model2") return runtimeConfig.model2TargetConstructedContext;
	return runtimeConfig.targetConstructedContext;
}

export function getMaxMessageLength(modelId?: string): number {
	if (modelId === "model1") return runtimeConfig.model1MaxMessageLength;
	if (modelId === "model2") return runtimeConfig.model2MaxMessageLength;
	return runtimeConfig.maxMessageLength;
}

export function isModelEnabled(
	modelId: ModelId,
	config: RuntimeConfig = runtimeConfig,
): boolean {
	if (modelId === "model1") return true;
	return config.model2Enabled !== false;
}

export function normalizeModelSelection(
	modelId: string | null | undefined,
	config: RuntimeConfig = runtimeConfig,
): ModelId {
	if (modelId === "model2" && config.model2Enabled !== false) {
		return "model2";
	}
	return "model1";
}

export async function normalizeModelSelectionWithProviders(
	modelId: string | null | undefined,
	config: RuntimeConfig = runtimeConfig,
): Promise<ModelId> {
	if (modelId?.startsWith("provider:")) {
		const provider = await getProviderById(modelId.slice("provider:".length));
		if (provider?.enabled) {
			return modelId as ModelId;
		}
	}
	return normalizeModelSelection(modelId, config);
}

export function getAvailableModels(
	config: RuntimeConfig = runtimeConfig,
): Array<{ id: ModelId; displayName: string }> {
	const models: Array<{ id: ModelId; displayName: string }> = [
		{ id: "model1", displayName: config.model1.displayName },
	];

	if (config.model2Enabled !== false) {
		models.push({ id: "model2", displayName: config.model2.displayName });
	}

	return models;
}

export function getResolvedAdminConfigValues(
	config: RuntimeConfig = runtimeConfig,
): Record<AdminConfigKey, string> {
	return {
		MAX_MESSAGE_LENGTH: String(config.maxMessageLength),
		MAX_MODEL_CONTEXT: String(config.maxModelContext),
		COMPACTION_UI_THRESHOLD: String(config.compactionUiThreshold),
		TARGET_CONSTRUCTED_CONTEXT: String(config.targetConstructedContext),
		MODEL_1_MAX_MODEL_CONTEXT: String(config.model1MaxModelContext),
		MODEL_1_COMPACTION_UI_THRESHOLD: String(config.model1CompactionUiThreshold),
		MODEL_1_TARGET_CONSTRUCTED_CONTEXT: String(
			config.model1TargetConstructedContext,
		),
		MODEL_1_MAX_MESSAGE_LENGTH: String(config.model1MaxMessageLength),
		MODEL_2_MAX_MODEL_CONTEXT: String(config.model2MaxModelContext),
		MODEL_2_COMPACTION_UI_THRESHOLD: String(config.model2CompactionUiThreshold),
		MODEL_2_TARGET_CONSTRUCTED_CONTEXT: String(
			config.model2TargetConstructedContext,
		),
		MODEL_2_MAX_MESSAGE_LENGTH: String(config.model2MaxMessageLength),
		WORKING_SET_DOCUMENT_TOKEN_BUDGET: String(
			config.workingSetDocumentTokenBudget,
		),
		WORKING_SET_PROMPT_TOKEN_BUDGET: String(config.workingSetPromptTokenBudget),
		SMALL_FILE_THRESHOLD_CHARS: String(config.smallFileThresholdChars),
		MODEL_1_BASEURL: config.model1.baseUrl,
		MODEL_1_NAME: config.model1.modelName,
		MODEL_1_DISPLAY_NAME: config.model1.displayName,
		MODEL_1_SYSTEM_PROMPT: getSystemPrompt(config.model1.systemPrompt),
		MODEL_1_FLOW_ID: config.model1.flowId,
		MODEL_1_COMPONENT_ID: config.model1.componentId,
		MODEL_2_BASEURL: config.model2.baseUrl,
		MODEL_2_NAME: config.model2.modelName,
		MODEL_2_DISPLAY_NAME: config.model2.displayName,
		MODEL_2_SYSTEM_PROMPT: getSystemPrompt(config.model2.systemPrompt),
		MODEL_2_FLOW_ID: config.model2.flowId,
		MODEL_2_COMPONENT_ID: config.model2.componentId,
		MODEL_2_ENABLED: String(config.model2Enabled),
		TRANSLATOR_URL: config.translatorUrl,
		TRANSLATOR_MODEL: config.translatorModel,
		TRANSLATION_MAX_TOKENS: String(config.translationMaxTokens),
		TRANSLATION_TEMPERATURE: String(config.translationTemperature),
		TITLE_GEN_URL: config.titleGenUrl,
		TITLE_GEN_MODEL: config.titleGenModel,
		TITLE_GEN_SYSTEM_PROMPT_EN: config.titleGenSystemPromptEn,
		TITLE_GEN_SYSTEM_PROMPT_HU: config.titleGenSystemPromptHu,
		TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_EN:
			config.titleGenSystemPromptCodeAppendixEn,
		TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_HU:
			config.titleGenSystemPromptCodeAppendixHu,
		CONTEXT_SUMMARIZER_URL: config.contextSummarizerUrl,
		CONTEXT_SUMMARIZER_MODEL: config.contextSummarizerModel,
		TEI_EMBEDDER_URL: config.teiEmbedderUrl,
		TEI_EMBEDDER_MODEL: config.teiEmbedderModel,
		TEI_EMBEDDER_BATCH_SIZE: String(config.teiEmbedderBatchSize),
		TEI_RERANKER_URL: config.teiRerankerUrl,
		TEI_RERANKER_MODEL: config.teiRerankerModel,
		TEI_RERANKER_MAX_TEXTS: String(config.teiRerankerMaxTexts),
		HONCHO_ENABLED: String(config.honchoEnabled),
		HONCHO_CONTEXT_WAIT_MS: String(config.honchoContextWaitMs),
		HONCHO_PERSONA_CONTEXT_WAIT_MS: String(config.honchoPersonaContextWaitMs),
		HONCHO_OVERVIEW_WAIT_MS: String(config.honchoOverviewWaitMs),
		MINERU_API_URL: config.mineruApiUrl,
		MINERU_TIMEOUT_MS: String(config.mineruTimeoutMs),
		SYSTEM_PROMPT: getSystemPrompt(config.systemPrompt),
		MAX_FILE_UPLOAD_SIZE: String(config.maxFileUploadSize),
		MAX_PROVIDER_TOOL_ROUNDS: String(config.maxProviderToolRounds),
	};
}

// Returns the env-var default value for each admin config key (for UI display)
export function getEnvDefaults(): Record<AdminConfigKey, string> {
	return {
		MAX_MESSAGE_LENGTH: String(envConfig.maxMessageLength),
		MAX_MODEL_CONTEXT: String(envConfig.maxModelContext),
		COMPACTION_UI_THRESHOLD: String(envConfig.compactionUiThreshold),
		TARGET_CONSTRUCTED_CONTEXT: String(envConfig.targetConstructedContext),
		MODEL_1_MAX_MODEL_CONTEXT: String(envConfig.model1MaxModelContext),
		MODEL_1_COMPACTION_UI_THRESHOLD: String(
			envConfig.model1CompactionUiThreshold,
		),
		MODEL_1_TARGET_CONSTRUCTED_CONTEXT: String(
			envConfig.model1TargetConstructedContext,
		),
		MODEL_1_MAX_MESSAGE_LENGTH: String(envConfig.model1MaxMessageLength),
		MODEL_2_MAX_MODEL_CONTEXT: String(envConfig.model2MaxModelContext),
		MODEL_2_COMPACTION_UI_THRESHOLD: String(
			envConfig.model2CompactionUiThreshold,
		),
		MODEL_2_TARGET_CONSTRUCTED_CONTEXT: String(
			envConfig.model2TargetConstructedContext,
		),
		MODEL_2_MAX_MESSAGE_LENGTH: String(envConfig.model2MaxMessageLength),
		WORKING_SET_DOCUMENT_TOKEN_BUDGET: String(
			envConfig.workingSetDocumentTokenBudget,
		),
		WORKING_SET_PROMPT_TOKEN_BUDGET: String(
			envConfig.workingSetPromptTokenBudget,
		),
		SMALL_FILE_THRESHOLD_CHARS: String(envConfig.smallFileThresholdChars),
		MODEL_1_BASEURL: envConfig.model1.baseUrl,
		MODEL_1_NAME: envConfig.model1.modelName,
		MODEL_1_DISPLAY_NAME: envConfig.model1.displayName,
		MODEL_1_SYSTEM_PROMPT: envConfig.model1.systemPrompt,
		MODEL_1_FLOW_ID: envConfig.model1.flowId,
		MODEL_1_COMPONENT_ID: envConfig.model1.componentId,
		MODEL_2_BASEURL: envConfig.model2.baseUrl,
		MODEL_2_NAME: envConfig.model2.modelName,
		MODEL_2_DISPLAY_NAME: envConfig.model2.displayName,
		MODEL_2_SYSTEM_PROMPT: envConfig.model2.systemPrompt,
		MODEL_2_FLOW_ID: envConfig.model2.flowId,
		MODEL_2_COMPONENT_ID: envConfig.model2.componentId,
		MODEL_2_ENABLED: String(envConfig.model2Enabled),
		TRANSLATOR_URL: envConfig.translatorUrl,
		TRANSLATOR_MODEL: envConfig.translatorModel,
		TRANSLATION_MAX_TOKENS: String(envConfig.translationMaxTokens),
		TRANSLATION_TEMPERATURE: String(envConfig.translationTemperature),
		TITLE_GEN_URL: envConfig.titleGenUrl,
		TITLE_GEN_MODEL: envConfig.titleGenModel,
		TITLE_GEN_SYSTEM_PROMPT_EN: envConfig.titleGenSystemPromptEn,
		TITLE_GEN_SYSTEM_PROMPT_HU: envConfig.titleGenSystemPromptHu,
		TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_EN:
			envConfig.titleGenSystemPromptCodeAppendixEn,
		TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_HU:
			envConfig.titleGenSystemPromptCodeAppendixHu,
		CONTEXT_SUMMARIZER_URL: envConfig.contextSummarizerUrl,
		CONTEXT_SUMMARIZER_MODEL: envConfig.contextSummarizerModel,
		TEI_EMBEDDER_URL: envConfig.teiEmbedderUrl,
		TEI_EMBEDDER_MODEL: envConfig.teiEmbedderModel,
		TEI_EMBEDDER_BATCH_SIZE: String(envConfig.teiEmbedderBatchSize),
		TEI_RERANKER_URL: envConfig.teiRerankerUrl,
		TEI_RERANKER_MODEL: envConfig.teiRerankerModel,
		TEI_RERANKER_MAX_TEXTS: String(envConfig.teiRerankerMaxTexts),
		HONCHO_ENABLED: String(envConfig.honchoEnabled),
		HONCHO_CONTEXT_WAIT_MS: String(envConfig.honchoContextWaitMs),
		HONCHO_PERSONA_CONTEXT_WAIT_MS: String(
			envConfig.honchoPersonaContextWaitMs,
		),
		HONCHO_OVERVIEW_WAIT_MS: String(envConfig.honchoOverviewWaitMs),
		MINERU_API_URL: envConfig.mineruApiUrl,
		MINERU_TIMEOUT_MS: String(envConfig.mineruTimeoutMs),
		SYSTEM_PROMPT: envConfig.systemPrompt,
		MAX_FILE_UPLOAD_SIZE: String(envConfig.maxFileUploadSize),
		MAX_PROVIDER_TOOL_ROUNDS: String(envConfig.maxProviderToolRounds),
	};
}

let cachedProviders:
	| import("$lib/server/services/inference-providers").InferenceProvider[]
	| null = null;
let providersLoadTime = 0;
const PROVIDERS_CACHE_TTL_MS = 60000;

export async function getInferenceProviders(): Promise<
	import("$lib/server/services/inference-providers").InferenceProvider[]
> {
	const now = Date.now();
	if (cachedProviders && now - providersLoadTime < PROVIDERS_CACHE_TTL_MS) {
		return cachedProviders;
	}

	const { listProviders } = await import(
		"$lib/server/services/inference-providers"
	);
	cachedProviders = await listProviders();
	providersLoadTime = now;
	return cachedProviders;
}

export async function getEnabledProviders(): Promise<
	import("$lib/server/services/inference-providers").InferenceProvider[]
> {
	const providers = await getInferenceProviders();
	return providers.filter((p) => p.enabled);
}

export async function getProviderById(
	id: string,
): Promise<
	import("$lib/server/services/inference-providers").InferenceProvider | null
> {
	const providers = await getInferenceProviders();
	return providers.find((p) => p.id === id) ?? null;
}

export async function getAvailableModelsWithProviders(): Promise<
	Array<{ id: ModelId; displayName: string; isThirdParty: boolean }>
> {
	const [builtIn, providers] = await Promise.all([
		Promise.resolve(getAvailableModels()),
		getEnabledProviders(),
	]);

	const models = builtIn.map((m) => ({ ...m, isThirdParty: false }));

	for (const provider of providers) {
		models.push({
			id: `provider:${provider.id}` as ModelId,
			displayName: provider.displayName,
			isThirdParty: true,
		});
	}

	return models;
}

export function clearProvidersCache(): void {
	cachedProviders = null;
	providersLoadTime = 0;
}
