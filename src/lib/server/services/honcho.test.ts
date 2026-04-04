import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockConfig,
  mockDisplayArtifact,
  mockPromptArtifact,
  mockResolvePromptAttachmentArtifacts,
  mockSelectWorkingSetArtifactsForPrompt,
  mockFindRelevantKnowledgeArtifacts,
  mockFindRelevantWorkCapsules,
  mockUpdateConversationContextStatus,
  mockCanUseContextSummarizer,
  mockCanUseTeiReranker,
  mockFormatTaskStateForPrompt,
  mockGetContextDebugState,
  mockGetPromptArtifactSnippets,
  mockPrepareTaskContext,
  mockRequestStructuredControlModel,
  mockRerankItems,
  mockSummarizeHistoricalContext,
  mockSessionQueueStatus,
  mockSessionContext,
  mockSessionAddPeers,
  mockSessionDelete,
  mockPeerContext,
  mockPeerChat,
  mockPeerSetCard,
  mockPeerSessions,
  mockScopeList,
  mockScopeDelete,
  mockScopeCreate,
  mockBuildPersonaPromptContext,
  mockListMessages,
  mockGetLatestHonchoMetadata,
  mockBuildActiveDocumentState,
} = vi.hoisted(() => {
  const now = Date.now();
  const mockConfig = {
    honchoApiKey: '',
    honchoBaseUrl: 'http://localhost:8000',
    honchoWorkspace: 'test-workspace',
    honchoEnabled: false,
    honchoContextWaitMs: 3000,
    honchoContextPollIntervalMs: 250,
    honchoPersonaContextWaitMs: 1500,
  };
  const mockDisplayArtifact = {
    id: 'source-attachment-1',
    userId: 'user-123',
    type: 'source_document' as const,
    retrievalClass: 'durable' as const,
    name: 'test.txt',
    mimeType: 'text/plain',
    sizeBytes: 151,
    conversationId: 'conv-456',
    summary: null,
    createdAt: now,
    updatedAt: now,
    extension: '.txt',
    storagePath: null,
    contentText: null,
    metadata: null,
  };
  const mockPromptArtifact = {
    ...mockDisplayArtifact,
    id: 'normalized-attachment-1',
    type: 'normalized_document' as const,
    contentText: 'This is the normalized attachment text that must reach the model.',
  };

  return {
    mockConfig,
    mockDisplayArtifact,
    mockPromptArtifact,
    mockResolvePromptAttachmentArtifacts: vi.fn(async () => ({
      displayArtifacts: [mockDisplayArtifact],
      promptArtifacts: [mockPromptArtifact],
      unresolvedItems: [],
    })),
    mockSelectWorkingSetArtifactsForPrompt: vi.fn(async () => []),
    mockFindRelevantKnowledgeArtifacts: vi.fn(async () => []),
    mockFindRelevantWorkCapsules: vi.fn(async () => []),
    mockUpdateConversationContextStatus: vi.fn(async () => ({
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
      updatedAt: now,
    })),
    mockCanUseContextSummarizer: vi.fn(() => false),
    mockCanUseTeiReranker: vi.fn(() => false),
    mockFormatTaskStateForPrompt: vi.fn((taskState: { objective: string }) => `Objective: ${taskState.objective}`),
    mockGetContextDebugState: vi.fn(async () => null),
    mockGetPromptArtifactSnippets: vi.fn(async ({ artifacts }: { artifacts: Array<{ id: string; contentText: string | null }> }) =>
      new Map(artifacts.map((artifact) => [artifact.id, artifact.contentText ?? '']))
    ),
    mockPrepareTaskContext: vi.fn(async ({ currentAttachments }: { currentAttachments: unknown[] }) => ({
      taskState: null,
      routingStage: 'deterministic' as const,
      routingConfidence: 0,
      verificationStatus: 'skipped' as const,
      selectedArtifacts: currentAttachments,
      pinnedArtifactIds: [],
      excludedArtifactIds: [],
    })),
    mockRequestStructuredControlModel: vi.fn(),
    mockRerankItems: vi.fn(),
    mockSummarizeHistoricalContext: vi.fn(async () => null),
    mockSessionQueueStatus: vi.fn(async () => ({
      pendingWorkUnits: 0,
      inProgressWorkUnits: 0,
    })),
    mockSessionContext: vi.fn(async () => ({
      messages: [],
      summary: null,
      peerRepresentation: null,
      peerCard: null,
    })),
    mockSessionAddPeers: vi.fn(async () => undefined),
    mockSessionDelete: vi.fn(async () => undefined),
    mockPeerContext: vi.fn(async () => ({ representation: null, peerCard: null })),
    mockPeerChat: vi.fn(async () => ''),
    mockPeerSetCard: vi.fn(async () => []),
    mockPeerSessions: vi.fn(async () => ({ toArray: async () => [] })),
    mockScopeList: vi.fn(async () => ({ toArray: async () => [] })),
    mockScopeDelete: vi.fn(async () => undefined),
    mockScopeCreate: vi.fn(async () => undefined),
    mockBuildPersonaPromptContext: vi.fn(async () => ''),
    mockListMessages: vi.fn(async () => []),
    mockGetLatestHonchoMetadata: vi.fn(async () => ({
      honchoContext: null,
      honchoSnapshot: null,
    })),
    mockBuildActiveDocumentState: vi.fn(
      ({
        attachmentIds,
        activeDocumentArtifactId,
        message,
      }: {
        attachmentIds?: string[];
        activeDocumentArtifactId?: string;
        message: string;
      }) => {
        const hasReset =
          /\b(done with (?:that|this|it)|finished with (?:that|this|it)|finished (?:that|this|it)|completed (?:that|this|it)|that(?:'s| is) done|wrapped up|move on|switch topics|new topic|another topic|something else|let's talk about something else)\b/i.test(
            message,
          );
        const documentFocused =
          !hasReset &&
          (Boolean(activeDocumentArtifactId) ||
            (attachmentIds?.length ?? 0) > 0 ||
            /\b(document|doc|file|pdf|attachment|attached|resume|cv|recipe|job description|contract|report)\b/i.test(
              message,
            ));

        return {
          documentFocused,
          hasRecentUserCorrection: false,
          hasContextResetSignal: hasReset,
          activeDocumentIds: new Set<string>(),
          correctionTargetIds: new Set<string>(),
          recentlyRefinedFamilyId: null,
          recentlyRefinedArtifactIds: new Set<string>(),
          currentGeneratedArtifactId: null,
          latestGeneratedArtifactIds: [],
          currentGeneratedReasonCodes: new Set<string>(),
        };
      },
    ),
  };
});

vi.mock('../config-store', () => ({
  getConfig: () => mockConfig,
}));

vi.mock('@honcho-ai/sdk', () => {
  const makeScope = () => ({
    list: mockScopeList,
    delete: mockScopeDelete,
    create: mockScopeCreate,
  });

  class Honcho {
    async session(id: string) {
      return {
        id,
        addPeers: mockSessionAddPeers,
        queueStatus: mockSessionQueueStatus,
        context: mockSessionContext,
        addMessages: vi.fn(async () => []),
        uploadFile: vi.fn(async () => undefined),
        delete: mockSessionDelete,
      };
    }

    async peer(id: string) {
      const conclusions = makeScope();
      return {
        id,
        context: mockPeerContext,
        chat: mockPeerChat,
        setCard: mockPeerSetCard,
        sessions: mockPeerSessions,
        conclusions,
        conclusionsOf: vi.fn(() => makeScope()),
        message: (content: string, options?: { metadata?: Record<string, unknown> }) => ({
          content,
          metadata: options?.metadata ?? {},
          peerId: id,
          createdAt: new Date().toISOString(),
        }),
      };
    }
  }

  return { Honcho };
});

// Mock env config
vi.mock('../env', () => ({
  getDatabasePath: () => './data/test.db',
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
      componentId: '',
    },
    model2: {
      baseUrl: '',
      apiKey: '',
      modelName: '',
      displayName: 'Model 2',
      systemPrompt: 'default',
      flowId: '',
      componentId: '',
    },
    honchoApiKey: '',
    honchoBaseUrl: 'http://localhost:8000',
    honchoWorkspace: 'test-workspace',
    honchoEnabled: false,
    honchoContextWaitMs: 3000,
    honchoContextPollIntervalMs: 250,
    honchoPersonaContextWaitMs: 1500,
  },
}));

