import { getAvailableModelsWithProviders } from '$lib/server/config-store';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	const models = await getAvailableModelsWithProviders();
	return json({ models });
};
