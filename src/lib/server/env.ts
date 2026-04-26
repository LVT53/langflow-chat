// src/lib/server/env.ts
// Centralized environment configuration module
import { createHash } from 'crypto';
import { resolve } from 'path';

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  displayName: string;
  systemPrompt: string;
  flowId: string;
  componentId: string;
  maxTokens: number | null;
}

interface Config {
  langflowApiUrl: string;
  langflowApiKey: string;
  langflowFlowId: string;
  langflowWebhookSecret: string;
  alfyaiApiSigningKey: string;
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
  systemPrompt: string;
  perUserStreamLimit: number;
  maxFileUploadSize: number;
}

export function getDatabasePath(env: NodeJS.ProcessEnv = process.env): string {
  return env.DATABASE_PATH || './data/chat.db';
}

function buildDefaultHonchoIdentityNamespace(databasePath: string, honchoWorkspace: string): string {
  const digest = createHash('sha256')
    .update(`${honchoWorkspace}\0${resolve(databasePath)}`)
    .digest('hex')
    .slice(0, 16);
  return `db_${digest}`;
}

function parseFloatEnv(value: string | undefined, fallback: number): number {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Read and validate environment variables
function readConfig(): Config {
  // Required variables (mocked if missing for local dev/testing)
  const langflowApiKey = process.env.LANGFLOW_API_KEY || 'mock-langflow-api-key';
  const sessionSecret = process.env.SESSION_SECRET || 'mock-session-secret-for-dev-testing-only';

  // Optional variables with defaults
  const webhookPort = parseInt(process.env.WEBHOOK_PORT || '8090', 10);
  if (isNaN(webhookPort)) {
    throw new Error('Invalid WEBHOOK_PORT: must be a valid number');
  }
  const databasePath = getDatabasePath();
  const honchoWorkspace = process.env.HONCHO_WORKSPACE || 'alfyai-prod';

  return {
    langflowApiUrl: process.env.LANGFLOW_API_URL || 'http://localhost:7860',
    langflowApiKey,
    langflowFlowId: process.env.LANGFLOW_FLOW_ID || '',
    langflowWebhookSecret: process.env.LANGFLOW_WEBHOOK_SECRET || '',
    alfyaiApiSigningKey: process.env.ALFYAI_API_SIGNING_KEY || '',
    attachmentTraceDebug: process.env.ATTACHMENT_TRACE_DEBUG === 'true',
    translatorUrl: process.env.TRANSLATOR_URL || 'http://localhost:30002/v1',
    translatorApiKey: process.env.TRANSLATOR_API_KEY || '',
    translatorModel: process.env.TRANSLATOR_MODEL || 'translategemma',
    translationMaxTokens: Math.max(
      1,
      parseInt(process.env.TRANSLATION_MAX_TOKENS || '256', 10) || 256
    ),
    translationTemperature: parseFloatEnv(process.env.TRANSLATION_TEMPERATURE, 0.1),
    titleGenUrl: process.env.TITLE_GEN_URL || 'http://localhost:30001/v1',
    titleGenApiKey: process.env.TITLE_GEN_API_KEY || '',
    titleGenModel: process.env.TITLE_GEN_MODEL || 'nemotron-nano',
    titleGenSystemPromptEn: process.env.TITLE_GEN_SYSTEM_PROMPT_EN || '',
    titleGenSystemPromptHu: process.env.TITLE_GEN_SYSTEM_PROMPT_HU || '',
    titleGenSystemPromptCodeAppendixEn: process.env.TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_EN || '',
    titleGenSystemPromptCodeAppendixHu: process.env.TITLE_GEN_SYSTEM_PROMPT_CODE_APPENDIX_HU || '',
    contextSummarizerUrl: process.env.CONTEXT_SUMMARIZER_URL || process.env.TITLE_GEN_URL || '',
    contextSummarizerApiKey: process.env.CONTEXT_SUMMARIZER_API_KEY || process.env.TITLE_GEN_API_KEY || '',
    contextSummarizerModel: process.env.CONTEXT_SUMMARIZER_MODEL || process.env.TITLE_GEN_MODEL || '',
    teiEmbedderUrl: process.env.TEI_EMBEDDER_URL || '',
    teiEmbedderApiKey: process.env.TEI_EMBEDDER_API_KEY || '',
    teiEmbedderModel: process.env.TEI_EMBEDDER_MODEL || '',
    teiEmbedderBatchSize: Math.max(
      1,
      parseInt(process.env.TEI_EMBEDDER_BATCH_SIZE || '32', 10) || 32
    ),
    teiRerankerUrl: process.env.TEI_RERANKER_URL || '',
    teiRerankerApiKey: process.env.TEI_RERANKER_API_KEY || '',
    teiRerankerModel: process.env.TEI_RERANKER_MODEL || '',
    teiRerankerMaxTexts: Math.max(
      1,
      parseInt(process.env.TEI_RERANKER_MAX_TEXTS || '32', 10) || 32
    ),
    teiTimeoutMs: Math.max(
      100,
      parseInt(process.env.TEI_TIMEOUT_MS || process.env.REQUEST_TIMEOUT_MS || '300000', 10) ||
        300000
    ),
    webhookPort,
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '300000', 10),
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
		model1MaxModelContext: Math.max(
			1000,
			parseInt(process.env.MODEL_1_MAX_MODEL_CONTEXT || process.env.MAX_MODEL_CONTEXT || '262144', 10) || 262144
		),
		model1CompactionUiThreshold: Math.max(
			1000,
			parseInt(process.env.MODEL_1_COMPACTION_UI_THRESHOLD || process.env.COMPACTION_UI_THRESHOLD || '209715', 10) || 209715
		),
		model1TargetConstructedContext: Math.max(
			1000,
			parseInt(process.env.MODEL_1_TARGET_CONSTRUCTED_CONTEXT || process.env.TARGET_CONSTRUCTED_CONTEXT || '157286', 10) || 157286
		),
		model1MaxMessageLength: Math.max(
			1,
			parseInt(process.env.MODEL_1_MAX_MESSAGE_LENGTH || process.env.MAX_MESSAGE_LENGTH || '10000', 10) || 10000
		),
		model2MaxModelContext: Math.max(
			1000,
			parseInt(process.env.MODEL_2_MAX_MODEL_CONTEXT || process.env.MAX_MODEL_CONTEXT || '262144', 10) || 262144
		),
		model2CompactionUiThreshold: Math.max(
			1000,
			parseInt(process.env.MODEL_2_COMPACTION_UI_THRESHOLD || process.env.COMPACTION_UI_THRESHOLD || '209715', 10) || 209715
		),
		model2TargetConstructedContext: Math.max(
			1000,
			parseInt(process.env.MODEL_2_TARGET_CONSTRUCTED_CONTEXT || process.env.TARGET_CONSTRUCTED_CONTEXT || '157286', 10) || 157286
		),
		model2MaxMessageLength: Math.max(
			1,
			parseInt(process.env.MODEL_2_MAX_MESSAGE_LENGTH || process.env.MAX_MESSAGE_LENGTH || '10000', 10) || 10000
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
    databasePath,
    model1: {
			baseUrl: process.env.MODEL_1_BASEURL || 'http://localhost:30001/v1',
			apiKey: process.env.MODEL_1_API_KEY || '',
			modelName: process.env.MODEL_1_NAME || 'model-1',
			displayName: process.env.MODEL_1_DISPLAY_NAME || 'Model 1',
			systemPrompt: process.env.SYSTEM_PROMPT || process.env.MODEL_1_SYSTEM_PROMPT || '',
			flowId: process.env.MODEL_1_FLOW_ID || process.env.LANGFLOW_FLOW_ID || '',
			componentId: process.env.MODEL_1_COMPONENT_ID || '',
			maxTokens: process.env.MODEL_1_MAX_TOKENS
				? Math.max(1, parseInt(process.env.MODEL_1_MAX_TOKENS, 10) || 1)
				: null,
    },
    model2: {
			baseUrl: process.env.MODEL_2_BASEURL || '',
			apiKey: process.env.MODEL_2_API_KEY || '',
			modelName: process.env.MODEL_2_NAME || '',
			displayName: process.env.MODEL_2_DISPLAY_NAME || 'Model 2',
			systemPrompt: process.env.SYSTEM_PROMPT || process.env.MODEL_2_SYSTEM_PROMPT || '',
      flowId: process.env.MODEL_2_FLOW_ID || process.env.LANGFLOW_FLOW_ID || '',
      componentId: process.env.MODEL_2_COMPONENT_ID || '',
      maxTokens: process.env.MODEL_2_MAX_TOKENS
        ? Math.max(1, parseInt(process.env.MODEL_2_MAX_TOKENS, 10) || 1)
        : null,
    },
    model2Enabled: process.env.MODEL_2_ENABLED !== 'false',
    honchoApiKey: process.env.HONCHO_API_KEY || '',
    honchoBaseUrl: process.env.HONCHO_BASE_URL || 'http://localhost:8000',
    honchoWorkspace,
    honchoIdentityNamespace:
      process.env.HONCHO_IDENTITY_NAMESPACE ||
      buildDefaultHonchoIdentityNamespace(databasePath, honchoWorkspace),
    honchoEnabled: process.env.HONCHO_ENABLED === 'true',
    honchoContextWaitMs: Math.max(
      0,
      parseInt(process.env.HONCHO_CONTEXT_WAIT_MS || '8000', 10) || 8000
    ),
    honchoPersonaContextWaitMs: Math.max(
      0,
      parseInt(process.env.HONCHO_PERSONA_CONTEXT_WAIT_MS || '8000', 10) || 8000
    ),
    honchoOverviewWaitMs: Math.max(
      0,
      parseInt(process.env.HONCHO_OVERVIEW_WAIT_MS || '10000', 10) || 10000
    ),
    memoryMaintenanceIntervalMinutes: Math.max(
      0,
      parseInt(process.env.MEMORY_MAINTENANCE_INTERVAL_MINUTES || '0', 10) || 0
    ),
    mineruApiUrl: process.env.MINERU_API_URL || 'http://127.0.0.1:8001',
    mineruTimeoutMs: Math.max(
      10000,
      parseInt(process.env.MINERU_TIMEOUT_MS || process.env.REQUEST_TIMEOUT_MS || '300000', 10) ||
        300000
    ),
    systemPrompt: process.env.SYSTEM_PROMPT || '',
    braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY || '',
    concurrentStreamLimit: Math.max(
      1,
      parseInt(process.env.CONCURRENT_STREAM_LIMIT || '3', 10) || 3
    ),
    perUserStreamLimit: Math.max(
      1,
      parseInt(process.env.PER_USER_STREAM_LIMIT || '1', 10) || 1
    ),
    maxFileUploadSize: Math.max(
      1048576,
      parseInt(process.env.MAX_FILE_UPLOAD_SIZE || '104857600', 10) || 104857600
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
	const resolved = getConfig() as unknown as Record<PropertyKey, unknown>;
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
