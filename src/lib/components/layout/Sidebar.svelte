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
	import type { ConversationListItem, SessionUser, Project } from '$lib/types';
	import { avatarState } from '$lib/stores/avatar';

	export let open = false;
	export let conversationsData: ConversationListItem[] = [];
	export let projectsData: Project[] = [];
	export let user: SessionUser | null = null;

	const dispatch = createEventDispatcher();
	let isDesktop = browser ? window.innerWidth >= SIDEBAR_DESKTOP_BREAKPOINT : false;
	let showSearchModal = false;
	let transitionsEnabled = false;

	$: isCollapsed = isDesktop && $sidebarCollapsed;

	async function handleNewConversation() {
		dispatch('new-conversation');
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

	function navigateAndClose(path: string) {
		if (window.innerWidth < SIDEBAR_DESKTOP_BREAKPOINT) {
			sidebarOpen.set(false);
		}
		goto(path);
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
	class="sidebar-panel fixed inset-y-0 left-0 z-50 flex h-[100dvh] max-w-[100vw] flex-col border-r border-border bg-surface-overlay shadow-lg"
	class:-translate-x-[105%]={!open}
	class:translate-x-0={open}
	class:opacity-0={!open && !isDesktop}
	class:opacity-100={open || isDesktop}
	class:pointer-events-none={!open && !isDesktop}
	class:sidebar-collapsed={isCollapsed}
	class:transitions-enabled={transitionsEnabled}
>
	<!-- Sidebar Header -->
	<div
		class="sidebar-header flex h-[64px] shrink-0 items-center border-b border-border"
		class:justify-between={!isCollapsed}
		class:justify-center={isCollapsed}
		class:px-3={!isCollapsed}
		class:px-0={isCollapsed}
	>
		{#if !isCollapsed}
			<div class="overflow-hidden whitespace-nowrap text-[20px] font-sans font-semibold tracking-[-0.03em] text-text-primary opacity-90 transition-opacity duration-150">
				AlfyAI
			</div>
		{/if}

		<!-- Desktop: Collapse/Expand toggle -->
		<button
			class="desktop-only btn-icon-bare compose-btn"
			class:ml-auto={!isCollapsed}
			on:click={toggleCollapse}
			aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
			title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			{#if isCollapsed}
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="9 18 15 12 9 6" />
				</svg>
			{:else}
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
			<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="18" x2="6" y1="6" y2="18" />
				<line x1="6" x2="18" y1="6" y2="18" />
			</svg>
		</button>
	</div>

	<!-- Search + New Chat -->
	<div class="shrink-0 py-2" class:px-3={!isCollapsed} class:px-0={isCollapsed}>
		{#if isCollapsed}
			<!-- Icon-only when collapsed -->
			<div class="flex w-full flex-col items-center gap-2">
				<button
					data-testid="new-conversation"
					class="compose-btn flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-accent transition-colors duration-150 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
					on:click={handleNewConversation}
					title="New chat"
					aria-label="New chat"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
						<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
						<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
					</svg>
				</button>
				<button
					type="button"
					class="compose-btn flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-icon-muted transition-colors duration-150 hover:text-icon-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
			<!-- Expanded: search pill + compose icon in a single row -->
			<div class="flex items-center gap-2">
				<!-- Search pill -->
				<button
					type="button"
					class="search-pill flex flex-1 cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm text-text-muted transition-colors duration-150 hover:border-border-focus hover:bg-surface-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
					on:click={openSearchModal}
					aria-label="Search conversations"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-icon-muted">
						<circle cx="11" cy="11" r="7"></circle>
						<path d="m20 20-3.5-3.5"></path>
					</svg>
					<span class="flex-1 truncate">Search</span>
				</button>
				<!-- New chat compose button -->
				<button
					data-testid="new-conversation"
					class="compose-btn flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-accent transition-colors duration-150 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
					on:click={handleNewConversation}
					title="New chat"
					aria-label="New chat"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
						<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
						<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
					</svg>
				</button>
			</div>
		{/if}
	</div>

	<!-- Conversation list -->
	<div class="flex-1 overflow-y-auto py-sm" class:px-sm={!isCollapsed} class:px-1={isCollapsed} style="pointer-events: auto;">
		{#if !isCollapsed}
			<ConversationList
				initialConversations={conversationsData}
				initialProjects={projectsData}
			/>
		{/if}
	</div>

	<!-- Bottom: Profile + Logout -->
	<div class="shrink-0 border-t border-border py-sm" class:px-0={isCollapsed} class:px-3={!isCollapsed}>
		{#if isCollapsed}
			<!-- Collapsed: two stacked icons with doubled gap -->
			<div class="flex flex-col items-center gap-2">
				<button
					type="button"
					class="profile-btn flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
					on:click={() => navigateAndClose('/settings')}
					title="Settings"
					aria-label="Open settings"
				>
					<AvatarCircle
						userId={user?.id ?? 'default'}
						name={user?.displayName ?? null}
						avatarId={user?.avatarId ?? null}
						profilePicture={$avatarState.profilePicture}
					cacheBuster={$avatarState.cacheBuster}
						size={22}
					/>
				</button>
				<button
					type="button"
					class="logout-btn flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-icon-muted transition-colors duration-150 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
					on:click={handleLogout}
					title="Logout"
					aria-label="Logout"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
						<polyline points="16 17 21 12 16 7"></polyline>
						<line x1="21" y1="12" x2="9" y2="12"></line>
					</svg>
				</button>
			</div>
		{:else}
			<!-- Expanded: profile info (→ settings) + logout icon in one row -->
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="profile-btn flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-1.5 py-1.5 text-sm text-text-secondary transition-colors duration-150 hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
					on:click={() => navigateAndClose('/settings')}
					aria-label="Open settings"
				>
					<AvatarCircle
						userId={user?.id ?? 'default'}
						name={user?.displayName ?? null}
						avatarId={user?.avatarId ?? null}
						profilePicture={$avatarState.profilePicture}
					cacheBuster={$avatarState.cacheBuster}
						size={28}
					/>
					<div class="min-w-0 flex-1 text-left">
						<div class="truncate text-sm font-medium text-text-primary">{user?.displayName ?? 'Profile'}</div>
						<div class="truncate text-xs text-text-muted">{user?.email ?? ''}</div>
					</div>
				</button>
				<button
					type="button"
					class="logout-btn flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-icon-muted transition-colors duration-150 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
					on:click={handleLogout}
					title="Logout"
					aria-label="Logout"
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
						<polyline points="16 17 21 12 16 7"></polyline>
						<line x1="21" y1="12" x2="9" y2="12"></line>
					</svg>
				</button>
			</div>
		{/if}
	</div>
</aside>

<SearchModal isOpen={showSearchModal} onClose={closeSearchModal} />

<style>
	.sidebar-panel {
		max-width: 100vw;
		width: 100vw;
		transition: none;
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

	.search-pill {
		background: color-mix(in srgb, var(--surface-elevated) 60%, var(--surface-overlay) 40%);
	}

	.search-pill:hover {
		background: var(--surface-page);
	}

	.compose-btn {
		border: 1px solid transparent;
	}

	.compose-btn:hover {
		background: color-mix(in srgb, var(--border-default) 18%, transparent 82%);
		border-color: var(--border-default);
	}

	.logout-btn {
		border: 1px solid transparent;
	}

	.logout-btn:hover {
		background: color-mix(in srgb, var(--border-default) 18%, transparent 82%);
		border-color: var(--border-default);
	}

	.profile-btn {
		border: 1px solid transparent;
		border-radius: 0.5rem;
	}

	.profile-btn:hover {
		background: color-mix(in srgb, var(--border-default) 18%, transparent 82%);
		border-color: var(--border-default);
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
			width: 300px;
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
