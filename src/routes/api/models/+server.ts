import { getAvailableModels, getConfig } from '$lib/server/config-store';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const config = getConfig();
	return json({
		models: getAvailableModels(config),
	});
};
