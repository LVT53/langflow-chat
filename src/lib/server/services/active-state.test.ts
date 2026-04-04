import { describe, expect, it } from "vitest";
import {
  buildActiveDocumentState,
  hasActiveContextResetSignal,
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

  it("detects explicit context-reset phrasing", () => {
    expect(
      hasActiveContextResetSignal("We are done with that now, let's talk about something else."),
    ).toBe(true);
    expect(hasActiveContextResetSignal("Please refine the same brief again.")).toBe(
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

  it("keeps the most recently refined document family active across generic follow-up turns", () => {
    const state = buildActiveDocumentState({
      message: "Please make it shorter.",
      currentConversationId: "conv-1",
      artifacts: [
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
            supersedesArtifactId: "brief-v1",
          },
        },
        {
          id: "slides-v1",
          userId: "user-1",
          type: "generated_output",
          retrievalClass: "durable",
          name: "slides-v1.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          conversationId: "conv-1",
          vaultId: null,
          summary: null,
          createdAt: 3,
          updatedAt: 3,
          extension: "pdf",
          storagePath: null,
          contentText: null,
          metadata: {
            documentFamilyId: "family-slides",
            documentLabel: "Investor slides",
            versionNumber: 1,
          },
        },
      ],
    });

    expect(state.recentlyRefinedFamilyId).toBe("family-brief");
    expect(Array.from(state.recentlyRefinedArtifactIds)).toEqual(["brief-v2"]);
    expect(state.currentGeneratedArtifactId).toBe("brief-v2");
    expect(Array.from(state.currentGeneratedReasonCodes)).toContain(
      "recently_refined_document_family",
    );
  });

  it("suppresses document carryover when the user clearly moves on", () => {
    const state = buildActiveDocumentState({
      message: "We are done with that document, let's talk about something else.",
      activeDocumentArtifactId: "brief-v2",
      currentConversationId: "conv-1",
      artifacts: [
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
            supersedesArtifactId: "brief-v1",
          },
        },
      ],
    });

    expect(state.hasContextResetSignal).toBe(true);
    expect(state.documentFocused).toBe(false);
    expect(Array.from(state.activeDocumentIds)).toEqual([]);
    expect(Array.from(state.recentlyRefinedArtifactIds)).toEqual([]);
    expect(state.currentGeneratedArtifactId).toBe(null);
  });
});
