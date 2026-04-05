<script lang="ts">
	import DialogShell from '$lib/components/ui/DialogShell.svelte';
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

	function handleConfirm() {
		if (resetLoading || !resetPassword) return;
		void onConfirm();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			handleConfirm();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<DialogShell
	title="Reset Account"
	description="This wipes your chats, knowledge base, memories, analytics, and generated files, but keeps your login credentials, profile preferences, and avatar. You will need to sign in again after the reset finishes."
	onClose={onCancel}
	maxWidthClass="max-w-[30rem]"
	zIndexClass="z-[9999]"
>
	<div class="max-h-[calc(100vh-2rem)] overflow-y-auto">
			<form
				onsubmit={(event) => {
					event.preventDefault();
					handleConfirm();
				}}
			>
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
						type="submit"
						class="btn-secondary w-full whitespace-nowrap sm:w-auto"
						disabled={resetLoading || !resetPassword}
					>
						{resetLoading ? 'Resetting…' : 'Reset account'}
					</button>
				</div>
			</form>
		</div>
</DialogShell>
