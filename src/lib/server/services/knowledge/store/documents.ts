import { join } from "path";
import { and, desc, eq, inArray, like, ne, or, sql } from "drizzle-orm";
import { db } from "$lib/server/db";
import { artifactLinks, artifacts } from "$lib/server/db/schema";
import type {
  Artifact,
  ArtifactSummary,
  ArtifactType,
  KnowledgeDocumentItem,
} from "$lib/types";
import { extractDocumentText } from "../../document-extraction";
import { scoreMatch } from "../../working-set";
import {
  createArtifact,
  createArtifactLink,
  guessSummary,
  knowledgeArtifactListSelection,
  mapArtifact,
  mapArtifactSummary,
} from "./core";

function mapLogicalDocumentItem(params: {
  displayArtifact: ArtifactSummary;
  promptArtifactId: string | null;
  familyArtifactIds: string[];
  normalizedAvailable: boolean;
  summary: string | null;
  updatedAt: number;
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
    summary: params.summary,
    normalizedAvailable: params.normalizedAvailable,
    createdAt: params.displayArtifact.createdAt,
    updatedAt: params.updatedAt,
  };
}

export async function createNormalizedArtifact(params: {
  userId: string;
  conversationId: string;
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
): Promise<KnowledgeDocumentItem[]> {
  const rows = await db
    .select(knowledgeArtifactListSelection)
    .from(artifacts)
    .where(
      and(
        eq(artifacts.userId, userId),
        inArray(artifacts.type, ["source_document", "normalized_document"]),
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
      }),
    );
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
