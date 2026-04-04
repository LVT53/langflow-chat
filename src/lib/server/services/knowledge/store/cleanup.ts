import { unlink } from "fs/promises";
import { join } from "path";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "$lib/server/db";
import {
  artifactLinks,
  artifacts,
  conversationWorkingSetItems,
  messages,
  taskStateEvidenceLinks,
} from "$lib/server/db/schema";
import {
  buildArtifactVisibilityCondition,
  getArtifactForUser,
  getArtifactOwnershipScope,
  isArtifactCanonicallyOwned,
} from "./core";
import { listLogicalDocuments } from "./documents";

export async function hardDeleteArtifactsForUser(
  userId: string,
  artifactIds: string[],
): Promise<{
  deletedArtifactIds: string[];
  deletedStoragePaths: string[];
  failedStoragePaths: string[];
}> {
  const uniqueIds = Array.from(new Set(artifactIds));
  if (uniqueIds.length === 0) {
    return {
      deletedArtifactIds: [],
      deletedStoragePaths: [],
      failedStoragePaths: [],
    };
  }

  const ownershipScope = await getArtifactOwnershipScope(userId);
  const artifactsToDelete = await db
    .select()
    .from(artifacts)
    .where(
      and(
        inArray(artifacts.id, uniqueIds),
        buildArtifactVisibilityCondition({ userId, ownershipScope }),
      ),
    );
  const scopedArtifactsToDelete = artifactsToDelete.filter((row) =>
    isArtifactCanonicallyOwned({
      userId,
      ownershipScope,
      artifact: row,
    }),
  );
  const ids = scopedArtifactsToDelete.map((row) => row.id);

  if (ids.length === 0) {
    return {
      deletedArtifactIds: [],
      deletedStoragePaths: [],
      failedStoragePaths: [],
    };
  }

  db.transaction((tx) => {
    tx.delete(conversationWorkingSetItems)
      .where(inArray(conversationWorkingSetItems.artifactId, ids))
      .run();

    tx.delete(taskStateEvidenceLinks)
      .where(inArray(taskStateEvidenceLinks.artifactId, ids))
      .run();

    tx.delete(artifactLinks)
      .where(
        or(
          inArray(artifactLinks.artifactId, ids),
          inArray(artifactLinks.relatedArtifactId, ids),
        ),
      )
      .run();

    tx.delete(artifacts).where(inArray(artifacts.id, ids)).run();
  });

  const deletedStoragePaths: string[] = [];
  const failedStoragePaths: string[] = [];
  for (const row of scopedArtifactsToDelete) {
    if (!row.storagePath) continue;
    try {
      await unlink(join(process.cwd(), row.storagePath));
      deletedStoragePaths.push(row.storagePath);
    } catch (error) {
      failedStoragePaths.push(row.storagePath);
      console.warn("[KNOWLEDGE_DELETE] File cleanup failed after DB deletion", {
        userId,
        artifactId: row.id,
        storagePath: row.storagePath,
        error,
      });
    }
  }

  return {
    deletedArtifactIds: ids,
    deletedStoragePaths,
    failedStoragePaths,
  };
}

export async function artifactHasReferencesOutsideConversation(
  userId: string,
  artifactId: string,
  conversationId: string,
): Promise<boolean> {
  const [artifactRow] = await db
    .select({ conversationId: artifacts.conversationId })
    .from(artifacts)
    .where(and(eq(artifacts.userId, userId), eq(artifacts.id, artifactId)))
    .limit(1);

  if (
    artifactRow?.conversationId &&
    artifactRow.conversationId !== conversationId
  ) {
    return true;
  }

  const linkRows = await db
    .select({
      conversationId: artifactLinks.conversationId,
      messageConversationId: messages.conversationId,
    })
    .from(artifactLinks)
    .leftJoin(messages, eq(artifactLinks.messageId, messages.id))
    .where(
      and(
        eq(artifactLinks.userId, userId),
        or(
          eq(artifactLinks.artifactId, artifactId),
          eq(artifactLinks.relatedArtifactId, artifactId),
        ),
      ),
    );

  if (
    linkRows.some((row) => {
      const linkedConversationId =
        row.conversationId ?? row.messageConversationId ?? null;
      return (
        linkedConversationId === null || linkedConversationId !== conversationId
      );
    })
  ) {
    return true;
  }

  const [evidenceReference] = await db
    .select({ id: taskStateEvidenceLinks.id })
    .from(taskStateEvidenceLinks)
    .where(
      and(
        eq(taskStateEvidenceLinks.userId, userId),
        eq(taskStateEvidenceLinks.artifactId, artifactId),
        ne(taskStateEvidenceLinks.conversationId, conversationId),
      ),
    )
    .limit(1);

  if (evidenceReference) {
    return true;
  }

  const [workingSetReference] = await db
    .select({ id: conversationWorkingSetItems.id })
    .from(conversationWorkingSetItems)
    .where(
      and(
        eq(conversationWorkingSetItems.userId, userId),
        eq(conversationWorkingSetItems.artifactId, artifactId),
        ne(conversationWorkingSetItems.conversationId, conversationId),
      ),
    )
    .limit(1);

  return Boolean(workingSetReference);
}

