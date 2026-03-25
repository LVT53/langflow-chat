import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env config
vi.mock('../env', () => ({
  config: {
    langflowApiUrl: 'http://localhost:7860',
    langflowApiKey: 'test-api-key',
    langflowFlowId: 'test-flow-id',
    langflowWebhookSecret: '',
    translatorUrl: '',
    translatorApiKey: '',
    translatorModel: '',
    translationMaxTokens: 256,
    translationTemperature: 0.1,
    titleGenUrl: '',
    titleGenApiKey: '',
    titleGenModel: '',
    webhookPort: 8090,
    requestTimeoutMs: 5000,
    maxMessageLength: 10000,
    sessionSecret: 'test-secret',
    databasePath: './data/test.db',
    model1: {
      baseUrl: 'http://localhost:30001/v1',
      apiKey: '',
      modelName: 'model-1',
      displayName: 'Model 1',
      systemPrompt: 'default',
      flowId: 'test-flow-id',
    },
    model2: {
      baseUrl: '',
      apiKey: '',
      modelName: '',
      displayName: 'Model 2',
      systemPrompt: 'default',
      flowId: '',
    },
    honchoApiKey: '',
    honchoBaseUrl: 'http://localhost:8000',
    honchoWorkspace: 'test-workspace',
    honchoEnabled: false,
  },
}));

// Mock db (required by config-store)
vi.mock('../db', () => ({
  db: {
    select: () => ({ from: () => [] }),
  },
}));

vi.mock('../db/schema', () => ({
  adminConfig: {},
}));

describe('Honcho Service', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('isHonchoEnabled', () => {
    it('should return false when config has honchoEnabled=false', async () => {
      const { isHonchoEnabled } = await import('./honcho');
      expect(isHonchoEnabled()).toBe(false);
    });
  });

  describe('buildEnhancedSystemPrompt', () => {
    it('should return base prompt when Honcho is disabled', async () => {
      const { buildEnhancedSystemPrompt } = await import('./honcho');
      const result = await buildEnhancedSystemPrompt('default', 'user-123');
      expect(result).toBe('You are a helpful AI assistant.');
    });
  });

  describe('mirrorMessage', () => {
    it('should return immediately when Honcho is disabled', async () => {
      const { mirrorMessage } = await import('./honcho');
      // Should not throw even though Honcho is not configured
      await expect(
        mirrorMessage('user-123', 'conv-456', 'user', 'Hello')
      ).resolves.toBeUndefined();
    });

    it('should return immediately for empty content', async () => {
      const { mirrorMessage } = await import('./honcho');
      await expect(
        mirrorMessage('user-123', 'conv-456', 'user', '  ')
      ).resolves.toBeUndefined();
    });
  });

  describe('getPeerContext', () => {
    it('should return null when Honcho is disabled', async () => {
      const { getPeerContext } = await import('./honcho');
      const result = await getPeerContext('user-123');
      expect(result).toBeNull();
    });
  });

  describe('checkHealth', () => {
    it('should return disabled status when Honcho is disabled', async () => {
      const { checkHealth } = await import('./honcho');
      const result = await checkHealth();
      expect(result).toEqual({
        enabled: false,
        connected: false,
        workspace: null,
      });
    });
  });
});
