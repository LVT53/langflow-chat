<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import type { ConversationListItem } from '$lib/types';
	import { formatRelativeTime } from '$lib/utils/time';

	import ConfirmDialog from '../ui/ConfirmDialog.svelte';

	export let conversation: ConversationListItem;
	export let active: boolean = false;

	const dispatch = createEventDispatcher<{
		select: { id: string };
		rename: { id: string; title: string };
		delete: { id: string };
	}>();

	let isEditing = false;
	let editTitle = '';
	let inputRef: HTMLInputElement;
	let menuOpen = false;
	let menuRef: HTMLDivElement;
	let showDeleteConfirm = false;

	function handleSelect() {
		if (!isEditing) {
			dispatch('select', { id: conversation.id });
		}
	}

	function startRename(e: MouseEvent) {
		e.stopPropagation();
		isEditing = true;
		editTitle = conversation.title;
		menuOpen = false;
		setTimeout(() => {
			if (inputRef) {
				inputRef.focus();
				inputRef.select();
			}
		}, 0);
	}

	function saveRename() {
		if (isEditing) {
			isEditing = false;
			const trimmedTitle = editTitle.trim();
			if (trimmedTitle && trimmedTitle !== conversation.title) {
				dispatch('rename', { id: conversation.id, title: trimmedTitle });
			}
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveRename();
		} else if (e.key === 'Escape') {
			isEditing = false;
		}
	}

	function handleDelete(e: MouseEvent) {
		e.stopPropagation();
		menuOpen = false;
		showDeleteConfirm = true;
	}

	function confirmDelete() {
		showDeleteConfirm = false;
		dispatch('delete', { id: conversation.id });
	}

	function cancelDelete() {
		showDeleteConfirm = false;
	}

	function toggleMenu(e: MouseEvent) {
		e.stopPropagation();
		menuOpen = !menuOpen;
	}

	function handleOutsideClick(e: MouseEvent) {
		if (menuOpen && menuRef && !menuRef.contains(e.target as Node)) {
			menuOpen = false;
		}
	}
</script>

<svelte:window on:click={handleOutsideClick} />

<div
  data-testid="conversation-item"
  class="group relative flex cursor-pointer items-center justify-between py-2 px-3 min-h-[44px] border-l-2 transition-colors hover:bg-surface-elevated focus-visible:bg-surface-elevated focus-visible:outline-none border-transparent"
  class:bg-surface-elevated={active}
  class:border-accent={active}
  on:click={handleSelect}
  on:keydown={(e) => e.key === 'Enter' && handleSelect()}
  role="button"
  tabindex="0"
>
	<div class="flex min-w-0 flex-1 flex-col overflow-hidden pr-2">
		{#if isEditing}
			<input
				data-testid="title-input"
				bind:this={inputRef}
				bind:value={editTitle}
				on:blur={saveRename}
				on:keydown={handleKeydown}
				on:click|stopPropagation
				class="w-full rounded-sm border-default bg-surface-page px-2 py-1 min-h-[44px] text-sm font-sans text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
			/>
		{:else}
			<div class="truncate text-[14px] font-sans text-text-primary">
				{conversation.title}
			</div>
			<div class="mt-0.5 text-[12px] font-sans text-text-muted">
				{formatRelativeTime(conversation.updatedAt)}
			</div>
		{/if}
	</div>

	<div class="relative flex-shrink-0" bind:this={menuRef}>
		<button
			class="flex h-11 w-11 items-center justify-center rounded-sm text-text-muted opacity-0 transition-opacity hover:bg-surface-elevated hover:text-text-primary focus-visible:opacity-100 focus-visible:bg-surface-elevated focus-visible:outline-none group-hover:opacity-100"
			class:opacity-100={menuOpen}
			on:click={toggleMenu}
			aria-label="Conversation options"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<circle cx="12" cy="12" r="1" />
				<circle cx="12" cy="5" r="1" />
				<circle cx="12" cy="19" r="1" />
			</svg>
		</button>

		{#if menuOpen}
			<div
				class="absolute right-0 top-full z-10 mt-1 w-32 rounded-md border border-default bg-surface-page py-1 shadow-lg"
			>
				<button
					data-testid="rename-option"
					class="flex w-full items-center px-4 py-2 text-left text-sm font-sans text-text-primary hover:bg-surface-elevated focus-visible:bg-surface-elevated focus-visible:outline-none min-h-[44px]"
					on:click={startRename}
				>
					Rename
				</button>
<button
  data-testid="delete-option"
  class="flex w-full items-center px-4 py-2 text-left text-sm font-sans text-danger hover:bg-surface-elevated focus-visible:bg-surface-elevated focus-visible:outline-none min-h-[44px]"
  on:click={handleDelete}
>
  Delete
</button>
			</div>
		{/if}
	</div>
</div>

{#if showDeleteConfirm}
	<ConfirmDialog
		title="Delete this conversation?"
		message="Are you sure you want to delete this conversation? This action cannot be undone."
		confirmText="Delete"
		cancelText="Cancel"
		confirmVariant="danger"
		on:confirm={confirmDelete}
		on:cancel={cancelDelete}
	/>
{/if}
