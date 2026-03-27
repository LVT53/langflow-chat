import { requestJson } from './http';

export async function logout(): Promise<void> {
	await requestJson<{ success?: boolean }>(
		'/api/auth/logout',
		{
			method: 'POST',
		},
		'Logout failed'
	);
}
