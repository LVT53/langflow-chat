#!/usr/bin/env tsx

// Backfill existing messages to Honcho for long-term memory reasoning.
// Run: npx tsx scripts/honcho-backfill.ts

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

// Set required env vars if not set
if (!process.env.LANGFLOW_API_KEY) process.env.LANGFLOW_API_KEY = 'placeholder';
if (!process.env.SESSION_SECRET) process.env.SESSION_SECRET = 'placeholder-secret-32-chars-long!!';

import Honcho from '@honcho-ai/core';
import { db } from '../src/lib/server/db';
import { users, conversations, messages } from '../src/lib/server/db/schema';
import { eq, asc } from 'drizzle-orm';

const RATE_LIMIT_MS = 100; // 10 msgs/sec

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const apiKey = process.env.HONCHO_API_KEY;
  const baseUrl = process.env.HONCHO_BASE_URL || 'http://localhost:8000';
  const workspaceName = process.env.HONCHO_WORKSPACE || 'alfyai-prod';

  if (!apiKey) {
    console.error('HONCHO_API_KEY is required');
    process.exit(1);
  }

  const honcho = new Honcho({ apiKey, baseURL: baseUrl });
  console.log('[BACKFILL] Connecting to Honcho at', baseUrl);

  // Get or create workspace
  const workspace = await honcho.workspaces.getOrCreate({ id: workspaceName });
  console.log('[BACKFILL] Workspace:', workspace.id);

  // Get all users
  const allUsers = await db.select().from(users);
  console.log(`[BACKFILL] Found ${allUsers.length} users`);

  let totalMessages = 0;

  for (const user of allUsers) {
    console.log(`\n[BACKFILL] Processing user: ${user.email} (${user.id})`);

    // Create peer for user
    const peer = await honcho.workspaces.peers.getOrCreate(workspace.id, {
      id: user.id,
    });
    console.log(`  Peer: ${peer.id}`);

    // Get all conversations for this user
    const userConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, user.id));

    console.log(`  Conversations: ${userConversations.length}`);

    for (const conv of userConversations) {
      // Create session for conversation
      const session = await honcho.workspaces.sessions.getOrCreate(
        workspace.id,
        {
          id: conv.id,
          peers: { [peer.id]: {} },
        }
      );

      // Get all messages in chronological order
      const convMessages = await db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(asc(messages.createdAt));

      if (convMessages.length === 0) continue;

      console.log(
        `  Conversation "${conv.title}": ${convMessages.length} messages`
      );

      // Batch messages (Honcho supports bulk create)
      const batch = convMessages
        .filter((m) => m.content.trim())
        .map((m) => ({
          content: m.content,
          peer_id: peer.id,
          metadata: { role: m.role },
          created_at: m.createdAt.toISOString(),
        }));

      if (batch.length === 0) continue;

      // Send in batches of 50 to avoid oversized requests
      for (let i = 0; i < batch.length; i += 50) {
        const chunk = batch.slice(i, i + 50);
        await honcho.workspaces.sessions.messages.create(
          workspace.id,
          session.id,
          { messages: chunk }
        );
        totalMessages += chunk.length;
        await sleep(RATE_LIMIT_MS);
      }
    }
  }

  console.log(`\n[BACKFILL] Done! Mirrored ${totalMessages} messages to Honcho.`);
  console.log('[BACKFILL] Honcho will process these asynchronously for reasoning.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[BACKFILL] Fatal error:', err);
  process.exit(1);
});
