import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	getArtifactForUser,
	listArtifactLinksForUser,
} from '$lib/server/services/knowledge';

export const GET: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const artifact = await getArtifactForUser(user.id, event.params.id);
	if (!artifact) {
		return json({ error: 'Artifact not found' }, { status: 404 });
	}

	const links = await listArtifactLinksForUser(user.id, artifact.id);
	return json({ artifact, links });
};
