import { getConfig } from '$lib/server/config-store';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const config = getConfig();
	return json({
		models: [
			{ id: 'model1', displayName: config.model1.displayName },
			{ id: 'model2', displayName: config.model2.displayName }
		]
	});
};
