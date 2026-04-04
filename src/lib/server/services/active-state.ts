import type { Artifact, WorkingSetReasonCode } from "$lib/types";
import { parseWorkingDocumentMetadata } from "$lib/server/services/knowledge/store";
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
  recentlyRefinedFamilyId: string | null;
  recentlyRefinedArtifactIds: Set<string>;
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

function hasGeneratedDocumentRefinementMetadata(
  artifact: Artifact,
): boolean {
  const metadata = parseWorkingDocumentMetadata(artifact.metadata);
  const recentVersionIds = Array.isArray(artifact.metadata?.recentGeneratedVersionIds)
    ? artifact.metadata.recentGeneratedVersionIds.filter(
        (value): value is string =>
          typeof value === "string" && value.trim().length > 0,
      )
    : [];

  return Boolean(
    metadata.documentFamilyId &&
      ((metadata.versionNumber ?? 0) > 1 ||
        metadata.supersedesArtifactId ||
        recentVersionIds.length > 0 ||
        (typeof artifact.metadata?.previousGeneratedArtifactId === "string" &&
          artifact.metadata.previousGeneratedArtifactId.trim().length > 0)),
  );
}

function resolveRecentlyRefinedGeneratedFamily(params: {
  artifacts: Artifact[];
  preferredArtifactId?: string | null;
  currentConversationId?: string | null;
}): {
  familyId: string | null;
  latestArtifactIds: string[];
} {
  const allGeneratedArtifacts = params.artifacts
    .filter((artifact) => artifact.type === "generated_output")
    .slice()
    .sort((left, right) => right.updatedAt - left.updatedAt);
  const sameConversationArtifacts = params.currentConversationId
    ? allGeneratedArtifacts.filter(
        (artifact) => artifact.conversationId === params.currentConversationId,
      )
    : [];
  const generatedArtifacts =
    sameConversationArtifacts.length > 0
      ? sameConversationArtifacts
      : allGeneratedArtifacts;

  const preferredArtifact = params.preferredArtifactId
    ? generatedArtifacts.find((artifact) => artifact.id === params.preferredArtifactId) ??
      null
    : null;
  const preferredMetadata = preferredArtifact
    ? parseWorkingDocumentMetadata(preferredArtifact.metadata)
    : null;

  if (
    preferredArtifact &&
    preferredMetadata?.documentFamilyId &&
    hasGeneratedDocumentRefinementMetadata(preferredArtifact)
  ) {
    return {
      familyId: preferredMetadata.documentFamilyId,
      latestArtifactIds: [preferredArtifact.id],
    };
  }

  const recentRefinedArtifact =
    generatedArtifacts.find((artifact) =>
      hasGeneratedDocumentRefinementMetadata(artifact),
    ) ?? null;
  const recentRefinedMetadata = recentRefinedArtifact
    ? parseWorkingDocumentMetadata(recentRefinedArtifact.metadata)
    : null;

  if (!recentRefinedMetadata?.documentFamilyId) {
    return {
      familyId: null,
      latestArtifactIds: [],
    };
  }

  const latestArtifactForFamily =
    generatedArtifacts.find((artifact) => {
      const metadata = parseWorkingDocumentMetadata(artifact.metadata);
      return metadata.documentFamilyId === recentRefinedMetadata.documentFamilyId;
    }) ?? null;

  return {
    familyId: recentRefinedMetadata.documentFamilyId,
    latestArtifactIds: latestArtifactForFamily ? [latestArtifactForFamily.id] : [],
  };
}

export function buildActiveDocumentState(params: {
  artifacts: Artifact[];
  message: string;
  attachmentIds?: string[];
  activeDocumentArtifactId?: string;
  preferredGeneratedArtifactId?: string | null;
  currentConversationId?: string | null;
}): ActiveDocumentState {
  const recentRefinedState = resolveRecentlyRefinedGeneratedFamily({
    artifacts: params.artifacts,
    preferredArtifactId:
      params.activeDocumentArtifactId ?? params.preferredGeneratedArtifactId ?? null,
    currentConversationId: params.currentConversationId ?? null,
  });
  const selection = resolveCurrentGeneratedDocumentSelection({
    artifacts: params.artifacts,
    preferredArtifactId:
      params.activeDocumentArtifactId ?? params.preferredGeneratedArtifactId,
    preferredFamilyId: recentRefinedState.familyId,
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
    recentlyRefinedFamilyId: recentRefinedState.familyId,
    recentlyRefinedArtifactIds: new Set(recentRefinedState.latestArtifactIds),
    currentGeneratedArtifactId: selection.primaryArtifactId,
    latestGeneratedArtifactIds: selection.latestArtifactIds,
    currentGeneratedReasonCodes: new Set(selection.primaryReasonCodes),
  };
}
