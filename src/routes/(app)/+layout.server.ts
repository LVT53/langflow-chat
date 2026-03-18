import { redirect } from '@sveltejs/kit';
import type { ServerLoad } from '@sveltejs/kit';
import { listConversations } from '$lib/server/services/conversations';

export const load: ServerLoad = async (event) => {
	if (!event.locals.user) {
		throw redirect(302, '/login');
	}

	const conversations = await listConversations(event.locals.user.id);

	return {
		user: event.locals.user,
		conversations
	};
};
