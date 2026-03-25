import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { listKnowledgeArtifacts } from '$lib/server/services/knowledge';

export const GET: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const data = await listKnowledgeArtifacts(user.id);
	return json(data);
};
