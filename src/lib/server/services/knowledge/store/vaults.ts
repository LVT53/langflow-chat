import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "$lib/server/db";
import { knowledgeVaults } from "$lib/server/db/schema";

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

export async function deleteVault(
  userId: string,
  vaultId: string,
): Promise<boolean> {
  const result = await db
    .delete(knowledgeVaults)
    .where(
      and(
        eq(knowledgeVaults.id, vaultId),
        eq(knowledgeVaults.userId, userId),
      ),
    );

  return result.changes > 0;
}
