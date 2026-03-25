// src/lib/server/env.ts
// Centralized environment configuration module

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  displayName: string;
  systemPrompt: string;
  flowId: string;
}

interface Config {
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

// Read and validate environment variables
const getConfig = (): Config => {
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
    translatorUrl: process.env.TRANSLATOR_URL || 'http://localhost:30002/v1',
    translatorApiKey: process.env.TRANSLATOR_API_KEY || '',
    translatorModel: process.env.TRANSLATOR_MODEL || 'translategemma',
    translationMaxTokens: parseInt(process.env.TRANSLATION_MAX_TOKENS || '256', 10),
    translationTemperature: parseFloat(process.env.TRANSLATION_TEMPERATURE || '0.1'),
    titleGenUrl: process.env.TITLE_GEN_URL || 'http://localhost:30001/v1',
    titleGenApiKey: process.env.TITLE_GEN_API_KEY || '',
    titleGenModel: process.env.TITLE_GEN_MODEL || 'nemotron-nano',
    webhookPort,
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '120000', 10),
    maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH || '10000', 10),
    sessionSecret,
    databasePath: process.env.DATABASE_PATH || './data/chat.db',
    model1: {
      baseUrl: process.env.MODEL_1_BASEURL || 'http://localhost:30001/v1',
      apiKey: process.env.MODEL_1_API_KEY || '',
      modelName: process.env.MODEL_1_NAME || 'model-1',
      displayName: process.env.MODEL_1_DISPLAY_NAME || 'Model 1',
      systemPrompt: process.env.MODEL_1_SYSTEM_PROMPT || 'default',
      flowId: process.env.MODEL_1_FLOW_ID || process.env.LANGFLOW_FLOW_ID || '',
    },
    model2: {
      baseUrl: process.env.MODEL_2_BASEURL || '',
      apiKey: process.env.MODEL_2_API_KEY || '',
      modelName: process.env.MODEL_2_NAME || '',
      displayName: process.env.MODEL_2_DISPLAY_NAME || 'Model 2',
      systemPrompt: process.env.MODEL_2_SYSTEM_PROMPT || 'default',
      flowId: process.env.MODEL_2_FLOW_ID || process.env.LANGFLOW_FLOW_ID || '',
    },
    honchoApiKey: process.env.HONCHO_API_KEY || '',
    honchoBaseUrl: process.env.HONCHO_BASE_URL || 'http://localhost:8000',
    honchoWorkspace: process.env.HONCHO_WORKSPACE || 'alfyai-prod',
    honchoEnabled: process.env.HONCHO_ENABLED === 'true',
  };
};

export const config = getConfig();
