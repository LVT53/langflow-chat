<script lang="ts">
	import { onMount } from 'svelte';
	import Header from '$lib/components/layout/Header.svelte';
	import Sidebar from '$lib/components/layout/Sidebar.svelte';
	import { sidebarOpen } from '$lib/stores/ui';
	import { conversations } from '$lib/stores/conversations';
	import { projects } from '$lib/stores/projects';
	import { initSettings } from '$lib/stores/settings';
	import { initTheme } from '$lib/stores/theme';
	import type { LayoutData } from './$types';

	export let data: LayoutData;

	$: conversations.set(data.conversations ?? []);
	$: projects.set(data.projects ?? []);

	onMount(() => {
		initTheme(data.userTheme as 'system' | 'light' | 'dark');
		initSettings({
			model: data.userModel as 'model1' | 'model2',
			translationEnabled: data.userTranslation,
		});
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
		<Sidebar open={$sidebarOpen} conversationsData={data.conversations ?? []} projectsData={data.projects ?? []} user={data.user} on:new-conversation={() => {}} />

		<main class="relative flex h-full flex-1 flex-col overflow-hidden min-w-0">
			<slot />
		</main>
	</div>
</div>
