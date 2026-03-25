import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { clearSessionCookie } from '$lib/server/services/auth';
import { deleteUserAccountWithCleanup } from '$lib/server/services/cleanup';

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

  let result;
  try {
    result = await deleteUserAccountWithCleanup(userId, body.password);
  } catch (error) {
    console.error('[ACCOUNT_DELETE] Failed to fully delete user account:', error);
    return json({ error: 'Failed to fully delete account data' }, { status: 500 });
  }

  if (result.status === 'not_found') {
    return json({ error: 'User not found' }, { status: 404 });
  }

  if (result.status === 'incorrect_password') {
    return json({ error: 'Incorrect password' }, { status: 401 });
  }

  clearSessionCookie(event.cookies);

  return json({ success: true });
};
