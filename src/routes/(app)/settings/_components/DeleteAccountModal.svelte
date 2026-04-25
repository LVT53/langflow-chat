<script lang="ts">
	import DialogShell from '$lib/components/ui/DialogShell.svelte';
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

	function handleConfirm() {
		if (deleteLoading || !deletePassword) return;
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
	title="Delete Account"
	description="This permanently deletes your account, chats, Knowledge Base, memories, analytics, generated files, profile preferences, and avatar. This cannot be undone."
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
						type="submit"
						class="btn-danger w-full whitespace-nowrap sm:w-auto"
						disabled={deleteLoading || !deletePassword}
					>
						{deleteLoading ? 'Deleting…' : 'Delete permanently'}
					</button>
				</div>
			</form>
		</div>
</DialogShell>
