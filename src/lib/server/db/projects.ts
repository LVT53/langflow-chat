import { db } from './index';
import { projects } from './schema';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function createProject(userId: string, name: string, color?: string) {
  const id = randomUUID();
  const [project] = await db.insert(projects).values({ id, userId, name, color }).returning();
  return project;
}

export async function getProjectsByUserId(userId: string) {
  return db.select().from(projects).where(eq(projects.userId, userId));
}

export async function getProjectById(id: string, userId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return project ?? null;
}

export async function updateProject(id: string, userId: string, updates: { name?: string; color?: string; sortOrder?: number }) {
  const [project] = await db
    .update(projects)
    .set({ ...updates, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning();
  return project ?? null;
}

export async function deleteProject(id: string, userId: string) {
  const result = await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning();
  return result.length > 0;
}
