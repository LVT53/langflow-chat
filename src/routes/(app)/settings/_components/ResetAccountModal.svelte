<script lang="ts">
	import DialogShell from '$lib/components/ui/DialogShell.svelte';
	import PasswordField from './PasswordField.svelte';
	import { t } from '$lib/i18n';

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
	title={$t('settings_resetAccountTitle')}
	description={$t('settings_resetAccountDescription')}
	onClose={onCancel}
	maxWidthClass="max-w-[30rem]"
	zIndexClass="z-[9999]"
>
	<div class="max-h-[calc(100vh-2rem)] overflow-y-auto">
			<form
				-onsubmit={(event) => {
					event.preventDefault();
					handleConfirm();
				}}
			>
				<p class="mb-1 text-sm font-medium text-text-primary">{$t('settings_enterPasswordConfirm')}</p>
				<PasswordField
					id="reset-account-password"
					label={$t('settings_passwordLabel')}
					bind:value={resetPassword}
					bind:shown={showResetPw}
					autocomplete="current-password"
					placeholder={$t('settings_yourPasswordPlaceholder')}
				/>
				{#if resetError}
					<p class="mb-3 mt-3 text-sm text-danger">{resetError}</p>
				{/if}
				<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button type="button" class="btn-secondary w-full sm:w-auto" onclick={onCancel}>
						{$t('common_cancel')}
					</button>
					<button
						type="submit"
						class="btn-secondary w-full whitespace-nowrap sm:w-auto"
						disabled={resetLoading || !resetPassword}
					>
						{resetLoading ? $t('settings_resetting') : $t('settings_resetAccount')}
					</button>
				</div>
			</form>
		</div>
</DialogShell>
