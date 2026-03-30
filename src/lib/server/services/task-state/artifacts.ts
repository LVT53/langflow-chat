import { randomUUID } from "crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "$lib/server/db";
import { artifactChunks } from "$lib/server/db/schema";
import type { Artifact, ArtifactChunk, TaskState } from "$lib/types";
import { clipText } from "$lib/server/utils/text";
import { estimateTokenCount } from "$lib/server/utils/tokens";
import { scoreMatch } from "$lib/server/services/working-set";
import { getSmallFileThreshold } from "$lib/server/services/knowledge/store/core";
import {
  canUseContextSummarizer,
  requestContextSummarizer,
  requestStructuredControlModel,
} from "./control-model";
import { mapArtifactChunk } from "./mappers";

const CHUNK_CHAR_TARGET = 1400;
const CHUNK_CHAR_OVERLAP = 220;
const CHUNK_RERANK_CONFIDENCE_MIN = 64;

/** Maximum characters for full content retrieval to prevent unbounded content */
export const FULL_CONTENT_MAX_CHARS = 6000;

function clip(text: string, maxLength: number): string {
  return clipText(text, maxLength);
}

/**
 * Determines if a file should bypass chunking based on its content length.
 * Small files (< threshold) are stored in full without chunking to save storage.
 */
function shouldBypassChunking(contentLength: number): boolean {
  return contentLength < getSmallFileThreshold();
}

function splitIntoChunks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + CHUNK_CHAR_TARGET);
    if (end < normalized.length) {
      const paragraphBreak = normalized.lastIndexOf("\n\n", end);
      const lineBreak = normalized.lastIndexOf("\n", end);
      const sentenceBreak = Math.max(
        normalized.lastIndexOf(". ", end),
        normalized.lastIndexOf("? ", end),
        normalized.lastIndexOf("! ", end),
      );
      const boundary = Math.max(paragraphBreak, lineBreak, sentenceBreak);
      if (boundary > start + Math.floor(CHUNK_CHAR_TARGET * 0.45)) {
        end = boundary + 1;
      }
    }

    const chunk = normalized.slice(start, end).trim();
    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) break;
    start = Math.max(end - CHUNK_CHAR_OVERLAP, start + 1);
  }

  return chunks;
}

export function formatTaskStateForPrompt(taskState: TaskState): string {
  const sections = [
    `Objective: ${taskState.objective}`,
    taskState.constraints.length > 0
      ? `Constraints:\n- ${taskState.constraints.join("\n- ")}`
      : null,
    taskState.factsToPreserve.length > 0
      ? `Facts to preserve:\n- ${taskState.factsToPreserve.join("\n- ")}`
      : null,
    taskState.decisions.length > 0
      ? `Decisions:\n- ${taskState.decisions.join("\n- ")}`
      : null,
    taskState.openQuestions.length > 0
      ? `Open questions:\n- ${taskState.openQuestions.join("\n- ")}`
      : null,
    taskState.nextSteps.length > 0
      ? `Next steps:\n- ${taskState.nextSteps.join("\n- ")}`
      : null,
  ].filter((value): value is string => Boolean(value));

  return sections.join("\n\n");
}

export async function syncArtifactChunks(params: {
  artifactId: string;
  userId: string;
  conversationId?: string | null;
  contentText?: string | null;
}): Promise<void> {
  // Always delete existing chunks first
  await db
    .delete(artifactChunks)
    .where(eq(artifactChunks.artifactId, params.artifactId));

  if (!params.contentText?.trim()) return;

  // Small file bypass: store full content without chunking
  if (shouldBypassChunking(params.contentText.length)) {
    return;
  }

  const chunks = splitIntoChunks(params.contentText);
  if (chunks.length === 0) return;

  await db.insert(artifactChunks).values(
    chunks.map((chunk, index) => ({
      id: randomUUID(),
      artifactId: params.artifactId,
      userId: params.userId,
      conversationId: params.conversationId ?? null,
      chunkIndex: index,
      contentText: chunk,
      tokenEstimate: estimateTokenCount(chunk),
      updatedAt: new Date(),
    })),
  );
}

export async function listArtifactChunksForArtifacts(
  userId: string,
  artifactIds: string[],
): Promise<ArtifactChunk[]> {
  if (artifactIds.length === 0) return [];
  const rows = await db
    .select()
    .from(artifactChunks)
    .where(
      and(
        eq(artifactChunks.userId, userId),
        inArray(artifactChunks.artifactId, artifactIds),
      ),
    )
    .orderBy(artifactChunks.chunkIndex);

  return rows.map(mapArtifactChunk);
}

/**
 * Retrieves full artifact content directly, bypassing chunk selection.
 * Returns contentText truncated to maxChars (default FULL_CONTENT_MAX_CHARS).
 * Appends truncation notice if content exceeds the limit.
 */
export async function getFullArtifactContent(
  artifactId: string,
  maxChars: number = FULL_CONTENT_MAX_CHARS,
): Promise<string | null> {
  const { artifacts } = await import("$lib/server/db/schema");
  const row = await db
    .select({ contentText: artifacts.contentText })
    .from(artifacts)
    .where(eq(artifacts.id, artifactId))
    .limit(1)
    .get();

  if (!row?.contentText) return null;

  if (row.contentText.length <= maxChars) {
    return row.contentText;
  }

  return `${row.contentText.slice(0, maxChars).trim()}\n...[truncated]`;
}

