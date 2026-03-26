import type { ModelId } from '$lib/types';
import { requestJson } from './http';

export async function updateUserPreferences(params: {
	preferredModel?: ModelId;
	translationEnabled?: boolean;
}): Promise<void> {
	await requestJson<{ success?: boolean }>(
		'/api/settings/preferences',
		{
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(params),
		},
		'Failed to update preferences'
	);
}
