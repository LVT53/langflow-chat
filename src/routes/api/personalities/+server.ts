import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAuth } from '$lib/server/auth/hooks';
import { listPersonalityProfiles, seedPersonalityProfiles } from '$lib/server/services/personality-profiles';

export const GET: RequestHandler = async (event) => {
	requireAuth(event);
	try {
		await seedPersonalityProfiles();
		const profiles = await listPersonalityProfiles();
		return json({ profiles });
	} catch (error) {
		console.error('[PERSONALITIES] Failed to list:', error);
		return json({ error: 'Failed to load personality profiles.' }, { status: 500 });
	}
};
