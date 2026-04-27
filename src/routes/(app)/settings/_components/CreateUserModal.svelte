<script lang="ts">
	import type { UserRole } from '$lib/types';
	import DialogShell from '$lib/components/ui/DialogShell.svelte';
	import PasswordField from './PasswordField.svelte';
	import { t } from '$lib/i18n';

	let {
		name = $bindable(''),
		email = $bindable(''),
		password = $bindable(''),
		role = $bindable('user'),
		showPassword = $bindable(false),
		createLoading = false,
		createError = '',
		onConfirm,
		onCancel,
	}: {
		name: string;
		email: string;
		password: string;
		role: UserRole;
		showPassword: boolean;
		createLoading?: boolean;
		createError?: string;
		onConfirm: () => void | Promise<void>;
		onCancel: () => void;
	} = $props();
</script>

<DialogShell
	title={$t('settings_createUserTitle')}
	description={$t('settings_createUserDescription')}
	onClose={onCancel}
	maxWidthClass="max-w-[42rem]"
	zIndexClass="z-[9999]"
>
	<div class="max-h-[calc(100vh-2rem)] overflow-y-auto">

		<div class="grid gap-3 sm:grid-cols-2 sm:gap-4">
				<div>
					<label class="settings-label" for="create-user-name">{$t('settings_displayName')}</label>
					<input
						id="create-user-name"
						type="text"
						class="settings-input"
						bind:value={name}
						placeholder={$t('settings_optionalDisplayName')}
					/>
				</div>
				<div>
					<label class="settings-label" for="create-user-email">{$t('settings_emailAddress')}</label>
					<input
						id="create-user-email"
						type="email"
						class="settings-input"
						bind:value={email}
						placeholder={$t('settings_userEmailPlaceholder')}
					/>
				</div>
				<div class="sm:col-span-2">
					<PasswordField
						id="create-user-password"
						label={$t('settings_passwordLabel')}
						bind:value={password}
						bind:shown={showPassword}
						autocomplete="new-password"
						placeholder={$t('settings_atLeast8Chars')}
					/>
				</div>
				<div class="sm:col-span-2">
					<p class="settings-label">{$t('settings_role')}</p>
					<div class="flex flex-wrap gap-2">
						{#each [
							{ value: 'user' as const, label: $t('settings_user') },
							{ value: 'admin' as const, label: $t('settings_admin') },
						] as nextRole}
							<button
								type="button"
								class="pref-pill"
								class:pref-pill-active={role === nextRole.value}
								onclick={() => (role = nextRole.value as UserRole)}
							>
								{nextRole.label}
							</button>
						{/each}
					</div>
				</div>
		</div>

		{#if createError}
			<p class="mt-4 text-sm text-danger">{createError}</p>
		{/if}

		<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
			<button type="button" class="btn-secondary w-full sm:w-auto" onclick={onCancel}>{$t('common.cancel')}</button>
			<button
				type="button"
				class="btn-primary w-full whitespace-nowrap sm:w-auto"
				onclick={onConfirm}
				disabled={createLoading || !email.trim() || password.length < 8}
			>
				{createLoading ? $t('settings_creating') : $t('settings_createUserBtn')}
			</button>
		</div>
	</div>
</DialogShell>
