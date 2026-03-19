import { redirect } from '@sveltejs/kit';
import type { ServerLoad } from '@sveltejs/kit';
import { listConversations } from '$lib/server/services/conversations';
import { config } from '$lib/server/env';

export const load: ServerLoad = async (event) => {
	if (!event.locals.user) {
		throw redirect(302, '/login');
	}

	const conversations = await listConversations(event.locals.user.id);

	return {
		user: event.locals.user,
		conversations,
		maxMessageLength: config.maxMessageLength
	};
};
