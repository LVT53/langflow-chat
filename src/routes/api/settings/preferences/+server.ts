import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { getAvailableModelsWithProviders } from '$lib/server/config-store';
import type { ModelId } from '$lib/types';

const VALID_THEMES = ['system', 'light', 'dark'];

export const PATCH: RequestHandler = async (event) => {
  requireAuth(event);
  const userId = event.locals.user!.id;

  let body: {
    preferredModel?: unknown;
    translationEnabled?: unknown;
    theme?: unknown;
    avatarId?: unknown;
  };
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.preferredModel !== undefined) {
    const validModels = new Set((await getAvailableModelsWithProviders()).map((model) => model.id));
    if (!validModels.has(body.preferredModel as ModelId)) {
      return json({ error: 'Invalid preferredModel' }, { status: 400 });
    }
    updates.preferredModel = body.preferredModel;
  }

  if (body.translationEnabled !== undefined) {
    updates.translationEnabled = body.translationEnabled ? 1 : 0;
  }

  if (body.theme !== undefined) {
    if (!VALID_THEMES.includes(body.theme as string)) {
      return json({ error: 'Invalid theme' }, { status: 400 });
    }
    updates.theme = body.theme;
  }

  if (body.avatarId !== undefined) {
    updates.avatarId = body.avatarId === null ? null : Number(body.avatarId);
  }

  await db.update(users).set(updates).where(eq(users.id, userId));

  return json({ success: true });
};
