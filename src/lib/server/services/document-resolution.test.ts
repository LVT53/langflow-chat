import { describe, expect, it } from "vitest";
import {
  resolveCurrentGeneratedDocumentSelection,
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
  });
});
