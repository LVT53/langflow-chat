<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { AVATAR_COLORS, AVATAR_COUNT } from '$lib/utils/avatar';
	import AvatarCircle from '$lib/components/ui/AvatarCircle.svelte';
	import { setThemeAndSync } from '$lib/stores/theme';
	import { setSelectedModelAndSync, setTranslationAndSync } from '$lib/stores/settings';
	import type { PageData } from './$types';

	export let data: PageData;

	// --- Tabs ---
	type Tab = 'profile' | 'analytics' | 'administration';
	let activeTab: Tab = 'profile';
	const isAdmin = data.userSettings.role === 'admin';

	// --- Profile state ---
	let name = data.userSettings.name ?? '';
	let email = data.userSettings.email;
	let profileSaving = false;
	let profileMessage = '';
	let profileError = '';

	// --- Password state ---
	let currentPassword = '';
	let newPassword = '';
	let confirmPassword = '';
	let passwordSaving = false;
	let passwordMessage = '';
	let passwordError = '';

	// --- Preferences state ---
	let selectedModel = data.userSettings.preferences.preferredModel;
	let translationEnabled = data.userSettings.preferences.translationEnabled;
	let selectedTheme = data.userSettings.preferences.theme;
	let selectedAvatar = data.userSettings.preferences.avatarId;

	// Model display names
	const modelNames = (data as any).modelNames ?? { model1: 'Model 1', model2: 'Model 2' };
	const adminModelNames = isAdmin ? ((data as any).modelNames ?? modelNames) : modelNames;

	// --- Delete account modal ---
	let showDeleteModal = false;
	let deletePassword = '';
	let deleteError = '';
	let deleteLoading = false;

	// --- Admin config state ---
	let adminConfig: Record<string, string> = {};
	let adminSaving = false;
	let adminMessage = '';
	let adminError = '';

	if (isAdmin && (data as any).currentConfigValues) {
		adminConfig = { ...(data as any).currentConfigValues };
	}

	// --- Analytics state ---
	let analyticsData: any = null;
	let analyticsLoading = false;
	let analyticsError = '';

	// --- Helpers ---
	async function saveProfile() {
		profileSaving = true;
		profileMessage = '';
		profileError = '';
		try {
			const res = await fetch('/api/settings/profile', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: name.trim() || null, email }),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error ?? 'Save failed');
			profileMessage = 'Profile updated.';
		} catch (e: any) {
			profileError = e.message;
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
			const res = await fetch('/api/settings/password', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ currentPassword, newPassword }),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error ?? 'Save failed');
			passwordMessage = 'Password changed.';
			currentPassword = '';
			newPassword = '';
			confirmPassword = '';
		} catch (e: any) {
			passwordError = e.message;
		} finally {
			passwordSaving = false;
		}
	}

	async function selectAvatar(id: number) {
		selectedAvatar = id;
		await fetch('/api/settings/preferences', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ avatarId: id }),
		}).catch(() => {});
	}

	async function changeModel(model: 'model1' | 'model2') {
		selectedModel = model;
		await setSelectedModelAndSync(model);
	}

	async function changeTranslation(enabled: boolean) {
		translationEnabled = enabled;
		await setTranslationAndSync(enabled);
	}

	async function changeTheme(t: 'system' | 'light' | 'dark') {
		selectedTheme = t;
		await setThemeAndSync(t);
	}

	async function confirmDeleteAccount() {
		deleteError = '';
		deleteLoading = true;
		try {
			const res = await fetch('/api/settings/account', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password: deletePassword }),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error ?? 'Delete failed');
			goto('/login');
		} catch (e: any) {
			deleteError = e.message;
		} finally {
			deleteLoading = false;
		}
	}

	async function saveAdminConfig() {
		adminSaving = true;
		adminMessage = '';
		adminError = '';
		try {
			const res = await fetch('/api/admin/config', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(adminConfig),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error ?? 'Save failed');
			adminMessage = 'Configuration saved.';
		} catch (e: any) {
			adminError = e.message;
		} finally {
			adminSaving = false;
		}
	}

	async function loadAnalytics() {
		analyticsLoading = true;
		analyticsError = '';
		try {
			const res = await fetch('/api/analytics');
			if (!res.ok) throw new Error('Failed to load analytics');
			analyticsData = await res.json();
		} catch (e: any) {
			analyticsError = e.message;
		} finally {
			analyticsLoading = false;
		}
	}

	function handleTabChange(tab: Tab) {
		activeTab = tab;
		if (tab === 'analytics' && !analyticsData && !analyticsLoading) {
			loadAnalytics();
		}
	}

	function formatMs(ms: number): string {
		if (!ms) return '—';
		return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
	}

	function formatNum(n: number): string {
		if (!n) return '0';
		return n.toLocaleString();
	}

	// Admin config field labels
	const CONFIG_LABELS: Record<string, string> = {
		MAX_MESSAGE_LENGTH: 'Max Message Length',
		MODEL_1_BASEURL: 'Model 1 Base URL',
		MODEL_1_NAME: 'Model 1 Name',
		MODEL_1_DISPLAY_NAME: 'Model 1 Display Name',
		MODEL_1_SYSTEM_PROMPT: 'Model 1 System Prompt',
		MODEL_1_FLOW_ID: 'Model 1 Flow ID',
		MODEL_2_BASEURL: 'Model 2 Base URL',
		MODEL_2_NAME: 'Model 2 Name',
		MODEL_2_DISPLAY_NAME: 'Model 2 Display Name',
		MODEL_2_SYSTEM_PROMPT: 'Model 2 System Prompt',
		MODEL_2_FLOW_ID: 'Model 2 Flow ID',
		TITLE_GEN_URL: 'Title Generator URL',
		TITLE_GEN_MODEL: 'Title Generator Model',
		TRANSLATOR_URL: 'Translator URL',
		TRANSLATOR_MODEL: 'Translator Model',
		TRANSLATION_MAX_TOKENS: 'Translation Max Tokens',
		TRANSLATION_TEMPERATURE: 'Translation Temperature',
	};

	const TEXTAREA_KEYS = new Set(['MODEL_1_SYSTEM_PROMPT', 'MODEL_2_SYSTEM_PROMPT']);
	const NUMBER_KEYS = new Set(['MAX_MESSAGE_LENGTH', 'TRANSLATION_MAX_TOKENS', 'TRANSLATION_TEMPERATURE']);