// Mock db (required by config-store)
const mockHonchoPeerVersion = vi.hoisted(() => ({ value: 0 }));

vi.mock('../db', () => ({
  db: {
    select: () => {
      let table: { __name?: string } | null = null;
      return {
        from(nextTable: { __name?: string }) {
          table = nextTable;
          return {
            where: vi.fn(() => ({
              limit: vi.fn(async () =>
                table?.__name === 'users'
                  ? [{ honchoPeerVersion: mockHonchoPeerVersion.value }]
                  : []
              ),
            })),
          };
        },
      };
    },
    update: () => ({
      set: (values: { honchoPeerVersion?: number }) => ({
        where: vi.fn(async () => {
          if (typeof values.honchoPeerVersion === 'number') {
            mockHonchoPeerVersion.value = values.honchoPeerVersion;
          }
        }),
      }),
    }),
    delete: () => ({
      where: vi.fn(async () => undefined),
    }),
  },
}));

vi.mock('../db/schema', () => ({
  adminConfig: {},
  personaMemoryAttributions: {
    userId: { name: 'userId' },
    conclusionId: { name: 'conclusionId' },
    conversationId: { name: 'conversationId' },
  },
  users: {
    __name: 'users',
    id: { name: 'id' },
    honchoPeerVersion: { name: 'honchoPeerVersion' },
  },
}));

