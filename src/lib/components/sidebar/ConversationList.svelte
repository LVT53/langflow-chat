<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		conversations,
		loadConversations,
		deleteConversationById,
		renameConversation
	} from '$lib/stores/conversations';
	import { currentConversationId } from '$lib/stores/ui';
	import ConversationItem from './ConversationItem.svelte';

	let loading = true;
	let error: string | null = null;

	onMount(async () => {
		try {
			await loadConversations();
		} catch (e) {
			error = 'Failed to load conversations';
			console.error(e);
		} finally {
			loading = false;
		}
	});

	function handleSelect(event: CustomEvent<{ id: string }>) {
		const id = event.detail.id;
		currentConversationId.set(id);
		goto(`/chat/${id}`);
	}

	async function handleRename(event: CustomEvent<{ id: string; title: string }>) {
		const { id, title } = event.detail;
		try {
			await renameConversation(id, title);
		} catch (e) {
			console.error('Rename failed', e);
			alert('Failed to rename conversation. Please try again.');
		}
	}

	async function handleDelete(event: CustomEvent<{ id: string }>) {
		const { id } = event.detail;
		if (confirm('Delete this conversation?')) {
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
	}
</script>

<div class="flex h-full flex-col gap-1">
	{#if loading}
		<div class="flex h-full items-center justify-center p-4 text-sm text-text-muted">
			Loading conversations...
		</div>
	{:else if error}
		<div class="flex h-full items-center justify-center p-4 text-sm text-danger">
			{error}
		</div>
	{:else if $conversations.length === 0}
		<div class="flex h-full items-center justify-center p-4 text-sm text-text-muted">
			No conversations yet
		</div>
	{:else}
		{#each $conversations as conversation (conversation.id)}
			<ConversationItem
				{conversation}
				active={$currentConversationId === conversation.id}
				on:select={handleSelect}
				on:rename={handleRename}
				on:delete={handleDelete}
			/>
		{/each}
	{/if}
</div>
