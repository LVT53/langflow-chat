// src/lib/server/env.ts
// Centralized environment configuration module

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  displayName: string;
  systemPrompt: string;
  flowId: string;
  componentId: string;
}

interface Config {
  langflowApiUrl: string;
  langflowApiKey: string;
  langflowFlowId: string;
  langflowWebhookSecret: string;
  alfyaiApiKey: string;
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

export function getDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATABASE_PATH || './data/chat.db';
}

// Read and validate environment variables
function readConfig(): Config {
  // Required variables
  const langflowApiKey = process.env.LANGFLOW_API_KEY;
  if (!langflowApiKey) {
    throw new Error('Missing required environment variable: LANGFLOW_API_KEY');
  }

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error('Missing required environment variable: SESSION_SECRET');
  }

  // Optional variables with defaults
  const webhookPort = parseInt(process.env.WEBHOOK_PORT || '8090', 10);
  if (isNaN(webhookPort)) {
    throw new Error('Invalid WEBHOOK_PORT: must be a valid number');
  }

  return {
    langflowApiUrl: process.env.LANGFLOW_API_URL || 'http://localhost:7860',
    langflowApiKey,
    langflowFlowId: process.env.LANGFLOW_FLOW_ID || '',
    langflowWebhookSecret: process.env.LANGFLOW_WEBHOOK_SECRET || '',
    alfyaiApiKey: process.env.ALFYAI_API_KEY || '',
    attachmentTraceDebug: process.env.ATTACHMENT_TRACE_DEBUG === 'true',
    translatorUrl: process.env.TRANSLATOR_URL || 'http://localhost:30002/v1',
    translatorApiKey: process.env.TRANSLATOR_API_KEY || '',
    translatorModel: process.env.TRANSLATOR_MODEL || 'translategemma',
    translationMaxTokens: parseInt(process.env.TRANSLATION_MAX_TOKENS || '256', 10),
    translationTemperature: parseFloat(process.env.TRANSLATION_TEMPERATURE || '0.1'),
    titleGenUrl: process.env.TITLE_GEN_URL || 'http://localhost:30001/v1',
    titleGenApiKey: process.env.TITLE_GEN_API_KEY || '',
    titleGenModel: process.env.TITLE_GEN_MODEL || 'nemotron-nano',
    titleGenSystemPromptEn: process.env.TITLE_GEN_SYSTEM_PROMPT_EN || '',
    titleGenSystemPromptHu: process.env.TITLE_GEN_SYSTEM_PROMPT_HU || '',
    titleGenSystemPromptCodeAppendixEn: process.env.TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_EN || '',
    titleGenSystemPromptCodeAppendixHu: process.env.TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_HU || '',
    contextSummarizerUrl: process.env.CONTEXT_SUMMARIZER_URL || process.env.TITLE_GEN_URL || '',
    contextSummarizerApiKey: process.env.CONTEXT_SUMMARIZER_API_KEY || process.env.TITLE_GEN_API_KEY || '',
    contextSummarizerModel: process.env.CONTEXT_SUMMARIZER_MODEL || '',
    webhookPort,
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '120000', 10),
    maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH || '10000', 10),
    maxModelContext: Math.max(
      1000,
      parseInt(process.env.MAX_MODEL_CONTEXT || '262144', 10) || 262144
    ),
    compactionUiThreshold: Math.max(
      1000,
      parseInt(process.env.COMPACTION_UI_THRESHOLD || '209715', 10) || 209715
    ),
    targetConstructedContext: Math.max(
      1000,
      parseInt(process.env.TARGET_CONSTRUCTED_CONTEXT || '157286', 10) || 157286
    ),
    workingSetDocumentTokenBudget: Math.max(
      100,
      parseInt(process.env.WORKING_SET_DOCUMENT_TOKEN_BUDGET || '4000', 10) || 4000
    ),
    workingSetPromptTokenBudget: Math.max(
      1000,
      parseInt(process.env.WORKING_SET_PROMPT_TOKEN_BUDGET || '20000', 10) || 20000
    ),
    smallFileThresholdChars: Math.max(
      100,
      parseInt(process.env.SMALL_FILE_THRESHOLD_CHARS || '5000', 10) || 5000
    ),
    sessionSecret,
    databasePath: getDatabasePath(),
    model1: {
      baseUrl: process.env.MODEL_1_BASEURL || 'http://localhost:30001/v1',
      apiKey: process.env.MODEL_1_API_KEY || '',
      modelName: process.env.MODEL_1_NAME || 'model-1',
      displayName: process.env.MODEL_1_DISPLAY_NAME || 'Model 1',
      systemPrompt: process.env.MODEL_1_SYSTEM_PROMPT || '',
      flowId: process.env.MODEL_1_FLOW_ID || process.env.LANGFLOW_FLOW_ID || '',
      componentId: process.env.MODEL_1_COMPONENT_ID || '',
    },
    model2: {
      baseUrl: process.env.MODEL_2_BASEURL || '',
      apiKey: process.env.MODEL_2_API_KEY || '',
      modelName: process.env.MODEL_2_NAME || '',
      displayName: process.env.MODEL_2_DISPLAY_NAME || 'Model 2',
      systemPrompt: process.env.MODEL_2_SYSTEM_PROMPT || '',
      flowId: process.env.MODEL_2_FLOW_ID || process.env.LANGFLOW_FLOW_ID || '',
      componentId: process.env.MODEL_2_COMPONENT_ID || '',
    },
    model2Enabled: process.env.MODEL_2_ENABLED !== 'false',
    honchoApiKey: process.env.HONCHO_API_KEY || '',
    honchoBaseUrl: process.env.HONCHO_BASE_URL || 'http://localhost:8000',
    honchoWorkspace: process.env.HONCHO_WORKSPACE || 'alfyai-prod',
    honchoEnabled: process.env.HONCHO_ENABLED === 'true',
    honchoContextWaitMs: Math.max(
      0,
      parseInt(process.env.HONCHO_CONTEXT_WAIT_MS || '3000', 10) || 3000
    ),
    honchoContextPollIntervalMs: Math.max(
      50,
      parseInt(process.env.HONCHO_CONTEXT_POLL_INTERVAL_MS || '250', 10) || 250
    ),
    honchoPersonaContextWaitMs: Math.max(
      0,
      parseInt(process.env.HONCHO_PERSONA_CONTEXT_WAIT_MS || '1500', 10) || 1500
    ),
    honchoOverviewWaitMs: Math.max(
      0,
      parseInt(process.env.HONCHO_OVERVIEW_WAIT_MS || '10000', 10) || 10000
    ),
    memoryMaintenanceIntervalMinutes: Math.max(
      0,
      parseInt(process.env.MEMORY_MAINTENANCE_INTERVAL_MINUTES || '0', 10) || 0
    ),
  };
}

let cachedConfig: Config | null = null;

export function getConfig(): Config {
  if (!cachedConfig) {
    cachedConfig = readConfig();
  }

  return cachedConfig;
}

export const config: Config = new Proxy({} as Config, {
  get(_target, prop) {
    const resolved = getConfig() as Record<PropertyKey, unknown>;
    return resolved[prop];
  },
  has(_target, prop) {
    return prop in getConfig();
  },
  ownKeys() {
    return Reflect.ownKeys(getConfig());
  },
  getOwnPropertyDescriptor(_target, prop) {
    const descriptor = Object.getOwnPropertyDescriptor(getConfig(), prop);
    return descriptor ? { ...descriptor, configurable: true } : undefined;
  },
});
