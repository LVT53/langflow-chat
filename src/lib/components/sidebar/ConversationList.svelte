<script lang="ts">
	import { fade, slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import {
		conversations,
		deleteConversationById,
		renameConversation,
		moveConversationToProject,
		clearProjectFromConversations
	} from '$lib/stores/conversations';
	import {
		projects as projectsStore,
		createProject,
		renameProject,
		deleteProject
	} from '$lib/stores/projects';
	import { currentConversationId } from '$lib/stores/ui';
	import type { ConversationListItem, Project } from '$lib/types';
	import ConversationItem from './ConversationItem.svelte';
	import ProjectItem from './ProjectItem.svelte';

	export let initialConversations: ConversationListItem[] = [];
	export let initialProjects: Project[] = [];

	let openMenuId: string | null = null;
	let openProjectMenuId: string | null = null;
	// Map of projectId → expanded state (local only)
	let expandedProjects: Record<string, boolean> = {};
	let isCreatingProject = false;
	let newProjectName = '';
	let newProjectInputRef: HTMLInputElement;

	$: visibleConversations = $conversations.length > 0 || $projectsStore.length > 0
		? $conversations
		: initialConversations;

	$: allProjects = $projectsStore.length > 0 ? $projectsStore : initialProjects;

	// Ensure newly loaded projects default to expanded
	$: {
		for (const p of allProjects) {
			if (!(p.id in expandedProjects)) {
				expandedProjects[p.id] = false;
			}
		}
	}

	$: conversationsByProject = (() => {
		const map: Record<string, ConversationListItem[]> = {};
		for (const p of allProjects) {
			map[p.id] = [];
		}
		const unorganized: ConversationListItem[] = [];
		for (const conv of visibleConversations) {
			if (conv.projectId && map[conv.projectId] !== undefined) {
				map[conv.projectId].push(conv);
			} else {
				unorganized.push(conv);
			}
		}
		return { byProject: map, unorganized };
	})();

	// ── Conversation handlers ──────────────────────────────────────────────────

	async function handleSelect(event: CustomEvent<{ id: string }>) {
		const id = event.detail.id;
		if (id === $currentConversationId) return;
		const previousConversationId = $currentConversationId;
		openMenuId = null;
		currentConversationId.set(id);
		try {
			await goto(`/chat/${id}`, { replaceState: false });
		} catch (err) {
			console.error('Navigation failed:', err);
			currentConversationId.set(previousConversationId);
		}
	}

	async function handleRename(event: CustomEvent<{ id: string; title: string }>) {
		const { id, title } = event.detail;
		openMenuId = null;
		try {
			await renameConversation(id, title);
		} catch (e) {
			console.error('Rename failed', e);
			alert('Failed to rename conversation. Please try again.');
		}
	}

	async function handleDelete(event: CustomEvent<{ id: string }>) {
		const { id } = event.detail;
		openMenuId = null;
		try {
			await deleteConversationById(id);
			if ($currentConversationId === id) {
				currentConversationId.set(null);
				goto('/');
			}
		} catch (e) {
			console.error('Delete failed', e);
			alert('Failed to delete conversation. Please try again.');
		}
	}

	async function handleMoveToProject(event: CustomEvent<{ id: string; projectId: string | null }>) {
		const { id, projectId } = event.detail;
		openMenuId = null;
		try {
			await moveConversationToProject(id, projectId);
		} catch (e) {
			console.error('Move to project failed', e);
			alert('Failed to move conversation. Please try again.');
		}
	}

	function handleMenuToggle(event: CustomEvent<{ id: string; open: boolean }>) {
		const { id, open } = event.detail;
		openMenuId = open ? id : null;
	}

	function handleMenuClose() {
		openMenuId = null;
	}

	// ── Project handlers ───────────────────────────────────────────────────────

	function handleProjectToggle(event: CustomEvent<{ id: string; expanded: boolean }>) {
		const { id, expanded } = event.detail;
		expandedProjects = { ...expandedProjects, [id]: expanded };
	}

	async function handleProjectRename(event: CustomEvent<{ id: string; name: string }>) {
		const { id, name } = event.detail;
		openProjectMenuId = null;
		try {
			await renameProject(id, name);
		} catch (e) {
			console.error('Rename project failed', e);
			alert('Failed to rename project. Please try again.');
		}
	}

	async function handleProjectDelete(event: CustomEvent<{ id: string }>) {
		const { id } = event.detail;
		openProjectMenuId = null;
		try {
			clearProjectFromConversations(id);
			await deleteProject(id);
		} catch (e) {
			console.error('Delete project failed', e);
			alert('Failed to delete project. Please try again.');
		}
	}

	function handleProjectMenuToggle(event: CustomEvent<{ id: string; open: boolean }>) {
		const { id, open } = event.detail;
		openProjectMenuId = open ? id : null;
	}

	function handleProjectMenuClose() {
		openProjectMenuId = null;
	}

	// ── Create project ─────────────────────────────────────────────────────────

	function startCreateProject(e: MouseEvent) {
		e.stopPropagation();
		isCreatingProject = true;
		newProjectName = '';
		setTimeout(() => newProjectInputRef?.focus(), 0);
	}

	async function commitCreateProject() {
		const name = newProjectName.trim();
		isCreatingProject = false;
		newProjectName = '';
		if (!name) return;
		try {
			const project = await createProject(name);
			expandedProjects = { ...expandedProjects, [project.id]: true };
		} catch (e) {
			console.error('Create project failed', e);
			alert('Failed to create project. Please try again.');
		}
	}

	function handleNewProjectKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') { e.preventDefault(); commitCreateProject(); }
		else if (e.key === 'Escape') { isCreatingProject = false; }
	}
