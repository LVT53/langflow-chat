import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { UserSettings } from '$lib/types';
import { normalizeModelSelection } from '$lib/server/config-store';

export const GET: RequestHandler = async (event) => {
  requireAuth(event);
  const userId = event.locals.user!.id;

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    return json({ error: 'User not found' }, { status: 404 });
  }

  const settings: UserSettings = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as 'user' | 'admin',
    preferences: {
      preferredModel: normalizeModelSelection(user.preferredModel ?? 'model1'),
      translationEnabled: (user.translationEnabled ?? 0) === 1,
      theme: (user.theme ?? 'system') as 'system' | 'light' | 'dark',
      avatarId: user.avatarId ?? null,
    },
    profilePicture: user.profilePicture ?? null,
  };

  return json(settings);
};
