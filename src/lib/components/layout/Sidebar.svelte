<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { onDestroy, onMount } from 'svelte';
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
	let previousFocus: HTMLElement | null = null;
	let searchLoading = false;
	const focusableSelector =
		'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

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
		previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		searchQuery = '';
		showSearchModal = true;
		setTimeout(() => {
			searchInputRef?.focus();
		}, 0);

		if ($conversations.length === 0) {
			searchLoading = true;
			try {
				await loadConversations();
			} catch (error) {
				console.error('Failed to load conversations for search modal:', error);
			} finally {
				searchLoading = false;
			}
		}
	}

	function closeSearchModal() {
		showSearchModal = false;
		searchQuery = '';
		searchLoading = false;
		previousFocus?.focus();
		previousFocus = null;
	}

	function handleSearchBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			closeSearchModal();
		}
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (!showSearchModal) return;

		if (event.key === 'Escape') {
			event.preventDefault();
			closeSearchModal();
			return;
		}

		if (event.key === 'Tab') {
			const focusableElements = modalRef?.querySelectorAll<HTMLElement>(focusableSelector);
			if (!focusableElements || focusableElements.length === 0) return;

			const firstElement = focusableElements[0];
			const lastElement = focusableElements[focusableElements.length - 1];

			if (event.shiftKey && document.activeElement === firstElement) {
				event.preventDefault();
				lastElement.focus();
			} else if (!event.shiftKey && document.activeElement === lastElement) {
				event.preventDefault();
				firstElement.focus();
			}
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

	$: {
		if (typeof document !== 'undefined') {
			document.body.style.overflow = showSearchModal ? 'hidden' : '';
		}
	}

	onDestroy(() => {
		if (typeof document !== 'undefined' && document.body.style.overflow === 'hidden') {
			document.body.style.overflow = '';
		}
	});
</script>

<svelte:window on:keydown={handleWindowKeydown} />

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
			<div class="flex flex-col gap-4">
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
					class="btn-secondary flex w-full items-center justify-start gap-2 rounded-lg px-4 text-sm"
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
		class="search-modal-backdrop fixed inset-0 z-[80] flex items-center justify-center p-4"
		on:click={handleSearchBackdropClick}
		transition:fade={{ duration: 180 }}
	>
		<div
			bind:this={modalRef}
			role="dialog"
			aria-modal="true"
			aria-labelledby="search-dialog-title"
			tabindex="-1"
			class="search-modal w-full max-w-[560px] overflow-hidden rounded-[1.1rem] border border-border bg-surface-overlay shadow-lg"
			on:click|stopPropagation
		>
			<div class="border-b border-border-subtle px-4 pb-4 pt-5 md:px-5">
				<div class="mb-4 flex items-start justify-between gap-4">
					<div class="min-w-0">
						<h2 id="search-dialog-title" class="text-[20px] font-sans font-semibold leading-[1.3] text-text-primary">
							Search conversations
						</h2>
						<p class="mt-1 text-[14px] font-sans leading-[1.4] text-text-muted">
							Find a thread by title and jump back in.
						</p>
					</div>
					<button
						type="button"
						class="btn-icon-bare search-close-button h-11 w-11 shrink-0 text-icon-muted hover:text-icon-primary"
						on:click={closeSearchModal}
						aria-label="Close search"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" x2="6" y1="6" y2="18"></line>
							<line x1="6" x2="18" y1="6" y2="18"></line>
						</svg>
					</button>
				</div>
				<div class="search-input-shell flex items-center gap-3 rounded-[0.9rem] border border-border bg-surface-page px-3">
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
				</div>
				<div class="mt-3 flex items-center justify-between gap-3">
					<p class="text-[12px] font-sans leading-[1.4] text-text-muted">
						{normalizedSearchQuery ? `${searchResults.length} result${searchResults.length === 1 ? '' : 's'}` : 'Recent conversations'}
					</p>
					<div class="search-kbd-hint rounded-full px-3 py-1 text-[12px] font-sans text-text-muted">
						Esc to close
					</div>
				</div>
			</div>

			<div class="max-h-[420px] overflow-y-auto px-3 py-3 md:px-4">
				{#if searchLoading}
					<div class="flex flex-col items-center justify-center px-5 py-12 text-center">
						<div class="search-empty-icon mb-4 flex h-12 w-12 items-center justify-center rounded-full">
							<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" class="animate-pulse text-icon-muted">
								<circle cx="11" cy="11" r="7"></circle>
								<path d="m20 20-3.5-3.5"></path>
							</svg>
						</div>
						<h3 class="text-[15px] font-sans text-text-primary">Loading conversations</h3>
						<p class="mt-2 max-w-[28ch] text-[14px] font-sans leading-[1.4] text-text-muted">
							Hang on while your recent threads are fetched.
						</p>
					</div>
				{:else if searchResults.length === 0}
					<div class="flex flex-col items-center justify-center px-5 py-12 text-center">
						<div class="search-empty-icon mb-4 flex h-12 w-12 items-center justify-center rounded-full">
							<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" class="text-icon-muted">
								<circle cx="11" cy="11" r="7"></circle>
								<path d="m20 20-3.5-3.5"></path>
							</svg>
						</div>
						<h3 class="text-[15px] font-sans text-text-primary">No conversations found</h3>
						<p class="mt-2 max-w-[28ch] text-[14px] font-sans leading-[1.4] text-text-muted">
							Try a different title or create a new chat to start fresh.
						</p>
					</div>
				{:else}
					{#each searchResults as conversation (conversation.id)}
						<button
							type="button"
							class="search-result-row flex w-full items-center rounded-[0.95rem] px-3 py-3 text-left transition-colors duration-150 hover:bg-surface-page"
							class:search-result-row-active={conversation.id === $currentConversationId}
							on:click={() => handleSearchSelection(conversation.id)}
						>
							<div class="min-w-0 flex-1">
								<div class="truncate text-[15px] font-sans text-text-primary">
									{conversation.title}
								</div>
								<div class="mt-1 text-[12px] font-sans text-text-muted">
									{conversation.id === $currentConversationId ? 'Current conversation' : 'Open conversation'}
								</div>
							</div>
							<div class="ml-3 text-icon-muted">
								<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
									<path d="m9 18 6-6-6-6"></path>
								</svg>
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
		background:
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--surface-overlay) 92%, var(--surface-page) 8%) 0%,
				var(--surface-overlay) 100%
			);
		border-color: color-mix(in srgb, var(--border-default) 76%, var(--surface-page) 24%);
		box-shadow:
			0 22px 52px rgba(0, 0, 0, 0.18),
			0 1px 0 color-mix(in srgb, var(--border-default) 85%, transparent 15%);
	}

	.search-modal-backdrop {
		background: color-mix(in srgb, var(--surface-overlay) 65%, transparent 35%);
		backdrop-filter: blur(14px);
	}

	.search-input-shell {
		background: color-mix(in srgb, var(--surface-elevated) 82%, var(--surface-page) 18%);
		border-color: color-mix(in srgb, var(--border-default) 72%, transparent 28%);
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--border-default) 88%, transparent 12%),
			var(--shadow-sm);
	}

	.search-input-shell:focus-within {
		border-color: var(--border-focus);
		box-shadow:
			0 0 0 2px var(--focus-ring),
			0 1px 0 color-mix(in srgb, var(--border-default) 88%, transparent 12%),
			var(--shadow-sm);
	}

	.search-kbd-hint {
		background: color-mix(in srgb, var(--surface-elevated) 84%, var(--surface-page) 16%);
		border: 1px solid color-mix(in srgb, var(--border-default) 78%, transparent 22%);
	}

	.search-empty-icon {
		background: color-mix(in srgb, var(--surface-elevated) 84%, var(--surface-page) 16%);
		border: 1px solid color-mix(in srgb, var(--border-default) 72%, transparent 28%);
	}

	.search-result-row + .search-result-row {
		margin-top: 2px;
	}

	.search-result-row {
		border: 1px solid transparent;
	}

	.search-result-row:hover,
	.search-result-row:focus-visible {
		background: color-mix(in srgb, var(--surface-page) 72%, var(--surface-overlay) 28%);
		border-color: color-mix(in srgb, var(--border-default) 70%, transparent 30%);
		outline: none;
	}

	.search-result-row-active {
		background: color-mix(in srgb, var(--accent) 10%, var(--surface-page) 90%);
		border-color: color-mix(in srgb, var(--accent) 28%, var(--border-default) 72%);
	}

	.search-close-button {
		border-radius: 9999px;
	}

	:global(.dark) .search-modal {
		background:
			linear-gradient(
				180deg,
				color-mix(in srgb, var(--surface-overlay) 94%, #3a3a3a 6%) 0%,
				var(--surface-overlay) 100%
			);
		border-color: color-mix(in srgb, var(--border-default) 84%, transparent 16%);
		box-shadow:
			0 24px 56px rgba(0, 0, 0, 0.42),
			0 1px 0 color-mix(in srgb, var(--border-default) 92%, transparent 8%),
			0 0 0 1px color-mix(in srgb, var(--accent) 10%, transparent 90%);
	}

	:global(.dark) .search-modal-backdrop {
		background: color-mix(in srgb, var(--surface-page) 76%, transparent 24%);
	}

	:global(.dark) .search-input-shell {
		background: color-mix(in srgb, var(--surface-overlay) 88%, #3a3a3a 12%);
		box-shadow:
			0 1px 0 color-mix(in srgb, var(--border-default) 92%, transparent 8%),
			0 14px 30px rgba(0, 0, 0, 0.22);
	}

	:global(.dark) .search-kbd-hint,
	:global(.dark) .search-empty-icon {
		background: color-mix(in srgb, var(--surface-elevated) 82%, var(--surface-page) 18%);
		border-color: color-mix(in srgb, var(--border-default) 84%, transparent 16%);
	}

	:global(.dark) .search-result-row:hover,
	:global(.dark) .search-result-row:focus-visible {
		background: color-mix(in srgb, var(--surface-page) 30%, var(--surface-overlay) 70%);
		border-color: color-mix(in srgb, var(--border-default) 84%, transparent 16%);
	}

	:global(.dark) .search-result-row-active {
		background: color-mix(in srgb, var(--accent) 14%, var(--surface-overlay) 86%);
		border-color: color-mix(in srgb, var(--accent) 34%, var(--border-default) 66%);
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
