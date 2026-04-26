<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { navigating } from '$app/stores';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import Header from '$lib/components/layout/Header.svelte';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import { currentConversationId, sidebarOpen, initUIListeners } from '$lib/stores/ui';
	import {
		conversations,
		loadConversations,
		reconcileConversationSnapshot,
	} from '$lib/stores/conversations';
	import { conversationExists } from '$lib/client/api/conversations';
	import { projects } from '$lib/stores/projects';
	import { initSettings } from '$lib/stores/settings';
	import { initTheme } from '$lib/stores/theme';
	import { initAvatar } from '$lib/stores/avatar';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	// Debounce state for conversation list refresh
	let lastRefreshTime = $state(0);
	const REFRESH_DEBOUNCE_MS = 2000; // 2 seconds minimum between refreshes
	let previousConversationUserId = $state<string | null>(null);

	$effect(() => {
		const nextUserId = data.user?.id ?? null;
		const resetLocalState = previousConversationUserId !== null && previousConversationUserId !== nextUserId;
		reconcileConversationSnapshot(data?.conversations ?? [], {
			resetLocalState,
			userId: nextUserId,
		});
		previousConversationUserId = nextUserId;
	});

	$effect(() => {
		projects.set(data?.projects ?? []);
	});

	$effect(() => {
		if (!browser) return;
		const match = $page.url.pathname.match(/^\/chat\/([^/]+)$/);
		currentConversationId.set(match?.[1] ?? null);
	});

	/**
	 * Refresh conversation list with debounce protection.
	 * Preserves existing list on failure and handles deleted conversation edge case.
	 */
	async function refreshConversations() {
		if (!browser) return;

		const now = Date.now();
		if (now - lastRefreshTime < REFRESH_DEBOUNCE_MS) {
			return; // Skip if within debounce window
		}

		lastRefreshTime = now;

		// Store current conversation state before refresh
		const currentId = $currentConversationId;
		const currentPath = $page.url.pathname;

		try {
			await loadConversations();

			// Edge case: if current conversation was deleted from another device,
			// redirect to landing page. Do not rely solely on the sidebar list:
			// brand-new bootstrap conversations can exist before the list chooses to show them.
			if (currentId && currentPath === `/chat/${currentId}`) {
				const stillExists = $conversations.some(c => c.id === currentId);
				if (!stillExists) {
					const exists = await conversationExists(currentId);
					if (exists === false) {
						goto('/');
					}
				}
			}
		} catch (error) {
			// Silently ignore errors - preserve existing list (stale data is better than empty)
			console.warn('Failed to refresh conversation list:', error);
		}
	}

	/**
	 * Handle visibilitychange event - refresh when tab becomes visible
	 */
	function handleVisibilityChange() {
		if (document.visibilityState === 'visible') {
			refreshConversations();
		}
	}

	/**
	 * Handle focus event - fallback for mobile browsers
	 */
	function handleWindowFocus() {
		refreshConversations();
	}

	onMount(() => {
		initTheme(data.userTheme as 'system' | 'light' | 'dark');
		initSettings({
			model: data.userModel,
			translationEnabled: data.userTranslation,
			titleLanguage: data.userTitleLanguage,
		});
		initAvatar(data.user?.profilePicture ?? null);
		const cleanupUIListeners = initUIListeners();

		// Add event listeners for conversation list refresh
		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('focus', handleWindowFocus);

		return () => {
			cleanupUIListeners();
		};
	});

	onDestroy(() => {
		if (!browser) return;
		document.removeEventListener('visibilitychange', handleVisibilityChange);
		window.removeEventListener('focus', handleWindowFocus);
	});
</script>

<!-- 
  Scroll Ownership: App Root Container
  - h-screen + overflow-hidden locks the app to viewport
  - Scroll is delegated to child components (Sidebar list, MessageArea)
  - See SCROLL OWNERSHIP CONTRACT in src/app.css
-->
<div class="flex h-[100dvh] w-full flex-col overflow-hidden bg-primary text-text-primary">
	<Header />

	<div class="flex h-full flex-1 overflow-hidden">
		<Sidebar open={$sidebarOpen} conversationsData={data?.conversations ?? []} projectsData={data?.projects ?? []} user={data?.user} />

		<main class="relative flex h-full flex-1 flex-col overflow-hidden min-w-0 pl-12">
			{#if $navigating}
				<div class="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 overflow-hidden">
					<div class="route-progress h-full w-1/3 rounded-full bg-accent/80"></div>
				</div>
			{/if}
			{@render children()}
		</main>
	</div>
</div>

<style>
	@keyframes route-progress-slide {
		0% {
			transform: translateX(-120%) scaleX(0.7);
			opacity: 0.35;
		}
		50% {
			transform: translateX(60%) scaleX(1);
			opacity: 0.9;
		}
		100% {
			transform: translateX(280%) scaleX(0.8);
			opacity: 0.35;
		}
	}

	.route-progress {
		animation: route-progress-slide 1s ease-in-out infinite;
	}

	@media (prefers-reduced-motion: reduce) {
		.route-progress {
			width: 100%;
			animation: none;
			opacity: 0.85;
		}
	}
</style>
