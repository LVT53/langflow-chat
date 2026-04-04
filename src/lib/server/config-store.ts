// Runtime config store: merges env vars with admin_config DB overrides.
// All services should call getConfig() instead of importing from env.ts directly.

import { config as envConfig, type ModelConfig } from './env';
import { db } from './db';
import { adminConfig } from './db/schema';
import type { ModelId } from '$lib/types';
import { getSystemPrompt, normalizeSystemPromptReference } from './prompts';

export const ADMIN_CONFIG_KEYS = [
  'MAX_MESSAGE_LENGTH',
  'MAX_MODEL_CONTEXT',
  'COMPACTION_UI_THRESHOLD',
  'TARGET_CONSTRUCTED_CONTEXT',
  'WORKING_SET_DOCUMENT_TOKEN_BUDGET',
  'WORKING_SET_PROMPT_TOKEN_BUDGET',
  'SMALL_FILE_THRESHOLD_CHARS',
  'MODEL_1_BASEURL',
  'MODEL_1_NAME',
  'MODEL_1_DISPLAY_NAME',
  'MODEL_1_SYSTEM_PROMPT',
  'MODEL_1_FLOW_ID',
  'MODEL_1_COMPONENT_ID',
  'MODEL_2_BASEURL',
  'MODEL_2_NAME',
  'MODEL_2_DISPLAY_NAME',
  'MODEL_2_SYSTEM_PROMPT',
  'MODEL_2_FLOW_ID',
  'MODEL_2_COMPONENT_ID',
  'MODEL_2_ENABLED',
  'TITLE_GEN_URL',
  'TITLE_GEN_MODEL',
  'TITLE_GEN_SYSTEM_PROMPT_EN',
  'TITLE_GEN_SYSTEM_PROMPT_HU',
  'TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_EN',
  'TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_HU',
  'CONTEXT_SUMMARIZER_URL',
  'CONTEXT_SUMMARIZER_MODEL',
  'TEI_EMBEDDER_URL',
  'TEI_EMBEDDER_MODEL',
  'TEI_EMBEDDER_BATCH_SIZE',
  'TEI_RERANKER_URL',
  'TEI_RERANKER_MODEL',
  'TEI_RERANKER_MAX_TEXTS',
  'TRANSLATOR_URL',
  'TRANSLATOR_MODEL',
  'TRANSLATION_MAX_TOKENS',
  'TRANSLATION_TEMPERATURE',
  'HONCHO_ENABLED',
  'HONCHO_CONTEXT_WAIT_MS',
  'HONCHO_CONTEXT_POLL_INTERVAL_MS',
  'HONCHO_PERSONA_CONTEXT_WAIT_MS',
  'HONCHO_OVERVIEW_WAIT_MS',
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
  honchoEnabled: boolean;
  honchoContextWaitMs: number;
  honchoContextPollIntervalMs: number;
  honchoPersonaContextWaitMs: number;
  honchoOverviewWaitMs: number;
  memoryMaintenanceIntervalMinutes: number;
}

function buildDefaultConfig(): RuntimeConfig {
  return {
    ...envConfig,
    model1: { ...envConfig.model1 },
    model2: { ...envConfig.model2 },
  };
}

let runtimeConfig: RuntimeConfig = buildDefaultConfig();

type OverrideApplier = (config: RuntimeConfig, value: string) => void;

