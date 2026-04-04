import { join } from "path";
import { and, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { artifactLinks, artifacts } from "$lib/server/db/schema";
import type {
  Artifact,
  ArtifactSummary,
  ArtifactType,
  KnowledgeDocumentItem,
  KnowledgeVaultSearchResult,
} from "$lib/types";
import { extractDocumentText } from "../../document-extraction";
import { scoreMatch } from "../../working-set";
import { parseJsonRecord } from "$lib/server/utils/json";
import {
  getArtifactDocumentOrigin,
  parseWorkingDocumentMetadata,
} from "./document-metadata";
import {
  createArtifact,
  createArtifactLink,
  guessSummary,
  knowledgeArtifactListSelection,
  mapArtifact,
  mapArtifactSummary,
} from "./core";
import { getVaults } from "./vaults";

function mapLogicalDocumentItem(params: {
  displayArtifact: ArtifactSummary;
  promptArtifactId: string | null;
  familyArtifactIds: string[];
  normalizedAvailable: boolean;
  summary: string | null;
  updatedAt: number;
  documentOrigin?: KnowledgeDocumentItem["documentOrigin"];
  documentFamilyId?: string | null;
  documentLabel?: string | null;
  documentRole?: string | null;
  versionNumber?: number | null;
  originConversationId?: string | null;
  originAssistantMessageId?: string | null;
  sourceChatFileId?: string | null;
}): KnowledgeDocumentItem {
  return {
    id: params.displayArtifact.id,
    displayArtifactId: params.displayArtifact.id,
    promptArtifactId: params.promptArtifactId,
    familyArtifactIds: params.familyArtifactIds,
    name: params.displayArtifact.name,
    mimeType: params.displayArtifact.mimeType,
    sizeBytes: params.displayArtifact.sizeBytes,
    conversationId: params.displayArtifact.conversationId,
    vaultId: params.displayArtifact.vaultId,
    summary: params.summary,
    normalizedAvailable: params.normalizedAvailable,
    documentOrigin: params.documentOrigin,
    documentFamilyId: params.documentFamilyId ?? null,
    documentLabel: params.documentLabel ?? null,
    documentRole: params.documentRole ?? null,
    versionNumber: params.versionNumber ?? null,
    originConversationId: params.originConversationId ?? null,
    originAssistantMessageId: params.originAssistantMessageId ?? null,
    sourceChatFileId: params.sourceChatFileId ?? null,
    createdAt: params.displayArtifact.createdAt,
    updatedAt: params.updatedAt,
  };
}

export async function createNormalizedArtifact(params: {
  userId: string;
  conversationId?: string | null;
  sourceArtifactId: string;
  sourceStoragePath: string;
  sourceName: string;
  sourceMimeType: string | null;
}): Promise<Artifact | null> {
  const absoluteSourcePath = join(process.cwd(), params.sourceStoragePath);
  const extraction = await extractDocumentText(
    absoluteSourcePath,
    params.sourceMimeType,
    params.sourceName,
  );

  if (!extraction.text) return null;

  const artifact = await createArtifact({
    userId: params.userId,
    conversationId: params.conversationId,
    type: "normalized_document",
    name: extraction.normalizedName,
    mimeType: extraction.mimeType,
    extension: "txt",
    sizeBytes: Buffer.byteLength(extraction.text, "utf8"),
    storagePath: null,
    contentText: extraction.text,
    summary: guessSummary(extraction.text, params.sourceName),
    metadata: {
      sourceArtifactId: params.sourceArtifactId,
      normalizedFrom: params.sourceName,
    },
  });

  await createArtifactLink({
    userId: params.userId,
    artifactId: artifact.id,
    relatedArtifactId: params.sourceArtifactId,
    conversationId: params.conversationId,
    linkType: "derived_from",
  });

  return artifact;
}

export async function listLogicalDocuments(
  userId: string,
  options?: {
    includeGeneratedOutputs?: boolean;
  },
): Promise<KnowledgeDocumentItem[]> {
  const includeGeneratedOutputs = options?.includeGeneratedOutputs ?? false;
  const rows = await db
    .select(knowledgeArtifactListSelection)
    .from(artifacts)
    .where(
      and(
        eq(artifacts.userId, userId),
        inArray(
          artifacts.type,
          includeGeneratedOutputs
            ? ["source_document", "normalized_document", "generated_output"]
            : ["source_document", "normalized_document"],
        ),
      ),
    )
    .orderBy(desc(artifacts.updatedAt));

  if (rows.length === 0) return [];

  const summaries = rows.map(mapArtifactSummary);
  const byId = new Map(summaries.map((item) => [item.id, item]));
  const sourceArtifacts = summaries.filter(
    (item) => item.type === "source_document",
  );
  const normalizedArtifacts = summaries.filter(
    (item) => item.type === "normalized_document",
  );
  const generatedOutputArtifacts = summaries.filter(
    (item) => item.type === "generated_output",
  );
  const metadataById = new Map(
    rows.map((row) => [
      row.id,
      parseWorkingDocumentMetadata(parseJsonRecord(row.metadataJson ?? null)),
    ]),
  );

  const derivedRows =
    normalizedArtifacts.length === 0
      ? []
      : await db
          .select({
            normalizedArtifactId: artifactLinks.artifactId,
            sourceArtifactId: artifactLinks.relatedArtifactId,
          })
          .from(artifactLinks)
          .where(
            and(
              eq(artifactLinks.userId, userId),
              inArray(
                artifactLinks.artifactId,
                normalizedArtifacts.map((item) => item.id),
              ),
              eq(artifactLinks.linkType, "derived_from"),
            ),
          );

  const normalizedBySourceId = new Map<string, ArtifactSummary>();
  const sourceByNormalizedId = new Map<string, string>();
  for (const row of derivedRows) {
    if (!(row.sourceArtifactId && row.normalizedArtifactId)) continue;
    const normalized = byId.get(row.normalizedArtifactId);
    if (!normalized) continue;
    normalizedBySourceId.set(row.sourceArtifactId, normalized);
    sourceByNormalizedId.set(row.normalizedArtifactId, row.sourceArtifactId);
  }

  const documents: KnowledgeDocumentItem[] = [];
  for (const source of sourceArtifacts) {
    const normalized = normalizedBySourceId.get(source.id) ?? null;
    documents.push(
      mapLogicalDocumentItem({
        displayArtifact: source,
        promptArtifactId: normalized?.id ?? null,
        familyArtifactIds: [source.id, normalized?.id ?? null].filter(
          (value): value is string => Boolean(value),
        ),
        normalizedAvailable: Boolean(normalized),
        summary: normalized?.summary ?? source.summary,
        updatedAt: Math.max(
          source.updatedAt,
          normalized?.updatedAt ?? source.updatedAt,
        ),
        documentOrigin: getArtifactDocumentOrigin(source.type) ?? undefined,
      }),
    );
  }

  for (const normalized of normalizedArtifacts) {
    if (sourceByNormalizedId.has(normalized.id)) continue;
    documents.push(
      mapLogicalDocumentItem({
        displayArtifact: normalized,
        promptArtifactId: normalized.id,
        familyArtifactIds: [normalized.id],
        normalizedAvailable: true,
        summary: normalized.summary,
        updatedAt: normalized.updatedAt,
        documentOrigin: getArtifactDocumentOrigin(normalized.type) ?? undefined,
      }),
    );
  }

  if (includeGeneratedOutputs) {
    const generatedByFamily = new Map<
      string,
      {
        artifacts: ArtifactSummary[];
        latest: ArtifactSummary;
        metadata: ReturnType<typeof parseWorkingDocumentMetadata>;
      }
    >();

    for (const artifact of generatedOutputArtifacts) {
      const metadata = metadataById.get(artifact.id) ?? {};
      const familyId = metadata.documentFamilyId ?? artifact.id;
      const existing = generatedByFamily.get(familyId);

      if (!existing) {
        generatedByFamily.set(familyId, {
          artifacts: [artifact],
          latest: artifact,
          metadata,
        });
        continue;
      }

      existing.artifacts.push(artifact);
      const latest =
        artifact.updatedAt > existing.latest.updatedAt ? artifact : existing.latest;
      existing.latest = latest;
      if (latest.id === artifact.id) {
        existing.metadata = metadata;
      }
    }

    for (const [familyId, group] of generatedByFamily) {
      const versionCandidates = group.artifacts
        .map((artifact) => metadataById.get(artifact.id)?.versionNumber)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      const versionNumber =
        versionCandidates.length > 0 ? Math.max(...versionCandidates) : null;

      documents.push(
        mapLogicalDocumentItem({
          displayArtifact: group.latest,
          promptArtifactId: group.latest.id,
          familyArtifactIds: group.artifacts.map((artifact) => artifact.id),
          normalizedAvailable: true,
          summary: group.latest.summary,
          updatedAt: group.latest.updatedAt,
          documentOrigin: "generated",
          documentFamilyId: familyId,
          documentLabel: group.metadata.documentLabel ?? group.latest.name,
          documentRole: group.metadata.documentRole ?? null,
          versionNumber,
          originConversationId: group.metadata.originConversationId ?? null,
          originAssistantMessageId: group.metadata.originAssistantMessageId ?? null,
          sourceChatFileId: group.metadata.sourceChatFileId ?? null,
        }),
      );
    }
  }

  return documents.sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function findRelevantArtifactsByTypes(params: {
  userId: string;
  query: string;
  types: ArtifactType[];
  limit: number;
  excludeConversationId?: string;
}): Promise<Artifact[]> {
  const queryFragment = `%${params.query.slice(0, 80)}%`;
  const rows = await db
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.userId, params.userId),
        inArray(artifacts.type, params.types),
        params.types.includes("generated_output")
          ? or(
              ne(artifacts.type, "generated_output"),
              eq(artifacts.retrievalClass, "durable"),
            )
          : undefined,
        params.excludeConversationId
          ? sql`${artifacts.conversationId} IS NULL OR ${artifacts.conversationId} <> ${params.excludeConversationId}`
          : undefined,
        or(
          like(artifacts.name, queryFragment),
          like(artifacts.summary, queryFragment),
          like(artifacts.contentText, queryFragment),
        ),
      ),
    )
    .orderBy(desc(artifacts.updatedAt))
    .limit(60);

  return rows
    .map(mapArtifact)
    .map((artifact) => ({
      artifact,
      score: scoreMatch(
        params.query,
        `${artifact.name}\n${artifact.summary ?? ""}\n${artifact.contentText ?? ""}`,
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, params.limit)
    .map((entry) => entry.artifact);
}

function buildSearchSnippet(
  query: string,
  contentText: string | null,
  fallback: string | null,
): string | null {
  const source = (contentText ?? fallback ?? "").replace(/\s+/g, " ").trim();
  if (!source) return null;

  if (!query) {
    return source.slice(0, 180);
  }

  const normalizedQuery = query.toLowerCase();
  const normalizedSource = source.toLowerCase();
  const matchIndex = normalizedSource.indexOf(normalizedQuery);

  if (matchIndex === -1) {
    return source.slice(0, 180);
  }

  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(source.length, matchIndex + Math.max(query.length, 40) + 70);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < source.length ? "…" : "";

  return `${prefix}${source.slice(start, end).trim()}${suffix}`;
}

function mapVaultSearchResult(params: {
  document: KnowledgeDocumentItem & { vaultId: string };
  vaultName: string;
  snippet: string | null;
}): KnowledgeVaultSearchResult {
  return {
    id: params.document.id,
    displayArtifactId: params.document.displayArtifactId,
    promptArtifactId: params.document.promptArtifactId,
    name: params.document.name,
    mimeType: params.document.mimeType,
    vaultId: params.document.vaultId,
    vaultName: params.vaultName,
    summary: params.document.summary,
    snippet: params.snippet,
    normalizedAvailable: params.document.normalizedAvailable,
    updatedAt: params.document.updatedAt,
  };
}

export async function searchVaultDocuments(params: {
  userId: string;
  query: string;
  limit: number;
}): Promise<KnowledgeVaultSearchResult[]> {
  const trimmedQuery = params.query.trim();
  const [logicalDocuments, vaults] = await Promise.all([
    listLogicalDocuments(params.userId),
    getVaults(params.userId),
  ]);

  const vaultDocuments = logicalDocuments.filter(
    (document): document is KnowledgeDocumentItem & { vaultId: string } =>
      typeof document.vaultId === "string" && document.vaultId.length > 0,
  );

  if (vaultDocuments.length === 0) {
    return [];
  }

  const vaultNames = new Map(vaults.map((vault) => [vault.id, vault.name]));

  if (!trimmedQuery) {
    return vaultDocuments.slice(0, params.limit).map((document) =>
      mapVaultSearchResult({
        document,
        vaultName: vaultNames.get(document.vaultId) ?? "Vault",
        snippet: document.summary,
      }),
    );
  }

  const familyToDocument = new Map<string, KnowledgeDocumentItem & { vaultId: string }>();
  for (const document of vaultDocuments) {
    for (const artifactId of document.familyArtifactIds) {
      familyToDocument.set(artifactId, document);
    }
  }

  const matches = await findRelevantArtifactsByTypes({
    userId: params.userId,
    query: trimmedQuery,
    types: ["source_document", "normalized_document"],
    limit: Math.max(params.limit * 4, 24),
  });

  const results = new Map<string, KnowledgeVaultSearchResult>();

  for (const artifact of matches) {
    if (!artifact.vaultId) continue;

    const document = familyToDocument.get(artifact.id);
    if (!document || results.has(document.id)) continue;

    results.set(
      document.id,
      mapVaultSearchResult({
        document,
        vaultName: vaultNames.get(document.vaultId) ?? "Vault",
        snippet: buildSearchSnippet(
          trimmedQuery,
          artifact.contentText,
          artifact.summary ?? document.summary,
        ),
      }),
    );
  }

  return Array.from(results.values()).slice(0, params.limit);
}
