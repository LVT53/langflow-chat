import { describe, it, expect, vi, afterEach } from 'vitest'

// Mock process.env for testing
const originalEnv = process.env

describe('Environment Configuration', () => {
  afterEach(() => {
    process.env = { ...originalEnv }
    vi.resetModules()
  })

  it('should throw error when LANGFLOW_API_KEY is missing', async () => {
    // Clear the required env var
    delete process.env.LANGFLOW_API_KEY
    // Keep SESSION_SECRET set to isolate the test
    process.env.SESSION_SECRET = 'test-session-secret-12345678901234567890123456789012'

    await expect(
      import('./env').then(({ config }) => config)
    ).rejects.toThrow('Missing required environment variable: LANGFLOW_API_KEY')
  })

  it('should throw error when SESSION_SECRET is missing', async () => {
    // Clear the required env var
    delete process.env.SESSION_SECRET
    // Keep LANGFLOW_API_KEY set to isolate the test
    process.env.LANGFLOW_API_KEY = 'test-api-key'

    await expect(
      import('./env').then(({ config }) => config)
    ).rejects.toThrow('Missing required environment variable: SESSION_SECRET')
  })

  it('should apply defaults when optional vars are missing', async () => {
    // Set required vars
    process.env.LANGFLOW_API_KEY = 'test-api-key'
    process.env.SESSION_SECRET = 'test-session-secret-12345678901234567890123456789012'

    // Clear optional vars to test defaults
    delete process.env.LANGFLOW_API_URL
    delete process.env.LANGFLOW_FLOW_ID
    delete process.env.LANGFLOW_WEBHOOK_SECRET
    delete process.env.NEMOTRON_URL
    delete process.env.NEMOTRON_API_KEY
    delete process.env.NEMOTRON_MODEL
    delete process.env.WEBHOOK_PORT
    delete process.env.REQUEST_TIMEOUT_MS
    delete process.env.MAX_MESSAGE_LENGTH
    delete process.env.DATABASE_PATH

    const { config } = await import('./env')
    
    expect(config.langflowApiUrl).toBe('http://localhost:7860')
    expect(config.langflowApiKey).toBe('test-api-key')
    expect(config.langflowFlowId).toBe('')
    expect(config.langflowWebhookSecret).toBe('')
    expect(config.nemotronUrl).toBe('http://192.168.1.96:30001/v1')
    expect(config.nemotronApiKey).toBe('')
    expect(config.nemotronModel).toBe('nemotron-nano')
    expect(config.webhookPort).toBe(8090)
    expect(config.requestTimeoutMs).toBe(120000)
    expect(config.maxMessageLength).toBe(10000)
    expect(config.sessionSecret).toBe('test-session-secret-12345678901234567890123456789012')
    expect(config.databasePath).toBe('./data/chat.db')
  })

  it('should return valid config object when all vars are present', async () => {
    // Set all env vars to test values
    process.env.LANGFLOW_API_URL = 'http://test-langflow:8080'
    process.env.LANGFLOW_API_KEY = 'test-api-key-123'
    process.env.LANGFLOW_FLOW_ID = 'test-flow-id'
    process.env.LANGFLOW_WEBHOOK_SECRET = 'test-webhook-secret'
    process.env.NEMOTRON_URL = 'http://test-nemotron:9000/v1'
    process.env.NEMOTRON_API_KEY = 'test-nemotron-key'
    process.env.NEMOTRON_MODEL = 'test-model'
    process.env.WEBHOOK_PORT = '3000'
    process.env.REQUEST_TIMEOUT_MS = '5000'
    process.env.MAX_MESSAGE_LENGTH = '5000'
    process.env.SESSION_SECRET = 'test-session-secret-12345678901234567890123456789012'
    process.env.DATABASE_PATH = './test-data/test.db'

    const { config } = await import('./env')
    
    expect(config.langflowApiUrl).toBe('http://test-langflow:8080')
    expect(config.langflowApiKey).toBe('test-api-key-123')
    expect(config.langflowFlowId).toBe('test-flow-id')
    expect(config.langflowWebhookSecret).toBe('test-webhook-secret')
    expect(config.nemotronUrl).toBe('http://test-nemotron:9000/v1')
    expect(config.nemotronApiKey).toBe('test-nemotron-key')
    expect(config.nemotronModel).toBe('test-model')
    expect(config.webhookPort).toBe(3000)
    expect(config.requestTimeoutMs).toBe(5000)
    expect(config.maxMessageLength).toBe(5000)
    expect(config.sessionSecret).toBe('test-session-secret-12345678901234567890123456789012')
    expect(config.databasePath).toBe('./test-data/test.db')
  })
})
