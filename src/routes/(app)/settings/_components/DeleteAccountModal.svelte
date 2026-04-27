<script lang="ts">
import { t } from "$lib/i18n";
import DialogShell from "$lib/components/ui/DialogShell.svelte";
import PasswordField from "./PasswordField.svelte";

let {
	deletePassword = $bindable(""),
	deleteError = "",
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
	if (event.key === "Enter") {
		event.preventDefault();
		handleConfirm();
	}
}
</script>

<svelte:window onkeydown={handleKeydown} />

<DialogShell
	title={$t('admin.deleteAccount')}
	description={$t('admin.deleteAccountDescription')}
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
				<p class="mb-1 text-sm font-medium text-text-primary">{$t('admin.enterPasswordConfirm')}</p>
				<PasswordField
					id="delete-account-password"
					label={$t('admin.password')}
					bind:value={deletePassword}
					bind:shown={showDeletePw}
					autocomplete="current-password"
					placeholder={$t('admin.yourPassword')}
				/>
				{#if deleteError}
					<p class="mb-3 mt-3 text-sm text-danger">{deleteError}</p>
				{/if}
				<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
					<button type="button" class="btn-secondary w-full sm:w-auto" onclick={onCancel}>
						{$t('common.cancel')}
					</button>
					<button
						type="submit"
						class="btn-danger w-full whitespace-nowrap sm:w-auto"
						disabled={deleteLoading || !deletePassword}
					>
						{deleteLoading ? $t('admin.deleting') : $t('admin.deletePermanently')}
					</button>
				</div>
			</form>
		</div>
</DialogShell>
