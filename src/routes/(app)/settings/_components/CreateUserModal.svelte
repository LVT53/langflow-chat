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
	class="fixed inset-0 z-[9999] overflow-y-auto bg-surface-overlay/60 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(event) => {
		if (event.target !== event.currentTarget) return;
		onCancel();
	}}
>
	<div class="flex min-h-full items-center justify-center">
		<div
			class="overflow-y-auto rounded-[1.25rem] border border-border bg-surface-page p-5 shadow-lg sm:p-6"
			style="width: min(42rem, calc(100vw - 2rem)); max-height: calc(100vh - 2rem);"
		>
			<h3 class="mb-2 text-lg font-semibold text-text-primary">Create User</h3>
			<p class="create-user-modal-subtext mb-5 text-sm leading-6 text-text-secondary">
				Create a new local account and optionally grant it admin access immediately.
			</p>

			<div class="grid gap-3 sm:grid-cols-2 sm:gap-4">
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
				<div class="sm:col-span-2">
					<PasswordField
						id="create-user-password"
						label="Password"
						bind:value={password}
						bind:shown={showPassword}
						autocomplete="new-password"
						placeholder="At least 8 characters"
					/>
				</div>
				<div class="sm:col-span-2">
					<p class="settings-label">Role</p>
					<div class="flex flex-wrap gap-2">
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

			<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<button type="button" class="btn-secondary w-full sm:w-auto" onclick={onCancel}>Cancel</button>
				<button
					type="button"
					class="btn-primary w-full whitespace-nowrap sm:w-auto"
					onclick={onConfirm}
					disabled={createLoading || !email.trim() || password.length < 8}
				>
					{createLoading ? 'Creating…' : 'Create User'}
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.create-user-modal-subtext {
		width: 100%;
		max-width: none;
		white-space: normal;
		overflow-wrap: break-word;
	}
</style>
