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
			<h3 class="mb-2 text-lg font-semibold text-text-primary">Reset Account</h3>
			<p class="reset-account-modal-subtext mb-4 text-sm leading-6 text-text-secondary">
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
			<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<button type="button" class="btn-secondary w-full sm:w-auto" onclick={onCancel}>
					Cancel
				</button>
				<button
					type="button"
					class="btn-secondary w-full whitespace-nowrap sm:w-auto"
					onclick={onConfirm}
					disabled={resetLoading || !resetPassword}
				>
					{resetLoading ? 'Resetting…' : 'Reset account'}
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.reset-account-modal-subtext {
		width: 100%;
		max-width: none;
		white-space: normal;
		overflow-wrap: break-word;
	}
</style>
