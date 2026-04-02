import { timingSafeEqual } from 'crypto';
import { error, redirect } from '@sveltejs/kit';
import { config } from '$lib/server/env';

export function requireAuth(event) {
  if (!event.locals.user) {
    throw redirect(302, '/login');
  }
}

export function getBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;

  const [scheme, token, ...rest] = authorizationHeader.trim().split(/\s+/);
  if (rest.length > 0) return null;
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;

  return token;
}

export function hasValidAlfyAiApiKey(authorizationHeader: string | null): boolean {
  const expectedToken = config.alfyaiApiKey.trim();
  const providedToken = getBearerToken(authorizationHeader);
  if (!expectedToken || !providedToken) return false;

  const expectedBuffer = Buffer.from(expectedToken);
  const providedBuffer = Buffer.from(providedToken);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
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
