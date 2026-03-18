<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { onMount } from 'svelte';
	import {
		sidebarOpen,
		sidebarCollapsed,
		currentConversationId,
		SIDEBAR_DESKTOP_BREAKPOINT
	} from '$lib/stores/ui';
	import { conversations, createNewConversation, loadConversations } from '$lib/stores/conversations';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import ConversationList from '../sidebar/ConversationList.svelte';

	export let open = false;

	const dispatch = createEventDispatcher();
	let isDesktop = false;
	let showSearchModal = false;
	let searchQuery = '';
	let modalRef: HTMLDivElement;
	let searchInputRef: HTMLInputElement;

	$: isCollapsed = isDesktop && $sidebarCollapsed;
	$: normalizedSearchQuery = searchQuery.trim().toLowerCase();
	$: searchableConversations = $conversations;
	$: searchResults = normalizedSearchQuery
		? searchableConversations.filter((conversation) =>
				conversation.title.toLowerCase().includes(normalizedSearchQuery)
			)
		: searchableConversations.slice(0, 7);

	async function handleNewConversation() {
		dispatch('new-conversation');
		
		try {
			const id = await createNewConversation();
			currentConversationId.set(id);
			goto(`/chat/${id}`);
		} catch (error) {
			console.error('Failed to create new conversation:', error);
			alert('Failed to create new conversation. Please try again.');
		}
		
		if (window.innerWidth < SIDEBAR_DESKTOP_BREAKPOINT) {
			sidebarOpen.set(false);
		}
	}

	async function openSearchModal() {
		if ($conversations.length === 0) {
			await loadConversations();
		}
		searchQuery = '';
		showSearchModal = true;
		setTimeout(() => {
			searchInputRef?.focus();
		}, 0);
	}

	function closeSearchModal() {
		showSearchModal = false;
		searchQuery = '';
	}

	function handleSearchBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			closeSearchModal();
		}
	}

	async function handleSearchSelection(id: string) {
		currentConversationId.set(id);
		closeSearchModal();
		await goto(`/chat/${id}`);
		if (window.innerWidth < SIDEBAR_DESKTOP_BREAKPOINT) {
			sidebarOpen.set(false);
		}
	}

	function toggleCollapse() {
		if (isDesktop) {
			sidebarCollapsed.update((v) => !v);
		}
	}

	onMount(() => {
		const syncViewportState = () => {
			isDesktop = window.innerWidth >= SIDEBAR_DESKTOP_BREAKPOINT;
		};

		syncViewportState();
		window.addEventListener('resize', syncViewportState);
		loadConversations().catch((error) => {
			console.error('Failed to load conversations for sidebar controls:', error);
		});

		return () => window.removeEventListener('resize', syncViewportState);
	});
</script>

