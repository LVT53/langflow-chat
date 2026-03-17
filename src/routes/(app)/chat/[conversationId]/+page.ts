import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { ConversationDetail } from '$lib/types';

export const load: PageLoad = async ({ params, fetch }) => {
	const { conversationId } = params;

	const res = await fetch(`/api/conversations/${conversationId}`);

	if (res.status === 404) {
		throw error(404, 'Conversation not found');
	}

	if (!res.ok) {
		throw error(res.status, 'Failed to load conversation');
	}

	const detail: ConversationDetail = await res.json();

	return {
		conversation: detail.conversation,
		messages: detail.messages
	};
};
