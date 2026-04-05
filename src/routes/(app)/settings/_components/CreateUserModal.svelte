<script lang="ts">
	import type { UserRole } from '$lib/types';
	import DialogShell from '$lib/components/ui/DialogShell.svelte';
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

<DialogShell
	title="Create User"
	description="Create a new local account and optionally grant it admin access immediately."
	onClose={onCancel}
	maxWidthClass="max-w-[42rem]"
	zIndexClass="z-[9999]"
>
	<div class="max-h-[calc(100vh-2rem)] overflow-y-auto">

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
</DialogShell>
