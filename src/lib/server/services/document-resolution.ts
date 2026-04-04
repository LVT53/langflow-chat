import type { Artifact, WorkingSetReasonCode } from "$lib/types";
import {
  parseWorkingDocumentMetadata,
  selectLatestGeneratedDocumentCandidatesByFamily,
} from "$lib/server/services/knowledge/store";
import { scoreMatch } from "./working-set";

export interface GeneratedDocumentResolution {
  artifact: Artifact;
  familyId: string | null;
  score: number;
  reasonCodes: string[];
}

export interface CurrentGeneratedDocumentSelection {
  primaryArtifactId: string | null;
  latestArtifactIds: string[];
  latestArtifacts: Artifact[];
  primaryReasonCodes: WorkingSetReasonCode[];
}

export interface RelevantGeneratedDocumentSelection {
  orderedArtifacts: Artifact[];
  primaryArtifactId: string | null;
  primaryReasonCodes: string[];
  resolutions: GeneratedDocumentResolution[];
}

type GeneratedArtifactMatchParams = {
  artifacts: Artifact[];
  query: string;
  currentConversationId?: string | null;
};

const GENERATED_QUERY_MATCH_REASONS = new Set([
  "matched_query",
  "matched_document_label",
  "matched_artifact_name",
  "matched_generated_filename",
  "matched_document_role",
]);

function includesNormalized(haystack: string, needle: string): boolean {
  const normalizedHaystack = haystack.trim().toLowerCase();
  const normalizedNeedle = needle.trim().toLowerCase();
  if (!normalizedHaystack || !normalizedNeedle) return false;
  return normalizedHaystack.includes(normalizedNeedle);
}

function scoreGeneratedDocumentArtifact(params: {
  artifact: Artifact;
  query: string;
  currentConversationId?: string | null;
}): GeneratedDocumentResolution {
  const metadata = parseWorkingDocumentMetadata(params.artifact.metadata);
  const label = metadata.documentLabel ?? params.artifact.name;
  const role = metadata.documentRole ?? "";
  const generatedFilename =
    typeof params.artifact.metadata?.generatedFilename === "string"
      ? params.artifact.metadata.generatedFilename
      : "";
  const haystack = [
    label,
    params.artifact.name,
    generatedFilename,
    role,
    params.artifact.summary ?? "",
    params.artifact.contentText ?? "",
  ].join("\n");

  let score = scoreMatch(params.query, haystack) * 10;
  const reasonCodes: string[] = [];

  if (score > 0) {
    reasonCodes.push("matched_query");
  }

  if (includesNormalized(params.query, label)) {
    score += 24;
    reasonCodes.push("matched_document_label");
  }

  if (includesNormalized(params.query, params.artifact.name)) {
    score += 20;
    reasonCodes.push("matched_artifact_name");
  }

  if (generatedFilename && includesNormalized(params.query, generatedFilename)) {
    score += 18;
    reasonCodes.push("matched_generated_filename");
  }

  if (role && includesNormalized(params.query, role)) {
    score += 10;
    reasonCodes.push("matched_document_role");
  }

  if (
    params.currentConversationId &&
    params.artifact.conversationId === params.currentConversationId
  ) {
    score += 8;
    reasonCodes.push("same_conversation");
  }

  return {
    artifact: params.artifact,
    familyId: metadata.documentFamilyId ?? null,
    score,
    reasonCodes,
  };
}

function getLatestGeneratedArtifacts(artifacts: Artifact[]): Artifact[] {
  return selectLatestGeneratedDocumentCandidatesByFamily(
    artifacts.map((artifact) => ({
      artifactId: artifact.id,
      artifactName: artifact.name,
      updatedAt: artifact.updatedAt,
      metadata: artifact.metadata,
      artifact,
    })),
  ).map((candidate) => candidate.artifact);
}

function getLatestArtifactForGeneratedFamily(
  artifacts: Artifact[],
  familyId: string,
): Artifact | null {
  return (
    getLatestGeneratedArtifacts(
      artifacts.filter((artifact) => {
        const metadata = parseWorkingDocumentMetadata(artifact.metadata);
        return metadata.documentFamilyId === familyId;
      }),
    )[0] ?? null
  );
}

function rankLatestGeneratedDocumentArtifacts(
  params: GeneratedArtifactMatchParams,
): GeneratedDocumentResolution[] {
  return getLatestGeneratedArtifacts(params.artifacts)
    .map((artifact) =>
      scoreGeneratedDocumentArtifact({
        artifact,
        query: params.query,
        currentConversationId: params.currentConversationId,
      }),
    )
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return right.artifact.updatedAt - left.artifact.updatedAt;
    });
}

function hasExplicitGeneratedDocumentQueryMatch(
  resolution: GeneratedDocumentResolution | null | undefined,
): boolean {
  if (!resolution) return false;
  return resolution.reasonCodes.some((code) =>
    GENERATED_QUERY_MATCH_REASONS.has(code),
  );
}

