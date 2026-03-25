// Runtime config store: merges env vars with admin_config DB overrides.
// All services should call getConfig() instead of importing from env.ts directly.

import { config as envConfig, type ModelConfig } from './env';
import { db } from './db';
import { adminConfig } from './db/schema';

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
  'TITLE_GEN_URL',
  'TITLE_GEN_MODEL',
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
  translatorUrl: string;
  translatorApiKey: string;
  translatorModel: string;
  translationMaxTokens: number;
  translationTemperature: number;
  titleGenUrl: string;
  titleGenApiKey: string;
  titleGenModel: string;
  webhookPort: number;
  requestTimeoutMs: number;
  maxMessageLength: number;
  sessionSecret: string;
  databasePath: string;
  model1: ModelConfig;
  model2: ModelConfig;
  honchoApiKey: string;
  honchoBaseUrl: string;
  honchoWorkspace: string;
  honchoEnabled: boolean;
}

function buildDefaultConfig(): RuntimeConfig {
  return {
    ...envConfig,
    model1: { ...envConfig.model1 },
    model2: { ...envConfig.model2 },
  };
}

let runtimeConfig: RuntimeConfig = buildDefaultConfig();

export async function refreshConfig(): Promise<void> {
  const rows = await db.select().from(adminConfig);
  const overrides: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  const base = buildDefaultConfig();

  if (overrides.MAX_MESSAGE_LENGTH !== undefined) {
    const v = parseInt(overrides.MAX_MESSAGE_LENGTH, 10);
    if (!isNaN(v)) base.maxMessageLength = v;
  }
  if (overrides.MODEL_1_BASEURL !== undefined) base.model1.baseUrl = overrides.MODEL_1_BASEURL;
  if (overrides.MODEL_1_NAME !== undefined) base.model1.modelName = overrides.MODEL_1_NAME;
  if (overrides.MODEL_1_DISPLAY_NAME !== undefined) base.model1.displayName = overrides.MODEL_1_DISPLAY_NAME;
  if (overrides.MODEL_1_SYSTEM_PROMPT !== undefined) base.model1.systemPrompt = overrides.MODEL_1_SYSTEM_PROMPT;
  if (overrides.MODEL_1_FLOW_ID !== undefined) base.model1.flowId = overrides.MODEL_1_FLOW_ID;
  if (overrides.MODEL_2_BASEURL !== undefined) base.model2.baseUrl = overrides.MODEL_2_BASEURL;
  if (overrides.MODEL_2_NAME !== undefined) base.model2.modelName = overrides.MODEL_2_NAME;
  if (overrides.MODEL_2_DISPLAY_NAME !== undefined) base.model2.displayName = overrides.MODEL_2_DISPLAY_NAME;
  if (overrides.MODEL_2_SYSTEM_PROMPT !== undefined) base.model2.systemPrompt = overrides.MODEL_2_SYSTEM_PROMPT;
  if (overrides.MODEL_2_FLOW_ID !== undefined) base.model2.flowId = overrides.MODEL_2_FLOW_ID;
  if (overrides.TITLE_GEN_URL !== undefined) base.titleGenUrl = overrides.TITLE_GEN_URL;
  if (overrides.TITLE_GEN_MODEL !== undefined) base.titleGenModel = overrides.TITLE_GEN_MODEL;
  if (overrides.TRANSLATOR_URL !== undefined) base.translatorUrl = overrides.TRANSLATOR_URL;
  if (overrides.TRANSLATOR_MODEL !== undefined) base.translatorModel = overrides.TRANSLATOR_MODEL;
  if (overrides.TRANSLATION_MAX_TOKENS !== undefined) {
    const v = parseInt(overrides.TRANSLATION_MAX_TOKENS, 10);
    if (!isNaN(v)) base.translationMaxTokens = v;
  }
  if (overrides.TRANSLATION_TEMPERATURE !== undefined) {
    const v = parseFloat(overrides.TRANSLATION_TEMPERATURE);
    if (!isNaN(v)) base.translationTemperature = v;
  }
  if (overrides.HONCHO_ENABLED !== undefined) base.honchoEnabled = overrides.HONCHO_ENABLED === 'true';

  runtimeConfig = base;
}

export function getConfig(): RuntimeConfig {
  return runtimeConfig;
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
    TITLE_GEN_URL: envConfig.titleGenUrl,
    TITLE_GEN_MODEL: envConfig.titleGenModel,
    TRANSLATOR_URL: envConfig.translatorUrl,
    TRANSLATOR_MODEL: envConfig.translatorModel,
    TRANSLATION_MAX_TOKENS: String(envConfig.translationMaxTokens),
    TRANSLATION_TEMPERATURE: String(envConfig.translationTemperature),
    HONCHO_ENABLED: String(envConfig.honchoEnabled),
  };
}
