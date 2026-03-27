<script lang="ts">
	import ConversationItem from './ConversationItem.svelte';

	let {
		conversation,
		active = false,
		onSelect = () => {},
		onRename = () => {},
		onDelete = () => {}
	}: {
		conversation: any;
		active?: boolean;
		onSelect?: (event: any) => void;
		onRename?: (event: any) => void;
		onDelete?: (event: any) => void;
	} = $props();

	let menuOpen = $state(false);
</script>

<ConversationItem 
	{conversation} 
	{active}
	{menuOpen}
	onSelect={onSelect}
	onRename={onRename}
	onDelete={onDelete}
	onMenuToggle={(payload) => (menuOpen = payload.open)}
	onMenuClose={() => (menuOpen = false)}
/>
