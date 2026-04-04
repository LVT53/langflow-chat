<script lang="ts">
	import PasswordField from './PasswordField.svelte';

	let {
		resetPassword = $bindable(''),
		resetError = '',
		resetLoading = false,
		showResetPw = $bindable(false),
		onConfirm,
		onCancel,
	}: {
		resetPassword: string;
		resetError?: string;
		resetLoading?: boolean;
		showResetPw: boolean;
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
	<div class="mx-4 w-full max-w-sm rounded-xl border border-border bg-surface-page p-6 shadow-lg">
		<h3 class="mb-2 text-lg font-semibold text-text-primary">Reset Account</h3>
		<p class="mb-4 text-sm text-text-secondary">
			This wipes your chats, knowledge base, memories, analytics, and generated files, but keeps
			your login credentials, profile preferences, and avatar. You will need to sign in again
			after the reset finishes.
		</p>
		<p class="mb-1 text-sm font-medium text-text-primary">Enter your password to confirm:</p>
		<PasswordField
			id="reset-account-password"
			label="Password"
			bind:value={resetPassword}
			bind:shown={showResetPw}
			autocomplete="current-password"
			placeholder="Your password"
		/>
		{#if resetError}
			<p class="mb-3 mt-3 text-sm text-danger">{resetError}</p>
		{/if}
		<div class="mt-4 flex gap-2">
			<button class="btn-secondary flex-1" onclick={onConfirm} disabled={resetLoading || !resetPassword}>
				{resetLoading ? 'Resetting…' : 'Reset account'}
			</button>
			<button class="btn-secondary" onclick={onCancel}>
				Cancel
			</button>
		</div>
	</div>
</div>
