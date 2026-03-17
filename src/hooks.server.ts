import { validateSession } from '$lib/server/services/auth';
import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { webhookBuffer } from '$lib/server/services/webhook-buffer';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/webhook/sentence'];

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get('session');
   
  if (token) {
    const sessionUser = await validateSession(token);
    event.locals.user = sessionUser ?? null;
  } else {
    event.locals.user = null;
  }

  event.locals.webhookBuffer = webhookBuffer;

  const path = event.url.pathname;

  if (!PUBLIC_PATHS.includes(path) && !event.locals.user) {
    throw redirect(303, '/login');
  }

  if (path === '/login' && event.locals.user) {
    throw redirect(303, '/');
  }

  return await resolve(event);
};
