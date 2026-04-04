import { describe, expect, it } from "vitest";
import {
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
});
