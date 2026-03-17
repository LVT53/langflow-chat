import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	getConversation,
	updateConversationTitle,
	deleteConversation
} from '$lib/server/services/conversations';
import { listMessages } from '$lib/server/services/messages';

export const GET: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const { id } = event.params;

	const conversation = await getConversation(user.id, id);
	if (!conversation) {
		return json({ error: 'Conversation not found' }, { status: 404 });
	}

	const messageHistory = await listMessages(id);

	return json({
		conversation,
		messages: messageHistory
	});
};

export const PATCH: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const { id } = event.params;

	const body = await event.request.json().catch(() => null);
	if (!body || typeof body.title !== 'string' || body.title.trim().length === 0) {
		return json({ error: 'Title is required' }, { status: 400 });
	}

	const conversation = await updateConversationTitle(user.id, id, body.title.trim());
	if (!conversation) {
		return json({ error: 'Conversation not found' }, { status: 404 });
	}

	return json(conversation);
};

export const DELETE: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const { id } = event.params;

	const deleted = await deleteConversation(user.id, id);
	if (!deleted) {
		return json({ error: 'Conversation not found' }, { status: 404 });
	}

	return json({ success: true });
};
