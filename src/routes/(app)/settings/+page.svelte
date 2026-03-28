<script lang="ts">
	import { goto } from '$app/navigation';
	import ProfilePictureEditor from '$lib/components/ui/ProfilePictureEditor.svelte';
	import {
		deleteAccount,
		deleteAvatar,
		fetchAnalytics,
		fetchHonchoHealth,
		updateAdminConfig,
		updatePassword,
		updateProfile,
		updateUserPreferences,
	} from '$lib/client/api/settings';
	import { avatarState, setAvatarRemoved, setAvatarUploaded } from '$lib/stores/avatar';
	import { setSelectedModelAndSync, setTranslationAndSync } from '$lib/stores/settings';
	import { setThemeAndSync } from '$lib/stores/theme';
	import { AVATAR_COLORS, AVATAR_COUNT } from '$lib/utils/avatar';
	import DeleteAccountModal from './_components/DeleteAccountModal.svelte';
	import SettingsAdministrationTab from './_components/SettingsAdministrationTab.svelte';
	import SettingsAnalyticsTab from './_components/SettingsAnalyticsTab.svelte';
	import SettingsProfileTab from './_components/SettingsProfileTab.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const getData = () => data;

	type Tab = 'profile' | 'analytics' | 'administration';

	const initialUserSettings = getData().userSettings;
	const initialPreferences = initialUserSettings.preferences;
	const initialCurrentConfigValues = (getData() as any).currentConfigValues as
		| Record<string, string>
		| undefined;
	const isAdmin = initialUserSettings.role === 'admin';
	const modelNames = (getData() as any).modelNames ?? { model1: 'Model 1', model2: 'Model 2' };
	const availableModels = ((getData() as any).availableModels ?? [
		{ id: 'model1', displayName: modelNames.model1 },
		{ id: 'model2', displayName: modelNames.model2 },
	]) as Array<{ id: 'model1' | 'model2'; displayName: string }>;

	let activeTab = $state<Tab>('profile');

	let name = $state(initialUserSettings.name ?? '');
	let email = $state(initialUserSettings.email);
	let profileSaving = $state(false);
	let profileMessage = $state('');
	let profileError = $state('');

	let currentPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let passwordSaving = $state(false);
	let passwordMessage = $state('');
	let passwordError = $state('');
	let showCurrentPw = $state(false);
	let showNewPw = $state(false);
	let showConfirmPw = $state(false);

	let selectedModel = $state(initialPreferences.preferredModel);
	let translationEnabled = $state(initialPreferences.translationEnabled);
	let selectedTheme = $state(initialPreferences.theme);
	let selectedAvatar = $state(initialPreferences.avatarId);

	let showDeleteModal = $state(false);
	let deletePassword = $state('');
	let deleteError = $state('');
	let deleteLoading = $state(false);
	let showDeletePw = $state(false);

	let adminConfig = $state<Record<string, string>>(
		initialCurrentConfigValues ? { ...initialCurrentConfigValues } : {}
	);
	let adminSaving = $state(false);
	let adminMessage = $state('');
	let adminError = $state('');

	let honchoHealth = $state<{
		enabled: boolean;
		connected: boolean;
		workspace: string | null;
	} | null>(null);
	let honchoLoading = $state(false);

	let analyticsData = $state<any>(null);
	let analyticsLoading = $state(false);
	let analyticsError = $state('');

	let showAvatarPicker = $state(false);
	let showPictureEditor = $state(false);
	let removingPhoto = $state(false);

	async function checkHonchoHealth() {
		honchoLoading = true;
		try {
			honchoHealth = await fetchHonchoHealth();
		} catch {
			honchoHealth = { enabled: false, connected: false, workspace: null };
		} finally {
			honchoLoading = false;
		}
	}

	async function removePhoto() {
		removingPhoto = true;
		try {
			await deleteAvatar();
			setAvatarRemoved();
		} catch {
			// Non-fatal
		} finally {
			removingPhoto = false;
		}
	}

	async function saveProfile() {
		profileSaving = true;
		profileMessage = '';
		profileError = '';
		try {
			await updateProfile({ name: name.trim() || null, email });
			profileMessage = 'Profile updated.';
		} catch (error: any) {
			profileError = error.message;
		} finally {
			profileSaving = false;
		}
	}

	async function savePassword() {
		passwordError = '';
		passwordMessage = '';
		if (newPassword !== confirmPassword) {
			passwordError = 'New passwords do not match.';
			return;
		}
		if (newPassword.length < 8) {
			passwordError = 'Password must be at least 8 characters.';
			return;
		}
		passwordSaving = true;
		try {
			await updatePassword({ currentPassword, newPassword });
			passwordMessage = 'Password changed.';
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
		} catch (error: any) {
			passwordError = error.message;
		} finally {
			passwordSaving = false;
		}
	}

	async function selectAvatar(avatarId: number) {
		selectedAvatar = avatarId;
		await updateUserPreferences({ avatarId }).catch(() => {});
	}

	async function changeModel(model: 'model1' | 'model2') {
		selectedModel = model;
		await setSelectedModelAndSync(model);
	}

	async function changeTranslation(enabled: boolean) {
		translationEnabled = enabled;
		await setTranslationAndSync(enabled);
	}

	async function changeTheme(theme: 'system' | 'light' | 'dark') {
		selectedTheme = theme;
		await setThemeAndSync(theme);
	}

	function closeDeleteModal() {
		showDeleteModal = false;
		deletePassword = '';
		deleteError = '';
		showDeletePw = false;
	}

	async function confirmDeleteAccount() {
		deleteError = '';
		deleteLoading = true;
		try {
			await deleteAccount(deletePassword);
			goto('/login');
		} catch (error: any) {
			deleteError = error.message;
		} finally {
			deleteLoading = false;
		}
	}

	async function saveAdminConfig() {
		adminSaving = true;
		adminMessage = '';
		adminError = '';
		try {
			await updateAdminConfig(adminConfig);
			adminMessage = 'Configuration saved.';
		} catch (error: any) {
			adminError = error.message;
		} finally {
			adminSaving = false;
		}
	}

	async function loadAnalytics() {
		analyticsLoading = true;
		analyticsError = '';
		try {
			analyticsData = await fetchAnalytics(import.meta.env.DEV);
		} catch (error: any) {
			analyticsError = error.message;
		} finally {
			analyticsLoading = false;
		}
	}

	async function handleTabChange(tab: Tab) {
		activeTab = tab;
		if (tab === 'analytics' && !analyticsData && !analyticsLoading) {
			await loadAnalytics();
		}
	}
