import { redirect, error } from '@sveltejs/kit';

export function requireAuth(event) {
  if (!event.locals.user) {
    throw redirect(302, '/login');
  }
}

export function requireAdmin(event) {
  if (!event.locals.user) {
    throw redirect(302, '/login');
  }
  if (event.locals.user.role !== 'admin') {
    throw error(403, 'Forbidden');
  }
}

export function requireGuest(event) {
  if (event.locals.user) {
    throw redirect(302, '/');
  }
}