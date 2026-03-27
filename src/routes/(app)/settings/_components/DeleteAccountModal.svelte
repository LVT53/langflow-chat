<script lang="ts">
	import PasswordField from './PasswordField.svelte';

	let {
		deletePassword = $bindable(''),
		deleteError = '',
		deleteLoading = false,
		showDeletePw = $bindable(false),
		onConfirm,
		onCancel,
	}: {
		deletePassword: string;
		deleteError?: string;
		deleteLoading?: boolean;
		showDeletePw: boolean;
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
		<h3 class="mb-2 text-lg font-semibold text-text-primary">Delete Account</h3>
		<p class="mb-4 text-sm text-text-secondary">
			This will permanently delete your account, all chats, and all data. This cannot be undone.
		</p>
		<p class="mb-1 text-sm font-medium text-text-primary">Enter your password to confirm:</p>
		<PasswordField
			id="delete-account-password"
			label="Password"
			bind:value={deletePassword}
			bind:shown={showDeletePw}
			autocomplete="current-password"
			placeholder="Your password"
		/>
		{#if deleteError}
			<p class="mb-3 mt-3 text-sm text-danger">{deleteError}</p>
		{/if}
		<div class="mt-4 flex gap-2">
			<button class="btn-danger flex-1" onclick={onConfirm} disabled={deleteLoading || !deletePassword}>
				{deleteLoading ? 'Deleting…' : 'Delete permanently'}
			</button>
			<button class="btn-secondary" onclick={onCancel}>
				Cancel
			</button>
		</div>
	</div>
</div>
