<script lang="ts">
import type { Snippet } from "svelte";
import { t } from "$lib/i18n";

let {
	id,
	label,
	active = false,
	disabled = false,
	children,
	onDragStart,
	onDragEnd,
	onDragOver,
	onDrop,
}: {
	id: string;
	label: string;
	active?: boolean;
	disabled?: boolean;
	children: Snippet;
	onDragStart?: (payload: { id: string }) => void;
	onDragEnd?: (payload: { id: string }) => void;
	onDragOver?: (event: DragEvent) => void;
	onDrop?: (event: DragEvent) => void;
} = $props();

function startDrag(event: DragEvent) {
	if (disabled) {
		event.preventDefault();
		return;
	}
	event.dataTransfer?.setData("application/x-alfyai-sidebar-reorder", id);
	event.dataTransfer?.setData("text/plain", id);
	if (event.dataTransfer) {
		event.dataTransfer.effectAllowed = "move";
	}
	onDragStart?.({ id });
}

function endDrag() {
	onDragEnd?.({ id });
}
</script>

<div
	data-testid="sidebar-reorder-row"
	data-reorder-id={id}
	class="sidebar-reorder-row rounded-lg"
	class:sidebar-reorder-row-active={active}
	class:sidebar-reorder-row-disabled={disabled}
	draggable={!disabled}
	role="group"
	aria-label={$t('sidebar.reorderItem', { label })}
	title={$t('sidebar.reorderItem', { label })}
	ondragstart={startDrag}
	ondragend={endDrag}
	ondragover={onDragOver}
	ondrop={onDrop}
>
	{@render children()}
</div>

<style>
	.sidebar-reorder-row {
		cursor: grab;
	}

	.sidebar-reorder-row:active {
		cursor: grabbing;
	}

	.sidebar-reorder-row-active {
		opacity: 0.72;
	}

	.sidebar-reorder-row-disabled {
		cursor: default;
	}
</style>
