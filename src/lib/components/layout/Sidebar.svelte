<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { sidebarOpen, currentConversationId } from '$lib/stores/ui';
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
	class="sidebar-panel fixed inset-y-0 left-0 z-50 flex h-screen flex-col border-r border-border bg-surface-overlay shadow-lg transition-transform duration-[var(--duration-standard)] ease-out w-[280px] max-w-[100vw] lg:w-[260px]"
	class:-translate-x-[105%]={!open}
	class:translate-x-0={open}
>
	<div class="mobile-close-header flex h-[48px] items-center px-2">
		<!-- Mobile close button -->
		<button
			class="ml-auto inline-flex shrink-0 min-h-[44px] min-w-[44px] p-sm items-center justify-center rounded-md text-icon-muted hover:bg-surface-elevated hover:text-icon-primary transition-colors duration-250 cursor-pointer"
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

	<div class="p-4">
<button
	data-testid="new-conversation"
	class="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-md py-sm text-sm font-medium font-sans text-surface-page transition-colors duration-250 hover:bg-accent-hover focus:outline-none focus:ring-2 focus:ring-focus-ring min-h-[44px] cursor-pointer"
	on:click={handleNewConversation}
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
				<line x1="12" x2="12" y1="5" y2="19" />
				<line x1="5" x2="19" y1="12" y2="12" />
			</svg>
			New chat
		</button>
	</div>

	<div class="flex-1 overflow-y-auto px-4 py-2">
		<ConversationList />
	</div>
</aside>

<style>
	.sidebar-panel {
		max-width: 100vw;
	}

	@media (min-width: 1024px) {
		.sidebar-panel {
			position: static !important;
			transform: translateX(0) !important;
		}

		.mobile-overlay {
			display: none !important;
		}

		.mobile-close-header {
			display: none !important;
		}
	}
</style>
