import { redirect } from '@sveltejs/kit';
import type { ServerLoad } from '@sveltejs/kit';
import { listConversations } from '$lib/server/services/conversations';
import { getConfig } from '$lib/server/config-store';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: ServerLoad = async (event) => {
	if (!event.locals.user) {
		throw redirect(302, '/login');
	}

	const [conversations, [userRow]] = await Promise.all([
		listConversations(event.locals.user.id),
		db.select().from(users).where(eq(users.id, event.locals.user.id)),
	]);

	const config = getConfig();
	return {
		user: event.locals.user,
		conversations,
		maxMessageLength: config.maxMessageLength,
		userTheme: userRow?.theme ?? 'system',
		userModel: (userRow?.preferredModel ?? 'model1') as 'model1' | 'model2',
		userTranslation: (userRow?.translationEnabled ?? 0) === 1,
		userAvatarId: userRow?.avatarId ?? null,
		modelNames: {
			model1: config.model1.displayName,
			model2: config.model2.displayName,
		},
	};
};
