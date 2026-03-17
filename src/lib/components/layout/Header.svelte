<script lang="ts">
	import { goto } from '$app/navigation';
	import { sidebarOpen, currentConversationId } from '$lib/stores/ui';
	import { createNewConversation } from '$lib/stores/conversations';
	import type { SessionUser } from '$lib/types';
	import ThemeToggle from './ThemeToggle.svelte';

	export let user: SessionUser | null = null;

	async function handleLogout() {
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
			goto('/login');
		} catch (error) {
			console.error('Logout failed:', error);
		}
	}

	function toggleSidebar() {
		sidebarOpen.update((open) => !open);
	}

	async function handleNewConversation() {
		try {
			const id = await createNewConversation();
			currentConversationId.set(id);
			goto(`/chat/${id}`);
			
			// Close sidebar on mobile if open
			if (window.innerWidth < 1024) {
				sidebarOpen.set(false);
			}
		} catch (error) {
			console.error('Failed to create new conversation:', error);
			alert('Failed to create new conversation. Please try again.');
		}
	}
</script>

<header
	class="grid grid-cols-[1fr_auto_1fr] flex-none w-full max-w-full h-[48px] md:h-[56px] lg:h-[64px] items-center border-b border-border bg-surface-page px-safe pt-safe shrink-0 z-10 gap-2 md:gap-4 box-border"
>
	<div class="flex min-w-0 items-center justify-start gap-sm">
		<button
			class="inline-flex shrink-0 min-h-[44px] min-w-[44px] p-sm items-center justify-center rounded-md hover:bg-surface-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring hide-on-desktop text-icon-muted hover:text-icon-primary transition-colors duration-250 cursor-pointer"
			on:click={toggleSidebar}
			aria-label="Toggle sidebar"
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
				<line x1="3" x2="21" y1="6" y2="6" />
				<line x1="3" x2="21" y1="12" y2="12" />
				<line x1="3" x2="21" y1="18" y2="18" />
			</svg>
		</button>
	</div>
    
	<div class="flex items-center justify-center px-2">
		<div class="text-[16px] md:text-xl font-sans font-bold tracking-tight text-text-primary whitespace-nowrap">AlfyAI</div>
	</div>

	<div class="flex min-w-0 items-center justify-end gap-sm md:gap-md">
		<ThemeToggle />
		<button
			class="inline-flex shrink-0 min-h-[44px] min-w-[44px] p-sm items-center justify-center rounded-md hover:bg-surface-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring text-icon-muted hover:text-icon-primary hide-on-desktop-md transition-colors duration-250"
			on:click={handleNewConversation}
			aria-label="New chat"
			title="New chat"
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
		</button>
		{#if user}
			<span class="text-[14px] font-sans text-text-muted hide-on-mobile truncate max-w-[150px]">
				{user.displayName}
			</span>
		{/if}
		<button
			class="inline-flex shrink-0 min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-surface-elevated p-sm md:px-md md:py-sm text-[14px] font-medium font-sans text-text-primary hover:bg-surface-overlay border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring transition-colors duration-250"
			data-testid="logout-button"
			on:click={handleLogout}
			aria-label="Logout"
			title="Logout"
		>
			<span class="hide-on-mobile">Logout</span>
			<svg class="hide-on-desktop-md" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
				<polyline points="16 17 21 12 16 7"></polyline>
				<line x1="21" y1="12" x2="9" y2="12"></line>
			</svg>
		</button>
	</div>
</header>

<style>
	@media (max-width: 767px) {
		.hide-on-mobile {
			display: none !important;
		}
	}
	@media (min-width: 768px) {
		.hide-on-desktop-md {
			display: none !important;
		}
	}
	@media (min-width: 1024px) {
		.hide-on-desktop {
			display: none !important;
		}
	}
</style>
