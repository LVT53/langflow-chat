import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/auth/hooks';
import { checkHealth } from '$lib/server/services/honcho';

export const GET: RequestHandler = async (event) => {
  requireAdmin(event);

  const health = await checkHealth();
  return json(health);
};
