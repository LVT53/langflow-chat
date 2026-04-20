import type { ModelId } from '$lib/types';
import { requestJson } from './http';
import { _unwrapList } from './_utils';

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

	return _unwrapList<AvailableModel>(payload, 'models');
}
