import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { searchVaultDocuments } from '$lib/server/services/knowledge';

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 12;

export const GET: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const rawLimit = Number.parseInt(event.url.searchParams.get('limit') ?? '', 10);
	const limit = Number.isFinite(rawLimit)
		? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
		: DEFAULT_LIMIT;

	const results = await searchVaultDocuments({
		userId: user.id,
		query: event.url.searchParams.get('q') ?? '',
		limit,
	});

	return json({ results });
};
