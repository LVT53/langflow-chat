import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import {
	clearConversationDraft,
	upsertConversationDraft,
} from '$lib/server/services/conversation-drafts';
import { getConversation } from '$lib/server/services/conversations';

function parseAttachmentIds(value: unknown): string[] | null {
	if (!Array.isArray(value)) return null;
	return value.filter((item): item is string => typeof item === 'string');
}

export const PUT: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const { id } = event.params;

	const conversation = await getConversation(user.id, id);
	if (!conversation) {
		return json({ error: 'Conversation not found' }, { status: 404 });
	}

	const body = await event.request.json().catch(() => null);
	if (!body || typeof body !== 'object') {
		return json({ error: 'Invalid draft payload' }, { status: 400 });
	}

	const draftText =
		typeof (body as Record<string, unknown>).draftText === 'string'
			? (body as Record<string, unknown>).draftText
			: '';
	const selectedAttachmentIds = parseAttachmentIds(
		(body as Record<string, unknown>).selectedAttachmentIds
	);
	if (!selectedAttachmentIds) {
		return json({ error: 'selectedAttachmentIds must be an array of strings' }, { status: 400 });
	}

	const draft = await upsertConversationDraft({
		userId: user.id,
		conversationId: id,
		draftText,
		selectedAttachmentIds,
	});

	return json({ draft });
};

export const DELETE: RequestHandler = async (event) => {
	requireAuth(event);
	const user = event.locals.user!;
	const { id } = event.params;

	await clearConversationDraft(user.id, id);
	return json({ success: true });
};
