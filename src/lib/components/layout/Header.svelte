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
	class="flex flex-none h-12 md:h-14 lg:h-16 w-full items-center justify-between border-b border-border bg-surface-page px-safe pt-safe shrink-0 box-content overflow-hidden"
>
	<div class="flex items-center gap-2">
		<button
			class="inline-flex shrink-0 h-11 w-11 items-center justify-center rounded-md hover:bg-surface-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring hide-on-desktop text-icon-primary"
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
    
	<div class="absolute left-1/2 -translate-x-1/2 title-responsive">
		<div class="text-[16px] md:text-xl font-sans font-bold tracking-tight text-text-primary">AlfyAI</div>
	</div>

	<div class="flex items-center gap-2 md:gap-4">
		<ThemeToggle />
		<button
			class="inline-flex shrink-0 h-11 w-11 items-center justify-center rounded-md hover:bg-surface-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring text-icon-muted hover:text-icon-primary hide-on-desktop-md"
			on:click={handleNewConversation}
			aria-label="New chat"
			title="New chat"
		>
			<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
		</button>
		{#if user}
			<span class="text-sm font-sans text-text-muted hide-on-mobile">
				{user.displayName}
			</span>
		{/if}
		<button
			class="inline-flex shrink-0 h-11 items-center justify-center rounded-md bg-surface-elevated px-4 py-2 text-sm font-medium font-sans text-text-primary hover:bg-surface-overlay border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring transition-colors"
			data-testid="logout-button"
			on:click={handleLogout}
		>
			Logout
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
		.title-responsive {
			position: static !important;
			transform: translateX(0) !important;
		}
	}
	@media (min-width: 1024px) {
		.hide-on-desktop {
			display: none !important;
		}
	}
</style>
