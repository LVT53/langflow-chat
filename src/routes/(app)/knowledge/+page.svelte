<script lang="ts">
	import { onMount } from 'svelte';
	import { renderMarkdown } from '$lib/services/markdown';
	import type {
		ArtifactSummary,
		KnowledgeMemoryPayload,
		PersonaMemoryItem,
		TaskMemoryItem,
		WorkCapsule,
	} from '$lib/types';
	import type { PageData } from './$types';

	export let data: PageData;

	type KnowledgeTab = 'library' | 'memory';
	type MemoryModal = 'persona' | 'task' | null;

	let documents = (data.documents ?? []) as ArtifactSummary[];
	let results = (data.results ?? []) as ArtifactSummary[];
	let workflows = (data.workflows ?? []) as WorkCapsule[];
	let personaMemories = [] as PersonaMemoryItem[];
	let taskMemories = [] as TaskMemoryItem[];
	let memorySummary = {
		personaCount: 0,
		taskCount: 0,
		overview: null,
	};
	const honchoEnabled = data.honchoEnabled ?? false;

	let activeTab: KnowledgeTab = 'library';
	let deletingArtifactIds = new Set<string>();
	let pendingMemoryActionKey: string | null = null;
	let manageError = '';
	let memoryLoaded = false;
	let memoryLoading = false;
	let memoryLoadError = '';
	let activeMemoryModal = null as MemoryModal;
	let honchoOverviewHtml = '';
	const userDisplayName = data.userDisplayName?.trim() || 'You';

	$: honchoOverview = memorySummary.overview?.trim() ?? '';
	$: honchoHighlights = honchoOverview
		? honchoOverview
				.split(/\n+/)
				.flatMap((paragraph) =>
					paragraph
						.split(/(?<=[.!?])\s+/)
						.map((part) => part.trim())
						.filter(Boolean)
				)
				.slice(0, 4)
		: [];
	$: void renderHonchoOverview(honchoOverview);

	let overviewRenderVersion = 0;

	async function renderHonchoOverview(source: string) {
		const renderVersion = ++overviewRenderVersion;

		if (!source) {
			honchoOverviewHtml = '';
			return;
		}

		try {
			const html = await renderMarkdown(source, false);
			if (renderVersion !== overviewRenderVersion) return;
			honchoOverviewHtml = html;
		} catch {
			if (renderVersion !== overviewRenderVersion) return;
			honchoOverviewHtml = `<p>${source}</p>`;
		}
	}

	function isDeletingArtifact(id: string): boolean {
		return deletingArtifactIds.has(id);
	}

	function applyDeletedArtifactIds(ids: string[]) {
		const deleted = new Set(ids);
		documents = documents.filter((artifact) => !deleted.has(artifact.id));
		results = results.filter((artifact) => !deleted.has(artifact.id));
		workflows = workflows.filter((capsule) => !deleted.has(capsule.artifact.id));
	}

	function applyMemoryPayload(payload: KnowledgeMemoryPayload) {
		personaMemories = payload.personaMemories ?? [];
		taskMemories = payload.taskMemories ?? [];
		memorySummary = payload.summary ?? {
			personaCount: 0,
			taskCount: 0,
			overview: null,
		};
		memoryLoaded = true;
		memoryLoadError = '';
	}

	async function ensureMemoryLoaded(force = false) {
		if (memoryLoading) return;
		if (memoryLoaded && !force) return;

		memoryLoading = true;
		memoryLoadError = '';

		try {
			const response = await fetch('/api/knowledge/memory');
			const result = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(result.error ?? 'Failed to load memory profile.');
			}
			applyMemoryPayload(result as KnowledgeMemoryPayload);
		} catch (error) {
			memoryLoadError =
				error instanceof Error ? error.message : 'Failed to load memory profile.';
		} finally {
			memoryLoading = false;
		}
	}

	function selectTab(tab: KnowledgeTab) {
		activeTab = tab;
		if (tab === 'memory') {
			void ensureMemoryLoaded();
		}
	}

	function openMemoryModal(kind: Exclude<MemoryModal, null>) {
		activeMemoryModal = kind;
		void ensureMemoryLoaded();
	}

	function closeMemoryModal() {
		activeMemoryModal = null;
	}

	function isMemoryActionPending(key: string): boolean {
		return pendingMemoryActionKey === key;
	}

	function formatPersonaActor(scope: PersonaMemoryItem['scope']): string {
		return scope === 'assistant_about_user' ? 'AlfyAI' : userDisplayName;
	}

	function formatPersonaOrigin(scope: PersonaMemoryItem['scope']): string {
		return scope === 'assistant_about_user' ? 'Assistant inference' : 'Direct memory';
	}

	function formatMemorySource(
		conversationTitle: string | null,
		sessionId: string | null
	): string {
		if (conversationTitle) return conversationTitle;
		if (sessionId) return 'Conversation memory';
		return 'General memory';
	}

	function formatMemoryTimestamp(timestamp: number): string {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(timestamp);
	}

	async function runMemoryAction(
		payload:
			| { action: 'forget_persona_memory'; conclusionId: string }
			| { action: 'forget_all_persona_memory' }
			| { action: 'forget_task_memory'; taskId: string },
		key: string,
		confirmationMessage?: string
	) {
		if (isMemoryActionPending(key)) return;
		if (confirmationMessage && !window.confirm(confirmationMessage)) return;

		manageError = '';
		pendingMemoryActionKey = key;

		try {
			const response = await fetch('/api/knowledge/memory/actions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(result.error ?? 'Failed to update memory profile.');
			}
			applyMemoryPayload(result as KnowledgeMemoryPayload);
		} catch (error) {
			manageError =
				error instanceof Error ? error.message : 'Failed to update memory profile.';
		} finally {
			pendingMemoryActionKey = null;
		}
	}

	async function removeArtifact(id: string, label: string) {
		if (isDeletingArtifact(id)) return;
		if (!window.confirm(`Remove "${label}" from the Knowledge Base?`)) return;

		manageError = '';
		deletingArtifactIds = new Set([...deletingArtifactIds, id]);

		try {
			const response = await fetch(`/api/knowledge/${id}`, {
				method: 'DELETE',
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(payload.error ?? 'Failed to remove artifact.');
			}
			applyDeletedArtifactIds(payload.deletedArtifactIds ?? [id]);
		} catch (error) {
			manageError = error instanceof Error ? error.message : 'Failed to remove artifact.';
		} finally {
			const next = new Set(deletingArtifactIds);
			next.delete(id);
			deletingArtifactIds = next;
		}
	}

	onMount(() => {
		if (memoryLoaded) return undefined;

		const timer = window.setTimeout(() => {
			void ensureMemoryLoaded();
		}, 250);

		return () => window.clearTimeout(timer);
	});

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && activeMemoryModal) {
			closeMemoryModal();
		}
	}
