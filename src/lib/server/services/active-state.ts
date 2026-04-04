import type { Artifact, WorkingSetReasonCode } from "$lib/types";
import { resolveCurrentGeneratedDocumentSelection } from "./document-resolution";

const DOCUMENT_FOCUS_RE =
  /\b(document|doc|file|pdf|attachment|attached|resume|cv|recipe|job description|contract|report)\b/i;
const USER_CORRECTION_RE =
  /\b(actually|instead|rather than|use the previous|use the earlier|change it to|revise this|refine this|update this|fix this|correct this|replace that|not that one)\b/i;

export interface ActiveDocumentState {
  documentFocused: boolean;
  hasRecentUserCorrection: boolean;
  activeDocumentIds: Set<string>;
  correctionTargetIds: Set<string>;
  currentGeneratedArtifactId: string | null;
  latestGeneratedArtifactIds: string[];
  currentGeneratedReasonCodes: Set<WorkingSetReasonCode>;
}

export function isDocumentFocusedTurn(
  message: string,
  attachmentIds: string[] = [],
): boolean {
  return attachmentIds.length > 0 || DOCUMENT_FOCUS_RE.test(message);
}

export function hasRecentUserCorrectionSignal(
  message: string | null | undefined,
): boolean {
  if (!message?.trim()) return false;
  return USER_CORRECTION_RE.test(message);
}

export function buildActiveDocumentState(params: {
  artifacts: Artifact[];
  message: string;
  attachmentIds?: string[];
  activeDocumentArtifactId?: string;
  preferredGeneratedArtifactId?: string | null;
  currentConversationId?: string | null;
}): ActiveDocumentState {
  const selection = resolveCurrentGeneratedDocumentSelection({
    artifacts: params.artifacts,
    preferredArtifactId:
      params.activeDocumentArtifactId ?? params.preferredGeneratedArtifactId,
    query: params.message.trim(),
    currentConversationId: params.currentConversationId ?? null,
  });
  const documentFocused =
    Boolean(params.activeDocumentArtifactId) ||
    isDocumentFocusedTurn(params.message, params.attachmentIds ?? []);
  const hasRecentUserCorrection = hasRecentUserCorrectionSignal(params.message);
  const activeDocumentIds = new Set(
    params.activeDocumentArtifactId ? [params.activeDocumentArtifactId] : [],
  );
  const correctionTargetIds = new Set<string>();
  if (hasRecentUserCorrection) {
    for (const artifactId of activeDocumentIds) {
      correctionTargetIds.add(artifactId);
    }
    if (selection.primaryArtifactId) {
      correctionTargetIds.add(selection.primaryArtifactId);
    }
  }

  return {
    documentFocused,
    hasRecentUserCorrection,
    activeDocumentIds,
    correctionTargetIds,
    currentGeneratedArtifactId: selection.primaryArtifactId,
    latestGeneratedArtifactIds: selection.latestArtifactIds,
    currentGeneratedReasonCodes: new Set(selection.primaryReasonCodes),
  };
}
