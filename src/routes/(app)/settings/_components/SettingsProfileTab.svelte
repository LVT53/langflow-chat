<script lang="ts">
	import AvatarCircle from '$lib/components/ui/AvatarCircle.svelte';
	import PasswordField from './PasswordField.svelte';

	type AvailableModel = { id: 'model1' | 'model2'; displayName: string };
	type Theme = 'system' | 'light' | 'dark';

	let {
		userId,
		userDisplayName,
		userEmail,
		profilePicture = null,
		cacheBuster = 0,
		avatarColors,
		avatarCount,
		selectedAvatar,
		showAvatarPicker = $bindable(false),
		removingPhoto = false,
		onOpenPictureEditor,
		onRemovePhoto,
		onSelectAvatar,
		name = $bindable(''),
		email = $bindable(''),
		profileSaving = false,
		profileMessage = '',
		profileError = '',
		onSaveProfile,
		currentPassword = $bindable(''),
		newPassword = $bindable(''),
		confirmPassword = $bindable(''),
		showCurrentPw = $bindable(false),
		showNewPw = $bindable(false),
		showConfirmPw = $bindable(false),
		passwordSaving = false,
		passwordMessage = '',
		passwordError = '',
		onSavePassword,
		availableModels,
		selectedModel,
		translationEnabled,
		selectedTheme,
		onChangeModel,
		onChangeTranslation,
		onChangeTheme,
		onOpenResetModal,
		onOpenDeleteModal,
		onForgetEverything,
		forgetEverythingLoading = false,
		forgetEverythingError = '',
	}: {
		userId: string;
		userDisplayName: string;
		userEmail: string;
		profilePicture?: string | null;
		cacheBuster?: number;
		avatarColors: string[];
		avatarCount: number;
		selectedAvatar: number;
		showAvatarPicker: boolean;
		removingPhoto?: boolean;
		onOpenPictureEditor: () => void;
		onRemovePhoto: () => void | Promise<void>;
		onSelectAvatar: (avatarId: number) => void | Promise<void>;
		name: string;
		email: string;
		profileSaving?: boolean;
		profileMessage?: string;
		profileError?: string;
		onSaveProfile: () => void | Promise<void>;
		currentPassword: string;
		newPassword: string;
		confirmPassword: string;
		showCurrentPw: boolean;
		showNewPw: boolean;
		showConfirmPw: boolean;
		passwordSaving?: boolean;
		passwordMessage?: string;
		passwordError?: string;
		onSavePassword: () => void | Promise<void>;
		availableModels: AvailableModel[];
		selectedModel: 'model1' | 'model2';
		translationEnabled: boolean;
		selectedTheme: Theme;
		onChangeModel: (model: 'model1' | 'model2') => void | Promise<void>;
		onChangeTranslation: (enabled: boolean) => void | Promise<void>;
		onChangeTheme: (theme: Theme) => void | Promise<void>;
		onOpenResetModal: () => void;
		onOpenDeleteModal: () => void;
		onForgetEverything: () => void | Promise<void>;
		forgetEverythingLoading?: boolean;
		forgetEverythingError?: string;
	} = $props();
</script>

