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
    contextSummarizerUrl: '',
    contextSummarizerApiKey: '',
    contextSummarizerModel: '',
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

vi.mock('./knowledge', () => ({
  COMPACTION_UI_THRESHOLD: 209715,
  MAX_MODEL_CONTEXT: 262144,
  TARGET_CONSTRUCTED_CONTEXT: 157286,
  findRelevantKnowledgeArtifacts: vi.fn(async () => []),
  findRelevantWorkCapsules: vi.fn(async () => []),
  getArtifactsForUser: vi.fn(async () => []),
  selectWorkingSetArtifactsForPrompt: vi.fn(async () => []),
  updateConversationContextStatus: vi.fn(async () => ({
    conversationId: 'conv-456',
    userId: 'user-123',
    estimatedTokens: 0,
    maxContextTokens: 262144,
    thresholdTokens: 209715,
    targetTokens: 157286,
    compactionApplied: false,
    compactionMode: 'none',
    routingStage: 'deterministic',
    routingConfidence: 0,
    verificationStatus: 'skipped',
    layersUsed: [],
    workingSetCount: 0,
    workingSetArtifactIds: [],
    workingSetApplied: false,
    taskStateApplied: false,
    promptArtifactCount: 0,
    recentTurnCount: 0,
    summary: null,
    updatedAt: Date.now(),
  })),
  WORKING_SET_DOCUMENT_TOKEN_BUDGET: 1500,
  WORKING_SET_OUTPUT_TOKEN_BUDGET: 2000,
  WORKING_SET_PROMPT_TOKEN_BUDGET: 12000,
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

  describe('Honcho peer IDs', () => {
    it('keeps compatible user peer ids unchanged', async () => {
      const { getHonchoUserPeerId } = await import('./honcho');
      expect(getHonchoUserPeerId('550e8400-e29b-41d4-a716-446655440000')).toBe(
        '550e8400-e29b-41d4-a716-446655440000'
      );
    });

    it('maps incompatible ids to deterministic safe peer ids', async () => {
      const { getHonchoUserPeerId, getHonchoAssistantPeerId } = await import('./honcho');
      const userPeerId = getHonchoUserPeerId('Jane Doe / sales');
      const assistantPeerId = getHonchoAssistantPeerId('Jane Doe / sales');

      expect(userPeerId).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(userPeerId).not.toContain(' ');
      expect(userPeerId).not.toContain('/');
      expect(getHonchoUserPeerId('Jane Doe / sales')).toBe(userPeerId);

      expect(assistantPeerId).toMatch(/^[a-zA-Z0-9_-]+$/);
      expect(assistantPeerId.startsWith('assistant_')).toBe(true);
      expect(assistantPeerId).not.toContain(':');
    });
  });

  describe('persona memory attribution helpers', () => {
    it('attributes sessionless persona memories only when they are new in the snapshot diff', async () => {
      const { selectPersonaMemoryAttributionCandidates } = await import('./honcho');

      const candidates = selectPersonaMemoryAttributionCandidates({
        conversationId: 'conv-1',
        beforeIds: new Set(['old-memory']),
        records: [
          {
            id: 'old-memory',
            scope: 'self',
            sessionId: null,
          },
          {
            id: 'new-promoted-memory',
            scope: 'assistant_about_user',
            sessionId: null,
          },
          {
            id: 'session-bound-memory',
            scope: 'self',
            sessionId: 'conv-1',
          },
        ],
      });

      expect(candidates).toEqual([
        {
          id: 'new-promoted-memory',
          scope: 'assistant_about_user',
          sessionId: null,
        },
        {
          id: 'session-bound-memory',
          scope: 'self',
          sessionId: 'conv-1',
        },
      ]);
    });

    it('deletes both session-bound and attributed persona memories for a conversation', async () => {
      const { selectConversationPersonaMemoryDeletionIds } = await import('./honcho');

      const ids = selectConversationPersonaMemoryDeletionIds({
        conversationId: 'conv-1',
        attributedIds: ['promoted-memory'],
        records: [
          {
            id: 'session-bound-memory',
            scope: 'self',
            sessionId: 'conv-1',
          },
          {
            id: 'promoted-memory',
            scope: 'assistant_about_user',
            sessionId: null,
          },
          {
            id: 'other-memory',
            scope: 'self',
            sessionId: null,
          },
        ],
      });

      expect(ids).toEqual(['session-bound-memory', 'promoted-memory']);
    });
  });

  describe('buildEnhancedSystemPrompt', () => {
    it('should return base prompt when Honcho is disabled', async () => {
      const { buildEnhancedSystemPrompt } = await import('./honcho');
      const result = await buildEnhancedSystemPrompt('default', 'user-123');
      expect(result).toContain('You are a helpful AI assistant.');
      expect(result).toContain('Retrieved Context Discipline');
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
