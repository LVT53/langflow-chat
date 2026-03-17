import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { listConversations, createConversation } from '$lib/server/services/conversations';

export const GET: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	const conversations = await listConversations(user.id);
	return json({ conversations });
};

export const POST: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;

	const body = await event.request.json().catch(() => ({}));
	const title = typeof body?.title === 'string' ? body.title.trim() || undefined : undefined;

	const conversation = await createConversation(user.id, title);
	return json(conversation, { status: 201 });
};
