import { randomUUID } from "crypto";
import { unlink } from "fs/promises";
import { join } from "path";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "$lib/server/db";
import {
  knowledgeVaults,
  artifacts,
  artifactLinks,
  conversationWorkingSetItems,
  taskStateEvidenceLinks,
} from "$lib/server/db/schema";

export interface Vault {
  id: string;
  userId: string;
  name: string;
  color: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

function mapVault(row: typeof knowledgeVaults.$inferSelect): Vault {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    color: row.color ?? null,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function createVault(
  userId: string,
  name: string,
  color?: string | null,
): Promise<Vault> {
  const id = randomUUID();
  const now = new Date();

  const [row] = await db
    .insert(knowledgeVaults)
    .values({
      id,
      userId,
      name,
      color: color ?? null,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return mapVault(row);
}

export async function getVaults(userId: string): Promise<Vault[]> {
  const rows = await db
    .select()
    .from(knowledgeVaults)
    .where(eq(knowledgeVaults.userId, userId))
    .orderBy(asc(knowledgeVaults.sortOrder), asc(knowledgeVaults.createdAt));

  return rows.map(mapVault);
}

export async function getVault(
  userId: string,
  vaultId: string,
): Promise<Vault | null> {
  const [row] = await db
    .select()
    .from(knowledgeVaults)
    .where(
      and(
        eq(knowledgeVaults.id, vaultId),
        eq(knowledgeVaults.userId, userId),
      ),
    );

  return row ? mapVault(row) : null;
}

export interface VaultUpdates {
  name?: string;
  color?: string | null;
  sortOrder?: number;
}

export async function updateVault(
  userId: string,
  vaultId: string,
  updates: VaultUpdates,
): Promise<Vault | null> {
  const [row] = await db
    .update(knowledgeVaults)
    .set({
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.color !== undefined && { color: updates.color }),
      ...(updates.sortOrder !== undefined && { sortOrder: updates.sortOrder }),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(knowledgeVaults.id, vaultId),
        eq(knowledgeVaults.userId, userId),
      ),
    )
    .returning();

  return row ? mapVault(row) : null;
}

export interface VaultDeleteResult {
  deleted: boolean;
  fileCount: number;
  deletedArtifactIds: string[];
  deletedStoragePaths: string[];
  failedStoragePaths: string[];
}

export async function deleteVault(
  userId: string,
  vaultId: string,
): Promise<VaultDeleteResult | null> {
  const startedAt = Date.now();

  // First, get all artifacts in this vault
  const vaultArtifacts = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.userId, userId), eq(artifacts.vaultId, vaultId)));

  const artifactIds = vaultArtifacts.map((row) => row.id);

  // Check if vault exists and belongs to user
  const [vaultRow] = await db
    .select({ id: knowledgeVaults.id })
    .from(knowledgeVaults)
    .where(
      and(
        eq(knowledgeVaults.id, vaultId),
        eq(knowledgeVaults.userId, userId),
      ),
    );

  if (!vaultRow) {
    return null;
  }

  // Delete all related records in a transaction
  if (artifactIds.length > 0) {
    db.transaction((tx) => {
      // Delete working set items
      tx.delete(conversationWorkingSetItems)
        .where(
          and(
            eq(conversationWorkingSetItems.userId, userId),
            inArray(conversationWorkingSetItems.artifactId, artifactIds),
          ),
        )
        .run();

      // Delete evidence links
      tx.delete(taskStateEvidenceLinks)
        .where(
          and(
            eq(taskStateEvidenceLinks.userId, userId),
            inArray(taskStateEvidenceLinks.artifactId, artifactIds),
          ),
        )
        .run();

      // Delete artifact links (both directions)
      tx.delete(artifactLinks)
        .where(
          and(
            eq(artifactLinks.userId, userId),
            or(
              inArray(artifactLinks.artifactId, artifactIds),
              inArray(artifactLinks.relatedArtifactId, artifactIds),
            ),
          ),
        )
        .run();

      // Delete artifacts
      tx.delete(artifacts)
        .where(and(eq(artifacts.userId, userId), inArray(artifacts.id, artifactIds)))
        .run();
    });
  }

  // Delete files from storage
  const deletedStoragePaths: string[] = [];
  const failedStoragePaths: string[] = [];
  for (const row of vaultArtifacts) {
    if (!row.storagePath) continue;
    try {
      await unlink(join(process.cwd(), row.storagePath));
      deletedStoragePaths.push(row.storagePath);
    } catch (error) {
      failedStoragePaths.push(row.storagePath);
      console.warn("[VAULT_DELETE] File cleanup failed", {
        userId,
        vaultId,
        artifactId: row.id,
        storagePath: row.storagePath,
        error,
      });
    }
  }

  // Delete the vault itself
  const result = await db
    .delete(knowledgeVaults)
    .where(
      and(
        eq(knowledgeVaults.id, vaultId),
        eq(knowledgeVaults.userId, userId),
      ),
    );

  const deleted = result.changes > 0;

  console.info("[VAULT_DELETE] Completed", {
    userId,
    vaultId,
    fileCount: artifactIds.length,
    deletedArtifactIds: artifactIds,
    deletedStoragePathCount: deletedStoragePaths.length,
    failedStoragePathCount: failedStoragePaths.length,
    durationMs: Date.now() - startedAt,
  });

  if (failedStoragePaths.length > 0) {
    console.warn("[VAULT_DELETE] Completed with file cleanup gaps", {
      userId,
      vaultId,
      failedStoragePaths,
    });
  }

  return {
    deleted,
    fileCount: artifactIds.length,
    deletedArtifactIds: artifactIds,
    deletedStoragePaths,
    failedStoragePaths,
  };
}
