<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { sidebarOpen, sidebarCollapsed, currentConversationId } from '$lib/stores/ui';
	import { createNewConversation } from '$lib/stores/conversations';
	import { goto } from '$app/navigation';
	import { fade } from 'svelte/transition';
	import ConversationList from '../sidebar/ConversationList.svelte';

	export let open = false;

	const dispatch = createEventDispatcher();

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
		
		if (window.innerWidth < 1024) {
			sidebarOpen.set(false);
		}
	}

	function toggleCollapse() {
		sidebarCollapsed.update(v => !v);
	}
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
	class="sidebar-panel fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-border bg-surface-overlay shadow-lg transition-all duration-[var(--duration-emphasis)] ease-out max-w-[100vw]"
	class:-translate-x-[105%]={!open}
	class:translate-x-0={open}
	class:sidebar-collapsed={$sidebarCollapsed}
>
	<!-- Sidebar Header: Title + Collapse button (desktop) / Close button (mobile) -->
	<div class="sidebar-header flex h-[56px] items-center justify-between px-md border-b border-border shrink-0">
		<!-- AlfyAI Title (hidden when collapsed) -->
		{#if !$sidebarCollapsed}
			<div class="text-[16px] font-sans font-bold tracking-tight text-text-primary whitespace-nowrap overflow-hidden transition-opacity duration-250">
				AlfyAI
			</div>
		{/if}

		<!-- Desktop: Collapse/Expand toggle -->
		<button
			class="desktop-only ml-auto inline-flex shrink-0 min-h-[36px] min-w-[36px] items-center justify-center rounded-md text-icon-muted hover:bg-surface-elevated hover:text-icon-primary transition-colors duration-250 cursor-pointer"
			on:click={toggleCollapse}
			aria-label={$sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
			title={$sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			{#if $sidebarCollapsed}
				<!-- Chevron right (expand) -->
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="9 18 15 12 9 6" />
				</svg>
			{:else}
				<!-- Chevron left (collapse) -->
				<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<polyline points="15 18 9 12 15 6" />
				</svg>
			{/if}
		</button>

		<!-- Mobile: Close button -->
		<button
			class="mobile-only ml-auto inline-flex shrink-0 min-h-[44px] min-w-[44px] p-sm items-center justify-center rounded-md text-icon-muted hover:bg-surface-elevated hover:text-icon-primary transition-colors duration-250 cursor-pointer"
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
	<div class="px-md py-md shrink-0">
		{#if $sidebarCollapsed}
			<!-- Icon-only when collapsed -->
			<button
				data-testid="new-conversation"
				class="flex w-full items-center justify-center rounded-md bg-accent p-sm text-surface-page transition-colors duration-250 hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-focus-ring min-h-[44px] cursor-pointer"
				on:click={handleNewConversation}
				title="New chat"
				aria-label="New chat"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" x2="12" y1="5" y2="19" />
					<line x1="5" x2="19" y1="12" y2="12" />
				</svg>
			</button>
		{:else}
			<!-- Full button when expanded -->
			<button
				data-testid="new-conversation"
				class="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-md py-sm text-sm font-medium font-sans text-surface-page transition-colors duration-250 hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-focus-ring min-h-[44px] cursor-pointer"
				on:click={handleNewConversation}
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" x2="12" y1="5" y2="19" />
					<line x1="5" x2="19" y1="12" y2="12" />
				</svg>
				New chat
			</button>
		{/if}
	</div>

	<!-- Conversation List -->
	<div class="flex-1 overflow-y-auto px-md py-sm">
		{#if !$sidebarCollapsed}
			<ConversationList />
		{/if}
	</div>
</aside>

<style>
	.sidebar-panel {
		max-width: 100vw;
		width: 280px;
	}

	.sidebar-panel.sidebar-collapsed {
		width: 64px;
	}

	@media (min-width: 1024px) {
		.sidebar-panel {
			position: static !important;
			transform: translateX(0) !important;
			width: 260px;
		}

		.sidebar-panel.sidebar-collapsed {
			width: 64px;
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