</script>

<div class="flex h-full flex-col gap-0">
	<!-- ── Projects section ──────────────────────────────────────────────── -->
	{#if allProjects.length > 0 || isCreatingProject}
		<div class="mb-0.5">
			<!-- Section header -->
			<div class="group flex items-center justify-between px-2 py-1">
				<span class="text-[11px] font-medium uppercase tracking-wider text-text-muted">Projects</span>
				<button
					class="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-icon-muted opacity-0 transition-opacity duration-100 hover:text-icon-primary group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
					title="New project"
					aria-label="Create new project"
					on:click={startCreateProject}
				>
					<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
						<line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" />
					</svg>
				</button>
			</div>

			<!-- New project input -->
			{#if isCreatingProject}
				<div class="px-1 pb-1">
					<input
						bind:this={newProjectInputRef}
						bind:value={newProjectName}
						on:blur={commitCreateProject}
						on:keydown={handleNewProjectKeydown}
						placeholder="Project name"
						class="w-full rounded-md border border-border bg-surface-page px-2.5 py-1.5 text-[13px] font-sans text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-text-muted"
					/>
				</div>
			{/if}

			<!-- Project list -->
			<div class="flex flex-col gap-px px-1">
				{#each allProjects as project (project.id)}
					<div>
						<ProjectItem
							{project}
							expanded={expandedProjects[project.id] ?? false}
							menuOpen={openProjectMenuId === project.id}
							on:toggle={handleProjectToggle}
							on:rename={handleProjectRename}
							on:delete={handleProjectDelete}
							on:menuToggle={handleProjectMenuToggle}
							on:menuClose={handleProjectMenuClose}
						/>
						<!-- Conversations inside this project -->
						{#if expandedProjects[project.id] ?? false}
							<div class="overflow-hidden" transition:slide={{ duration: 200 }}>
							{#each conversationsByProject.byProject[project.id] ?? [] as conversation, i (conversation.id)}
								<div class="pl-4" in:fade={{ duration: 150, delay: i * 35 }}>
									<ConversationItem
										{conversation}
										active={$currentConversationId === conversation.id}
										menuOpen={openMenuId === conversation.id}
										projects={allProjects}
										on:select={handleSelect}
										on:rename={handleRename}
										on:delete={handleDelete}
										on:moveToProject={handleMoveToProject}
										on:menuToggle={handleMenuToggle}
										on:menuClose={handleMenuClose}
									/>
								</div>
							{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<!-- Divider between projects and unorganized chats -->
		{#if conversationsByProject.unorganized.length > 0}
			<div class="my-1 border-t border-border-subtle mx-2"></div>
		{/if}
	{:else}
		<!-- No projects yet: header + creative empty notice -->
		<div class="group flex items-center justify-between px-2 py-1">
			<span class="text-[11px] font-medium uppercase tracking-wider text-text-muted">Projects</span>
			<button
				class="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-icon-muted opacity-0 transition-opacity duration-100 hover:text-icon-primary group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
				title="New project"
				aria-label="Create new project"
				on:click={startCreateProject}
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
					<line x1="12" x2="12" y1="5" y2="19" /><line x1="5" x2="19" y1="12" y2="12" />
				</svg>
			</button>
		</div>
		{#if isCreatingProject}
			<div class="px-1 pb-1">
				<input
					bind:this={newProjectInputRef}
					bind:value={newProjectName}
					on:blur={commitCreateProject}
					on:keydown={handleNewProjectKeydown}
					placeholder="Project name"
					class="w-full rounded-md border border-border bg-surface-page px-2.5 py-1.5 text-[13px] font-sans text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent placeholder:text-text-muted"
				/>
			</div>
		{:else}
			<!-- Creative empty state: dashed folder card -->
			<button
				class="empty-projects-btn mx-1 mb-2 flex w-[calc(100%-0.5rem)] cursor-pointer items-center gap-2.5 rounded-lg border border-dashed px-3 py-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
				on:click={startCreateProject}
				aria-label="Create new project"
			>
				<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-surface-elevated text-icon-muted">
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
						<line x1="12" y1="11" x2="12" y2="17"/>
						<line x1="9" y1="14" x2="15" y2="14"/>
					</svg>
				</div>
				<div>
					<p class="text-[12px] font-medium text-text-secondary">No projects yet</p>
					<p class="text-[11px] text-text-muted">Group your chats — click to create one</p>
				</div>
			</button>
		{/if}
	{/if}

	<!-- ── Unorganized conversations ─────────────────────────────────────── -->
	<div class="flex flex-col gap-0.5 px-1">
		{#if visibleConversations.length === 0}
			<div class="flex h-20 items-center justify-center p-4 text-sm text-text-muted">
				No conversations yet
			</div>
		{:else}
			{#each conversationsByProject.unorganized as conversation (conversation.id)}
				<ConversationItem
					{conversation}
					active={$currentConversationId === conversation.id}
					menuOpen={openMenuId === conversation.id}
					projects={allProjects}
					on:select={handleSelect}
					on:rename={handleRename}
					on:delete={handleDelete}
					on:moveToProject={handleMoveToProject}
					on:menuToggle={handleMenuToggle}
					on:menuClose={handleMenuClose}
				/>
			{/each}
		{/if}
	</div>
</div>

<style>
	.empty-projects-btn {
		border-color: color-mix(in srgb, var(--border-default) 50%, transparent 50%);
	}

	.empty-projects-btn:hover {
		background: color-mix(in srgb, var(--surface-elevated) 60%, var(--surface-overlay) 40%);
		border-color: var(--border-default);
	}
</style>
