import { describe, expect, it } from "vitest";
import {
  isGeneratedDocumentPromptEligible,
  resolveCurrentGeneratedDocumentSelection,
  resolveRelevantGeneratedDocumentSelection,
  resolveRelevantGeneratedDocumentArtifacts,
} from "./document-resolution";
import type { Artifact } from "$lib/types";

function makeArtifact(params: {
  id: string;
  name: string;
  summary?: string | null;
  conversationId?: string | null;
  updatedAt?: number;
  metadata?: Record<string, unknown> | null;
}): Artifact {
  return {
    id: params.id,
    userId: "user-1",
    type: "generated_output",
    retrievalClass: "durable",
    name: params.name,
    mimeType: "application/pdf",
    sizeBytes: 1024,
    conversationId: params.conversationId ?? null,
    vaultId: null,
    summary: params.summary ?? null,
    createdAt: params.updatedAt ?? 1,
    updatedAt: params.updatedAt ?? 1,
    extension: "pdf",
    storagePath: null,
    contentText: null,
    metadata: params.metadata ?? null,
  };
}

describe("document resolution", () => {
  it("dedupes generated outputs by family and prefers explicit label/name matches", () => {
    const resolved = resolveRelevantGeneratedDocumentArtifacts({
      query: "continue the project brief",
      limit: 4,
      artifacts: [
        makeArtifact({
          id: "artifact-1",
          name: "brief-v1.pdf",
          updatedAt: 1,
          metadata: {
            documentFamilyId: "family-brief",
            documentLabel: "Project brief",
            versionNumber: 1,
            generatedFilename: "brief-v1.pdf",
          },
        }),
        makeArtifact({
          id: "artifact-2",
          name: "brief-v2.pdf",
          updatedAt: 2,
          metadata: {
            documentFamilyId: "family-brief",
            documentLabel: "Project brief",
            versionNumber: 2,
            generatedFilename: "brief-v2.pdf",
          },
        }),
        makeArtifact({
          id: "artifact-3",
          name: "slides-v1.pdf",
          updatedAt: 3,
          metadata: {
            documentFamilyId: "family-slides",
            documentLabel: "Investor slides",
            versionNumber: 1,
            generatedFilename: "slides-v1.pdf",
          },
        }),
      ],
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({
      familyId: "family-brief",
    });
    expect(resolved[0]?.artifact.id).toBe("artifact-2");
  });

  it("boosts same-conversation generated documents when relevance is otherwise similar", () => {
    const resolved = resolveRelevantGeneratedDocumentArtifacts({
      query: "continue the report",
      currentConversationId: "conv-2",
      limit: 4,
      artifacts: [
        makeArtifact({
          id: "artifact-1",
          name: "report-v1.pdf",
          conversationId: "conv-1",
          updatedAt: 1,
          metadata: {
            documentFamilyId: "family-old",
            documentLabel: "Report",
            versionNumber: 1,
          },
        }),
        makeArtifact({
          id: "artifact-2",
          name: "report-v2.pdf",
          conversationId: "conv-2",
          updatedAt: 2,
          metadata: {
            documentFamilyId: "family-current",
            documentLabel: "Report",
            versionNumber: 1,
          },
        }),
      ],
    });

    expect(resolved[0]?.artifact.id).toBe("artifact-2");
    expect(resolved[0]?.reasonCodes).toContain("same_conversation");
  });

  it("keeps the explicitly preferred generated artifact first without duplicating its family", () => {
    const selection = resolveRelevantGeneratedDocumentSelection({
      query: "continue the project brief",
      limit: 4,
      preferredArtifactId: "artifact-1",
      artifacts: [
        makeArtifact({
          id: "artifact-1",
          name: "brief-v1.pdf",
          updatedAt: 1,
          metadata: {
            documentFamilyId: "family-brief",
            documentLabel: "Project brief",
            versionNumber: 1,
          },
        }),
        makeArtifact({
          id: "artifact-2",
          name: "brief-v2.pdf",
          updatedAt: 2,
          metadata: {
            documentFamilyId: "family-brief",
            documentLabel: "Project brief",
            versionNumber: 2,
          },
        }),
        makeArtifact({
          id: "artifact-3",
          name: "slides-v1.pdf",
          updatedAt: 3,
          metadata: {
            documentFamilyId: "family-slides",
            documentLabel: "Investor slides",
            versionNumber: 1,
          },
        }),
      ],
    });

    expect(selection.orderedArtifacts.map((artifact) => artifact.id)).toEqual(["artifact-1"]);
    expect(selection.primaryArtifactId).toBe("artifact-1");
    expect(selection.primaryReasonCodes).toEqual(["preferred_artifact"]);
  });

  it("selects the latest artifact per generated document family for current-document context", () => {
    const selection = resolveCurrentGeneratedDocumentSelection({
      artifacts: [
        makeArtifact({
          id: "artifact-1",
          name: "brief-v1.pdf",
          updatedAt: 1,
          metadata: {
            documentFamilyId: "family-brief",
            documentLabel: "Project brief",
            versionNumber: 1,
          },
        }),
        makeArtifact({
          id: "artifact-2",
          name: "brief-v2.pdf",
          updatedAt: 2,
          metadata: {
            documentFamilyId: "family-brief",
            documentLabel: "Project brief",
            versionNumber: 2,
          },
        }),
        makeArtifact({
          id: "artifact-3",
          name: "slides-v1.pdf",
          updatedAt: 3,
          metadata: {
            documentFamilyId: "family-slides",
            documentLabel: "Investor slides",
            versionNumber: 1,
          },
        }),
      ],
    });

    expect(selection.latestArtifactIds).toEqual(["artifact-3", "artifact-2"]);
    expect(selection.primaryArtifactId).toBe("artifact-3");
  });

  it("preserves an explicitly preferred artifact id for current-document context", () => {
    const selection = resolveCurrentGeneratedDocumentSelection({
      preferredArtifactId: "artifact-1",
      artifacts: [
        makeArtifact({
          id: "artifact-1",
          name: "brief-v1.pdf",
          updatedAt: 1,
          metadata: {
            documentFamilyId: "family-brief",
            documentLabel: "Project brief",
            versionNumber: 1,
          },
        }),
        makeArtifact({
          id: "artifact-2",
          name: "brief-v2.pdf",
          updatedAt: 2,
          metadata: {
            documentFamilyId: "family-brief",
            documentLabel: "Project brief",
            versionNumber: 2,
          },
        }),
      ],
    });

    expect(selection.latestArtifactIds).toEqual(["artifact-2"]);
    expect(selection.primaryArtifactId).toBe("artifact-1");
    expect(selection.primaryReasonCodes).toEqual(["preferred_artifact"]);
  });

  it("uses explicit query matches to choose the current generated document family over raw recency", () => {
    const selection = resolveCurrentGeneratedDocumentSelection({
      query: "continue the project brief",
      currentConversationId: "conv-1",
      artifacts: [
        makeArtifact({
          id: "artifact-brief",
          name: "brief-v2.pdf",
          conversationId: "conv-1",
          updatedAt: 2,
          metadata: {
            documentFamilyId: "family-brief",
            documentLabel: "Project brief",
            versionNumber: 2,
          },
        }),
        makeArtifact({
          id: "artifact-slides",
          name: "slides-v3.pdf",
          conversationId: "conv-1",
          updatedAt: 3,
          metadata: {
            documentFamilyId: "family-slides",
            documentLabel: "Investor slides",
            versionNumber: 3,
          },
        }),
      ],
    });

    expect(selection.latestArtifactIds).toEqual(["artifact-slides", "artifact-brief"]);
    expect(selection.primaryArtifactId).toBe("artifact-brief");
    expect(selection.primaryReasonCodes).toContain("matched_document_label");
  });

  it("falls back to recency when there is no preferred artifact or explicit query match", () => {
    const selection = resolveCurrentGeneratedDocumentSelection({
      query: "please keep refining it",
      artifacts: [
        makeArtifact({
          id: "artifact-brief",
          name: "brief-v2.pdf",
          updatedAt: 2,
          metadata: {
            documentFamilyId: "family-brief",
            documentLabel: "Project brief",
            versionNumber: 2,
          },
        }),
        makeArtifact({
          id: "artifact-slides",
          name: "slides-v3.pdf",
          updatedAt: 3,
          metadata: {
            documentFamilyId: "family-slides",
            documentLabel: "Investor slides",
            versionNumber: 3,
          },
        }),
      ],
    });

    expect(selection.primaryArtifactId).toBe("artifact-slides");
    expect(selection.primaryReasonCodes).toEqual(["current_generated_document"]);
  });

  it("prefers the most recently refined family over raw recency for generic follow-up turns", () => {
    const selection = resolveCurrentGeneratedDocumentSelection({
      query: "Please make it shorter.",
      preferredFamilyId: "family-brief",
      artifacts: [
        makeArtifact({
          id: "artifact-brief",
          name: "brief-v2.pdf",
          updatedAt: 2,
          metadata: {
            documentFamilyId: "family-brief",
            documentLabel: "Project brief",
            versionNumber: 2,
          },
        }),
        makeArtifact({
          id: "artifact-slides",
          name: "slides-v3.pdf",
          updatedAt: 3,
          metadata: {
            documentFamilyId: "family-slides",
            documentLabel: "Investor slides",
            versionNumber: 3,
          },
        }),
      ],
    });

    expect(selection.primaryArtifactId).toBe("artifact-brief");
    expect(selection.primaryReasonCodes).toEqual([
      "recently_refined_document_family",
    ]);
  });

  it("treats active/current generated documents as prompt-eligible even when ephemeral", () => {
    const artifact = makeArtifact({
      id: "artifact-1",
      name: "brief-v2.pdf",
      conversationId: "conv-1",
      updatedAt: 2,
      metadata: {
        documentFamilyId: "family-brief",
        documentLabel: "Project brief",
        versionNumber: 2,
      },
    });
    artifact.retrievalClass = "ephemeral";

    expect(
      isGeneratedDocumentPromptEligible({
        artifact,
        conversationId: "conv-1",
        reasonCodes: ["current_generated_document"],
        messageMatchScore: 0,
        explicitlyRequested: false,
      }),
    ).toBe(true);
  });

  it("treats a recently corrected generated document as prompt-eligible even when ephemeral", () => {
    const artifact = makeArtifact({
      id: "artifact-1",
      name: "brief-v2.pdf",
      conversationId: "conv-1",
      updatedAt: 2,
      metadata: {
        documentFamilyId: "family-brief",
        documentLabel: "Project brief",
        versionNumber: 2,
      },
    });
    artifact.retrievalClass = "ephemeral";

    expect(
      isGeneratedDocumentPromptEligible({
        artifact,
        conversationId: "conv-1",
        reasonCodes: ["recent_user_correction"],
        messageMatchScore: 0,
        explicitlyRequested: false,
      }),
    ).toBe(true);
  });

  it("treats a recently refined generated document family as prompt-eligible even when ephemeral", () => {
    const artifact = makeArtifact({
      id: "artifact-1",
      name: "brief-v2.pdf",
      conversationId: "conv-1",
      updatedAt: 2,
      metadata: {
        documentFamilyId: "family-brief",
        documentLabel: "Project brief",
        versionNumber: 2,
      },
    });
    artifact.retrievalClass = "ephemeral";

    expect(
      isGeneratedDocumentPromptEligible({
        artifact,
        conversationId: "conv-1",
        reasonCodes: ["recently_refined_document_family"],
        messageMatchScore: 0,
        explicitlyRequested: false,
      }),
    ).toBe(true);
  });

  it("keeps unrelated ephemeral generated outputs out of prompt selection", () => {
    const artifact = makeArtifact({
      id: "artifact-1",
      name: "brief-v2.pdf",
      conversationId: "conv-1",
      updatedAt: 2,
      metadata: {
        documentFamilyId: "family-brief",
        documentLabel: "Project brief",
        versionNumber: 2,
      },
    });
    artifact.retrievalClass = "ephemeral";

    expect(
      isGeneratedDocumentPromptEligible({
        artifact,
        conversationId: "conv-1",
        reasonCodes: [],
        messageMatchScore: 0,
        explicitlyRequested: false,
      }),
    ).toBe(false);
  });
});
