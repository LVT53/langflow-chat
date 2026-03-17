import { db } from './index';
import { users } from './schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function createUser(email: string, passwordHash: string, name?: string) {
  const id = randomUUID();
  const [user] = await db.insert(users).values({
    id,
    email,
    passwordHash,
    name,
  }).returning();
  return user;
}

export async function getUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

export async function getUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user;
}

export async function updateUser(id: string, updates: Partial<typeof users.$inferSelect>) {
  const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
  return user;
}

export async function deleteUser(id: string) {
  await db.delete(users).where(eq(users.id, id));
}