import { validateSession } from '$lib/server/services/auth';
import type { Handle, ServerInit } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { webhookBuffer } from '$lib/server/services/webhook-buffer';
import { refreshConfig } from '$lib/server/config-store';
import { ensureMemoryMaintenanceScheduler } from '$lib/server/services/memory-maintenance';
import { prewarmSandboxImageInBackground } from '$lib/server/sandbox/config';
import { db } from '$lib/server/db';
import { ensureRuntimeSchemaCompatibility } from '$lib/server/db/compat';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

// Load admin config overrides once at startup
refreshConfig().catch((err) => console.error('Config refresh failed:', err));
ensureMemoryMaintenanceScheduler();
prewarmSandboxImageInBackground();

const PUBLIC_PATHS = [
	'/login',
	'/api/auth/login',
	'/api/webhook/sentence',
	'/api/chat/files/generate',
	'/api/ocr/paddle',
	'/api/health',
];

// Throttled lastSeenAt tracking: fire-and-forget writes with 5-minute TTL per user.
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;
const lastSeenWriteTimestamps = new Map<string, number>();

function touchLastSeenAt(userId: string): void {
  const now = Date.now();
  const lastWrite = lastSeenWriteTimestamps.get(userId);
  if (lastWrite !== undefined && now - lastWrite < LAST_SEEN_THROTTLE_MS) {
    return;
  }
  lastSeenWriteTimestamps.set(userId, now);
  db.update(users)
    .set({ lastSeenAt: new Date() })
    .where(eq(users.id, userId))
    .catch((err) => console.error('lastSeenAt update failed:', err));
}

export const init: ServerInit = async () => {
  await ensureRuntimeSchemaCompatibility();
};

export const handle: Handle = async ({ event, resolve }) => {
  await ensureRuntimeSchemaCompatibility();

  try {
    const token = event.cookies.get('session');
     
    if (token) {
      const sessionUser = await validateSession(token);
      event.locals.user = sessionUser ?? null;
    } else {
      event.locals.user = null;
    }
  } catch (err) {
    console.error('Session validation error:', err);
    event.locals.user = null;
  }

  event.locals.webhookBuffer = webhookBuffer;

  // Fire-and-forget lastSeenAt update for authenticated users.
  if (event.locals.user) {
    touchLastSeenAt(event.locals.user.id);
  }

  const path = event.url.pathname;

  if (!PUBLIC_PATHS.includes(path) && !event.locals.user) {
    throw redirect(303, '/login');
  }

  if (path === '/login' && event.locals.user) {
    throw redirect(303, '/');
  }

  return await resolve(event);
};
