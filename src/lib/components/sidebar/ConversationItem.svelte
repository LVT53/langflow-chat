<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type { ConversationListItem } from '$lib/types';

	import ConfirmDialog from '../ui/ConfirmDialog.svelte';

	export let conversation: ConversationListItem;
	export let active: boolean = false;
	export let menuOpen: boolean = false;

	const dispatch = createEventDispatcher<{
		select: { id: string };
		rename: { id: string; title: string };
		delete: { id: string };
		menuToggle: { id: string; open: boolean };
		menuClose: { id: string };
	}>();

	let isEditing = false;
	let editTitle = '';
	let inputRef: HTMLInputElement;
	let menuRef: HTMLDivElement;
	let triggerRef: HTMLButtonElement;
	let showDeleteConfirm = false;
	let menuPositionStyle = '';
	let menuBaseBackground = '';

	function setMenuBaseBackground() {
		if (typeof document === 'undefined') return;
		const isDark = document.documentElement.classList.contains('dark');
		menuBaseBackground = isDark
			? 'rgb(33 35 38 / 1)'
			: 'rgb(241 239 235 / 1)';
	}

	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) {
					node.parentNode.removeChild(node);
				}
			}
		};
	}

	function handleSelect(e?: MouseEvent) {
		// Only select if not currently editing and menu is closed
		if (!isEditing && !menuOpen) {
			dispatch('select', { id: conversation.id });
		}
	}

	function startRename(e: MouseEvent) {
		e.stopPropagation();
		isEditing = true;
		editTitle = conversation.title;
		dispatch('menuClose', { id: conversation.id });
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
		dispatch('menuClose', { id: conversation.id });
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
		if (!menuOpen) {
			updateMenuPosition();
		}
		dispatch('menuToggle', { id: conversation.id, open: !menuOpen });
	}

	function handleOutsideClick(e: MouseEvent) {
		const target = e.target as Node;
		// Only handle if menu is open and click is outside menu and trigger button
		if (
			menuOpen &&
			menuRef &&
			triggerRef &&
			!menuRef.contains(target) &&
			!triggerRef.contains(target)
		) {
			e.preventDefault();
			e.stopPropagation();
			dispatch('menuClose', { id: conversation.id });
		}
	}

	function updateMenuPosition() {
		if (!triggerRef) return;
		setMenuBaseBackground();
		const rect = triggerRef.getBoundingClientRect();
		const menuWidth = 176;
		const viewportPadding = 12;
		const left = Math.min(
			window.innerWidth - menuWidth - viewportPadding,
			Math.max(viewportPadding, rect.right - menuWidth)
		);
		const top = Math.min(window.innerHeight - 12, rect.bottom + 8);
		menuPositionStyle = `position: fixed; top: ${top}px; left: ${left}px; width: ${menuWidth}px;`;
	}

	$: if (menuOpen) {
		updateMenuPosition();
	}

	onMount(() => {
		const syncMenuPosition = () => {
			if (menuOpen) {
				updateMenuPosition();
			}
		};

		window.addEventListener('resize', syncMenuPosition);
		window.addEventListener('scroll', syncMenuPosition, true);

		return () => {
			window.removeEventListener('resize', syncMenuPosition);
			window.removeEventListener('scroll', syncMenuPosition, true);
		};
	});
</script>

<svelte:window on:click={handleOutsideClick} />

<div
  data-testid="conversation-item"
  class="group relative flex min-h-[40px] cursor-pointer items-center justify-between rounded-xl border border-transparent transition-colors duration-150 hover:border-border-subtle hover:bg-surface-elevated focus-visible:bg-surface-elevated focus-visible:outline-none"
	style="padding: 0 3px 0 10px; pointer-events: auto;"
  class:bg-surface-elevated={active}
  class:border-accent={active}
  class:shadow-sm={active}
  on:click={(e) => handleSelect(e)}
  on:keydown={(e) => e.key === 'Enter' && handleSelect()}
  role="button"
  tabindex="0"
