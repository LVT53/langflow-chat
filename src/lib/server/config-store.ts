// Runtime config store: merges env vars with admin_config DB overrides.
// All services should call getConfig() instead of importing from env.ts directly.

import { config as envConfig, type ModelConfig } from './env';
import { db } from './db';
import { adminConfig } from './db/schema';
import type { ModelId } from '$lib/types';

export const ADMIN_CONFIG_KEYS = [
  'MAX_MESSAGE_LENGTH',
  'MODEL_1_BASEURL',
  'MODEL_1_NAME',
  'MODEL_1_DISPLAY_NAME',
  'MODEL_1_SYSTEM_PROMPT',
  'MODEL_1_FLOW_ID',
  'MODEL_2_BASEURL',
  'MODEL_2_NAME',
  'MODEL_2_DISPLAY_NAME',
  'MODEL_2_SYSTEM_PROMPT',
  'MODEL_2_FLOW_ID',
  'MODEL_2_ENABLED',
  'TITLE_GEN_URL',
  'TITLE_GEN_MODEL',
  'CONTEXT_SUMMARIZER_URL',
  'CONTEXT_SUMMARIZER_MODEL',
  'TRANSLATOR_URL',
  'TRANSLATOR_MODEL',
  'TRANSLATION_MAX_TOKENS',
  'TRANSLATION_TEMPERATURE',
  'HONCHO_ENABLED',
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
  contextSummarizerUrl: string;
  contextSummarizerApiKey: string;
  contextSummarizerModel: string;
  webhookPort: number;
  requestTimeoutMs: number;
  maxMessageLength: number;
  sessionSecret: string;
  databasePath: string;
  model1: ModelConfig;
  model2: ModelConfig;
  model2Enabled: boolean;
  honchoApiKey: string;
  honchoBaseUrl: string;
  honchoWorkspace: string;
  honchoEnabled: boolean;
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
    config.model1.systemPrompt = value;
  },
  MODEL_1_FLOW_ID: (config, value) => {
    config.model1.flowId = value;
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
    config.model2.systemPrompt = value;
  },
  MODEL_2_FLOW_ID: (config, value) => {
    config.model2.flowId = value;
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
  CONTEXT_SUMMARIZER_URL: (config, value) => {
    config.contextSummarizerUrl = value;
  },
  CONTEXT_SUMMARIZER_MODEL: (config, value) => {
    config.contextSummarizerModel = value;
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
}

export function getConfig(): RuntimeConfig {
  return runtimeConfig;
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

// Returns the env-var default value for each admin config key (for UI display)
export function getEnvDefaults(): Record<AdminConfigKey, string> {
  return {
    MAX_MESSAGE_LENGTH: String(envConfig.maxMessageLength),
    MODEL_1_BASEURL: envConfig.model1.baseUrl,
    MODEL_1_NAME: envConfig.model1.modelName,
    MODEL_1_DISPLAY_NAME: envConfig.model1.displayName,
    MODEL_1_SYSTEM_PROMPT: envConfig.model1.systemPrompt,
    MODEL_1_FLOW_ID: envConfig.model1.flowId,
    MODEL_2_BASEURL: envConfig.model2.baseUrl,
    MODEL_2_NAME: envConfig.model2.modelName,
    MODEL_2_DISPLAY_NAME: envConfig.model2.displayName,
    MODEL_2_SYSTEM_PROMPT: envConfig.model2.systemPrompt,
    MODEL_2_FLOW_ID: envConfig.model2.flowId,
    MODEL_2_ENABLED: String(envConfig.model2Enabled),
    TITLE_GEN_URL: envConfig.titleGenUrl,
    TITLE_GEN_MODEL: envConfig.titleGenModel,
    CONTEXT_SUMMARIZER_URL: envConfig.contextSummarizerUrl,
    CONTEXT_SUMMARIZER_MODEL: envConfig.contextSummarizerModel,
    TRANSLATOR_URL: envConfig.translatorUrl,
    TRANSLATOR_MODEL: envConfig.translatorModel,
    TRANSLATION_MAX_TOKENS: String(envConfig.translationMaxTokens),
    TRANSLATION_TEMPERATURE: String(envConfig.translationTemperature),
    HONCHO_ENABLED: String(envConfig.honchoEnabled),
  };
}
