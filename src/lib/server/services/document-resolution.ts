import type { Artifact } from "$lib/types";
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
}

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

export function resolveRelevantGeneratedDocumentArtifacts(params: {
  artifacts: Artifact[];
  query: string;
  limit: number;
  currentConversationId?: string | null;
}): GeneratedDocumentResolution[] {
  const latestPerFamily = selectLatestGeneratedDocumentCandidatesByFamily(
    params.artifacts.map((artifact) => ({
      artifactId: artifact.id,
      artifactName: artifact.name,
      updatedAt: artifact.updatedAt,
      metadata: artifact.metadata,
      artifact,
    })),
  ).map((candidate) => candidate.artifact);

  return latestPerFamily
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
    })
    .slice(0, params.limit);
}

export function resolveCurrentGeneratedDocumentSelection(params: {
  artifacts: Artifact[];
  preferredArtifactId?: string | null;
}): CurrentGeneratedDocumentSelection {
  const latestArtifacts = selectLatestGeneratedDocumentCandidatesByFamily(
    params.artifacts
      .filter((artifact) => artifact.type === "generated_output")
      .map((artifact) => ({
        artifactId: artifact.id,
        artifactName: artifact.name,
        updatedAt: artifact.updatedAt,
        metadata: artifact.metadata,
        artifact,
      })),
  ).map((candidate) => candidate.artifact);

  const latestArtifactIds = latestArtifacts.map((artifact) => artifact.id);

  return {
    primaryArtifactId:
      params.preferredArtifactId ?? (latestArtifactIds.length > 0 ? latestArtifactIds[0] : null),
    latestArtifactIds,
    latestArtifacts,
  };
}
