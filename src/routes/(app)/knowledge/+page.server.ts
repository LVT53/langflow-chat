import type { ServerLoad } from '@sveltejs/kit';
import { listKnowledgeArtifacts } from '$lib/server/services/knowledge';

export const load: ServerLoad = async (event) => {
	const user = event.locals.user!;
	return listKnowledgeArtifacts(user.id);
};