<!-- Mobile Overlay -->
{#if open}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="mobile-overlay fixed inset-0 z-40 bg-surface-overlay/50 backdrop-blur-sm"
		transition:fade={{ duration: 250 }}
		on:click={() => sidebarOpen.set(false)}
	></div>
{/if}

<!-- Sidebar -->
<aside
	class="sidebar-panel fixed inset-y-0 left-0 z-50 flex h-screen max-w-[100vw] flex-col border-r border-border bg-surface-overlay shadow-lg"
	class:-translate-x-[105%]={!open}
	class:translate-x-0={open}
	class:opacity-0={!open && !isDesktop}
	class:opacity-100={open || isDesktop}
	class:pointer-events-none={!open && !isDesktop}
	class:sidebar-collapsed={isCollapsed}
>
	<!-- Sidebar Header: Title + Collapse button (desktop) / Close button (mobile) -->
	<div
		class="sidebar-header flex h-[64px] shrink-0 items-center border-b border-border"
		class:justify-between={!isCollapsed}
		class:justify-center={isCollapsed}
		class:px-lg={!isCollapsed}
		class:px-0={isCollapsed}
	>
		<!-- AlfyAI Title (hidden when collapsed) -->
		{#if !isCollapsed}
			<div class="overflow-hidden whitespace-nowrap text-[20px] font-sans font-semibold tracking-[-0.03em] text-text-primary opacity-90 transition-opacity duration-150">
				AlfyAI
			</div>
		{/if}

		<!-- Desktop: Collapse/Expand toggle -->
		<button
			class="desktop-only btn-icon-bare sidebar-rail-button"
			class:ml-auto={!isCollapsed}
			on:click={toggleCollapse}
			aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
			title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			{#if isCollapsed}
				<!-- Chevron right (expand) -->
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="9 18 15 12 9 6" />
				</svg>
			{:else}
				<!-- Chevron left (collapse) -->
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15 18 9 12 15 6" />
				</svg>
			{/if}
		</button>

		<!-- Mobile: Close button -->
		<button
			class="mobile-only btn-icon-bare ml-auto"
			on:click={() => sidebarOpen.set(false)}
			aria-label="Close sidebar"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<line x1="18" x2="6" y1="6" y2="18" />
				<line x1="6" x2="18" y1="6" y2="18" />
			</svg>
		</button>
	</div>

	<!-- New Chat Button -->
	<div class="shrink-0 py-md" class:px-lg={!isCollapsed} class:px-0={isCollapsed}>
		{#if isCollapsed}
			<!-- Icon-only when collapsed -->
			<div class="flex w-full flex-col items-center gap-1">
				<button
					data-testid="new-conversation"
					class="btn-icon-bare sidebar-rail-button w-full text-accent hover:text-accent-hover"
					on:click={handleNewConversation}
					title="New chat"
					aria-label="New chat"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="12" x2="12" y1="5" y2="19" />
						<line x1="5" x2="19" y1="12" y2="12" />
					</svg>
				</button>
				<button
					type="button"
					class="btn-icon-bare sidebar-rail-button w-full text-icon-muted hover:text-icon-primary"
					on:click={openSearchModal}
					title="Search"
					aria-label="Search conversations"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="11" cy="11" r="7"></circle>
						<path d="m20 20-3.5-3.5"></path>
					</svg>
				</button>
			</div>
		{:else}
			<!-- Full button when expanded -->
			<div class="flex flex-col gap-2">
				<button
					data-testid="new-conversation"
					class="btn-primary flex w-full items-center justify-center gap-2 rounded-lg text-sm shadow-sm"
					on:click={handleNewConversation}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="12" x2="12" y1="5" y2="19" />
						<line x1="5" x2="19" y1="12" y2="12" />
					</svg>
					New chat
				</button>
				<button
					type="button"
					class="btn-secondary flex w-full items-center justify-start gap-3 rounded-lg px-4 text-sm"
					on:click={openSearchModal}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="11" cy="11" r="7"></circle>
						<path d="m20 20-3.5-3.5"></path>
					</svg>
					<span>Search</span>
				</button>
			</div>
		{/if}
	</div>

	<!-- Conversation List -->
	<div class="flex-1 overflow-y-auto py-sm" class:px-md={!isCollapsed} class:px-1={isCollapsed}>
		{#if !isCollapsed}
			<ConversationList />
		{/if}
	</div>
</aside>

{#if showSearchModal}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 z-[80] flex items-center justify-center bg-surface-overlay/65 p-4 backdrop-blur-sm"
		on:click={handleSearchBackdropClick}
		transition:fade={{ duration: 180 }}
	>
		<div
			bind:this={modalRef}
			class="search-modal w-full max-w-[560px] rounded-[1.1rem] border border-border bg-surface-overlay shadow-lg"
		>
			<div class="border-b border-border-subtle px-4 py-4 md:px-5">
				<div class="flex items-center gap-3 rounded-[0.9rem] border border-border bg-surface-page px-3">
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-icon-muted">
						<circle cx="11" cy="11" r="7"></circle>
						<path d="m20 20-3.5-3.5"></path>
					</svg>
					<input
						bind:this={searchInputRef}
						bind:value={searchQuery}
						type="text"
						placeholder="Search conversations"
						class="h-12 w-full bg-transparent text-[15px] font-sans text-text-primary outline-none placeholder:text-text-muted"
					/>
					<button
						type="button"
						class="btn-icon-bare h-10 w-10 shrink-0 text-icon-muted hover:text-icon-primary"
						on:click={closeSearchModal}
						aria-label="Close search"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" x2="6" y1="6" y2="18"></line>
							<line x1="6" x2="18" y1="6" y2="18"></line>
						</svg>
					</button>
				</div>
			</div>

			<div class="max-h-[420px] overflow-y-auto px-3 py-3 md:px-4">
				{#if searchResults.length === 0}
					<div class="px-3 py-10 text-center text-sm text-text-muted">
						No conversations found
					</div>
				{:else}
					{#each searchResults as conversation (conversation.id)}
						<button
							type="button"
							class="search-result-row flex w-full items-center rounded-[0.95rem] px-3 py-3 text-left transition-colors duration-150 hover:bg-surface-page"
							on:click={() => handleSearchSelection(conversation.id)}
						>
							<div class="min-w-0 flex-1">
								<div class="truncate text-[15px] font-sans text-text-primary">
									{conversation.title}
								</div>
							</div>
						</button>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.sidebar-panel {
		max-width: 100vw;
		width: 100vw;
		transition:
			width 240ms cubic-bezier(0.22, 1, 0.36, 1),
			transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
			opacity 180ms cubic-bezier(0.22, 1, 0.36, 1),
			background-color 150ms cubic-bezier(0.4, 0, 0.2, 1),
			border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
		will-change: transform, width, opacity;
	}

	.sidebar-panel.sidebar-collapsed {
		width: 48px;
		overflow: hidden;
	}

	.sidebar-rail-button {
		min-height: 48px !important;
		min-width: 48px !important;
		border-radius: 0 !important;
	}

	.search-modal {
		box-shadow:
			0 22px 52px rgba(0, 0, 0, 0.18),
			0 1px 0 color-mix(in srgb, var(--border-default) 85%, transparent 15%);
	}

	.search-result-row + .search-result-row {
		margin-top: 2px;
	}

	@media (max-width: 1023px) {
		.sidebar-panel {
			width: 100vw;
		}
	}

	@media (min-width: 1024px) {
		.sidebar-panel {
			position: static !important;
			transform: translateX(0) !important;
			opacity: 1 !important;
			width: 360px;
		}

		.sidebar-panel.sidebar-collapsed {
			width: 48px;
		}

		.mobile-overlay {
			display: none !important;
		}

		.mobile-only {
			display: none !important;
		}

		.desktop-only {
			display: inline-flex !important;
		}
	}

	@media (max-width: 1023px) {
		.desktop-only {
			display: none !important;
		}

		.mobile-only {
			display: inline-flex !important;
		}
	}
</style>
