import type { ModelId } from '$lib/types';
import { requestJson } from './http';

export interface AvailableModel {
	id: ModelId;
	displayName: string;
}

export async function fetchAvailableModels(): Promise<AvailableModel[]> {
	const payload = await requestJson<{ models?: AvailableModel[] }>(
		'/api/models',
		undefined,
		'Failed to load models'
	);

	return Array.isArray(payload.models) ? payload.models : [];
}