vi.mock('./knowledge', () => ({
  getCompactionUiThreshold: () => 209715,
  getMaxModelContext: () => 262144,
  getTargetConstructedContext: () => 157286,
  findRelevantKnowledgeArtifacts: mockFindRelevantKnowledgeArtifacts,
  findRelevantWorkCapsules: mockFindRelevantWorkCapsules,
  getArtifactsForUser: vi.fn(async () => []),
  resolvePromptAttachmentArtifacts: mockResolvePromptAttachmentArtifacts,
  selectWorkingSetArtifactsForPrompt: mockSelectWorkingSetArtifactsForPrompt,
  updateConversationContextStatus: mockUpdateConversationContextStatus,
  WORKING_SET_DOCUMENT_TOKEN_BUDGET: 1500,
  WORKING_SET_OUTPUT_TOKEN_BUDGET: 2000,
  WORKING_SET_PROMPT_TOKEN_BUDGET: 12000,
}));

vi.mock('./task-state', () => ({
  canUseContextSummarizer: mockCanUseContextSummarizer,
  formatTaskStateForPrompt: mockFormatTaskStateForPrompt,
  getContextDebugState: mockGetContextDebugState,
  getPromptArtifactSnippets: mockGetPromptArtifactSnippets,
  prepareTaskContext: mockPrepareTaskContext,
  requestStructuredControlModel: mockRequestStructuredControlModel,
  summarizeHistoricalContext: mockSummarizeHistoricalContext,
}));

vi.mock('./tei-reranker', () => ({
  canUseTeiReranker: mockCanUseTeiReranker,
  rerankItems: mockRerankItems,
}));

vi.mock('./persona-memory', () => ({
  buildPersonaPromptContext: mockBuildPersonaPromptContext,
}));

vi.mock('./active-state', () => ({
  buildActiveDocumentState: mockBuildActiveDocumentState,
}));

vi.mock('./messages', () => ({
  listMessages: mockListMessages,
  getLatestHonchoMetadata: mockGetLatestHonchoMetadata,
}));

