import { db } from '$lib/server/db';
import { conversations } from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { Conversation } from '$lib/types';

export async function createConversation(userId: string, title?: string): Promise<Conversation> {
	const id = uuidv4();
	const [conversation] = await db
		.insert(conversations)
		.values({
			id,
			userId,
			title: title ?? 'New Conversation',
		})
		.returning();
	return {
		id: conversation.id,
		title: conversation.title,
		createdAt: conversation.createdAt.getTime() / 1000,
		updatedAt: conversation.updatedAt.getTime() / 1000,
	};
}

export async function listConversations(userId: string): Promise<Conversation[]> {
	const result = await db
		.select()
		.from(conversations)
		.where(eq(conversations.userId, userId))
		.orderBy(desc(conversations.updatedAt));
	return result.map(conv => ({
		id: conv.id,
		title: conv.title,
		createdAt: conv.createdAt.getTime() / 1000,
		updatedAt: conv.updatedAt.getTime() / 1000,
	}));
}

export async function getConversation(userId: string, conversationId: string): Promise<Conversation | null> {
	const [conversation] = await db
		.select()
		.from(conversations)
		.where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));
	if (!conversation) {
		return null;
	}
	return {
		id: conversation.id,
		title: conversation.title,
		createdAt: conversation.createdAt.getTime() / 1000,
		updatedAt: conversation.updatedAt.getTime() / 1000,
	};
}

export async function updateConversationTitle(userId: string, conversationId: string, title: string): Promise<Conversation | null> {
	const [conversation] = await db
		.update(conversations)
		.set({ title, updatedAt: new Date() })
		.where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
		.returning();
	if (!conversation) {
		return null;
	}
	return {
		id: conversation.id,
		title: conversation.title,
		createdAt: conversation.createdAt.getTime() / 1000,
		updatedAt: conversation.updatedAt.getTime() / 1000,
	};
}

export async function deleteConversation(userId: string, conversationId: string): Promise<boolean> {
	const result = await db
		.delete(conversations)
		.where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
		.returning();
	return result.length > 0;
}

export async function touchConversation(userId: string, conversationId: string): Promise<Conversation | null> {
	const [conversation] = await db
		.update(conversations)
		.set({ updatedAt: new Date() })
		.where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
		.returning();
	if (!conversation) {
		return null;
	}
	return {
		id: conversation.id,
		title: conversation.title,
		createdAt: conversation.createdAt.getTime() / 1000,
		updatedAt: conversation.updatedAt.getTime() / 1000,
	};
}