>
	<div class="flex min-w-0 flex-1 overflow-hidden pr-1">
		{#if isEditing}
			<input
				data-testid="title-input"
				bind:this={inputRef}
				bind:value={editTitle}
				on:blur={saveRename}
				on:keydown={handleKeydown}
				on:click|stopPropagation
				class="min-h-[44px] w-full rounded-sm border border-border bg-surface-page px-2 py-1 text-sm font-sans text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent"
			/>
		{:else}
			<div class="truncate px-2 text-[14px] font-sans text-text-primary">
				{conversation.title}
			</div>
		{/if}
	</div>

	<div class="relative flex min-h-[40px] min-w-[40px] flex-shrink-0 items-center justify-center">
		<button
			bind:this={triggerRef}
			class="btn-icon-bare flex min-h-[36px] min-w-[36px] flex-shrink-0 items-center justify-center rounded-lg text-icon-muted opacity-100 transition-colors duration-150 hover:bg-surface-page hover:text-icon-primary hover:opacity-100 focus-visible:bg-surface-page focus-visible:opacity-100 focus-visible:outline-none md:opacity-0 md:group-hover:opacity-100 cursor-pointer"
			class:opacity-100={menuOpen || active}
			class:md:opacity-100={menuOpen || active}
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
				bind:this={menuRef}
				use:portal
				class="conversation-menu z-[9999] overflow-hidden rounded-[0.75rem] border p-[5px]"
				style={`${menuPositionStyle} --conversation-menu-bg: ${menuBaseBackground}; background: ${menuBaseBackground};`}
			>
				<button
					data-testid="rename-option"
					class="conversation-option flex min-h-[38px] w-full items-center px-[3px] py-[3px] text-left text-sm font-sans text-text-primary transition-colors duration-150 focus-visible:outline-none cursor-pointer"
					on:click={startRename}
				>
					<svg class="conversation-option-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 20h9" />
						<path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z" />
					</svg>
					<span>Rename</span>
				</button>
				<button
					data-testid="delete-option"
					class="conversation-option conversation-option-danger flex min-h-[38px] w-full items-center px-[3px] py-[3px] text-left text-sm font-sans text-text-primary transition-colors duration-150 focus-visible:outline-none cursor-pointer"
					on:click={handleDelete}
				>
					<svg class="conversation-option-icon conversation-option-icon-danger" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M3 6h18" />
						<path d="M8 6V4h8v2" />
						<path d="M19 6l-1 14H6L5 6" />
						<path d="M10 11v6" />
						<path d="M14 11v6" />
					</svg>
					<span>Delete</span>
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

<style>
	.conversation-menu {
		border-color: color-mix(in srgb, var(--border-default) 76%, var(--surface-page) 24%);
		isolation: isolate;
		pointer-events: auto;
		box-shadow:
			0 14px 30px rgba(0, 0, 0, 0.14),
			0 1px 0 color-mix(in srgb, var(--border-default) 88%, transparent 12%);
	}

	:global(.dark) .conversation-menu {
		border-color: color-mix(in srgb, var(--border-default) 84%, transparent 16%);
		box-shadow:
			0 16px 32px rgba(0, 0, 0, 0.4),
			0 0 0 1px color-mix(in srgb, var(--border-default) 88%, transparent 12%);
	}

	.conversation-option {
		border: 0;
		border-radius: 0.75rem;
		background: var(--conversation-menu-bg);
		padding-inline: 0.65rem;
		gap: 0.8rem;
	}

	.conversation-option:hover,
	.conversation-option:focus-visible {
		background: rgba(194, 166, 106, 0.24) !important;
	}

	.conversation-option-danger:hover,
	.conversation-option-danger:focus-visible {
		background: rgba(186, 77, 77, 0.14) !important;
	}

	.conversation-option-icon {
		margin-right: 7px;
		color: color-mix(in srgb, var(--surface-overlay) 45%, var(--text-primary) 55%);
	}

	.conversation-option-icon-danger {
		color: color-mix(in srgb, var(--surface-overlay) 45%, var(--text-primary) 55%);
	}

	:global(.dark) .conversation-option:hover,
	:global(.dark) .conversation-option:focus-visible {
		background: rgba(194, 166, 106, 0.3) !important;
	}

	:global(.dark) .conversation-option-danger:hover,
	:global(.dark) .conversation-option-danger:focus-visible {
		background: rgba(186, 77, 77, 0.22) !important;
	}

	:global(.dark) .conversation-option-icon,
	:global(.dark) .conversation-option-icon-danger {
		color: color-mix(in srgb, var(--surface-overlay) 62%, var(--text-primary) 38%);
	}
</style>