</script>

<svelte:head>
	<title>Knowledge Base</title>
</svelte:head>

<svelte:window on:keydown={handleWindowKeydown} />

<div class="flex h-full min-h-0 flex-col overflow-y-auto bg-surface-page px-4 py-6 md:px-8">
	<div class="mx-auto flex w-full max-w-[920px] flex-col gap-8">
		<div class="rounded-[1.5rem] border border-border bg-surface-elevated px-5 py-5 shadow-sm md:px-6">
			<div class="flex flex-col gap-5">
				<div class="space-y-2">
					<h1 class="text-[2rem] font-serif tracking-[-0.05em] text-text-primary md:text-[2.75rem]">
						Knowledge Base
					</h1>
					<p class="max-w-[720px] text-sm font-sans leading-[1.5] text-text-secondary">
						Persistent documents, saved results, workflow capsules, and a live memory view of what the system currently knows about you.
					</p>
				</div>

				<div class="inline-flex w-full rounded-full border border-border bg-surface-page p-1">
					<button
						type="button"
						class={`flex-1 rounded-full px-4 py-2 text-sm font-sans transition ${
							activeTab === 'library'
								? 'bg-surface-elevated text-text-primary shadow-sm'
								: 'text-text-secondary hover:text-text-primary'
						}`}
						on:click={() => selectTab('library')}
						aria-pressed={activeTab === 'library'}
					>
						Library
					</button>
					<button
						type="button"
						class={`flex flex-1 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-sans transition ${
							activeTab === 'memory'
								? 'bg-surface-elevated text-text-primary shadow-sm'
								: 'text-text-secondary hover:text-text-primary'
						}`}
						on:click={() => selectTab('memory')}
						aria-pressed={activeTab === 'memory'}
					>
						Memory Profile
						{#if memoryLoading && !memoryLoaded}
							<span class="h-1.5 w-1.5 rounded-full bg-accent animate-pulse"></span>
						{/if}
					</button>
				</div>
			</div>
		</div>

		{#if manageError}
			<div class="rounded-[1rem] border border-danger bg-surface-page px-4 py-3 text-sm font-sans text-danger shadow-sm" role="alert">
				{manageError}
			</div>
		{/if}

		{#if activeTab === 'library'}
			<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
				<div class="flex items-center justify-between">
					<h2 class="text-lg font-sans font-semibold text-text-primary">Documents</h2>
					<span class="text-xs font-sans uppercase tracking-[0.08em] text-text-muted">{documents.length}</span>
				</div>
				<div class="mt-4 grid gap-3 md:grid-cols-2">
					{#if documents.length === 0}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm text-text-muted">
							No documents yet.
						</div>
					{:else}
						{#each documents as artifact (artifact.id)}
							<div class="rounded-[1.2rem] border border-border bg-surface-page px-4 py-4">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<div class="text-sm font-sans font-medium text-text-primary">{artifact.name}</div>
										<div class="text-xs uppercase tracking-[0.08em] text-text-muted">{artifact.type}</div>
									</div>
									<div class="flex items-start gap-2">
										{#if artifact.sizeBytes}
											<div class="pt-0.5 text-xs font-sans text-text-muted">{Math.ceil(artifact.sizeBytes / 1024)} KB</div>
										{/if}
										<button
											type="button"
											class="btn-icon-bare h-8 w-8 rounded-full text-icon-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
											on:click={() => removeArtifact(artifact.id, artifact.name)}
											disabled={isDeletingArtifact(artifact.id)}
											aria-label={`Remove ${artifact.name}`}
											title="Remove"
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<path d="M3 6h18" />
												<path d="M8 6V4h8v2" />
												<path d="M19 6l-1 14H6L5 6" />
												<path d="M10 11v6" />
												<path d="M14 11v6" />
											</svg>
										</button>
									</div>
								</div>
								{#if artifact.summary}
									<p class="mt-3 text-sm font-serif leading-[1.45] text-text-secondary">{artifact.summary}</p>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			</section>

			<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
				<div class="flex items-center justify-between">
					<h2 class="text-lg font-sans font-semibold text-text-primary">Results</h2>
					<span class="text-xs font-sans uppercase tracking-[0.08em] text-text-muted">{results.length}</span>
				</div>
				<div class="mt-4 grid gap-3 md:grid-cols-2">
					{#if results.length === 0}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm text-text-muted">
							No saved results yet.
						</div>
					{:else}
						{#each results as artifact (artifact.id)}
							<div class="rounded-[1.2rem] border border-border bg-surface-page px-4 py-4">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<div class="text-sm font-sans font-medium text-text-primary">{artifact.name}</div>
									</div>
									<div class="flex items-start gap-2">
										<button
											type="button"
											class="btn-icon-bare h-8 w-8 rounded-full text-icon-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
											on:click={() => removeArtifact(artifact.id, artifact.name)}
											disabled={isDeletingArtifact(artifact.id)}
											aria-label={`Remove ${artifact.name}`}
											title="Remove"
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<path d="M3 6h18" />
												<path d="M8 6V4h8v2" />
												<path d="M19 6l-1 14H6L5 6" />
												<path d="M10 11v6" />
												<path d="M14 11v6" />
											</svg>
										</button>
									</div>
								</div>
								{#if artifact.summary}
									<p class="mt-3 text-sm font-serif leading-[1.45] text-text-secondary">{artifact.summary}</p>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			</section>

			<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
				<div class="flex items-center justify-between">
					<h2 class="text-lg font-sans font-semibold text-text-primary">Workflows</h2>
					<span class="text-xs font-sans uppercase tracking-[0.08em] text-text-muted">{workflows.length}</span>
				</div>
				<div class="mt-4 grid gap-3 md:grid-cols-2">
					{#if workflows.length === 0}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm text-text-muted">
							No workflow capsules yet.
						</div>
					{:else}
						{#each workflows as capsule (capsule.artifact.id)}
							<div class="rounded-[1.2rem] border border-border bg-surface-page px-4 py-4">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<div class="text-sm font-sans font-medium text-text-primary">{capsule.artifact.name}</div>
										{#if capsule.taskSummary}
											<p class="mt-2 text-sm font-serif leading-[1.45] text-text-secondary">{capsule.taskSummary}</p>
										{/if}
									</div>
									<div class="flex items-start gap-2">
										<div class="text-xs font-sans uppercase tracking-[0.08em] text-text-muted">
											{capsule.sourceArtifactIds.length} docs / {capsule.outputArtifactIds.length} outputs
										</div>
										<button
											type="button"
											class="btn-icon-bare h-8 w-8 rounded-full text-icon-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
											on:click={() => removeArtifact(capsule.artifact.id, capsule.artifact.name)}
											disabled={isDeletingArtifact(capsule.artifact.id)}
											aria-label={`Remove ${capsule.artifact.name}`}
											title="Remove"
										>
											<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
												<path d="M3 6h18" />
												<path d="M8 6V4h8v2" />
												<path d="M19 6l-1 14H6L5 6" />
												<path d="M10 11v6" />
												<path d="M14 11v6" />
											</svg>
										</button>
									</div>
								</div>
								{#if capsule.workflowSummary}
									<p class="mt-3 text-sm font-serif leading-[1.45] text-text-secondary">{capsule.workflowSummary}</p>
								{/if}
								{#if capsule.reusablePatterns.length > 0}
									<div class="mt-3 flex flex-wrap gap-2">
										{#each capsule.reusablePatterns as pattern}
											<span class="rounded-full border border-border px-3 py-1 text-xs font-sans text-text-secondary">
												{pattern}
											</span>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					{/if}
				</div>
			</section>
		{:else}
			{#if memoryLoading && !memoryLoaded}
				<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
					<div class="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
						<div class="rounded-[1.3rem] border border-border bg-surface-page px-5 py-5">
							<div class="h-3 w-28 rounded-full bg-surface-page animate-pulse"></div>
							<div class="mt-5 h-8 w-52 rounded-full bg-surface-page animate-pulse"></div>
							<div class="mt-5 space-y-3">
								<div class="h-3 w-full rounded-full bg-surface-page animate-pulse"></div>
								<div class="h-3 w-11/12 rounded-full bg-surface-page animate-pulse"></div>
								<div class="h-3 w-9/12 rounded-full bg-surface-page animate-pulse"></div>
							</div>
						</div>
						<div class="space-y-4">
							<div class="grid grid-cols-2 gap-3">
								<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
									<div class="h-3 w-20 rounded-full bg-surface-page animate-pulse"></div>
									<div class="mt-3 h-7 w-12 rounded-full bg-surface-page animate-pulse"></div>
								</div>
								<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
									<div class="h-3 w-20 rounded-full bg-surface-page animate-pulse"></div>
									<div class="mt-3 h-7 w-12 rounded-full bg-surface-page animate-pulse"></div>
								</div>
							</div>
							<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
								<div class="h-3 w-28 rounded-full bg-surface-page animate-pulse"></div>
								<div class="mt-4 space-y-3">
									<div class="h-3 w-full rounded-full bg-surface-page animate-pulse"></div>
									<div class="h-3 w-10/12 rounded-full bg-surface-page animate-pulse"></div>
								</div>
							</div>
						</div>
					</div>

					<div class="mt-6 rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm font-sans text-text-muted">
						Loading memory profile…
					</div>
				</section>
			{:else if memoryLoadError && !memoryLoaded}
				<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
					<div class="rounded-[1.2rem] border border-danger bg-surface-page px-4 py-5">
						<div class="text-sm font-sans font-medium text-danger">Memory Profile failed to load.</div>
						<p class="mt-2 text-sm font-sans leading-[1.6] text-text-secondary">
							{memoryLoadError}
						</p>
						<button
							type="button"
							class="mt-4 rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-page"
							on:click={() => void ensureMemoryLoaded(true)}
						>
							Try again
						</button>
					</div>
				</section>
			{:else}
			<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
				<div class="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
					<div class="rounded-[1.3rem] border border-border bg-surface-page px-5 py-5">
						<div class="flex flex-wrap items-center gap-2">
							<span class="rounded-full border border-border px-3 py-1 text-[0.7rem] font-sans uppercase tracking-[0.1em] text-text-muted">
								Memory Profile
							</span>
							<span class="rounded-full border border-border px-3 py-1 text-[0.7rem] font-sans uppercase tracking-[0.1em] text-text-muted">
								{honchoEnabled ? 'Live' : 'Unavailable'}
							</span>
						</div>
						<h2 class="mt-4 text-[1.75rem] font-serif tracking-[-0.04em] text-text-primary">
							Memory Overview
						</h2>
						{#if honchoOverview}
							<div class="memory-markdown prose mt-4 max-w-none text-base leading-[1.65] text-text-secondary">
								{@html honchoOverviewHtml}
							</div>
						{:else if honchoEnabled}
							<p class="mt-4 text-sm font-sans leading-[1.6] text-text-muted">
								Memory Profile is enabled, but there is not enough durable persona memory yet to render a useful overview.
							</p>
						{:else}
							<p class="mt-4 text-sm font-sans leading-[1.6] text-text-muted">
								Memory Profile is disabled in this deployment, so the live persona memory overview is not available.
							</p>
						{/if}
					</div>

					<div class="space-y-4">
						<div class="grid grid-cols-2 gap-3">
							<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
								<div class="text-[0.7rem] font-sans uppercase tracking-[0.12em] text-text-muted">
									Persona memory
								</div>
								<div class="mt-2 text-2xl font-serif text-text-primary">
									{memorySummary.personaCount}
								</div>
							</div>
							<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
								<div class="text-[0.7rem] font-sans uppercase tracking-[0.12em] text-text-muted">
									Task memory
								</div>
								<div class="mt-2 text-2xl font-serif text-text-primary">
									{memorySummary.taskCount}
								</div>
							</div>
						</div>

						<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
							<div class="text-[0.7rem] font-sans uppercase tracking-[0.12em] text-text-muted">
								How forgetting works
							</div>
							<p class="mt-3 text-sm font-sans leading-[1.6] text-text-secondary">
								Persona memory removes Honcho-derived conclusions about you. Task memory forgets the local task-state checkpoints and evidence links used for long-horizon chat continuity.
							</p>
						</div>
					</div>
				</div>

				<div class="mt-4 grid gap-3 md:grid-cols-2">
					{#if honchoHighlights.length > 0}
						{#each honchoHighlights as highlight}
							<div class="rounded-[1.2rem] border border-border bg-surface-page px-4 py-4">
								<div class="text-[0.7rem] font-sans uppercase tracking-[0.12em] text-text-muted">
									Memory signal
								</div>
								<p class="mt-3 text-sm font-serif leading-[1.55] text-text-secondary">{highlight}</p>
							</div>
						{/each}
					{:else}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm text-text-muted md:col-span-2">
							As you work across conversations, this tab will surface and manage the durable persona and task memory the system is carrying forward.
						</div>
					{/if}
				</div>

				<div class="mt-6 grid gap-4 lg:grid-cols-2">
					<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
						<div class="flex items-center justify-between gap-3">
							<div>
								<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
									Persona memory
								</div>
								<h3 class="mt-2 text-lg font-sans font-semibold text-text-primary">
									Manage durable profile memories
								</h3>
							</div>
							<span class="rounded-full border border-border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
								{personaMemories.length}
							</span>
						</div>

						<p class="mt-4 text-sm font-sans leading-[1.6] text-text-secondary">
							Review and forget stored persona memories in a compact table instead of scanning long card stacks.
						</p>

						<div class="mt-4 flex flex-wrap items-center gap-3">
							<button
								type="button"
								class="rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
								on:click={() => openMemoryModal('persona')}
								disabled={!honchoEnabled}
							>
								Manage persona memory
							</button>
							{#if !honchoEnabled}
								<span class="text-xs font-sans text-text-muted">
									Unavailable while Honcho is disabled.
								</span>
							{:else if personaMemories.length === 0}
								<span class="text-xs font-sans text-text-muted">
									No stored persona memory yet.
								</span>
							{/if}
						</div>
					</div>

					<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
						<div class="flex items-center justify-between gap-3">
							<div>
								<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
									Task memory
								</div>
								<h3 class="mt-2 text-lg font-sans font-semibold text-text-primary">
									Reset local task continuity
								</h3>
							</div>
							<span class="rounded-full border border-border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
								{taskMemories.length}
							</span>
						</div>

						<p class="mt-4 text-sm font-sans leading-[1.6] text-text-secondary">
							Task continuity is now managed in a modal table, so large task histories stay readable and don’t dominate the page layout.
						</p>

						<div class="mt-4 flex flex-wrap items-center gap-3">
							<button
								type="button"
								class="rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
								on:click={() => openMemoryModal('task')}
							>
								Manage task memory
							</button>
							{#if taskMemories.length === 0}
								<span class="text-xs font-sans text-text-muted">
									No task-state memory has been checkpointed yet.
								</span>
							{/if}
						</div>
					</div>
				</div>
			</section>
			{/if}
		{/if}
	</div>
</div>

{#if activeMemoryModal}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 z-[120] flex items-center justify-center bg-surface-overlay/65 p-4 backdrop-blur-sm"
		on:click={closeMemoryModal}
	>
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby={activeMemoryModal === 'persona' ? 'persona-memory-dialog-title' : 'task-memory-dialog-title'}
			tabindex={-1}
			class="max-h-[88vh] w-full max-w-[1100px] overflow-hidden rounded-[1.6rem] border border-border bg-surface-elevated shadow-2xl"
			on:click|stopPropagation
		>
			<div class="flex items-start justify-between gap-4 border-b border-border px-5 py-4 md:px-6">
				<div>
					<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
						{activeMemoryModal === 'persona' ? 'Persona memory' : 'Task memory'}
					</div>
					<h3
						id={activeMemoryModal === 'persona' ? 'persona-memory-dialog-title' : 'task-memory-dialog-title'}
						class="mt-2 text-xl font-serif tracking-[-0.03em] text-text-primary"
					>
						{activeMemoryModal === 'persona'
							? 'Manage stored persona memories'
							: 'Manage stored task continuity'}
					</h3>
					<p class="mt-2 text-sm font-sans leading-[1.6] text-text-secondary">
						{activeMemoryModal === 'persona'
							? 'Review memory items in a compact table and forget individual entries without scrolling through long cards.'
							: 'Inspect task-level checkpoints and reset the long-horizon continuity for tasks you no longer want the system to carry forward.'}
					</p>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					{#if activeMemoryModal === 'persona' && honchoEnabled && personaMemories.length > 0}
						<button
							type="button"
							class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
							on:click={() =>
								runMemoryAction(
									{ action: 'forget_all_persona_memory' },
									'forget-all-persona',
									'Forget all persona memory items? This clears the live memory profile about you.'
								)}
							disabled={isMemoryActionPending('forget-all-persona')}
						>
							Forget all
						</button>
					{/if}
					<button
						type="button"
						class="btn-icon-bare h-10 w-10 rounded-full text-icon-muted hover:text-text-primary"
						on:click={closeMemoryModal}
						aria-label="Close memory manager"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" x2="6" y1="6" y2="18" />
							<line x1="6" x2="18" y1="6" y2="18" />
						</svg>
					</button>
				</div>
			</div>

			<div class="max-h-[calc(88vh-104px)] overflow-y-auto px-5 py-5 md:px-6">
				{#if activeMemoryModal === 'persona'}
					{#if !honchoEnabled}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm font-sans text-text-muted">
							Persona memory controls are unavailable because Honcho is disabled.
						</div>
					{:else if personaMemories.length === 0}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm font-sans text-text-muted">
							No stored persona memory items yet.
						</div>
					{:else}
						<div class="overflow-x-auto rounded-[1.2rem] border border-border bg-surface-page">
							<table class="min-w-[880px] w-full border-collapse">
								<thead>
									<tr class="border-b border-border bg-surface-elevated/70 text-left">
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Actor</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Memory</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Source</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Added</th>
										<th class="px-4 py-3 text-right text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Action</th>
									</tr>
								</thead>
								<tbody>
									{#each personaMemories as memory (memory.id)}
										<tr class="border-b border-border last:border-b-0">
											<td class="px-4 py-3 align-top">
												<div class="text-sm font-sans font-medium text-text-primary">
													{formatPersonaActor(memory.scope)}
												</div>
												<div class="mt-1 text-xs font-sans text-text-muted">
													{formatPersonaOrigin(memory.scope)}
												</div>
											</td>
											<td class="px-4 py-3 align-top">
												<div class="memory-preview text-sm font-serif leading-[1.55] text-text-secondary" title={memory.content}>
													{memory.content}
												</div>
											</td>
											<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">
												{formatMemorySource(memory.conversationTitle, memory.sessionId)}
											</td>
											<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">
												{formatMemoryTimestamp(memory.createdAt)}
											</td>
											<td class="px-4 py-3 align-top text-right">
												<button
													type="button"
													class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
													on:click={() =>
														runMemoryAction(
															{ action: 'forget_persona_memory', conclusionId: memory.id },
															`persona-${memory.id}`,
															'Forget this persona memory item?'
														)}
													disabled={isMemoryActionPending(`persona-${memory.id}`)}
												>
													Forget
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				{:else}
					{#if taskMemories.length === 0}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm font-sans text-text-muted">
							No task-state memory has been checkpointed yet.
						</div>
					{:else}
						<div class="overflow-x-auto rounded-[1.2rem] border border-border bg-surface-page">
							<table class="min-w-[980px] w-full border-collapse">
								<thead>
									<tr class="border-b border-border bg-surface-elevated/70 text-left">
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Objective</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Checkpoint</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Conversation</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Status</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Updated</th>
										<th class="px-4 py-3 text-right text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Action</th>
									</tr>
								</thead>
								<tbody>
									{#each taskMemories as memory (memory.taskId)}
										<tr class="border-b border-border last:border-b-0">
											<td class="px-4 py-3 align-top">
												<div class="text-sm font-sans font-medium text-text-primary">
													{memory.objective}
												</div>
											</td>
											<td class="px-4 py-3 align-top">
												<div class="memory-preview text-sm font-serif leading-[1.55] text-text-secondary" title={memory.checkpointSummary ?? ''}>
													{memory.checkpointSummary ?? 'No checkpoint summary stored yet.'}
												</div>
											</td>
											<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">
												{memory.conversationTitle ?? 'Conversation memory'}
											</td>
											<td class="px-4 py-3 align-top">
												<div class="flex flex-wrap gap-2">
													<span class="rounded-full border border-border px-2.5 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
														{memory.status}
													</span>
													{#if memory.locked}
														<span class="rounded-full border border-border px-2.5 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
															Locked
														</span>
													{/if}
												</div>
											</td>
											<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">
												{formatMemoryTimestamp(memory.updatedAt)}
											</td>
											<td class="px-4 py-3 align-top text-right">
												<button
													type="button"
													class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
													on:click={() =>
														runMemoryAction(
															{ action: 'forget_task_memory', taskId: memory.taskId },
															`task-${memory.taskId}`,
															'Forget this task memory? The conversation can still continue, but its long-horizon task checkpoints will be cleared.'
														)}
													disabled={isMemoryActionPending(`task-${memory.taskId}`)}
												>
													Forget
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.memory-markdown :global(*:last-child) {
		margin-bottom: 0;
	}

	.memory-markdown :global(strong) {
		color: var(--text-primary);
		font-weight: 600;
	}

	.memory-markdown :global(ul),
	.memory-markdown :global(ol) {
		padding-left: 1.25rem;
	}

	.memory-preview {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		overflow: hidden;
	}
</style>
