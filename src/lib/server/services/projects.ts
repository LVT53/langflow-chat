import { db } from '$lib/server/db';
import { projects, conversations } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { Project } from '$lib/types';

function toProject(row: typeof projects.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.getTime() / 1000,
    updatedAt: row.updatedAt.getTime() / 1000,
  };
}

export async function listProjects(userId: string): Promise<Project[]> {
  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId));
  return rows.map(toProject).sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
}

export async function createProject(userId: string, name: string): Promise<Project> {
  const id = randomUUID();
  const [row] = await db.insert(projects).values({ id, userId, name }).returning();
  return toProject(row);
}

export async function updateProject(
  userId: string,
  projectId: string,
  updates: { name?: string }
): Promise<Project | null> {
  const [row] = await db
    .update(projects)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning();
  return row ? toProject(row) : null;
}

export async function deleteProject(userId: string, projectId: string): Promise<boolean> {
  // Unassign all conversations from this project first
  await db
    .update(conversations)
    .set({ projectId: null })
    .where(eq(conversations.projectId, projectId));

  const result = await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning();
  return result.length > 0;
}
