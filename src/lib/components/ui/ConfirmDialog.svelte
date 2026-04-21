<script lang="ts">
import DialogShell from "$lib/components/ui/DialogShell.svelte";

let {
	title,
	message,
	confirmText = "Confirm",
	cancelText = "Cancel",
	confirmVariant = "primary",
	onConfirm,
	onCancel,
	zIndexClass = "z-[130]",
}: {
	title: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	confirmVariant?: "primary" | "danger";
	onConfirm?: () => void;
	onCancel?: () => void;
	zIndexClass?: string;
} = $props();
let confirmBtnRef = $state<HTMLButtonElement | undefined>(undefined);

function handleConfirm() {
	onConfirm?.();
}

function handleCancel() {
	onCancel?.();
}

$effect(() => {
	if (confirmBtnRef) {
		confirmBtnRef.focus();
	}
});
</script>

<DialogShell title={title} description={message} onClose={handleCancel} {zIndexClass}>
	<div class="flex justify-end gap-md">
		<button type="button" class="btn-secondary" onclick={handleCancel}>
			{cancelText}
		</button>
		<button
			data-testid="confirm-delete"
			bind:this={confirmBtnRef}
			type="button"
			class={confirmVariant === 'danger' ? 'btn-danger' : 'btn-primary'}
			onclick={handleConfirm}
		>
			{confirmText}
		</button>
	</div>
</DialogShell>
