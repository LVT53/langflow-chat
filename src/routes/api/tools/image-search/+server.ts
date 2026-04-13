import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchImages } from '$lib/server/services/image-search';

export const POST: RequestHandler = async (event) => {
  const user = event.locals.user;
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { query } = body as Record<string, unknown>;
  if (typeof query !== 'string' || query.trim().length === 0) {
    return json({ error: 'query is required' }, { status: 400 });
  }

  try {
    const results = await searchImages(query.trim());
    return json({ results });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Image search failed';
    return json({ error: errorMessage }, { status: 500 });
  }
};
