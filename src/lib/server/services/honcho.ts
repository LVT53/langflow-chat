// Honcho memory service: provides cross-conversation long-term memory
// Messages are mirrored to Honcho (fire-and-forget), and peer context
// is injected into system prompts for personalized responses.

import Honcho from '@honcho-ai/core';
import { getConfig } from '../config-store';
import { getSystemPrompt } from '../prompts';

let client: Honcho | null = null;
let workspaceId: string | null = null;

// In-memory caches (single-process app, stable IDs)
const peerIdCache = new Map<string, string>();
const sessionIdCache = new Map<string, string>();

export function isHonchoEnabled(): boolean {
  return getConfig().honchoEnabled;
}

async function ensureInitialized(): Promise<Honcho> {
  if (client && workspaceId) return client;

  const config = getConfig();
  if (!config.honchoApiKey) {
    throw new Error('[HONCHO] HONCHO_API_KEY is not set');
  }

  client = new Honcho({
    apiKey: config.honchoApiKey,
    baseURL: config.honchoBaseUrl,
  });

  const workspace = await client.workspaces.getOrCreate({
    id: config.honchoWorkspace,
  });
  workspaceId = workspace.id;

  console.log('[HONCHO] Initialized — workspace:', workspaceId);
  return client;
}

export async function getOrCreatePeer(userId: string): Promise<string> {
  const cached = peerIdCache.get(userId);
  if (cached) return cached;

  const honcho = await ensureInitialized();
  const peer = await honcho.workspaces.peers.getOrCreate(workspaceId!, {
    id: userId,
  });
  peerIdCache.set(userId, peer.id);
  return peer.id;
}

export async function getOrCreateSession(
  userId: string,
  conversationId: string
): Promise<string> {
  const cached = sessionIdCache.get(conversationId);
  if (cached) return cached;

  const honcho = await ensureInitialized();
  const peerId = await getOrCreatePeer(userId);
  const session = await honcho.workspaces.sessions.getOrCreate(workspaceId!, {
    id: conversationId,
    peers: { [peerId]: {} },
  });
  sessionIdCache.set(conversationId, session.id);
  return session.id;
}

export async function mirrorMessage(
  userId: string,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  if (!isHonchoEnabled() || !content.trim()) return;

  const honcho = await ensureInitialized();
  const peerId = await getOrCreatePeer(userId);
  const sessionId = await getOrCreateSession(userId, conversationId);

  await honcho.workspaces.sessions.messages.create(workspaceId!, sessionId, {
    messages: [
      {
        content,
        peer_id: peerId,
        metadata: { role },
      },
    ],
  });
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
  const honcho = await ensureInitialized();
  const peerId = await getOrCreatePeer(userId);

  const response = await honcho.workspaces.peers.chat(workspaceId!, peerId, {
    query:
      'Summarize what you know about this user: preferences, interests, communication style, and important context. Be concise (under 200 words).',
    reasoning_level: 'low',
  });

  if (!response.content || response.content.trim().length === 0) return null;
  return response.content.trim();
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
    await ensureInitialized();
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
