import type { RequestHandler } from '@sveltejs/kit';
import { requireAuth } from '$lib/server/auth/hooks';
import { requestActiveChatStreamStop } from '$lib/server/services/chat-turn/active-streams';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export const POST: RequestHandler = async (event) => {
	requireAuth(event);

	let body: { streamId?: unknown };
	try {
		body = await event.request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
			status: 400,
			headers: JSON_HEADERS,
		});
	}

	const streamId =
		typeof body.streamId === 'string' && body.streamId.trim().length > 0
			? body.streamId.trim()
			: '';
	if (!streamId) {
		return new Response(JSON.stringify({ error: 'streamId is required' }), {
			status: 400,
			headers: JSON_HEADERS,
		});
	}

	const stopped = requestActiveChatStreamStop({
		streamId,
		userId: event.locals.user!.id,
	});

	return new Response(JSON.stringify({ stopped }), {
		status: 200,
		headers: JSON_HEADERS,
	});
};
