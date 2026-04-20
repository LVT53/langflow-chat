import type { AdminManagedUserSummary, UserRole } from '$lib/types';
import { requestJson, requestVoid } from './http';

interface AdminUsersResponse {
	users: AdminManagedUserSummary[];
}

interface AdminUserResponse {
	user: AdminManagedUserSummary;
}

export async function fetchAdminUsers(): Promise<AdminManagedUserSummary[]> {
	const response = await requestJson<AdminUsersResponse>(
		'/api/admin/users',
		undefined,
		'Failed to load users'
	);
	return response.users;
}

export async function createAdminUser(params: {
	email: string;
	password: string;
	name?: string | null;
	role?: UserRole;
}): Promise<AdminManagedUserSummary> {
	const response = await requestJson<AdminUserResponse>(
		'/api/admin/users',
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(params),
		},
		'Failed to create user'
	);
	return response.user;
}

export async function updateAdminUserRole(
	userId: string,
	role: UserRole
): Promise<AdminManagedUserSummary> {
	const response = await requestJson<AdminUserResponse>(
		`/api/admin/users/${userId}`,
		{
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ role }),
		},
		'Failed to update user role'
	);
	return response.user;
}

export async function deleteAdminUser(userId: string): Promise<void> {
	await requestVoid(
		`/api/admin/users/${userId}`,
		{
			method: 'DELETE',
		},
		'Failed to delete user'
	);
}

export async function revokeAdminUserSessions(userId: string): Promise<void> {
	await requestVoid(
		`/api/admin/users/${userId}/sessions`,
		{
			method: 'DELETE',
		},
		'Failed to revoke sessions'
	);
}

export async function updateAdminConfig(config: Record<string, string>): Promise<void> {
	await requestJson<{ success?: boolean }>(
		'/api/admin/config',
		{
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(config),
		},
		'Failed to save configuration'
	);
}