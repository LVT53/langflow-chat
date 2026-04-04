<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
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
	aria-labelledby="reset-account-title"
	aria-describedby="reset-account-description"
>
	<button
		type="button"
		class="absolute inset-0 h-full w-full cursor-default bg-surface-overlay/60 backdrop-blur-sm"
		aria-label="Cancel account reset"
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
				<h3 id="reset-account-title" class="mb-2 text-lg font-semibold text-text-primary">
					Reset Account
				</h3>
				<p id="reset-account-description" class="reset-account-modal-subtext mb-4 text-sm leading-6 text-text-secondary">
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
						type="submit"
						class="btn-secondary w-full whitespace-nowrap sm:w-auto"
						disabled={resetLoading || !resetPassword}
					>
						{resetLoading ? 'Resetting…' : 'Reset account'}
					</button>
				</div>
			</form>
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