export function isGeneratedDocumentPromptEligible(params: {
  artifact: Artifact;
  conversationId: string;
  reasonCodes: WorkingSetReasonCode[];
  messageMatchScore: number;
  explicitlyRequested: boolean;
}): boolean {
  if (params.artifact.type !== "generated_output") {
    return true;
  }

  const allowEphemeralOutput =
    params.reasonCodes.includes("active_document_focus") ||
    params.reasonCodes.includes("recent_user_correction") ||
    params.reasonCodes.includes("recently_refined_document_family") ||
    params.reasonCodes.includes("current_generated_document") ||
    (params.artifact.conversationId === params.conversationId &&
      params.reasonCodes.includes("latest_generated_output"));

  if (params.artifact.retrievalClass === "durable") {
    return true;
  }

  if (!allowEphemeralOutput) {
    return false;
  }

  return (
    params.reasonCodes.includes("attached_this_turn") ||
    params.reasonCodes.includes("active_document_focus") ||
    params.reasonCodes.includes("recent_user_correction") ||
    params.reasonCodes.includes("recently_refined_document_family") ||
    params.reasonCodes.includes("current_generated_document") ||
    params.messageMatchScore >= 2 ||
    params.explicitlyRequested ||
    (params.reasonCodes.includes("latest_generated_output") &&
      params.messageMatchScore >= 1) ||
    (params.reasonCodes.includes("recently_used_in_output") &&
      params.messageMatchScore >= 1)
  );
}

export function resolveRelevantGeneratedDocumentArtifacts(params: {
  artifacts: Artifact[];
  query: string;
  limit: number;
  currentConversationId?: string | null;
}): GeneratedDocumentResolution[] {
  return rankLatestGeneratedDocumentArtifacts({
    artifacts: params.artifacts,
    query: params.query,
    currentConversationId: params.currentConversationId,
  }).slice(0, params.limit);
}

export function resolveRelevantGeneratedDocumentSelection(params: {
  artifacts: Artifact[];
  query: string;
  limit: number;
  preferredArtifactId?: string | null;
  currentConversationId?: string | null;
}): RelevantGeneratedDocumentSelection {
  const generatedArtifacts = params.artifacts.filter(
    (artifact) => artifact.type === "generated_output",
  );
  const preferredArtifact = params.preferredArtifactId
    ? generatedArtifacts.find((artifact) => artifact.id === params.preferredArtifactId) ??
      null
    : null;
  const preferredFamilyId = preferredArtifact
    ? parseWorkingDocumentMetadata(preferredArtifact.metadata).documentFamilyId
    : null;
  const resolutions = resolveRelevantGeneratedDocumentArtifacts({
    artifacts: generatedArtifacts,
    query: params.query,
    limit: Math.max(params.limit, 1),
    currentConversationId: params.currentConversationId,
  });
  const orderedArtifacts: Artifact[] = [];
  const seenArtifactIds = new Set<string>();

  if (preferredArtifact) {
    orderedArtifacts.push(preferredArtifact);
    seenArtifactIds.add(preferredArtifact.id);
  }

  for (const resolution of resolutions) {
    if (seenArtifactIds.has(resolution.artifact.id)) continue;
    if (preferredFamilyId && resolution.familyId === preferredFamilyId) continue;
    orderedArtifacts.push(resolution.artifact);
    seenArtifactIds.add(resolution.artifact.id);
    if (orderedArtifacts.length >= params.limit) break;
  }

  const primaryReasonCodes = preferredArtifact
    ? ["preferred_artifact"]
    : (resolutions[0]?.reasonCodes ?? []);

  return {
    orderedArtifacts,
    primaryArtifactId: orderedArtifacts[0]?.id ?? null,
    primaryReasonCodes,
    resolutions,
  };
}

export function resolveCurrentGeneratedDocumentSelection(params: {
  artifacts: Artifact[];
  preferredArtifactId?: string | null;
  preferredFamilyId?: string | null;
  query?: string;
  currentConversationId?: string | null;
}): CurrentGeneratedDocumentSelection {
  const generatedArtifacts = params.artifacts.filter(
    (artifact) => artifact.type === "generated_output",
  );
  const latestArtifacts = getLatestGeneratedArtifacts(generatedArtifacts);

  const latestArtifactIds = latestArtifacts.map((artifact) => artifact.id);
  const preferredArtifact = params.preferredArtifactId
    ? generatedArtifacts.find((artifact) => artifact.id === params.preferredArtifactId) ??
      null
    : null;

  if (preferredArtifact) {
    return {
      primaryArtifactId: preferredArtifact.id,
      latestArtifactIds,
      latestArtifacts,
      primaryReasonCodes: ["preferred_artifact"],
    };
  }

  const normalizedQuery = params.query?.trim() ?? "";
  if (normalizedQuery) {
    const rankedArtifacts = rankLatestGeneratedDocumentArtifacts({
      artifacts: generatedArtifacts,
      query: normalizedQuery,
      currentConversationId: params.currentConversationId,
    });
    const primaryMatch = rankedArtifacts[0] ?? null;

    if (hasExplicitGeneratedDocumentQueryMatch(primaryMatch)) {
      return {
        primaryArtifactId: primaryMatch.artifact.id,
        latestArtifactIds,
        latestArtifacts,
        primaryReasonCodes: primaryMatch.reasonCodes,
      };
    }
  }

  if (params.preferredFamilyId) {
    const preferredFamilyArtifact = getLatestArtifactForGeneratedFamily(
      generatedArtifacts,
      params.preferredFamilyId,
    );
    if (preferredFamilyArtifact) {
      return {
        primaryArtifactId: preferredFamilyArtifact.id,
        latestArtifactIds,
        latestArtifacts,
        primaryReasonCodes: ["recently_refined_document_family"],
      };
    }
  }

  return {
    primaryArtifactId: latestArtifactIds.length > 0 ? latestArtifactIds[0] : null,
    latestArtifactIds,
    latestArtifacts,
    primaryReasonCodes: latestArtifactIds.length > 0 ? ["current_generated_document"] : [],
  };
}
