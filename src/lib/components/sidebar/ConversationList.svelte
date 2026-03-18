<script lang="ts">
	import { goto } from '$app/navigation';
	import {
		conversations,
		deleteConversationById,
		renameConversation
	} from '$lib/stores/conversations';
	import { currentConversationId } from '$lib/stores/ui';
	import type { ConversationListItem } from '$lib/types';
	import ConversationItem from './ConversationItem.svelte';

	export let initialConversations: ConversationListItem[] = [];

	let openMenuId: string | null = null;

	$: visibleConversations = $conversations.length > 0 ? $conversations : initialConversations;

	function handleSelect(event: CustomEvent<{ id: string }>) {
		const id = event.detail.id;
		openMenuId = null;
		// Navigate first, then update the store to avoid race conditions
		goto(`/chat/${id}`).then(() => {
			currentConversationId.set(id);
		});
	}

	async function handleRename(event: CustomEvent<{ id: string; title: string }>) {
		const { id, title } = event.detail;
		openMenuId = null;
		try {
			await renameConversation(id, title);
		} catch (e) {
			console.error('Rename failed', e);
			alert('Failed to rename conversation. Please try again.');
		}
	}

	async function handleDelete(event: CustomEvent<{ id: string }>) {
		const { id } = event.detail;
		openMenuId = null;
		try {
			await deleteConversationById(id);
			if ($currentConversationId === id) {
				currentConversationId.set(null);
				goto('/');
			}
		} catch (e) {
			console.error('Delete failed', e);
			alert('Failed to delete conversation. Please try again.');
		}
	}

	function handleMenuToggle(event: CustomEvent<{ id: string; open: boolean }>) {
		const { id, open } = event.detail;
		openMenuId = open ? id : null;
	}

	function handleMenuClose() {
		openMenuId = null;
	}
</script>

<div class="flex h-full flex-col gap-1">
	{#if visibleConversations.length === 0}
		<div class="flex h-full items-center justify-center p-4 text-sm text-text-muted">
			No conversations yet
		</div>
	{:else}
		{#each visibleConversations as conversation (conversation.id)}
			<ConversationItem
				{conversation}
				active={$currentConversationId === conversation.id}
				menuOpen={openMenuId === conversation.id}
				on:select={handleSelect}
				on:rename={handleRename}
				on:delete={handleDelete}
				on:menuToggle={handleMenuToggle}
				on:menuClose={handleMenuClose}
			/>
		{/each}
	{/if}
</div>
