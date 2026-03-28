<script lang="ts">
	import type { UserRole } from '$lib/types';
	import PasswordField from './PasswordField.svelte';

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

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-[9999] flex items-center justify-center bg-surface-overlay/60 backdrop-blur-sm"
	role="presentation"
	onclick={(event) => {
		if (event.target !== event.currentTarget) return;
		onCancel();
	}}
>
	<div class="mx-4 w-full max-w-lg rounded-xl border border-border bg-surface-page p-6 shadow-lg">
		<h3 class="mb-2 text-lg font-semibold text-text-primary">Create User</h3>
		<p class="mb-4 text-sm text-text-secondary">
			Create a new local account and optionally grant it admin access immediately.
		</p>

		<div class="flex flex-col gap-3">
			<div>
				<label class="settings-label" for="create-user-name">Display Name</label>
				<input
					id="create-user-name"
					type="text"
					class="settings-input"
					bind:value={name}
					placeholder="Optional display name"
				/>
			</div>
			<div>
				<label class="settings-label" for="create-user-email">Email</label>
				<input
					id="create-user-email"
					type="email"
					class="settings-input"
					bind:value={email}
					placeholder="user@example.com"
				/>
			</div>
			<PasswordField
				id="create-user-password"
				label="Password"
				bind:value={password}
				bind:shown={showPassword}
				autocomplete="new-password"
				placeholder="At least 8 characters"
			/>
			<div>
				<p class="settings-label">Role</p>
				<div class="flex gap-2">
					{#each ['user', 'admin'] as nextRole}
						<button
							type="button"
							class="pref-pill"
							class:pref-pill-active={role === nextRole}
							onclick={() => (role = nextRole as UserRole)}
						>
							{nextRole === 'admin' ? 'Admin' : 'User'}
						</button>
					{/each}
				</div>
			</div>
		</div>

		{#if createError}
			<p class="mt-4 text-sm text-danger">{createError}</p>
		{/if}

		<div class="mt-5 flex gap-2">
			<button
				class="btn-primary flex-1"
				onclick={onConfirm}
				disabled={createLoading || !email.trim() || password.length < 8}
			>
				{createLoading ? 'Creating…' : 'Create User'}
			</button>
			<button class="btn-secondary" onclick={onCancel}>Cancel</button>
		</div>
	</div>
</div>