</script>

<div class="h-full overflow-y-auto">
	<div class="mx-auto max-w-2xl px-4 py-8">

		<!-- Page header -->
		<h1 class="mb-6 text-2xl font-semibold text-text-primary">Settings</h1>

		<!-- Tab bar -->
		<div class="mb-6 flex gap-1 rounded-lg border border-border bg-surface-overlay p-1">
			<button
				class="tab-btn flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150"
				class:tab-active={activeTab === 'profile'}
				on:click={() => handleTabChange('profile')}
			>
				Profile
			</button>
			<button
				class="tab-btn flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150"
				class:tab-active={activeTab === 'analytics'}
				on:click={() => handleTabChange('analytics')}
			>
				Analytics
			</button>
			{#if isAdmin}
				<button
					class="tab-btn flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors duration-150"
					class:tab-active={activeTab === 'administration'}
					on:click={() => handleTabChange('administration')}
				>
					Administration
				</button>
			{/if}
		</div>

		<!-- ===================== PROFILE TAB ===================== -->
		{#if activeTab === 'profile'}
			<!-- Avatar picker -->
			<section class="settings-card mb-4">
				<h2 class="settings-section-title">Avatar</h2>
				<div class="flex flex-wrap gap-3">
					{#each Array.from({ length: AVATAR_COUNT }, (_, i) => i) as avatarIndex}
						<button
							class="avatar-swatch rounded-full focus:outline-none"
							class:avatar-selected={selectedAvatar === avatarIndex}
							style="background: {AVATAR_COLORS[avatarIndex]}; width: 44px; height: 44px;"
							on:click={() => selectAvatar(avatarIndex)}
							aria-label="Avatar {avatarIndex + 1}"
							title="Avatar {avatarIndex + 1}"
						>
							<span class="block text-lg font-semibold text-white leading-none text-center">
								{data.userSettings.name ? data.userSettings.name[0].toUpperCase() : (data.userSettings.email[0] ?? '?').toUpperCase()}
							</span>
						</button>
					{/each}
				</div>
				<p class="mt-3 text-xs text-text-muted">Profile pictures will be available in a future update.</p>
			</section>

			<!-- Profile info -->
			<section class="settings-card mb-4">
				<h2 class="settings-section-title">Profile Information</h2>
				<div class="flex flex-col gap-3">
					<div>
						<label class="settings-label" for="name">Display Name</label>
						<input
							id="name"
							type="text"
							class="settings-input"
							bind:value={name}
							placeholder="Your name"
						/>
					</div>
					<div>
						<label class="settings-label" for="email">Email Address</label>
						<input
							id="email"
							type="email"
							class="settings-input"
							bind:value={email}
							placeholder="email@example.com"
						/>
					</div>
					{#if profileMessage}
						<p class="text-sm text-[color:var(--status-success)]">{profileMessage}</p>
					{/if}
					{#if profileError}
						<p class="text-sm text-danger">{profileError}</p>
					{/if}
					<button
						class="btn-primary self-start"
						on:click={saveProfile}
						disabled={profileSaving}
					>
						{profileSaving ? 'Saving…' : 'Save'}
					</button>
				</div>
			</section>

			<!-- Password -->
			<section class="settings-card mb-4">
				<h2 class="settings-section-title">Change Password</h2>
				<div class="flex flex-col gap-3">
					<div>
						<label class="settings-label" for="current-pw">Current Password</label>
						<input id="current-pw" type="password" class="settings-input" bind:value={currentPassword} autocomplete="current-password" />
					</div>
					<div>
						<label class="settings-label" for="new-pw">New Password</label>
						<input id="new-pw" type="password" class="settings-input" bind:value={newPassword} autocomplete="new-password" />
					</div>
					<div>
						<label class="settings-label" for="confirm-pw">Confirm New Password</label>
						<input id="confirm-pw" type="password" class="settings-input" bind:value={confirmPassword} autocomplete="new-password" />
					</div>
					{#if passwordMessage}
						<p class="text-sm text-[color:var(--status-success)]">{passwordMessage}</p>
					{/if}
					{#if passwordError}
						<p class="text-sm text-danger">{passwordError}</p>
					{/if}
					<button
						class="btn-primary self-start"
						on:click={savePassword}
						disabled={passwordSaving}
					>
						{passwordSaving ? 'Saving…' : 'Change Password'}
					</button>
				</div>
			</section>

			<!-- Preferences -->
			<section class="settings-card mb-4">
				<h2 class="settings-section-title">Preferences</h2>
				<div class="flex flex-col gap-5">
					<!-- Default model -->
					<div>
						<p class="settings-label">Default Model</p>
						<div class="flex gap-2">
							<button
								class="pref-pill"
								class:pref-pill-active={selectedModel === 'model1'}
								on:click={() => changeModel('model1')}
							>
								{modelNames.model1}
							</button>
							<button
								class="pref-pill"
								class:pref-pill-active={selectedModel === 'model2'}
								on:click={() => changeModel('model2')}
							>
								{modelNames.model2}
							</button>
						</div>
					</div>

					<!-- Translation -->
					<div class="flex items-center justify-between">
						<div>
							<p class="settings-label mb-0">Translation</p>
							<p class="text-xs text-text-muted mt-0.5">Auto-translate Hungarian ↔ English</p>
						</div>
						<button
							class="toggle-btn"
							class:toggle-on={translationEnabled}
							on:click={() => changeTranslation(!translationEnabled)}
							aria-label="Toggle translation"
							role="switch"
							aria-checked={translationEnabled}
						>
							<span class="toggle-thumb"></span>
						</button>
					</div>

					<!-- Theme -->
					<div>
						<p class="settings-label">Theme</p>
						<div class="flex gap-2">
							{#each ['system', 'light', 'dark'] as t}
								<button
									class="pref-pill"
									class:pref-pill-active={selectedTheme === t}
									on:click={() => changeTheme(t as 'system' | 'light' | 'dark')}
								>
									{t.charAt(0).toUpperCase() + t.slice(1)}
								</button>
							{/each}
						</div>
					</div>
				</div>
			</section>

			<!-- Danger Zone -->
			<section class="settings-card settings-card-danger mb-4">
				<h2 class="settings-section-title text-danger">Danger Zone</h2>
				<p class="mb-4 text-sm text-text-secondary">
					Permanently delete your account and all data including chat history. This cannot be undone.
				</p>
				<button class="btn-danger" on:click={() => (showDeleteModal = true)}>
					Delete Account
				</button>
			</section>
		{/if}

		<!-- ===================== ANALYTICS TAB ===================== -->
		{#if activeTab === 'analytics'}
			{#if analyticsLoading}
				<div class="flex items-center justify-center py-16 text-text-muted">Loading analytics…</div>
			{:else if analyticsError}
				<div class="settings-card">
					<p class="text-danger text-sm">{analyticsError}</p>
					<button class="btn-secondary mt-3" on:click={loadAnalytics}>Retry</button>
				</div>
			{:else if analyticsData}
				<!-- Personal stats -->
				<section class="settings-card mb-4">
					<h2 class="settings-section-title">Your Activity</h2>
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
						<div class="stat-card">
							<div class="stat-value">{formatNum(analyticsData.personal.totalMessages)}</div>
							<div class="stat-label">Messages sent</div>
						</div>
						<div class="stat-card">
							<div class="stat-value">{formatMs(analyticsData.personal.avgGenerationMs)}</div>
							<div class="stat-label">Avg response time</div>
						</div>
						<div class="stat-card">
							<div class="stat-value">{formatNum(analyticsData.personal.totalTokens)}</div>
							<div class="stat-label">Tokens used</div>
						</div>
						<div class="stat-card">
							<div class="stat-value">{formatNum(analyticsData.personal.reasoningTokens)}</div>
							<div class="stat-label">Reasoning tokens</div>
						</div>
						<div class="stat-card">
							<div class="stat-value">{analyticsData.personal.favoriteModel ?? '—'}</div>
							<div class="stat-label">Favorite model</div>
						</div>
						<div class="stat-card">
							<div class="stat-value">{formatNum(analyticsData.personal.chatCount)}</div>
							<div class="stat-label">Conversations</div>
						</div>
					</div>

					{#if analyticsData.personal.byModel?.length > 0}
						<div class="mt-4">
							<p class="settings-label mb-2">Model usage</p>
							<div class="flex flex-col gap-1.5">
								{#each analyticsData.personal.byModel as row}
									{@const total = analyticsData.personal.totalMessages || 1}
									{@const pct = Math.round((Number(row.msgCount) / total) * 100)}
									<div class="flex items-center gap-2">
										<div class="w-20 shrink-0 text-xs text-text-muted">{row.model}</div>
										<div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-elevated">
											<div class="h-2 rounded-full bg-accent transition-all" style="width: {pct}%"></div>
										</div>
										<div class="w-10 shrink-0 text-right text-xs text-text-muted">{pct}%</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				</section>

				<!-- Admin: system-wide stats -->
				{#if isAdmin && analyticsData.system}
					<section class="settings-card mb-4">
						<h2 class="settings-section-title">System Overview</h2>
						<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
							<div class="stat-card">
								<div class="stat-value">{formatNum(analyticsData.system.totalMessages)}</div>
								<div class="stat-label">Total messages</div>
							</div>
							<div class="stat-card">
								<div class="stat-value">{formatNum(analyticsData.system.totalUsers)}</div>
								<div class="stat-label">Total users</div>
							</div>
							<div class="stat-card">
								<div class="stat-value">{formatMs(analyticsData.system.avgGenerationMs)}</div>
								<div class="stat-label">Avg response time</div>
							</div>
							<div class="stat-card">
								<div class="stat-value">{formatNum(analyticsData.system.totalTokens)}</div>
								<div class="stat-label">Total tokens</div>
							</div>
							<div class="stat-card">
								<div class="stat-value">{formatNum(analyticsData.system.reasoningTokens)}</div>
								<div class="stat-label">Reasoning tokens</div>
							</div>
						</div>

						{#if analyticsData.system.byModel?.length > 0}
							<div class="mt-4">
								<p class="settings-label mb-2">Model usage (system)</p>
								<div class="flex flex-col gap-1.5">
									{#each analyticsData.system.byModel as row}
										{@const total = analyticsData.system.totalMessages || 1}
										{@const pct = Math.round((Number(row.msgCount) / total) * 100)}
										<div class="flex items-center gap-2">
											<div class="w-20 shrink-0 text-xs text-text-muted">{row.model}</div>
											<div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-elevated">
												<div class="h-2 rounded-full bg-accent transition-all" style="width: {pct}%"></div>
											</div>
											<div class="w-10 shrink-0 text-right text-xs text-text-muted">{pct}%</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</section>

					<!-- Per-user table -->
					{#if analyticsData.perUser?.length > 0}
						<section class="settings-card mb-4 overflow-x-auto">
							<h2 class="settings-section-title">Per-User Breakdown</h2>
							<table class="analytics-table w-full text-sm">
								<thead>
									<tr class="border-b border-border text-left text-xs text-text-muted">
										<th class="pb-2 pr-3 font-medium">User</th>
										<th class="pb-2 pr-3 font-medium">Msgs</th>
										<th class="pb-2 pr-3 font-medium">Avg Time</th>
										<th class="pb-2 pr-3 font-medium">Tokens</th>
										<th class="pb-2 pr-3 font-medium">Reasoning</th>
										<th class="pb-2 pr-3 font-medium">Model</th>
										<th class="pb-2 font-medium">Chats</th>
									</tr>
								</thead>
								<tbody>
									{#each analyticsData.perUser as row}
										<tr class="border-b border-border last:border-0">
											<td class="py-2 pr-3">
												<div class="font-medium text-text-primary">{row.displayName}</div>
												<div class="text-xs text-text-muted">{row.email}</div>
											</td>
											<td class="py-2 pr-3 text-text-secondary">{formatNum(row.messageCount)}</td>
											<td class="py-2 pr-3 text-text-secondary">{formatMs(row.avgGenerationMs)}</td>
											<td class="py-2 pr-3 text-text-secondary">{formatNum(row.totalTokens)}</td>
											<td class="py-2 pr-3 text-text-secondary">{formatNum(row.reasoningTokens)}</td>
											<td class="py-2 pr-3 text-text-secondary">{row.favoriteModel ?? '—'}</td>
											<td class="py-2 text-text-secondary">{formatNum(row.conversationCount)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</section>
					{/if}
				{/if}
			{:else}
				<div class="settings-card text-center text-text-muted text-sm py-8">No analytics data yet.</div>
			{/if}
		{/if}

		<!-- ===================== ADMINISTRATION TAB ===================== -->
		{#if activeTab === 'administration' && isAdmin}
			<section class="settings-card mb-4">
				<h2 class="settings-section-title">Model 1</h2>
				<div class="flex flex-col gap-3">
					{#each ['MODEL_1_BASEURL', 'MODEL_1_NAME', 'MODEL_1_DISPLAY_NAME', 'MODEL_1_FLOW_ID'] as key}
						<div>
							<label class="settings-label" for={key}>{CONFIG_LABELS[key]}</label>
							<input id={key} type="text" class="settings-input" bind:value={adminConfig[key]} placeholder={(data as any).envDefaults?.[key] ?? ''} />
						</div>
					{/each}
					<div>
						<label class="settings-label" for="MODEL_1_SYSTEM_PROMPT">{CONFIG_LABELS['MODEL_1_SYSTEM_PROMPT']}</label>
						<textarea id="MODEL_1_SYSTEM_PROMPT" class="settings-input min-h-[120px]" bind:value={adminConfig['MODEL_1_SYSTEM_PROMPT']} rows="5"></textarea>
						<p class="mt-1 text-xs text-text-muted">Full prompt text. Leave empty to use env default.</p>
					</div>
				</div>
			</section>

			<section class="settings-card mb-4">
				<h2 class="settings-section-title">Model 2</h2>
				<div class="flex flex-col gap-3">
					{#each ['MODEL_2_BASEURL', 'MODEL_2_NAME', 'MODEL_2_DISPLAY_NAME', 'MODEL_2_FLOW_ID'] as key}
						<div>
							<label class="settings-label" for={key}>{CONFIG_LABELS[key]}</label>
							<input id={key} type="text" class="settings-input" bind:value={adminConfig[key]} placeholder={(data as any).envDefaults?.[key] ?? ''} />
						</div>
					{/each}
					<div>
						<label class="settings-label" for="MODEL_2_SYSTEM_PROMPT">{CONFIG_LABELS['MODEL_2_SYSTEM_PROMPT']}</label>
						<textarea id="MODEL_2_SYSTEM_PROMPT" class="settings-input min-h-[120px]" bind:value={adminConfig['MODEL_2_SYSTEM_PROMPT']} rows="5"></textarea>
						<p class="mt-1 text-xs text-text-muted">Full prompt text. Leave empty to use env default.</p>
					</div>
				</div>
			</section>

			<section class="settings-card mb-4">
				<h2 class="settings-section-title">Title Generator</h2>
				<div class="flex flex-col gap-3">
					{#each ['TITLE_GEN_URL', 'TITLE_GEN_MODEL'] as key}
						<div>
							<label class="settings-label" for={key}>{CONFIG_LABELS[key]}</label>
							<input id={key} type="text" class="settings-input" bind:value={adminConfig[key]} placeholder={(data as any).envDefaults?.[key] ?? ''} />
						</div>
					{/each}
				</div>
			</section>

			<section class="settings-card mb-4">
				<h2 class="settings-section-title">Translator</h2>
				<div class="flex flex-col gap-3">
					{#each ['TRANSLATOR_URL', 'TRANSLATOR_MODEL', 'TRANSLATION_MAX_TOKENS', 'TRANSLATION_TEMPERATURE'] as key}
						<div>
							<label class="settings-label" for={key}>{CONFIG_LABELS[key]}</label>
							<input
								id={key}
								type={NUMBER_KEYS.has(key) ? 'number' : 'text'}
								class="settings-input"
								bind:value={adminConfig[key]}
								placeholder={(data as any).envDefaults?.[key] ?? ''}
								step={key === 'TRANSLATION_TEMPERATURE' ? '0.01' : undefined}
							/>
						</div>
					{/each}
				</div>
			</section>

			<section class="settings-card mb-4">
				<h2 class="settings-section-title">General</h2>
				<div>
					<label class="settings-label" for="MAX_MESSAGE_LENGTH">{CONFIG_LABELS['MAX_MESSAGE_LENGTH']}</label>
					<input id="MAX_MESSAGE_LENGTH" type="number" class="settings-input" bind:value={adminConfig['MAX_MESSAGE_LENGTH']} placeholder={(data as any).envDefaults?.['MAX_MESSAGE_LENGTH'] ?? ''} />
				</div>
			</section>

			{#if adminMessage}
				<p class="mb-3 text-sm text-[color:var(--status-success)]">{adminMessage}</p>
			{/if}
			{#if adminError}
				<p class="mb-3 text-sm text-danger">{adminError}</p>
			{/if}
			<button class="btn-primary w-full mb-8" on:click={saveAdminConfig} disabled={adminSaving}>
				{adminSaving ? 'Saving…' : 'Save Configuration'}
			</button>
		{/if}

	</div>
</div>

<!-- Delete account modal -->
{#if showDeleteModal}
	<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 z-[9999] flex items-center justify-center bg-surface-overlay/60 backdrop-blur-sm"
		on:click|self={() => { showDeleteModal = false; deletePassword = ''; deleteError = ''; }}
	>
		<div class="mx-4 w-full max-w-sm rounded-xl border border-border bg-surface-page p-6 shadow-lg">
			<h3 class="mb-2 text-lg font-semibold text-text-primary">Delete Account</h3>
			<p class="mb-4 text-sm text-text-secondary">
				This will permanently delete your account, all chats, and all data. This cannot be undone.
			</p>
			<p class="mb-3 text-sm font-medium text-text-primary">Enter your password to confirm:</p>
			<input
				type="password"
				class="settings-input mb-4"
				bind:value={deletePassword}
				placeholder="Your password"
				autocomplete="current-password"
			/>
			{#if deleteError}
				<p class="mb-3 text-sm text-danger">{deleteError}</p>
			{/if}
			<div class="flex gap-2">
				<button
					class="btn-danger flex-1"
					on:click={confirmDeleteAccount}
					disabled={deleteLoading || !deletePassword}
				>
					{deleteLoading ? 'Deleting…' : 'Delete permanently'}
				</button>
				<button
					class="btn-secondary"
					on:click={() => { showDeleteModal = false; deletePassword = ''; deleteError = ''; }}
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.settings-card {
		background: var(--surface-overlay);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-lg);
		padding: var(--space-lg);
	}

	.settings-card-danger {
		border-color: var(--status-danger);
	}

	.settings-section-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: var(--space-md);
	}

	.settings-label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--text-secondary);
		margin-bottom: 0.25rem;
	}

	.settings-input {
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

	.settings-input:focus {
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

	.pref-pill {
		padding: 0.375rem 0.875rem;
		border-radius: var(--radius-full);
		border: 1px solid var(--border-default);
		font-size: 0.8125rem;
		color: var(--text-secondary);
		background: var(--surface-page);
		cursor: pointer;
		transition: all var(--duration-standard);
	}

	.pref-pill:hover {
		border-color: var(--accent);
		color: var(--text-primary);
	}

	.pref-pill-active {
		border-color: var(--accent);
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 10%, var(--surface-page) 90%);
		font-weight: 500;
	}

	/* Toggle switch */
	.toggle-btn {
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

	.toggle-btn.toggle-on {
		background: var(--accent);
	}

	.toggle-thumb {
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

	.toggle-on .toggle-thumb {
		transform: translateX(20px);
	}

	/* Avatar swatch */
	.avatar-swatch {
		border: 2px solid transparent;
		cursor: pointer;
		transition: all var(--duration-standard);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.avatar-swatch:hover {
		transform: scale(1.08);
	}

	.avatar-selected {
		border-color: var(--accent);
		box-shadow: 0 0 0 2px var(--surface-page), 0 0 0 4px var(--accent);
	}

	/* Stat cards */
	.stat-card {
		background: var(--surface-page);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
		padding: 0.75rem;
	}

	.stat-value {
		font-size: 1.25rem;
		font-weight: 600;
		color: var(--text-primary);
		line-height: 1.2;
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-top: 0.25rem;
	}

	.analytics-table th,
	.analytics-table td {
		vertical-align: middle;
	}
</style>
