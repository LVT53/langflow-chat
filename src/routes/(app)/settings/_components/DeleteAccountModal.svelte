<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
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
		if (event.key === 'Escape') {
			event.preventDefault();
			onCancel();
		}
	}

	onMount(() => {
		document.body.style.overflow = 'hidden';
	});

	onDestroy(() => {
		document.body.style.overflow = '';
	});
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="fixed inset-0 z-[9999] overflow-y-auto p-4"
	role="dialog"
	aria-modal="true"
	aria-labelledby="delete-account-title"
	aria-describedby="delete-account-description"
>
	<button
		type="button"
		class="absolute inset-0 h-full w-full cursor-default bg-surface-overlay/60 backdrop-blur-sm"
		aria-label="Cancel delete account"
		onclick={onCancel}
	></button>
	<div class="relative flex min-h-full items-center justify-center">
		<div
			class="overflow-y-auto rounded-[1.25rem] border border-border bg-surface-page p-5 shadow-lg sm:p-6"
			style="width: min(30rem, calc(100vw - 2rem)); max-height: calc(100vh - 2rem);"
		>
			<form
				onsubmit={(event) => {
					event.preventDefault();
					handleConfirm();
				}}
			>
				<h3 id="delete-account-title" class="mb-2 text-lg font-semibold text-text-primary">
					Delete Account
				</h3>
				<p id="delete-account-description" class="delete-account-modal-subtext mb-4 text-sm leading-6 text-text-secondary">
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
						type="submit"
						class="btn-danger w-full whitespace-nowrap sm:w-auto"
						disabled={deleteLoading || !deletePassword}
					>
						{deleteLoading ? 'Deleting…' : 'Delete permanently'}
					</button>
				</div>
			</form>
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