export async function getPromptArtifactSnippets(params: {
  userId: string;
  artifacts: Artifact[];
  query: string;
  perArtifactLimit?: number;
  perArtifactCharBudget?: number;
  useFullContent?: boolean;
}): Promise<Map<string, string>> {
  const perArtifactLimit = params.perArtifactLimit ?? 2;
  const perArtifactCharBudget = params.perArtifactCharBudget ?? 1400;
  const artifactIds = params.artifacts.map((artifact) => artifact.id);
  const chunkRows = await listArtifactChunksForArtifacts(
    params.userId,
    artifactIds,
  );
  const chunksByArtifactId = new Map<string, ArtifactChunk[]>();

  for (const chunk of chunkRows) {
    const list = chunksByArtifactId.get(chunk.artifactId) ?? [];
    list.push(chunk);
    chunksByArtifactId.set(chunk.artifactId, list);
  }

  const snippets = new Map<string, string>();

  for (const artifact of params.artifacts) {
    const chunks = chunksByArtifactId.get(artifact.id) ?? [];
    
    if (chunks.length === 0) {
      if (params.useFullContent && artifact.contentText) {
        const fullContent = await getFullArtifactContent(
          artifact.id,
          FULL_CONTENT_MAX_CHARS,
        );
        if (fullContent) {
          snippets.set(artifact.id, fullContent);
          continue;
        }
      }
      const fallback =
        artifact.contentText ?? artifact.summary ?? artifact.name;
      snippets.set(artifact.id, clip(fallback, perArtifactCharBudget));
      continue;
    }

    const ranked = chunks
      .map((chunk) => ({
        chunk,
        score: params.query.trim()
          ? scoreMatch(
              params.query,
              `${artifact.name}\n${artifact.summary ?? ""}\n${chunk.contentText}`,
            )
          : 0,
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.chunk.chunkIndex - b.chunk.chunkIndex;
      });

    let chosen = ranked
      .filter((entry) => entry.score > 0)
      .slice(0, perArtifactLimit);
    if (chosen.length === 0) {
      chosen = ranked.slice(0, 1);
    }

    const rerankCandidates = ranked
      .filter((entry) => entry.score > 0)
      .slice(0, Math.max(perArtifactLimit, Math.min(6, ranked.length)));
    if (
      canUseContextSummarizer() &&
      params.query.trim() &&
      rerankCandidates.length > 2
    ) {
      type ChunkRerankPayload = {
        selectedChunkIndexes?: number[];
        confidence?: number;
      };

      try {
        const reranked =
          await requestStructuredControlModel<ChunkRerankPayload>({
            system:
              "Select the most relevant document chunks for the current user request. Return strict JSON with selectedChunkIndexes and confidence. Favor chunks that directly answer the request and avoid duplicate or weakly related chunks.",
            user: [
              `Artifact: ${artifact.name}`,
              artifact.summary
                ? `Artifact summary: ${clip(artifact.summary, 220)}`
                : null,
              `User message: ${params.query}`,
              `Candidate chunks: ${JSON.stringify(
                rerankCandidates.map((entry) => ({
                  chunkIndex: entry.chunk.chunkIndex,
                  score: entry.score,
                  content: clip(entry.chunk.contentText, 320),
                })),
                null,
                2,
              )}`,
            ]
              .filter((value): value is string => Boolean(value))
              .join("\n\n"),
            maxTokens: 220,
            temperature: 0.0,
          });
        if (
          reranked &&
          typeof reranked.confidence === "number" &&
          reranked.confidence >= CHUNK_RERANK_CONFIDENCE_MIN
        ) {
          const selectedIndexes = new Set(
            (Array.isArray(reranked.selectedChunkIndexes)
              ? reranked.selectedChunkIndexes
              : []
            ).filter((value): value is number => typeof value === "number"),
          );
          const rerankedSelection = rerankCandidates.filter((entry) =>
            selectedIndexes.has(entry.chunk.chunkIndex),
          );
          if (rerankedSelection.length > 0) {
            chosen = rerankedSelection.slice(0, perArtifactLimit);
          }
        }
      } catch (error) {
        console.error("[TASK_STATE] Chunk reranker failed:", error);
      }
    }

    const combined = chosen
      .map((entry) =>
        clip(
          entry.chunk.contentText,
          Math.floor(perArtifactCharBudget / chosen.length),
        ),
      )
      .join("\n\n");
    snippets.set(artifact.id, clip(combined, perArtifactCharBudget));
  }

  return snippets;
}

export async function summarizeHistoricalContext(params: {
  message: string;
  taskState: TaskState | null;
  sectionBodies: Array<{ title: string; body: string }>;
  targetTokens: number;
}): Promise<string | null> {
  if (!canUseContextSummarizer()) return null;
  if (params.sectionBodies.length === 0) return null;

  const prompt = [
    params.taskState
      ? `Current task objective: ${params.taskState.objective}`
      : null,
    `Current user message: ${params.message}`,
    "Condense the historical support context below into a compact working checkpoint for the current turn. Preserve only details that are clearly relevant to the current task and user message.",
    ...params.sectionBodies.map(
      (section) => `## ${section.title}\n${section.body}`,
    ),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n\n");

  try {
    const content = await requestContextSummarizer({
      system:
        "You compress historical support context for a chat assistant. Return concise markdown, focused on currently relevant facts, decisions, open questions, and evidence. Do not invent new facts.",
      user: prompt,
      maxTokens: Math.max(
        240,
        Math.min(700, Math.floor(params.targetTokens / 3)),
      ),
      temperature: 0.0,
    });
    return content ? content.trim() : null;
  } catch (error) {
    console.error(
      "[TASK_STATE] Historical context summarization failed:",
      error,
    );
    return null;
  }
}
