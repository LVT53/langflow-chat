import { db } from './index';
import { sessions } from './schema';
import { eq, lt } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

export async function createSession(id: string, userId: string, expiresAt: number) {
  await db.insert(sessions).values({
    id,
    userId,
    expiresAt: sql`${expiresAt}`,
  });
}

export async function getSessionById(id: string) {
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id));
  return session;
}

export async function deleteSession(id: string) {
  await db.delete(sessions).where(eq(sessions.id, id));
}

export async function deleteExpiredSessions() {
  const now = Date.now();
  await db.delete(sessions).where(lt(sessions.expiresAt, sql`${now}`));
}