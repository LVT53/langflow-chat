import { redirect } from '@sveltejs/kit';

export function requireAuth(event) {
  if (!event.locals.user) {
    throw redirect(302, '/login');
  }
}

export function requireGuest(event) {
  if (event.locals.user) {
    throw redirect(302, '/');
  }
}