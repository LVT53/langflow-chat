import type { ServerLoad } from '@sveltejs/kit';
import { listKnowledgeArtifacts } from '$lib/server/services/knowledge';
import { getPeerContext, isHonchoEnabled } from '$lib/server/services/honcho';

export const load: ServerLoad = async (event) => {
	const user = event.locals.user!;
	const [knowledge, honchoOverview] = await Promise.all([
		listKnowledgeArtifacts(user.id),
		getPeerContext(user.id),
	]);

	return {
		...knowledge,
		honchoEnabled: isHonchoEnabled(),
		honchoOverview,
	};
};
