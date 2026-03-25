// Honcho memory service: provides cross-conversation long-term memory
// Messages are mirrored to Honcho (fire-and-forget), and peer context
// is injected into system prompts for personalized responses.

import { Honcho } from '@honcho-ai/sdk';
import type { Peer } from '@honcho-ai/sdk/dist/peer';
import type { Session } from '@honcho-ai/sdk/dist/session';
import { getConfig } from '../config-store';
import { getSystemPrompt } from '../prompts';

let client: Honcho | null = null;

// In-memory caches (single-process app, stable IDs)
const peerCache = new Map<string, Peer>();
const sessionCache = new Map<string, Session>();

export function isHonchoEnabled(): boolean {
  return getConfig().honchoEnabled;
}

async function ensureClient(): Promise<Honcho> {
  if (client) return client;

  const config = getConfig();

  client = new Honcho({
    apiKey: config.honchoApiKey || 'no-auth',
    baseURL: config.honchoBaseUrl,
    workspaceId: config.honchoWorkspace,
  });

  console.log('[HONCHO] Initialized — workspace:', config.honchoWorkspace);
  return client;
}

async function getPeer(userId: string): Promise<Peer> {
  const cached = peerCache.get(userId);
  if (cached) return cached;

  const honcho = await ensureClient();
  const peer = await honcho.peer(userId);
  peerCache.set(userId, peer);
  return peer;
}

async function getSession(userId: string, conversationId: string): Promise<Session> {
  const cached = sessionCache.get(conversationId);
  if (cached) return cached;

  const honcho = await ensureClient();
  const session = await honcho.session(conversationId);
  const peer = await getPeer(userId);
  try {
    await session.addPeers(peer);
    console.log(`[HONCHO] Added peer ${peer.id} to session ${conversationId}`);
  } catch (err) {
    console.error(`[HONCHO] Failed to add peer to session:`, err);
  }
  sessionCache.set(conversationId, session);
  return session;
}

export async function getOrCreateSession(
  userId: string,
  conversationId: string
): Promise<string> {
  const session = await getSession(userId, conversationId);
  return session.id;
}

export async function mirrorMessage(
  userId: string,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  if (!isHonchoEnabled() || !content.trim()) return;

  const peer = await getPeer(userId);
  const session = await getSession(userId, conversationId);

  const msgs = await session.addMessages(peer.message(content, { metadata: { role } }));
  console.log(`[HONCHO] Mirrored ${role} message to session ${conversationId} (${msgs.length} msgs created)`);
}

export async function getPeerContext(userId: string): Promise<string | null> {
  if (!isHonchoEnabled()) return null;

  try {
    const result = await Promise.race([
      queryPeerContext(userId),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
    return result;
  } catch (err) {
    console.error('[HONCHO] getPeerContext failed:', err);
    return null;
  }
}

async function queryPeerContext(userId: string): Promise<string | null> {
  const peer = await getPeer(userId);

  const response = await peer.chat(
    'Summarize what you know about this user: preferences, interests, communication style, and important context. Be concise (under 200 words).',
    { reasoningLevel: 'low' }
  );

  if (!response || response.trim().length === 0) return null;
  return response.trim();
}

export async function buildEnhancedSystemPrompt(
  promptName: string | undefined,
  userId: string
): Promise<string> {
  const basePrompt = getSystemPrompt(promptName);
  if (!isHonchoEnabled()) return basePrompt;

  const memoryContext = await getPeerContext(userId);
  if (!memoryContext) return basePrompt;

  return `${basePrompt}\n\n## User Memory (from previous conversations)\n${memoryContext}`;
}

// Health check for admin UI
export async function checkHealth(): Promise<{
  enabled: boolean;
  connected: boolean;
  workspace: string | null;
}> {
  if (!isHonchoEnabled()) {
    return { enabled: false, connected: false, workspace: null };
  }

  try {
    await ensureClient();
    // Try to actually reach the API
    const honcho = client!;
    await honcho.getMetadata();
    return {
      enabled: true,
      connected: true,
      workspace: getConfig().honchoWorkspace,
    };
  } catch {
    return {
      enabled: true,
      connected: false,
      workspace: getConfig().honchoWorkspace,
    };
  }
}
