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
			style="width: min(30rem, calc(100vw - 2rem)); max-height: calc(100vh - 2rem);"
		>
			<h3 class="mb-2 text-lg font-semibold text-text-primary">Delete Account</h3>
			<p class="delete-account-modal-subtext mb-4 text-sm leading-6 text-text-secondary">
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
			<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<button type="button" class="btn-secondary w-full sm:w-auto" onclick={onCancel}>
					Cancel
				</button>
				<button
					type="button"
					class="btn-danger w-full whitespace-nowrap sm:w-auto"
					onclick={onConfirm}
					disabled={deleteLoading || !deletePassword}
				>
					{deleteLoading ? 'Deleting…' : 'Delete permanently'}
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.delete-account-modal-subtext {
		width: 100%;
		max-width: none;
		white-space: normal;
		overflow-wrap: break-word;
	}
</style>
