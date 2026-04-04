import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  selectRows,
  mockShortlistSemanticMatchesBySubject,
  mockCanUseTeiReranker,
  mockRerankItems,
} = vi.hoisted(() => ({
  selectRows: [] as Array<Record<string, unknown>>,
  mockShortlistSemanticMatchesBySubject: vi.fn(async () => []),
  mockCanUseTeiReranker: vi.fn(() => false),
  mockRerankItems: vi.fn(async () => null),
}));

function createSelectChain(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: async () => rows,
    limit: async () => rows,
  };
  return chain;
}

vi.mock('$lib/server/db', () => ({
  db: {
    select: vi.fn(() => createSelectChain(selectRows)),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => []),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => undefined),
    })),
  },
}));

vi.mock('$lib/server/db/schema', () => ({
  artifacts: {},
  conversationContextStatus: {},
  conversationTaskStates: {
    userId: { name: 'userId' },
    conversationId: { name: 'conversationId' },
    status: { name: 'status' },
    updatedAt: { name: 'updatedAt' },
    taskId: { name: 'taskId' },
  },
  taskCheckpoints: {},
  taskStateEvidenceLinks: {},
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  desc: vi.fn(() => 'desc'),
  eq: vi.fn((field: { name: string }, value: unknown) => ({ field: field.name, value })),
  inArray: vi.fn((field: { name: string }, values: unknown[]) => ({ field: field.name, value: values })),
}));

vi.mock('$lib/server/utils/json', () => ({
  parseJsonRecord: vi.fn(() => null),
}));

vi.mock('$lib/server/utils/prompt-context', () => ({
  dedupeById: vi.fn((items: unknown[]) => items),
}));

vi.mock('$lib/server/utils/text', () => ({
  clipText: vi.fn((value: string, maxLength: number) => value.slice(0, maxLength)),
  normalizeWhitespace: vi.fn((value: string) => value.replace(/\s+/g, ' ').trim()),
}));

vi.mock('$lib/server/utils/tokens', () => ({
  estimateTokenCount: vi.fn(() => 0),
}));

vi.mock('./active-state', () => ({
  buildActiveDocumentState: vi.fn(() => ({
    currentGeneratedArtifactId: null,
    latestGeneratedArtifactIds: [],
  })),
}));

vi.mock('./evidence-family', () => ({
  collapseArtifactsByFamily: vi.fn((items: unknown[]) => items),
}));

vi.mock('./messages', () => ({
  getLatestHonchoMetadata: vi.fn(async () => null),
}));

vi.mock('./semantic-embedding-refresh', () => ({
  queueTaskStateSemanticEmbeddingRefresh: vi.fn(),
}));

vi.mock('./semantic-ranking', () => ({
  shortlistSemanticMatchesBySubject: mockShortlistSemanticMatchesBySubject,
}));

vi.mock('./tei-reranker', () => ({
  canUseTeiReranker: mockCanUseTeiReranker,
  rerankItems: mockRerankItems,
}));

vi.mock('./task-state/artifacts', () => ({
  formatTaskStateForPrompt: vi.fn(),
}));

vi.mock('./task-state/document-preferences', () => ({
  findConflictingDocumentPreferenceArtifactIds: vi.fn(async () => []),
}));

vi.mock('./task-state/control-model', () => ({
  canUseContextSummarizer: vi.fn(() => false),
  parseJsonFromModel: vi.fn(),
  requestContextSummarizer: vi.fn(),
  requestStructuredControlModel: vi.fn(),
}));

vi.mock('./task-state/mappers', () => ({
  mapTaskCheckpoint: vi.fn((value: unknown) => value),
  mapTaskEvidenceLink: vi.fn((value: unknown) => value),
  mapTaskState: vi.fn((value: unknown) => value),
}));

vi.mock('./working-set', () => ({
  scoreMatch: vi.fn(() => 0),
}));

describe('task-state semantic routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectRows.splice(0, selectRows.length);
    mockShortlistSemanticMatchesBySubject.mockResolvedValue([]);
    mockCanUseTeiReranker.mockReturnValue(false);
    mockRerankItems.mockResolvedValue(null);
  });

  it('revives the semantically matched archived task when lexical overlap is weak', async () => {
    selectRows.push(
      {
        taskId: 'task-forecast',
        userId: 'user-1',
        conversationId: 'conv-1',
        status: 'archived',
        objective: 'Quarterly revenue forecast',
        confidence: 70,
        locked: false,
        lastConfirmedTurnMessageId: null,
        constraints: [],
        factsToPreserve: [],
        decisions: [],
        openQuestions: [],
        activeArtifactIds: [],
        nextSteps: [],
        lastCheckpointAt: null,
        createdAt: Date.now() - 20_000,
        updatedAt: Date.now() - 10_000,
      },
      {
        taskId: 'task-design',
        userId: 'user-1',
        conversationId: 'conv-1',
        status: 'archived',
        objective: 'Homepage visual refresh',
        confidence: 70,
        locked: false,
        lastConfirmedTurnMessageId: null,
        constraints: [],
        factsToPreserve: [],
        decisions: [],
        openQuestions: [],
        activeArtifactIds: [],
        nextSteps: [],
        lastCheckpointAt: null,
        createdAt: Date.now() - 30_000,
        updatedAt: Date.now() - 20_000,
      },
    );

    mockShortlistSemanticMatchesBySubject.mockResolvedValue([
      {
        item: selectRows[0],
        subjectId: 'task-forecast',
        semanticScore: 0.92,
      },
    ]);

    const { selectTaskStateForTurn } = await import('./task-state');
    const selected = await selectTaskStateForTurn({
      userId: 'user-1',
      conversationId: 'conv-1',
      message: 'let us continue the forecast work',
      createIfMissing: false,
    });

    expect(selected?.taskId).toBe('task-forecast');
    expect(mockShortlistSemanticMatchesBySubject).toHaveBeenCalledTimes(1);
  });
});
