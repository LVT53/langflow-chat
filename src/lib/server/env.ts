// src/lib/server/env.ts
// Centralized environment configuration module

interface Config {
  langflowApiUrl: string;
  langflowApiKey: string;
  langflowFlowId: string;
  nemotronUrl: string;
  nemotronApiKey: string;
  nemotronModel: string;
  webhookPort: number;
  requestTimeoutMs: number;
  maxMessageLength: number;
  sessionSecret: string;
  databasePath: string;
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
    nemotronUrl: process.env.NEMOTRON_URL || 'http://192.168.1.96:30001/v1',
    nemotronApiKey: process.env.NEMOTRON_API_KEY || '',
    nemotronModel: process.env.NEMOTRON_MODEL || 'nemotron-nano',
    webhookPort,
    requestTimeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '120000', 10),
    maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH || '10000', 10),
    sessionSecret,
    databasePath: process.env.DATABASE_PATH || './data/chat.db'
  };
};

export const config = getConfig();
