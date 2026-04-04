import { describe, expect, it } from "vitest";
import {
  buildActiveDocumentState,
  hasRecentUserCorrectionSignal,
  isDocumentFocusedTurn,
} from "./active-state";

describe("active-state signals", () => {
  it("detects document-focused turns from message text or attachments", () => {
    expect(isDocumentFocusedTurn("Please update this document.", [])).toBe(
      true,
    );
    expect(isDocumentFocusedTurn("General brainstorming", ["artifact-1"])).toBe(
      true,
    );
    expect(isDocumentFocusedTurn("General brainstorming", [])).toBe(false);
  });

  it("detects explicit user correction/refinement signals", () => {
    expect(
      hasRecentUserCorrectionSignal("Actually, use the previous version instead."),
    ).toBe(true);
    expect(hasRecentUserCorrectionSignal("Let's discuss another topic.")).toBe(
      false,
    );
  });

  it("assembles active document state from workspace focus, current output, and correction phrasing", () => {
    const state = buildActiveDocumentState({
      message: "Actually, refine this brief instead.",
      activeDocumentArtifactId: "brief-v1",
      currentConversationId: "conv-1",
      artifacts: [
        {
          id: "brief-v1",
          userId: "user-1",
          type: "generated_output",
          retrievalClass: "durable",
          name: "brief-v1.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          conversationId: "conv-1",
          vaultId: null,
          summary: null,
          createdAt: 1,
          updatedAt: 1,
          extension: "pdf",
          storagePath: null,
          contentText: null,
          metadata: {
            documentFamilyId: "family-brief",
            documentLabel: "Project brief",
            versionNumber: 1,
          },
        },
        {
          id: "brief-v2",
          userId: "user-1",
          type: "generated_output",
          retrievalClass: "durable",
          name: "brief-v2.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          conversationId: "conv-1",
          vaultId: null,
          summary: null,
          createdAt: 2,
          updatedAt: 2,
          extension: "pdf",
          storagePath: null,
          contentText: null,
          metadata: {
            documentFamilyId: "family-brief",
            documentLabel: "Project brief",
            versionNumber: 2,
          },
        },
      ],
    });

    expect(state.documentFocused).toBe(true);
    expect(state.hasRecentUserCorrection).toBe(true);
    expect(Array.from(state.activeDocumentIds)).toEqual(["brief-v1"]);
    expect(Array.from(state.correctionTargetIds).sort()).toEqual([
      "brief-v1",
    ]);
    expect(state.currentGeneratedArtifactId).toBe("brief-v1");
  });
});
