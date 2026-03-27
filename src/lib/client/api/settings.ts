import type { ModelId } from '$lib/types';
import { requestJson } from './http';

export interface HonchoHealth {
	enabled: boolean;
	connected: boolean;
	workspace: string | null;
}

interface AnalyticsByModelRow {
	model: string;
	msgCount: number;
}

interface PersonalAnalytics {
	byModel: AnalyticsByModelRow[];
	totalMessages: number;
	avgGenerationMs: number;
	totalTokens: number;
	reasoningTokens: number;
	favoriteModel: string | null;
	chatCount: number;
}

interface SystemAnalytics {
	totalMessages: number;
	avgGenerationMs: number;
	totalTokens: number;
	reasoningTokens: number;
	totalUsers: number;
	totalConversations: number;
	byModel: AnalyticsByModelRow[];
}

interface PerUserAnalytics {
	userId: string;
	displayName: string;
	email: string;
	messageCount: number;
	avgGenerationMs: number;
	totalTokens: number;
	reasoningTokens: number;
	favoriteModel: string | null;
	conversationCount: number;
}

export interface AnalyticsResponse {
	personal: PersonalAnalytics;
	system?: SystemAnalytics;
	perUser?: PerUserAnalytics[];
}

interface ProfileUpdateParams {
	name: string | null;
	email: string;
}

interface PasswordUpdateParams {
	currentPassword: string;
	newPassword: string;
}

export async function updateUserPreferences(params: {
	preferredModel?: ModelId;
	translationEnabled?: boolean;
	theme?: 'system' | 'light' | 'dark';
	avatarId?: number | null;
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

export async function fetchHonchoHealth(): Promise<HonchoHealth> {
	return requestJson<HonchoHealth>(
		'/api/admin/honcho',
		undefined,
		'Failed to load Honcho health'
	);
}

export async function fetchAnalytics(useMockData = false): Promise<AnalyticsResponse> {
	const endpoint = useMockData ? '/api/analytics?mock=1' : '/api/analytics';
	return requestJson<AnalyticsResponse>(endpoint, undefined, 'Failed to load analytics');
}

export async function deleteAvatar(): Promise<void> {
	await requestJson<{ success?: boolean }>(
		'/api/settings/avatar',
		{
			method: 'DELETE',
		},
		'Failed to remove photo'
	);
}

export async function uploadAvatar(image: Blob): Promise<void> {
	const formData = new FormData();
	formData.append('image', image, 'avatar.webp');

	await requestJson<{ success?: boolean }>(
		'/api/settings/avatar',
		{
			method: 'POST',
			body: formData,
		},
		'Upload failed'
	);
}

export async function updateProfile(params: ProfileUpdateParams): Promise<void> {
	await requestJson<{ name: string | null; email: string }>(
		'/api/settings/profile',
		{
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(params),
		},
		'Failed to update profile'
	);
}

export async function updatePassword(params: PasswordUpdateParams): Promise<void> {
	await requestJson<{ success?: boolean }>(
		'/api/settings/password',
		{
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(params),
		},
		'Failed to change password'
	);
}

export async function deleteAccount(password: string): Promise<void> {
	await requestJson<{ success?: boolean }>(
		'/api/settings/account',
		{
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password }),
		},
		'Failed to delete account'
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
