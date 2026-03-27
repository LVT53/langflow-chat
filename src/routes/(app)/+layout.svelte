<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { navigating } from '$app/stores';
	import { browser } from '$app/environment';
	import Header from '$lib/components/layout/Header.svelte';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import { currentConversationId, sidebarOpen } from '$lib/stores/ui';
	import { conversations } from '$lib/stores/conversations';
	import { projects } from '$lib/stores/projects';
	import { initSettings } from '$lib/stores/settings';
	import { initTheme } from '$lib/stores/theme';
	import { initAvatar } from '$lib/stores/avatar';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	$effect(() => {
		conversations.set(data.conversations ?? []);
	});

	$effect(() => {
		projects.set(data.projects ?? []);
	});

	$effect(() => {
		if (!browser) return;
		const match = $page.url.pathname.match(/^\/chat\/([^/]+)$/);
		currentConversationId.set(match?.[1] ?? null);
	});

	onMount(() => {
		initTheme(data.userTheme as 'system' | 'light' | 'dark');
		initSettings({
			model: data.userModel as 'model1' | 'model2',
			translationEnabled: data.userTranslation,
		});
		initAvatar(data.user?.profilePicture ?? null);
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
		<Sidebar open={$sidebarOpen} conversationsData={data.conversations ?? []} projectsData={data.projects ?? []} user={data.user} />

		<main class="relative flex h-full flex-1 flex-col overflow-hidden min-w-0">
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
