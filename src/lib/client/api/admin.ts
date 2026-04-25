import type { AdminManagedUserSummary, UserRole } from "$lib/types";
import { requestJson, requestVoid } from "./http";

interface AdminUsersResponse {
	users: AdminManagedUserSummary[];
}

interface AdminUserResponse {
	user: AdminManagedUserSummary;
}

export async function fetchAdminUsers(): Promise<AdminManagedUserSummary[]> {
	const response = await requestJson<AdminUsersResponse>(
		"/api/admin/users",
		undefined,
		"Failed to load users",
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
		"/api/admin/users",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(params),
		},
		"Failed to create user",
	);
	return response.user;
}

export async function updateAdminUserRole(
	userId: string,
	role: UserRole,
): Promise<AdminManagedUserSummary> {
	const response = await requestJson<AdminUserResponse>(
		`/api/admin/users/${userId}`,
		{
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ role }),
		},
		"Failed to update user role",
	);
	return response.user;
}

export async function deleteAdminUser(userId: string): Promise<void> {
	await requestVoid(
		`/api/admin/users/${userId}`,
		{
			method: "DELETE",
		},
		"Failed to delete user",
	);
}

export async function revokeAdminUserSessions(userId: string): Promise<void> {
	await requestVoid(
		`/api/admin/users/${userId}/sessions`,
		{
			method: "DELETE",
		},
		"Failed to revoke sessions",
	);
}

export async function updateAdminConfig(
	config: Record<string, string>,
): Promise<void> {
	await requestJson<{ success?: boolean }>(
		"/api/admin/config",
		{
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(config),
		},
		"Failed to save configuration",
	);
}

export interface InferenceProvider {
	id: string;
	name: string;
	displayName: string;
	baseUrl: string;
	modelName: string;
	reasoningEffort: "low" | "medium" | "high" | null;
	thinkingType: "enabled" | "disabled" | null;
	enabled: boolean;
	sortOrder: number;
	maxModelContext: number | null;
	compactionUiThreshold: number | null;
	targetConstructedContext: number | null;
	maxMessageLength: number | null;
	createdAt: string;
	updatedAt: string;
}

interface ProvidersResponse {
	providers: InferenceProvider[];
}

interface ProviderResponse {
	provider: InferenceProvider;
}

interface ValidateResponse {
	valid: boolean;
	error?: string;
}

export async function fetchProviders(): Promise<InferenceProvider[]> {
	const response = await requestJson<ProvidersResponse>(
		"/api/admin/providers",
		undefined,
		"Failed to load providers",
	);
	return response.providers;
}

export async function createProvider(data: {
	name: string;
	displayName: string;
	baseUrl: string;
	apiKey: string;
	modelName: string;
	reasoningEffort?: "low" | "medium" | "high" | null;
	thinkingType?: "enabled" | "disabled" | null;
	enabled?: boolean;
	sortOrder?: number;
	maxModelContext?: number | null;
	compactionUiThreshold?: number | null;
	targetConstructedContext?: number | null;
	maxMessageLength?: number | null;
}): Promise<InferenceProvider> {
	const response = await requestJson<ProviderResponse>(
		"/api/admin/providers",
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		},
		"Failed to create provider",
	);
	return response.provider;
}

export async function updateProvider(
	id: string,
	data: {
		displayName?: string;
		baseUrl?: string;
		apiKey?: string;
		modelName?: string;
		reasoningEffort?: "low" | "medium" | "high" | null;
		thinkingType?: "enabled" | "disabled" | null;
		enabled?: boolean;
		sortOrder?: number;
		maxModelContext?: number | null;
		compactionUiThreshold?: number | null;
		targetConstructedContext?: number | null;
		maxMessageLength?: number | null;
	},
): Promise<InferenceProvider> {
	const response = await requestJson<ProviderResponse>(
		`/api/admin/providers/${id}`,
		{
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(data),
		},
		"Failed to update provider",
	);
	return response.provider;
}

export async function deleteProvider(id: string): Promise<void> {
	await requestVoid(
		`/api/admin/providers/${id}`,
		{ method: "DELETE" },
		"Failed to delete provider",
	);
}

export async function validateProvider(id: string): Promise<ValidateResponse> {
	return requestJson<ValidateResponse>(
		`/api/admin/providers/${id}/validate`,
		{ method: "POST" },
		"Failed to validate provider",
	);
}
