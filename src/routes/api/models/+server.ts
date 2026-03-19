import { config } from '$lib/server/env';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json({
		models: [
			{ id: 'model1', displayName: config.model1.displayName },
			{ id: 'model2', displayName: config.model2.displayName }
		]
	});
};
