<script lang="ts">
	import ConversationItem from './ConversationItem.svelte';
	
	export let conversation: any;
	export let active = false;
	
	export let onSelect: (e: any) => void = () => {};
	export let onRename: (e: any) => void = () => {};
	export let onDelete: (e: any) => void = () => {};

	let menuOpen = false;
</script>

<ConversationItem 
	{conversation} 
	{active}
	{menuOpen}
	on:select={(e) => onSelect(e.detail)}
	on:rename={(e) => onRename(e.detail)}
	on:delete={(e) => onDelete(e.detail)}
	on:menuToggle={(e) => (menuOpen = e.detail.open)}
	on:menuClose={() => (menuOpen = false)}
/>
