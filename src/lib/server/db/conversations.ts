import { db } from './index';
import { conversations } from './schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function createConversation(userId: string, title: string) {
  const id = randomUUID();
  const [conversation] = await db.insert(conversations).values({
    id,
    userId,
    title,
  }).returning();
  return conversation;
}

export async function getConversationById(id: string) {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
  return conversation;
}

export async function getConversationsByUserId(userId: string) {
  const convoList = await db.select().from(conversations).where(eq(conversations.userId, userId));
  return convoList;
}

export async function updateConversation(id: string, updates: Partial<typeof conversations.$inferSelect>) {
  const [conversation] = await db.update(conversations).set(updates).where(eq(conversations.id, id)).returning();
  return conversation;
}

export async function deleteConversation(id: string) {
  await db.delete(conversations).where(eq(conversations.id, id));
}