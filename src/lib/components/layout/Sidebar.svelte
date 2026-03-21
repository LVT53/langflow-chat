<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { onDestroy, onMount } from 'svelte';
	import { browser } from '$app/environment';
	import {
		sidebarOpen,
		sidebarCollapsed,
		SIDEBAR_DESKTOP_BREAKPOINT,
		currentConversationId
	} from '$lib/stores/ui';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import ConversationList from '../sidebar/ConversationList.svelte';
	import SearchModal from '../search/SearchModal.svelte';
	import AvatarCircle from '../ui/AvatarCircle.svelte';
	import type { ConversationListItem, SessionUser } from '$lib/types';

	export let open = false;
	export let conversationsData: ConversationListItem[] = [];
	export let user: SessionUser | null = null;

	const dispatch = createEventDispatcher();
	let isDesktop = browser ? window.innerWidth >= SIDEBAR_DESKTOP_BREAKPOINT : false;
	let showSearchModal = false;
	let transitionsEnabled = false;

	$: isCollapsed = isDesktop && $sidebarCollapsed;

	async function handleNewConversation() {
		dispatch('new-conversation');
		// Store current conversation ID to trigger landing page animation
		const currentId = $currentConversationId;
		if (currentId && typeof window !== 'undefined') {
			window.sessionStorage.setItem('previous-conversation-id', currentId);
		}
		currentConversationId.set(null);
		await goto('/');

		if (window.innerWidth < SIDEBAR_DESKTOP_BREAKPOINT) {
			sidebarOpen.set(false);
		}
	}

	function openSearchModal() {
		showSearchModal = true;
	}

	function closeSearchModal() {
		showSearchModal = false;
	}

	function toggleCollapse() {
		if (isDesktop) {
			sidebarCollapsed.update((v) => !v);
		}
	}

	async function handleLogout() {
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
			goto('/login');
		} catch (error) {
			console.error('Logout failed:', error);
		}
	}

	onMount(() => {
		const syncViewportState = () => {
			isDesktop = window.innerWidth >= SIDEBAR_DESKTOP_BREAKPOINT;
		};

		syncViewportState();
		requestAnimationFrame(() => {
			transitionsEnabled = true;
		});
		window.addEventListener('resize', syncViewportState);

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
	class:transitions-enabled={transitionsEnabled}
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
			<div class="flex flex-col gap-1.5">
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
					class="btn-secondary flex w-full items-center justify-center gap-2 rounded-lg px-4 text-sm"
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

	<div class="flex-1 overflow-y-auto py-sm" class:px-md={!isCollapsed} class:px-1={isCollapsed} style="pointer-events: auto;">
		{#if !isCollapsed}
			<ConversationList initialConversations={conversationsData} />
		{/if}
	</div>

	<div
		class="shrink-0 border-t border-border py-sm"
		class:px-lg={!isCollapsed}
		class:px-0={isCollapsed}
	>
		<div class="flex flex-col">
			<!-- Profile / Settings button -->
			<button
				type="button"
				class="btn-ghost flex w-full items-center rounded-lg py-1.5 text-sm text-text-secondary hover:text-text-primary"
				class:justify-start={!isCollapsed}
				class:justify-center={isCollapsed}
				class:gap-3={!isCollapsed}
				class:px-3={!isCollapsed}
				on:click={() => goto('/settings')}
				title={isCollapsed ? 'Settings' : ''}
				aria-label="Open settings"
			>
				<AvatarCircle
					userId={user?.id ?? 'default'}
					name={user?.displayName ?? null}
					avatarId={user?.avatarId ?? null}
					size={28}
				/>
				{#if !isCollapsed}
					<div class="min-w-0 flex-1 text-left">
						<div class="truncate text-sm font-medium text-text-primary">{user?.displayName ?? 'Profile'}</div>
						<div class="truncate text-xs text-text-muted">{user?.email ?? ''}</div>
					</div>
				{/if}
			</button>
			<button
				type="button"
				class="btn-ghost flex w-full items-center rounded-lg py-1.5 text-sm text-text-secondary hover:text-danger"
				class:justify-start={!isCollapsed}
				class:justify-center={isCollapsed}
				class:gap-3={!isCollapsed}
				class:px-3={!isCollapsed}
				on:click={handleLogout}
				title={isCollapsed ? "Logout" : ""}
				aria-label="Logout"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
					<polyline points="16 17 21 12 16 7"></polyline>
					<line x1="21" y1="12" x2="9" y2="12"></line>
				</svg>
				{#if !isCollapsed}
					<span>Logout</span>
				{/if}
			</button>
		</div>
	</div>
</aside>

<SearchModal isOpen={showSearchModal} onClose={closeSearchModal} />

<style>
	.sidebar-panel {
		max-width: 100vw;
		width: 100vw;
		transition: none;
		will-change: transform, width, opacity;
	}

	.sidebar-panel.transitions-enabled {
		transition:
			width 240ms cubic-bezier(0.22, 1, 0.36, 1),
			transform 240ms cubic-bezier(0.22, 1, 0.36, 1),
			opacity 180ms cubic-bezier(0.22, 1, 0.36, 1),
			background-color 150ms cubic-bezier(0.4, 0, 0.2, 1),
			border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
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
			width: 288px;
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