describe('Honcho Service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockHonchoPeerVersion.value = 0;
    mockConfig.honchoEnabled = false;
    mockConfig.honchoContextWaitMs = 3000;
    mockConfig.honchoContextPollIntervalMs = 250;
    mockConfig.honchoPersonaContextWaitMs = 1500;
    mockCanUseTeiReranker.mockReturnValue(false);
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

    it('rotates Honcho peer ids after a reset version bump', async () => {
      const { getHonchoUserPeerId, getHonchoAssistantPeerId, rotateHonchoPeerIdentity } =
        await import('./honcho');

      expect(getHonchoUserPeerId('user-123')).toBe('user-123');
      expect(getHonchoAssistantPeerId('user-123')).toBe('assistant_user-123');

      await rotateHonchoPeerIdentity('user-123');

      expect(getHonchoUserPeerId('user-123')).toBe('user-123_v1');
      expect(getHonchoAssistantPeerId('user-123')).toBe('assistant_user-123_v1');
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

  describe('memory clearing', () => {
    it('clears Honcho peer cards when forgetting all persona memories', async () => {
      mockConfig.honchoEnabled = true;
      mockScopeList
        .mockResolvedValueOnce({
          toArray: async () => [
            {
              id: 'self-memory-1',
              content: 'User likes concise responses.',
              sessionId: null,
              createdAt: '2026-04-04T10:00:00.000Z',
            },
          ],
        })
        .mockResolvedValueOnce({
          toArray: async () => [
            {
              id: 'assistant-memory-1',
              content: 'Assistant knows the user is a designer.',
              sessionId: null,
              createdAt: '2026-04-04T10:01:00.000Z',
            },
          ],
        });

      const { forgetAllPersonaMemories } = await import('./honcho');

      const deletedCount = await forgetAllPersonaMemories('user-123');

      expect(deletedCount).toBe(2);
      expect(mockScopeDelete).toHaveBeenCalledWith('self-memory-1');
      expect(mockScopeDelete).toHaveBeenCalledWith('assistant-memory-1');
      expect(mockPeerSetCard).toHaveBeenCalledTimes(4);
      expect(mockPeerSetCard).toHaveBeenNthCalledWith(1, [], undefined);
      expect(mockPeerSetCard).toHaveBeenNthCalledWith(2, [], undefined);
      expect(mockPeerSetCard).toHaveBeenNthCalledWith(3, [], expect.objectContaining({ id: 'assistant_user-123' }));
      expect(mockPeerSetCard).toHaveBeenNthCalledWith(4, [], expect.objectContaining({ id: 'user-123' }));
    });

    it('clears peer cards and sessions when deleting all Honcho state for a user', async () => {
      mockConfig.honchoEnabled = true;
      mockScopeList
        .mockResolvedValueOnce({ toArray: async () => [] })
        .mockResolvedValueOnce({ toArray: async () => [] })
        .mockResolvedValueOnce({ toArray: async () => [] })
        .mockResolvedValueOnce({ toArray: async () => [] });
      mockPeerSessions
        .mockResolvedValueOnce({
          toArray: async () => [{ id: 'session-a' }, { id: 'session-b' }],
        })
        .mockResolvedValueOnce({
          toArray: async () => [{ id: 'session-b' }, { id: 'session-c' }],
        });

      const { deleteAllHonchoStateForUser } = await import('./honcho');

      await deleteAllHonchoStateForUser('user-123');

      expect(mockPeerSetCard).toHaveBeenCalledTimes(4);
      expect(mockSessionDelete).toHaveBeenCalledTimes(3);
    });
  });

  describe('buildEnhancedSystemPrompt', () => {
    it('should return base prompt when Honcho is disabled', async () => {
      const { buildEnhancedSystemPrompt } = await import('./honcho');
      const result = await buildEnhancedSystemPrompt('default', 'user-123');
      expect(result).toContain('You are a helpful AI assistant.');
      expect(result).toContain('Retrieved Context Discipline');
      expect(result).toContain('User profile and persona memory describe the human user, not you.');
    });
  });

  describe('buildConstructedContext', () => {
    it('falls back to persisted conversation messages when Honcho is disabled', async () => {
      mockListMessages.mockResolvedValueOnce([
        {
          id: 'msg-1',
          role: 'user',
          content: 'First stored question',
          timestamp: Date.parse('2026-03-26T10:00:00.000Z'),
        },
        {
          id: 'msg-2',
          role: 'assistant',
          content: 'First stored answer',
          timestamp: Date.parse('2026-03-26T10:00:01.000Z'),
        },
      ]);

      const { buildConstructedContext } = await import('./honcho');

      const result = await buildConstructedContext({
        userId: 'user-123',
        conversationId: 'conv-456',
        message: 'Continue the discussion.',
      });

      expect(result.inputValue).toContain('## Honcho Session Context');
      expect(result.inputValue).toContain('USER: First stored question');
      expect(result.inputValue).toContain('ASSISTANT: First stored answer');
      expect(mockSessionQueueStatus).not.toHaveBeenCalled();
      expect(mockSessionContext).not.toHaveBeenCalled();
      expect(result.honchoContext).toBeNull();
    });

    it('keeps the current attachments section when historical reranking is effectively a no-op', async () => {
      const { buildConstructedContext } = await import('./honcho');

      const result = await buildConstructedContext({
        userId: 'user-123',
        conversationId: 'conv-456',
        message: 'Could you explain the contents of this file in detail?',
        attachmentIds: [mockDisplayArtifact.id],
        attachmentTraceId: 'trace-attachment-alias',
      });

      expect(result.inputValue).toContain('## Current Attachments');
      expect(result.inputValue).toContain(mockPromptArtifact.contentText);
      expect(result.inputValue).toContain('## Current User Message');
      expect(result.inputValue).toContain('Could you explain the contents of this file in detail?');
      expect(mockPrepareTaskContext).toHaveBeenCalled();
      expect(mockResolvePromptAttachmentArtifacts).toHaveBeenCalledWith('user-123', [mockDisplayArtifact.id]);
    });

    it('threads the active workspace document into retrieval and task preparation', async () => {
      const { buildConstructedContext } = await import('./honcho');

      await buildConstructedContext({
        userId: 'user-123',
        conversationId: 'conv-456',
        message: 'Refine the open document.',
        activeDocumentArtifactId: 'generated-artifact-7',
      });

      expect(mockFindRelevantKnowledgeArtifacts).toHaveBeenCalledWith({
        userId: 'user-123',
        query: 'Refine the open document.',
        excludeConversationId: 'conv-456',
        currentConversationId: 'conv-456',
        limit: 6,
        preferredArtifactId: 'generated-artifact-7',
        preferredGeneratedFamilyId: null,
        suppressGeneratedCarryover: false,
      });
      expect(mockPrepareTaskContext).toHaveBeenCalledWith(
        expect.objectContaining({
          activeDocumentArtifactId: 'generated-artifact-7',
        })
      );
    });

    it('does not keep document-focused snippet budgets when the user explicitly moves on', async () => {
      const { buildConstructedContext } = await import('./honcho');

      await buildConstructedContext({
        userId: 'user-123',
        conversationId: 'conv-456',
        message: "We're done with that document, let's talk about something else.",
        activeDocumentArtifactId: 'generated-artifact-7',
      });

      expect(mockGetPromptArtifactSnippets).toHaveBeenCalledWith(
        expect.objectContaining({
          perArtifactLimit: 2,
          perArtifactCharBudget: 1400,
        })
      );
      expect(mockFindRelevantKnowledgeArtifacts).toHaveBeenCalledWith(
        expect.objectContaining({
          suppressGeneratedCarryover: true,
        })
      );
    });

    it('counts recent turns by user-led turns instead of raw message count', async () => {
      mockListMessages.mockResolvedValueOnce([
        { id: 'msg-1', role: 'user', content: 'Turn 1 question', timestamp: Date.parse('2026-03-26T10:00:00.000Z') },
        { id: 'msg-2', role: 'assistant', content: 'Turn 1 answer', timestamp: Date.parse('2026-03-26T10:00:01.000Z') },
        { id: 'msg-3', role: 'user', content: 'Turn 2 question', timestamp: Date.parse('2026-03-26T10:01:00.000Z') },
        { id: 'msg-4', role: 'assistant', content: 'Turn 2 answer', timestamp: Date.parse('2026-03-26T10:01:01.000Z') },
        { id: 'msg-5', role: 'user', content: 'Turn 3 question', timestamp: Date.parse('2026-03-26T10:02:00.000Z') },
        { id: 'msg-6', role: 'assistant', content: 'Turn 3 answer', timestamp: Date.parse('2026-03-26T10:02:01.000Z') },
        { id: 'msg-7', role: 'user', content: 'Turn 4 question', timestamp: Date.parse('2026-03-26T10:03:00.000Z') },
        { id: 'msg-8', role: 'assistant', content: 'Turn 4 answer', timestamp: Date.parse('2026-03-26T10:03:01.000Z') },
      ]);

      const { buildConstructedContext } = await import('./honcho');

      await buildConstructedContext({
        userId: 'user-123',
        conversationId: 'conv-456',
        message: 'Continue from earlier.',
      });

      expect(mockUpdateConversationContextStatus).toHaveBeenLastCalledWith(
        expect.objectContaining({
          recentTurnCount: 4,
        })
      );
    });

    it('uses live Honcho session context when the queue is clear', async () => {
      mockConfig.honchoEnabled = true;
      mockSessionContext.mockResolvedValueOnce({
        messages: [
          {
            peerId: 'user-123',
            content: 'Prior user turn',
            createdAt: '2026-03-26T10:00:00.000Z',
            metadata: { role: 'user' },
          },
          {
            peerId: 'assistant_user-123',
            content: 'Prior assistant turn',
            createdAt: '2026-03-26T10:00:01.000Z',
            metadata: { role: 'assistant' },
          },
        ],
        summary: { content: 'Live Honcho summary' },
        peerRepresentation: null,
        peerCard: null,
      });
      mockBuildPersonaPromptContext.mockResolvedValueOnce('- Prefers short answers');

      const { buildConstructedContext } = await import('./honcho');

      const result = await buildConstructedContext({
        userId: 'user-123',
        conversationId: 'conv-live',
        message: 'Continue from the live context.',
      });

      expect(mockSessionAddPeers).toHaveBeenCalled();
      expect(mockSessionQueueStatus).toHaveBeenCalledTimes(1);
      expect(mockSessionContext).toHaveBeenCalledWith({
        summary: true,
        searchQuery: 'Continue from the live context.',
        tokens: 2000,
      });
      expect(result.inputValue).toContain('## Session Summary');
      expect(result.inputValue).toContain('Live Honcho summary');
      expect(result.inputValue).toContain('## Honcho Session Context');
      expect(result.inputValue).toContain('USER: Prior user turn');
      expect(result.inputValue).toContain('ASSISTANT: Prior assistant turn');
      expect(mockBuildPersonaPromptContext).toHaveBeenCalledWith(
        'user-123',
        'Continue from the live context.'
      );
      expect(result.honchoContext).toMatchObject({
        source: 'live',
        fallbackReason: null,
      });
      expect(result.honchoSnapshot).toMatchObject({
        summary: 'Live Honcho summary',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'Prior user turn' }),
          expect.objectContaining({ role: 'assistant', content: 'Prior assistant turn' }),
        ]),
      });
    });

    it('polls queue status before building live Honcho context', async () => {
      vi.useFakeTimers();
      try {
        mockConfig.honchoEnabled = true;
        mockConfig.honchoContextWaitMs = 200;
        mockConfig.honchoContextPollIntervalMs = 50;
        mockSessionQueueStatus
          .mockResolvedValueOnce({ pendingWorkUnits: 2, inProgressWorkUnits: 0 })
          .mockResolvedValueOnce({ pendingWorkUnits: 0, inProgressWorkUnits: 0 });
        mockSessionContext.mockResolvedValueOnce({
          messages: [
            {
              peerId: 'user-123',
              content: 'Queued user context',
              createdAt: '2026-03-26T10:00:00.000Z',
              metadata: { role: 'user' },
            },
          ],
          summary: null,
          peerRepresentation: null,
          peerCard: null,
        });

        const { buildConstructedContext } = await import('./honcho');

        const resultPromise = buildConstructedContext({
          userId: 'user-123',
          conversationId: 'conv-queued',
          message: 'Continue once Honcho catches up.',
        });

        await vi.advanceTimersByTimeAsync(60);
        const result = await resultPromise;

        expect(mockSessionQueueStatus).toHaveBeenCalledTimes(2);
        expect(mockSessionContext).toHaveBeenCalledTimes(1);
        expect(result.honchoContext).toMatchObject({
          source: 'live',
          queuePendingWorkUnits: 0,
          queueInProgressWorkUnits: 0,
        });
        expect(result.inputValue).toContain('Queued user context');
      } finally {
        mockConfig.honchoContextWaitMs = 3000;
        mockConfig.honchoContextPollIntervalMs = 250;
        mockConfig.honchoPersonaContextWaitMs = 1500;
        vi.useRealTimers();
      }
    });

    it('uses a shorter dedicated timeout for persona prompt context', async () => {
      vi.useFakeTimers();
      try {
        mockConfig.honchoEnabled = true;
        mockConfig.honchoContextWaitMs = 500;
        mockConfig.honchoPersonaContextWaitMs = 50;
        mockSessionContext.mockResolvedValueOnce({
          messages: [
            {
              peerId: 'user-123',
              content: 'Live Honcho context is available',
              createdAt: '2026-03-26T10:00:00.000Z',
              metadata: { role: 'user' },
            },
          ],
          summary: { content: 'Live Honcho summary' },
          peerRepresentation: null,
          peerCard: null,
        });
        mockBuildPersonaPromptContext.mockImplementationOnce(() => new Promise(() => undefined));

        const { buildConstructedContext } = await import('./honcho');

        const resultPromise = buildConstructedContext({
          userId: 'user-123',
          conversationId: 'conv-persona-timeout',
          message: 'Use the live Honcho session context.',
        });

        await vi.advanceTimersByTimeAsync(60);
        const result = await resultPromise;

        expect(result.honchoContext).toMatchObject({
          source: 'live',
          fallbackReason: null,
        });
        expect(result.inputValue).toContain('Live Honcho summary');
        expect(result.inputValue).not.toContain('## User Memory');
      } finally {
        mockConfig.honchoContextWaitMs = 3000;
        mockConfig.honchoContextPollIntervalMs = 250;
        mockConfig.honchoPersonaContextWaitMs = 1500;
        vi.useRealTimers();
      }
    });

    it('falls back to the latest stored Honcho snapshot when live Honcho times out', async () => {
      vi.useFakeTimers();
      try {
        mockConfig.honchoEnabled = true;
        mockConfig.honchoContextWaitMs = 100;
        mockConfig.honchoContextPollIntervalMs = 50;
        mockGetLatestHonchoMetadata.mockResolvedValueOnce({
          honchoContext: {
            source: 'live',
            waitedMs: 10,
            queuePendingWorkUnits: 0,
            queueInProgressWorkUnits: 0,
            fallbackReason: null,
            snapshotCreatedAt: 111,
          },
          honchoSnapshot: {
            createdAt: 111,
            summary: 'Stored Honcho summary',
            messages: [
              {
                role: 'user',
                content: 'Stored snapshot question',
                createdAt: Date.parse('2026-03-26T10:00:00.000Z'),
              },
              {
                role: 'assistant',
                content: 'Stored snapshot answer',
                createdAt: Date.parse('2026-03-26T10:00:01.000Z'),
              },
            ],
          },
        });
        mockSessionContext.mockImplementationOnce(
          () => new Promise(() => undefined)
        );

        const { buildConstructedContext } = await import('./honcho');

        const resultPromise = buildConstructedContext({
          userId: 'user-123',
          conversationId: 'conv-snapshot',
          message: 'Continue from the stored snapshot.',
        });

        await vi.advanceTimersByTimeAsync(120);
        const result = await resultPromise;

        expect(result.honchoContext).toMatchObject({
          source: 'snapshot',
          fallbackReason: 'timeout',
          snapshotCreatedAt: 111,
        });
        expect(result.inputValue).toContain('Stored Honcho summary');
        expect(result.inputValue).toContain('Stored snapshot question');
        expect(result.inputValue).toContain('Stored snapshot answer');
      } finally {
        mockConfig.honchoContextWaitMs = 3000;
        mockConfig.honchoContextPollIntervalMs = 250;
        vi.useRealTimers();
      }
    });

    it('falls back to persisted conversation messages only when neither live Honcho nor snapshots are available', async () => {
      vi.useFakeTimers();
      try {
        mockConfig.honchoEnabled = true;
        mockConfig.honchoContextWaitMs = 100;
        mockConfig.honchoContextPollIntervalMs = 50;
        mockListMessages.mockResolvedValueOnce([
          {
            id: 'msg-1',
            role: 'user',
            content: 'Stored fallback question',
            timestamp: Date.parse('2026-03-26T10:00:00.000Z'),
          },
          {
            id: 'msg-2',
            role: 'assistant',
            content: 'Stored fallback answer',
            timestamp: Date.parse('2026-03-26T10:00:01.000Z'),
          },
        ]);
        mockSessionContext.mockImplementationOnce(
          () => new Promise(() => undefined)
        );

        const { buildConstructedContext } = await import('./honcho');

        const resultPromise = buildConstructedContext({
          userId: 'user-123',
          conversationId: 'conv-stored',
          message: 'Continue from stored fallback context.',
        });

        await vi.advanceTimersByTimeAsync(120);
        const result = await resultPromise;

        expect(result.honchoContext).toMatchObject({
          source: 'persisted_fallback',
          fallbackReason: 'timeout',
          snapshotCreatedAt: null,
        });
        expect(result.inputValue).toContain('Stored fallback question');
        expect(result.inputValue).toContain('Stored fallback answer');
      } finally {
        mockConfig.honchoContextWaitMs = 3000;
        mockConfig.honchoContextPollIntervalMs = 250;
        vi.useRealTimers();
      }
    });

    it('still attempts live Honcho on a fresh conversation before degrading', async () => {
      vi.useFakeTimers();
      try {
        mockConfig.honchoEnabled = true;
        mockConfig.honchoContextWaitMs = 100;
        mockConfig.honchoContextPollIntervalMs = 50;
        mockListMessages.mockResolvedValueOnce([]);
        mockSessionContext.mockImplementationOnce(
          () => new Promise(() => undefined)
        );

        const { buildConstructedContext } = await import('./honcho');

        const resultPromise = buildConstructedContext({
          userId: 'user-123',
          conversationId: 'conv-fresh',
          message: 'Say exactly: fresh context ok.',
        });

        await vi.advanceTimersByTimeAsync(120);
        const result = await resultPromise;

        expect(mockSessionAddPeers).toHaveBeenCalled();
        expect(mockSessionQueueStatus).toHaveBeenCalled();
        expect(mockSessionContext).toHaveBeenCalled();
        expect(result.honchoContext).toMatchObject({
          source: 'persisted_fallback',
          fallbackReason: 'timeout',
        });
        expect(result.inputValue).toContain('## Current User Message');
        expect(result.inputValue).toContain('Say exactly: fresh context ok.');
      } finally {
        mockConfig.honchoContextWaitMs = 3000;
        mockConfig.honchoContextPollIntervalMs = 250;
        vi.useRealTimers();
      }
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

    it('times out the peer overview instead of waiting indefinitely', async () => {
      vi.useFakeTimers();
      try {
        mockConfig.honchoEnabled = true;
        mockConfig.honchoPersonaContextWaitMs = 50;
        mockPeerChat.mockImplementationOnce(() => new Promise(() => undefined));

        const { getPeerContext } = await import('./honcho');

        const resultPromise = getPeerContext('user-123', 'Test User');
        await vi.advanceTimersByTimeAsync(60);
        const result = await resultPromise;

        expect(result).toBeNull();
        expect(mockPeerChat).toHaveBeenCalledTimes(1);
      } finally {
        mockConfig.honchoPersonaContextWaitMs = 1500;
        vi.useRealTimers();
      }
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
