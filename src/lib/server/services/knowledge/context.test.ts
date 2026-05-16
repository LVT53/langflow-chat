import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindRelevantArtifactsByTypesDetailed,
  mockGetArtifactsForUser,
  mockResolveRelevantGeneratedDocumentSelection,
  mockDbInsert,
} = vi.hoisted(() => {
  const mockFindRelevantArtifactsByTypesDetailed = vi.fn(async () => []);
  const mockGetArtifactsForUser = vi.fn(async () => []);
  const mockResolveRelevantGeneratedDocumentSelection = vi.fn(() => ({
    orderedArtifacts: [],
    diagnostics: [],
  }));
  const mockDbInsert = vi.fn();

  return {
    mockFindRelevantArtifactsByTypesDetailed,
    mockGetArtifactsForUser,
    mockResolveRelevantGeneratedDocumentSelection,
    mockDbInsert,
  };
});

vi.mock("$lib/server/db", () => ({
  db: {
    insert: mockDbInsert,
  },
}));

vi.mock("./store", () => ({
  findRelevantArtifactsByTypesDetailed: mockFindRelevantArtifactsByTypesDetailed,
  getArtifactsForUser: mockGetArtifactsForUser,
}));

vi.mock("../memory-events", () => ({
  countRecentMemoryEventsBySubject: vi.fn(async () => new Map()),
}));

vi.mock("../document-resolution", () => ({
  getGeneratedDocumentBehaviorKey: vi.fn((artifact: { id: string }) => artifact.id),
  isGeneratedDocumentPromptEligible: vi.fn(() => true),
  resolveRelevantGeneratedDocumentSelection: mockResolveRelevantGeneratedDocumentSelection,
}));

describe("knowledge context retrieval", () => {
  beforeEach(() => {
    mockFindRelevantArtifactsByTypesDetailed.mockClear();
    mockFindRelevantArtifactsByTypesDetailed.mockResolvedValue([]);
    mockGetArtifactsForUser.mockClear();
    mockGetArtifactsForUser.mockResolvedValue([]);
    mockDbInsert.mockClear();
    mockResolveRelevantGeneratedDocumentSelection.mockClear();
    mockResolveRelevantGeneratedDocumentSelection.mockReturnValue({
      orderedArtifacts: [],
      diagnostics: [],
    });
  });

  it("does not include Skill Notes in default broad relevance retrieval", async () => {
    const { findRelevantKnowledgeArtifacts } = await import("./context");

    const results = await findRelevantKnowledgeArtifacts({
      userId: "user-1",
      currentConversationId: "conv-1",
      query: "research notes",
      limit: 4,
    });

    expect(results).toEqual([]);
    expect(mockFindRelevantArtifactsByTypesDetailed).toHaveBeenCalledTimes(2);
    expect(
      mockFindRelevantArtifactsByTypesDetailed.mock.calls.map(([params]) => params.types),
    ).toEqual([["normalized_document"], ["generated_output"]]);
  });

  it("promotes a strong semantic library document match for one-turn prompt retrieval without carrying it forward", async () => {
    const semanticDocument = {
      id: "doc-semantic",
      userId: "user-1",
      type: "normalized_document",
      retrievalClass: "durable",
      name: "Operations handbook",
      mimeType: "text/plain",
      sizeBytes: 1024,
      conversationId: "conv-2",
      summary: "Internal support procedures",
      metadata: null,
      contentText: "Escalation policy and support team operating procedures",
      extension: "txt",
      storagePath: null,
      createdAt: Date.parse("2026-04-01T10:00:00Z"),
      updatedAt: Date.parse("2026-04-01T10:00:00Z"),
    };
    mockFindRelevantArtifactsByTypesDetailed
      .mockResolvedValueOnce([
        {
          artifact: semanticDocument,
          lexicalScore: 0,
          semanticScore: 0.91,
          rerankScore: 0.86,
          finalScore: 35,
        },
      ])
      .mockResolvedValueOnce([]);

    const { findRelevantKnowledgeArtifacts } = await import("./context");
    const results = await findRelevantKnowledgeArtifacts({
      userId: "user-1",
      currentConversationId: "conv-1",
      query: "refund risk predictors",
      limit: 4,
    });

    expect(results.map((artifact) => artifact.id)).toEqual(["doc-semantic"]);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });
});