function parseIntOverride(value: string): number | undefined {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseFloatOverride(value: string): number | undefined {
  const parsed = parseFloat(value);
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
  WORKING_SET_DOCUMENT_TOKEN_BUDGET: (config, value) => {
    const parsed = parseIntOverride(value);
    if (parsed !== undefined) config.workingSetDocumentTokenBudget = Math.max(100, parsed);
  },
  WORKING_SET_PROMPT_TOKEN_BUDGET: (config, value) => {
    const parsed = parseIntOverride(value);
    if (parsed !== undefined) config.workingSetPromptTokenBudget = Math.max(1000, parsed);
  },
  SMALL_FILE_THRESHOLD_CHARS: (config, value) => {
    const parsed = parseIntOverride(value);
    if (parsed !== undefined) config.smallFileThresholdChars = Math.max(100, parsed);
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
    config.model1.systemPrompt = normalizeSystemPromptReference(value) ?? '';
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
    config.model2.systemPrompt = normalizeSystemPromptReference(value) ?? '';
  },
  MODEL_2_FLOW_ID: (config, value) => {
    config.model2.flowId = value;
  },
  MODEL_2_COMPONENT_ID: (config, value) => {
    config.model2.componentId = value;
  },
  MODEL_2_ENABLED: (config, value) => {
    config.model2Enabled = value === 'true';
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
  TRANSLATOR_URL: (config, value) => {
    config.translatorUrl = value;
  },
  TRANSLATOR_MODEL: (config, value) => {
    config.translatorModel = value;
  },
  TRANSLATION_MAX_TOKENS: (config, value) => {
    const parsed = parseIntOverride(value);
    if (parsed !== undefined) config.translationMaxTokens = parsed;
  },
  TRANSLATION_TEMPERATURE: (config, value) => {
    const parsed = parseFloatOverride(value);
    if (parsed !== undefined) config.translationTemperature = parsed;
  },
  HONCHO_ENABLED: (config, value) => {
    config.honchoEnabled = value === 'true';
  },
  HONCHO_CONTEXT_WAIT_MS: (config, value) => {
    const parsed = parseIntOverride(value);
    if (parsed !== undefined) config.honchoContextWaitMs = Math.max(0, parsed);
  },
  HONCHO_CONTEXT_POLL_INTERVAL_MS: (config, value) => {
    const parsed = parseIntOverride(value);
    if (parsed !== undefined) {
      config.honchoContextPollIntervalMs = Math.max(50, parsed);
    }
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
};

export async function refreshConfig(): Promise<void> {
  const rows = await db.select().from(adminConfig);
  const overrides: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const base = buildDefaultConfig();

  for (const key of ADMIN_CONFIG_KEYS) {
    const value = overrides[key];
    if (value === undefined) continue;
    overrideAppliers[key](base, value);
  }

  runtimeConfig = base;

  // Cross-field validation: target < threshold < max
  if (
    runtimeConfig.targetConstructedContext >= runtimeConfig.compactionUiThreshold ||
    runtimeConfig.compactionUiThreshold >= runtimeConfig.maxModelContext
  ) {
    // Revert to env defaults if invalid
    runtimeConfig.targetConstructedContext = envConfig.targetConstructedContext;
    runtimeConfig.compactionUiThreshold = envConfig.compactionUiThreshold;
    runtimeConfig.maxModelContext = envConfig.maxModelContext;
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

export function isModelEnabled(modelId: ModelId, config: RuntimeConfig = runtimeConfig): boolean {
  if (modelId === 'model1') return true;
  return config.model2Enabled !== false;
}

export function normalizeModelSelection(
  modelId: string | null | undefined,
  config: RuntimeConfig = runtimeConfig
): ModelId {
  if (modelId === 'model2' && config.model2Enabled !== false) {
    return 'model2';
  }
  return 'model1';
}

export function getAvailableModels(
  config: RuntimeConfig = runtimeConfig
): Array<{ id: ModelId; displayName: string }> {
  const models: Array<{ id: ModelId; displayName: string }> = [
    { id: 'model1', displayName: config.model1.displayName },
  ];

  if (config.model2Enabled !== false) {
    models.push({ id: 'model2', displayName: config.model2.displayName });
  }

  return models;
}

export function getResolvedAdminConfigValues(
  config: RuntimeConfig = runtimeConfig
): Record<AdminConfigKey, string> {
  return {
    MAX_MESSAGE_LENGTH: String(config.maxMessageLength),
    MAX_MODEL_CONTEXT: String(config.maxModelContext),
    COMPACTION_UI_THRESHOLD: String(config.compactionUiThreshold),
    TARGET_CONSTRUCTED_CONTEXT: String(config.targetConstructedContext),
    WORKING_SET_DOCUMENT_TOKEN_BUDGET: String(config.workingSetDocumentTokenBudget),
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
    TITLE_GEN_URL: config.titleGenUrl,
    TITLE_GEN_MODEL: config.titleGenModel,
    TITLE_GEN_SYSTEM_PROMPT_EN: config.titleGenSystemPromptEn,
    TITLE_GEN_SYSTEM_PROMPT_HU: config.titleGenSystemPromptHu,
    TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_EN: config.titleGenSystemPromptCodeAppendixEn,
    TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_HU: config.titleGenSystemPromptCodeAppendixHu,
    CONTEXT_SUMMARIZER_URL: config.contextSummarizerUrl,
    CONTEXT_SUMMARIZER_MODEL: config.contextSummarizerModel,
    TEI_EMBEDDER_URL: config.teiEmbedderUrl,
    TEI_EMBEDDER_MODEL: config.teiEmbedderModel,
    TEI_EMBEDDER_BATCH_SIZE: String(config.teiEmbedderBatchSize),
    TEI_RERANKER_URL: config.teiRerankerUrl,
    TEI_RERANKER_MODEL: config.teiRerankerModel,
    TEI_RERANKER_MAX_TEXTS: String(config.teiRerankerMaxTexts),
    TRANSLATOR_URL: config.translatorUrl,
    TRANSLATOR_MODEL: config.translatorModel,
    TRANSLATION_MAX_TOKENS: String(config.translationMaxTokens),
    TRANSLATION_TEMPERATURE: String(config.translationTemperature),
    HONCHO_ENABLED: String(config.honchoEnabled),
    HONCHO_CONTEXT_WAIT_MS: String(config.honchoContextWaitMs),
    HONCHO_CONTEXT_POLL_INTERVAL_MS: String(config.honchoContextPollIntervalMs),
    HONCHO_PERSONA_CONTEXT_WAIT_MS: String(config.honchoPersonaContextWaitMs),
    HONCHO_OVERVIEW_WAIT_MS: String(config.honchoOverviewWaitMs),
  };
}

// Returns the env-var default value for each admin config key (for UI display)
export function getEnvDefaults(): Record<AdminConfigKey, string> {
  return {
    MAX_MESSAGE_LENGTH: String(envConfig.maxMessageLength),
    MAX_MODEL_CONTEXT: String(envConfig.maxModelContext),
    COMPACTION_UI_THRESHOLD: String(envConfig.compactionUiThreshold),
    TARGET_CONSTRUCTED_CONTEXT: String(envConfig.targetConstructedContext),
    WORKING_SET_DOCUMENT_TOKEN_BUDGET: String(envConfig.workingSetDocumentTokenBudget),
    WORKING_SET_PROMPT_TOKEN_BUDGET: String(envConfig.workingSetPromptTokenBudget),
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
    TITLE_GEN_URL: envConfig.titleGenUrl,
    TITLE_GEN_MODEL: envConfig.titleGenModel,
    TITLE_GEN_SYSTEM_PROMPT_EN: envConfig.titleGenSystemPromptEn,
    TITLE_GEN_SYSTEM_PROMPT_HU: envConfig.titleGenSystemPromptHu,
    TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_EN: envConfig.titleGenSystemPromptCodeAppendixEn,
    TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_HU: envConfig.titleGenSystemPromptCodeAppendixHu,
    CONTEXT_SUMMARIZER_URL: envConfig.contextSummarizerUrl,
    CONTEXT_SUMMARIZER_MODEL: envConfig.contextSummarizerModel,
    TEI_EMBEDDER_URL: envConfig.teiEmbedderUrl,
    TEI_EMBEDDER_MODEL: envConfig.teiEmbedderModel,
    TEI_EMBEDDER_BATCH_SIZE: String(envConfig.teiEmbedderBatchSize),
    TEI_RERANKER_URL: envConfig.teiRerankerUrl,
    TEI_RERANKER_MODEL: envConfig.teiRerankerModel,
    TEI_RERANKER_MAX_TEXTS: String(envConfig.teiRerankerMaxTexts),
    TRANSLATOR_URL: envConfig.translatorUrl,
    TRANSLATOR_MODEL: envConfig.translatorModel,
    TRANSLATION_MAX_TOKENS: String(envConfig.translationMaxTokens),
    TRANSLATION_TEMPERATURE: String(envConfig.translationTemperature),
    HONCHO_ENABLED: String(envConfig.honchoEnabled),
    HONCHO_CONTEXT_WAIT_MS: String(envConfig.honchoContextWaitMs),
    HONCHO_CONTEXT_POLL_INTERVAL_MS: String(envConfig.honchoContextPollIntervalMs),
    HONCHO_PERSONA_CONTEXT_WAIT_MS: String(envConfig.honchoPersonaContextWaitMs),
    HONCHO_OVERVIEW_WAIT_MS: String(envConfig.honchoOverviewWaitMs),
  };
}
