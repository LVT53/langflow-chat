import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { getConversation } from '$lib/server/services/conversations';
import { listMessages, deleteMessages } from '$lib/server/services/messages';

export const DELETE: RequestHandler = async (event) => {
	try {
		requireAuth(event);
		const user = event.locals.user!;
		const { id } = event.params;

		const conversation = await getConversation(user.id, id);
		if (!conversation) {
			return json({ error: 'Conversation not found' }, { status: 404 });
		}

		const body = await event.request.json().catch(() => null);
		if (!body || !Array.isArray(body.messageIds) || body.messageIds.length === 0) {
			return json({ error: 'messageIds array is required' }, { status: 400 });
		}

		const messageIds: string[] = body.messageIds.filter((id: unknown) => typeof id === 'string');

		// Verify all messages belong to this conversation before deleting
		const existingMessages = await listMessages(id);
		const existingIds = new Set(existingMessages.map((m) => m.id));
		const safeIds = messageIds.filter((mid) => existingIds.has(mid));

		await deleteMessages(safeIds);

		return json({ deleted: safeIds.length });
	} catch (err) {
		console.error('Error deleting messages:', err);
		return json({ error: 'Failed to delete messages' }, { status: 500 });
	}
};
