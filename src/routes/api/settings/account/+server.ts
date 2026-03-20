import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { verifyPassword, clearSessionCookie } from '$lib/server/services/auth';

export const DELETE: RequestHandler = async (event) => {
  requireAuth(event);
  const userId = event.locals.user!.id;

  let body: { password?: unknown };
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (typeof body.password !== 'string') {
    return json({ error: 'password is required' }, { status: 400 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    return json({ error: 'User not found' }, { status: 404 });
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    return json({ error: 'Incorrect password' }, { status: 401 });
  }

  // Delete user (cascades to sessions, conversations, messages, message_analytics)
  await db.delete(users).where(eq(users.id, userId));

  clearSessionCookie(event.cookies);

  return json({ success: true });
};