<section class="settings-card mb-4">
	<h2 class="settings-section-title">Avatar</h2>
	<div class="flex items-center gap-4">
		<AvatarCircle
			{userId}
			name={userDisplayName}
			avatarId={selectedAvatar}
			{profilePicture}
			{cacheBuster}
			size={48}
		/>
		<div class="flex flex-wrap items-center gap-2">
			<button class="btn-secondary text-sm" onclick={onOpenPictureEditor}>
				Upload Photo
			</button>
			<button class="btn-secondary text-sm" onclick={() => (showAvatarPicker = !showAvatarPicker)}>
				{showAvatarPicker ? 'Done' : 'Change Color'}
			</button>
			{#if profilePicture}
				<button
					class="btn-ghost text-sm"
					style="color: var(--color-danger);"
					onclick={onRemovePhoto}
					disabled={removingPhoto}
				>
					{removingPhoto ? 'Removing…' : 'Remove Photo'}
				</button>
			{/if}
		</div>
	</div>
	{#if showAvatarPicker}
		<div class="mt-4 flex flex-wrap gap-3">
			{#each Array.from({ length: avatarCount }, (_, i) => i) as avatarIndex}
				<button
					class="avatar-swatch rounded-full focus:outline-none"
					class:avatar-selected={selectedAvatar === avatarIndex}
					style={`background: ${avatarColors[avatarIndex]}; width: 44px; height: 44px;`}
					onclick={() => onSelectAvatar(avatarIndex)}
					aria-label={`Avatar ${avatarIndex + 1}`}
					title={`Avatar ${avatarIndex + 1}`}
				>
					<span class="block text-center text-lg font-semibold leading-none text-white">
						{userDisplayName[0]?.toUpperCase() ?? userEmail[0]?.toUpperCase() ?? '?'}
					</span>
				</button>
			{/each}
		</div>
	{/if}
</section>

<section class="settings-card mb-4">
	<h2 class="settings-section-title">Profile Information</h2>
	<div class="flex flex-col gap-3">
		<div>
			<label class="settings-label" for="name">Display Name</label>
			<input id="name" type="text" class="settings-input" bind:value={name} placeholder="Your name" />
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
			<p class="text-sm text-success">{profileMessage}</p>
		{/if}
		{#if profileError}
			<p class="text-sm text-danger">{profileError}</p>
		{/if}
		<button class="btn-primary self-start" onclick={onSaveProfile} disabled={profileSaving}>
			{profileSaving ? 'Saving…' : 'Save'}
		</button>
	</div>
</section>

<section class="settings-card mb-4">
	<h2 class="settings-section-title">Change Password</h2>
	<div class="flex flex-col gap-3">
		<PasswordField
			id="current-pw"
			label="Current Password"
			bind:value={currentPassword}
			bind:shown={showCurrentPw}
			autocomplete="current-password"
		/>
		<PasswordField
			id="new-pw"
			label="New Password"
			bind:value={newPassword}
			bind:shown={showNewPw}
			autocomplete="new-password"
		/>
		<PasswordField
			id="confirm-pw"
			label="Confirm New Password"
			bind:value={confirmPassword}
			bind:shown={showConfirmPw}
			autocomplete="new-password"
		/>
		{#if passwordMessage}
			<p class="text-sm text-success">{passwordMessage}</p>
		{/if}
		{#if passwordError}
			<p class="text-sm text-danger">{passwordError}</p>
		{/if}
		<button class="btn-primary self-start" onclick={onSavePassword} disabled={passwordSaving}>
			{passwordSaving ? 'Saving…' : 'Change Password'}
		</button>
	</div>
</section>

<section class="settings-card mb-4">
	<h2 class="settings-section-title">Preferences</h2>
	<div class="flex flex-col gap-5">
		<div>
			<p class="settings-label">Default Model</p>
			<div class="flex gap-2">
				{#each availableModels as model}
					<button
						class="pref-pill"
						class:pref-pill-active={selectedModel === model.id}
						onclick={() => onChangeModel(model.id)}
					>
						{model.displayName}
					</button>
				{/each}
			</div>
		</div>

		<div>
			<p class="settings-label mb-0">Translation</p>
			<p class="mb-2 mt-0.5 text-xs text-text-muted">Auto-translate Hungarian ↔ English</p>
			<button
				class="toggle-btn"
				class:toggle-on={translationEnabled}
				onclick={() => onChangeTranslation(!translationEnabled)}
				aria-label="Toggle translation"
				role="switch"
				aria-checked={translationEnabled}
			>
				<span class="toggle-thumb"></span>
			</button>
		</div>

		<div>
			<p class="settings-label">Theme</p>
			<div class="flex gap-2">
				{#each ['system', 'light', 'dark'] as theme}
					<button
						class="pref-pill"
						class:pref-pill-active={selectedTheme === theme}
						onclick={() => onChangeTheme(theme as Theme)}
					>
						{theme.charAt(0).toUpperCase() + theme.slice(1)}
					</button>
				{/each}
			</div>
		</div>
	</div>
</section>

<section class="settings-card settings-card-danger mb-4">
	<h2 class="settings-section-title text-danger">Danger Zone</h2>
	<p class="mb-4 text-sm text-text-secondary">
		Reset clears your chats, knowledge base, memories, analytics, and generated files while keeping
		your login, profile preferences, and avatar. Delete permanently removes the account itself too.
	</p>
	{#if forgetEverythingError}
		<p class="mb-3 text-sm text-danger">{forgetEverythingError}</p>
	{/if}
	<div class="flex flex-wrap gap-2">
		<button class="btn-secondary" onclick={onOpenResetModal}>
			Reset Account
		</button>
		<button class="btn-danger" onclick={onOpenDeleteModal}>
			Delete Account
		</button>
		<button class="btn-secondary" style="border-color: var(--danger); color: var(--danger);" onclick={onForgetEverything} disabled={forgetEverythingLoading}>
			{forgetEverythingLoading ? 'Resetting…' : 'Forget everything'}
		</button>
	</div>
</section>
