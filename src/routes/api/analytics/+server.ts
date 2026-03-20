import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { db } from '$lib/server/db';
import { messageAnalytics, conversations, users } from '$lib/server/db/schema';
import { eq, count, avg, sum, sql } from 'drizzle-orm';

export const GET: RequestHandler = async (event) => {
  requireAuth(event);
  const user = event.locals.user!;
  const isAdmin = user.role === 'admin';

  // Personal stats for the requesting user
  const personalRows = await db
    .select({
      model: messageAnalytics.model,
      msgCount: count(messageAnalytics.id),
      avgGenMs: avg(messageAnalytics.generationTimeMs),
      totalCompletion: sum(messageAnalytics.completionTokens),
      totalReasoning: sum(messageAnalytics.reasoningTokens),
    })
    .from(messageAnalytics)
    .where(eq(messageAnalytics.userId, user.id))
    .groupBy(messageAnalytics.model);

  const personalChatCount = await db
    .select({ cnt: count(conversations.id) })
    .from(conversations)
    .where(eq(conversations.userId, user.id));

  const personalStats = {
    byModel: personalRows,
    totalMessages: personalRows.reduce((s, r) => s + Number(r.msgCount), 0),
    avgGenerationMs: personalRows.length
      ? personalRows.reduce((s, r) => s + Number(r.avgGenMs || 0), 0) / personalRows.length
      : 0,
    totalTokens: personalRows.reduce((s, r) => s + Number(r.totalCompletion || 0), 0),
    reasoningTokens: personalRows.reduce((s, r) => s + Number(r.totalReasoning || 0), 0),
    favoriteModel: personalRows.sort((a, b) => Number(b.msgCount) - Number(a.msgCount))[0]?.model ?? null,
    chatCount: Number(personalChatCount[0]?.cnt ?? 0),
  };

  if (!isAdmin) {
    return json({ personal: personalStats });
  }

  // Admin: system-wide stats
  const systemRows = await db
    .select({
      msgCount: count(messageAnalytics.id),
      avgGenMs: avg(messageAnalytics.generationTimeMs),
      totalCompletion: sum(messageAnalytics.completionTokens),
      totalReasoning: sum(messageAnalytics.reasoningTokens),
    })
    .from(messageAnalytics);

  const systemModelRows = await db
    .select({
      model: messageAnalytics.model,
      msgCount: count(messageAnalytics.id),
    })
    .from(messageAnalytics)
    .groupBy(messageAnalytics.model);

  const userCount = await db.select({ cnt: count(users.id) }).from(users);

  const systemStats = {
    totalMessages: Number(systemRows[0]?.msgCount ?? 0),
    avgGenerationMs: Number(systemRows[0]?.avgGenMs ?? 0),
    totalTokens: Number(systemRows[0]?.totalCompletion ?? 0),
    reasoningTokens: Number(systemRows[0]?.totalReasoning ?? 0),
    totalUsers: Number(userCount[0]?.cnt ?? 0),
    byModel: systemModelRows,
  };

  // Per-user breakdown
  const perUserRows = await db
    .select({
      userId: messageAnalytics.userId,
      msgCount: count(messageAnalytics.id),
      avgGenMs: avg(messageAnalytics.generationTimeMs),
      totalCompletion: sum(messageAnalytics.completionTokens),
      totalReasoning: sum(messageAnalytics.reasoningTokens),
      topModel: sql<string>`(SELECT model FROM message_analytics WHERE user_id = ${messageAnalytics.userId} GROUP BY model ORDER BY COUNT(*) DESC LIMIT 1)`,
    })
    .from(messageAnalytics)
    .groupBy(messageAnalytics.userId);

  // Get user info and chat counts
  const allUsers = await db.select({ id: users.id, name: users.name, email: users.email }).from(users);
  const userMap = new Map(allUsers.map((u) => [u.id, u]));

  const chatCounts = await db
    .select({ userId: conversations.userId, cnt: count(conversations.id) })
    .from(conversations)
    .groupBy(conversations.userId);
  const chatMap = new Map(chatCounts.map((c) => [c.userId, Number(c.cnt)]));

  const perUser = perUserRows.map((row) => {
    const u = userMap.get(row.userId);
    return {
      userId: row.userId,
      displayName: u?.name ?? u?.email ?? row.userId,
      email: u?.email ?? '',
      messageCount: Number(row.msgCount),
      avgGenerationMs: Number(row.avgGenMs ?? 0),
      totalTokens: Number(row.totalCompletion ?? 0),
      reasoningTokens: Number(row.totalReasoning ?? 0),
      favoriteModel: row.topModel ?? null,
      conversationCount: chatMap.get(row.userId) ?? 0,
    };
  }).sort((a, b) => b.messageCount - a.messageCount);

  return json({ personal: personalStats, system: systemStats, perUser });
};
