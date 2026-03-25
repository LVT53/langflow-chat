import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	createArtifactLink,
	getArtifactForUser,
} from '$lib/server/services/knowledge';

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const artifact = await getArtifactForUser(user.id, event.params.id);
	if (!artifact) {
		return json({ error: 'Artifact not found' }, { status: 404 });
	}

	const body = await event.request.json().catch(() => null);
	const conversationId = typeof body?.conversationId === 'string' ? body.conversationId : null;
	if (!conversationId) {
		return json({ error: 'conversationId is required' }, { status: 400 });
	}

	const link = await createArtifactLink({
		userId: user.id,
		artifactId: artifact.id,
		conversationId,
		linkType: 'attached_to_conversation',
	});

	return json({ artifact, link });
};
