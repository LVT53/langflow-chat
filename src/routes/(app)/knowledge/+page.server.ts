import type { ServerLoad } from '@sveltejs/kit';
import { listKnowledgeArtifacts } from '$lib/server/services/knowledge';
import { isHonchoEnabled } from '$lib/server/services/honcho';
import { getKnowledgeMemory } from '$lib/server/services/memory';

export const load: ServerLoad = async (event) => {
	const user = event.locals.user!;
	const [knowledge, memory] = await Promise.all([
		listKnowledgeArtifacts(user.id),
		getKnowledgeMemory(user.id),
	]);

	return {
		...knowledge,
		honchoEnabled: isHonchoEnabled(),
		memory,
	};
};
