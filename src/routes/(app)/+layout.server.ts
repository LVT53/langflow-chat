import { redirect } from '@sveltejs/kit';
import type { ServerLoad } from '@sveltejs/kit';
import { listConversations } from '$lib/server/services/conversations';
import { listProjects } from '$lib/server/services/projects';
import {
	getAvailableModelsWithProviders,
	getConfig,
	normalizeModelSelectionWithProviders,
} from '$lib/server/config-store';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: ServerLoad = async (event) => {
	if (!event.locals.user) {
		throw redirect(302, '/login');
	}

	const [conversations, projectsList, [userRow]] = await Promise.all([
		listConversations(event.locals.user.id),
		listProjects(event.locals.user.id),
		db.select().from(users).where(eq(users.id, event.locals.user.id)),
	]);

	const config = getConfig();
	const userModel = await normalizeModelSelectionWithProviders(
		userRow?.preferredModel ?? 'model1',
		config
	);
	const availableModels = await getAvailableModelsWithProviders();

	return {
		user: event.locals.user,
		conversations,
		projects: projectsList,
		maxMessageLength: config.maxMessageLength,
		userTheme: userRow?.theme ?? 'system',
		userModel,
		userTranslation: (userRow?.translationEnabled ?? 0) === 1,
		userTitleLanguage: (userRow?.titleLanguage ?? 'auto') as 'auto' | 'en' | 'hu',
		userAvatarId: userRow?.avatarId ?? null,
		modelNames: {
			model1: config.model1.displayName,
			model2: config.model2.displayName,
		},
		availableModels,
	};
};