</script>

<div class="flex h-full w-full flex-1 flex-col overflow-y-auto">
	<div class="mx-auto w-full max-w-[672px] px-4 py-8">
		<h1 class="mb-6 text-2xl font-semibold text-text-primary">Settings</h1>

		<div class="mb-6 flex gap-1 rounded-lg border border-border bg-surface-overlay p-1">
			<button
				class="tab-btn flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150"
				class:tab-active={activeTab === 'profile'}
				onclick={() => handleTabChange('profile')}
			>
				Profile
			</button>
			<button
				class="tab-btn flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150"
				class:tab-active={activeTab === 'analytics'}
				onclick={() => handleTabChange('analytics')}
			>
				Analytics
			</button>
			{#if isAdmin}
				<button
					class="tab-btn flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150"
					class:tab-active={activeTab === 'administration'}
					onclick={() => handleTabChange('administration')}
				>
					Administration
				</button>
			{/if}
		</div>

		{#if activeTab === 'profile'}
			<SettingsProfileTab
				userId={data.userSettings.id}
				userDisplayName={data.userSettings.name ?? data.userSettings.email}
				userEmail={data.userSettings.email}
				profilePicture={$avatarState.profilePicture}
				cacheBuster={$avatarState.cacheBuster}
				avatarColors={AVATAR_COLORS}
				avatarCount={AVATAR_COUNT}
				selectedAvatar={selectedAvatar}
				bind:showAvatarPicker
				{removingPhoto}
				onOpenPictureEditor={() => (showPictureEditor = true)}
				onRemovePhoto={removePhoto}
				onSelectAvatar={selectAvatar}
				bind:name
				bind:email
				{profileSaving}
				{profileMessage}
				{profileError}
				onSaveProfile={saveProfile}
				bind:currentPassword
				bind:newPassword
				bind:confirmPassword
				bind:showCurrentPw
				bind:showNewPw
				bind:showConfirmPw
				{passwordSaving}
				{passwordMessage}
				{passwordError}
				onSavePassword={savePassword}
				{availableModels}
				{selectedModel}
				{translationEnabled}
				{selectedTheme}
				onChangeModel={changeModel}
				onChangeTranslation={changeTranslation}
				onChangeTheme={changeTheme}
				onOpenDeleteModal={() => (showDeleteModal = true)}
			/>
		{/if}

		{#if activeTab === 'analytics'}
			<SettingsAnalyticsTab
				{analyticsData}
				{analyticsLoading}
				{analyticsError}
				{isAdmin}
				{modelNames}
				onRetry={loadAnalytics}
			/>
		{/if}

		{#if activeTab === 'administration' && isAdmin}
			<SettingsAdministrationTab
				currentUserId={data.userSettings.id}
				{modelNames}
				bind:adminConfig
				envDefaults={(data as any).envDefaults ?? {}}
				{adminSaving}
				{adminMessage}
				{adminError}
				{honchoHealth}
				{honchoLoading}
				onCheckHonchoHealth={checkHonchoHealth}
				onSaveAdminConfig={saveAdminConfig}
			/>
		{/if}
	</div>
</div>

{#if showPictureEditor}
	<ProfilePictureEditor
		onClose={() => (showPictureEditor = false)}
		onUploaded={() => {
			setAvatarUploaded(data.userSettings.id);
			showPictureEditor = false;
		}}
	/>
{/if}

{#if showDeleteModal}
	<DeleteAccountModal
		bind:deletePassword
		{deleteError}
		{deleteLoading}
		bind:showDeletePw
		onConfirm={confirmDeleteAccount}
		onCancel={closeDeleteModal}
	/>
{/if}

<style>
	:global(.settings-card) {
		background: var(--surface-overlay);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
	}

	:global(.settings-card-danger) {
		border-color: var(--danger);
	}

	:global(.settings-section-title) {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: var(--space-md);
	}

	:global(.settings-label) {
		display: block;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-secondary);
		margin-bottom: 0.25rem;
	}

	:global(.settings-input) {
		width: 100%;
		background: var(--surface-page);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		color: var(--text-primary);
		transition: border-color var(--duration-standard);
		resize: vertical;
	}

	:global(.settings-input:focus) {
		outline: none;
		border-color: var(--accent);
	}

	.tab-btn {
		color: var(--text-secondary);
		background: transparent;
		border: none;
		cursor: pointer;
	}

	.tab-btn:hover {
		color: var(--text-primary);
		background: var(--surface-elevated);
	}

	.tab-active {
		color: var(--text-primary) !important;
		background: var(--surface-page) !important;
		font-weight: 600;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
	}

	:global(.pref-pill) {
		padding: 0.375rem 0.875rem;
		border-radius: var(--radius-full);
		border: 1px solid var(--border-default);
		font-size: 0.8125rem;
		color: var(--text-secondary);
		background: var(--surface-page);
		cursor: pointer;
		transition: all var(--duration-standard);
	}

	:global(.pref-pill:hover) {
		border-color: var(--accent);
		color: var(--text-primary);
	}

	:global(.pref-pill-active) {
		border-color: var(--accent);
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 10%, var(--surface-page) 90%);
		font-weight: 500;
	}

	:global(.toggle-btn) {
		position: relative;
		width: 44px;
		height: 24px;
		background: var(--border-default);
		border-radius: 9999px;
		border: none;
		cursor: pointer;
		transition: background var(--duration-standard);
		flex-shrink: 0;
	}

	:global(.toggle-btn.toggle-on) {
		background: var(--accent);
	}

	:global(.toggle-thumb) {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 20px;
		height: 20px;
		background: white;
		border-radius: 9999px;
		transition: transform var(--duration-standard);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	:global(.toggle-on .toggle-thumb) {
		transform: translateX(20px);
	}

	:global(.avatar-swatch) {
		border: 2px solid transparent;
		cursor: pointer;
		transition: all var(--duration-standard);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	:global(.avatar-swatch:hover) {
		transform: scale(1.08);
	}

	:global(.avatar-selected) {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--surface-page), 0 0 0 4px var(--accent);
	}

	:global(.stat-card) {
		background: var(--surface-page);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		padding: 0.75rem;
	}

	:global(.stat-value) {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-primary);
		line-height: 1.2;
	}

	:global(.stat-label) {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-top: 0.25rem;
	}

	:global(.analytics-table th),
	:global(.analytics-table td) {
		vertical-align: middle;
	}
</style>
