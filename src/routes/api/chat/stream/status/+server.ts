import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getOrphanedStream } from '$lib/server/services/chat-turn/active-streams';

export const GET: RequestHandler = async (event) => {
	requireAuth(event);

	const conversationId = event.url.searchParams.get('conversationId');
	if (!conversationId) {
		return json({ error: 'conversationId is required' }, { status: 400 });
	}

	const orphanedStreamId = getOrphanedStream(conversationId);
	if (!orphanedStreamId) {
		return json({ hasOrphanedStream: false });
	}

	return json({
		hasOrphanedStream: true,
		streamId: orphanedStreamId,
	});
};