export async function deleteArtifactForUser(
  userId: string,
  artifactId: string,
): Promise<{
  deletedArtifactIds: string[];
  deletedStoragePaths: string[];
  failedStoragePaths: string[];
} | null> {
  const startedAt = Date.now();
  const artifact = await getArtifactForUser(userId, artifactId);
  if (!artifact) return null;

  const artifactIdsToDelete = new Set<string>([artifact.id]);
  if (artifact.type === "source_document") {
    const derivedRows = await db
      .select({ artifact: artifacts })
      .from(artifactLinks)
      .innerJoin(artifacts, eq(artifactLinks.artifactId, artifacts.id))
      .where(
        and(
          eq(artifactLinks.userId, userId),
          eq(artifactLinks.relatedArtifactId, artifact.id),
          eq(artifactLinks.linkType, "derived_from"),
          eq(artifacts.type, "normalized_document"),
        ),
      );

    for (const row of derivedRows) {
      artifactIdsToDelete.add(row.artifact.id);
    }
  }

  const ids = Array.from(artifactIdsToDelete);
  const result = await hardDeleteArtifactsForUser(userId, ids);
  console.info("[KNOWLEDGE_DELETE] Artifact delete completed", {
    userId,
    artifactId: artifact.id,
    artifactType: artifact.type,
    derivedArtifactIds: ids.filter((id) => id !== artifact.id),
    deletedArtifactIds: result.deletedArtifactIds,
    deletedStoragePathCount: result.deletedStoragePaths.length,
    failedStoragePathCount: result.failedStoragePaths.length,
    durationMs: Date.now() - startedAt,
  });
  if (result.failedStoragePaths.length > 0) {
    console.warn(
      "[KNOWLEDGE_DELETE] Artifact delete completed with file cleanup gaps",
      {
        userId,
        artifactId: artifact.id,
        failedStoragePaths: result.failedStoragePaths,
      },
    );
  }
  return result;
}

export type KnowledgeBulkAction =
  | "forget_all_documents"
  | "forget_all_results"
  | "forget_all_workflows";

async function listDocumentRootArtifactIds(userId: string): Promise<string[]> {
  const documents = await listLogicalDocuments(userId);
  return documents.map((document) => document.id);
}

export async function deleteKnowledgeArtifactsByAction(
  userId: string,
  action: KnowledgeBulkAction,
): Promise<{
  deletedArtifactIds: string[];
  deletedStoragePaths: string[];
  failedStoragePaths: string[];
}> {
  let rootArtifactIds: string[] = [];

  if (action === "forget_all_documents") {
    rootArtifactIds = await listDocumentRootArtifactIds(userId);
  } else {
    const type =
      action === "forget_all_results" ? "generated_output" : "work_capsule";
    const rows = await db
      .select({ id: artifacts.id })
      .from(artifacts)
      .where(and(eq(artifacts.userId, userId), eq(artifacts.type, type)));
    rootArtifactIds = rows.map((row) => row.id);
  }

  if (rootArtifactIds.length === 0) {
    return {
      deletedArtifactIds: [],
      deletedStoragePaths: [],
      failedStoragePaths: [],
    };
  }

  const expandedIds = new Set<string>(rootArtifactIds);
  if (action === "forget_all_documents") {
    const derivedRows = await db
      .select({ artifactId: artifactLinks.artifactId })
      .from(artifactLinks)
      .innerJoin(artifacts, eq(artifactLinks.artifactId, artifacts.id))
      .where(
        and(
          eq(artifactLinks.userId, userId),
          inArray(artifactLinks.relatedArtifactId, rootArtifactIds),
          eq(artifactLinks.linkType, "derived_from"),
          eq(artifacts.type, "normalized_document"),
        ),
      );
    for (const row of derivedRows) {
      expandedIds.add(row.artifactId);
    }
  }

  return hardDeleteArtifactsForUser(userId, Array.from(expandedIds));
}
