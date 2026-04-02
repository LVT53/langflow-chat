import type { ServerLoad } from '@sveltejs/kit';
import { listKnowledgeArtifacts } from '$lib/server/services/knowledge';
import { isHonchoEnabled } from '$lib/server/services/honcho';
import { getVaults } from '$lib/server/services/knowledge/store/vaults';

export const load: ServerLoad = async (event) => {
	const user = event.locals.user!;
	const knowledge = await listKnowledgeArtifacts(user.id);
	const vaults = await getVaults(user.id);

	return {
		...knowledge,
		vaults,
		honchoEnabled: isHonchoEnabled(),
		userDisplayName: user.displayName,
	};
};
