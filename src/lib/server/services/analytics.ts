import * as crypto from 'crypto';
import { db } from '../db';
import { messageAnalytics } from '../db/schema';

export interface AnalyticsParams {
  messageId: string;
  userId: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  generationTimeMs?: number;
}

export async function recordMessageAnalytics(params: AnalyticsParams): Promise<void> {
  await db.insert(messageAnalytics).values({
    id: crypto.randomUUID(),
    messageId: params.messageId,
    userId: params.userId,
    model: params.model,
    promptTokens: params.promptTokens ?? null,
    completionTokens: params.completionTokens ?? null,
    reasoningTokens: params.reasoningTokens ?? null,
    generationTimeMs: params.generationTimeMs ?? null,
  });
}
