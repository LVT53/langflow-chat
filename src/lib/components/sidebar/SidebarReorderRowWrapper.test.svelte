<script lang="ts">
import SidebarReorderRow from "./SidebarReorderRow.svelte";

let {
	onDragStart = () => {},
	onDragEnd = () => {},
	onDragOver = () => {},
	onDrop = () => {},
}: {
	onDragStart?: (payload: { id: string }) => void;
	onDragEnd?: (payload: { id: string }) => void;
	onDragOver?: (event: DragEvent) => void;
	onDrop?: (event: DragEvent) => void;
} = $props();
</script>

<SidebarReorderRow
	id="row-1"
	label="Quarterly plan"
	{onDragStart}
	{onDragEnd}
	{onDragOver}
	{onDrop}
>
	<div data-testid="row-content">Quarterly plan</div>
</SidebarReorderRow>
