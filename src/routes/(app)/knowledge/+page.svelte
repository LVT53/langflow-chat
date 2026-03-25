<script lang="ts">
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

	let documents = (data.documents ?? []) as ArtifactSummary[];
	let results = (data.results ?? []) as ArtifactSummary[];
	let workflows = (data.workflows ?? []) as WorkCapsule[];
	let personaMemories = (data.memory?.personaMemories ?? []) as PersonaMemoryItem[];
	let taskMemories = (data.memory?.taskMemories ?? []) as TaskMemoryItem[];
	let memorySummary = data.memory?.summary ?? {
		personaCount: 0,
		taskCount: 0,
		overview: null,
	};
	const honchoEnabled = data.honchoEnabled ?? false;

	let activeTab: KnowledgeTab = 'library';
	let deletingArtifactIds = new Set<string>();
	let pendingMemoryActionKey: string | null = null;
	let manageError = '';

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
	}

	function isMemoryActionPending(key: string): boolean {
		return pendingMemoryActionKey === key;
	}

	function formatMemoryScope(scope: PersonaMemoryItem['scope']): string {
		return scope === 'assistant_about_user' ? 'Assistant about you' : 'Self conclusion';
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
</script>

<svelte:head>
	<title>Knowledge Base</title>
</svelte:head>

<div class="flex h-full min-h-0 flex-col overflow-y-auto bg-surface-page px-4 py-6 md:px-8">
	<div class="mx-auto flex w-full max-w-[920px] flex-col gap-8">
		<div class="rounded-[1.5rem] border border-border bg-surface-elevated px-5 py-5 shadow-sm md:px-6">
			<div class="flex flex-col gap-5">
				<div class="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
					<div class="space-y-2">
						<h1 class="text-[2rem] font-serif tracking-[-0.05em] text-text-primary md:text-[2.75rem]">
							Knowledge Base
						</h1>
						<p class="max-w-[720px] text-sm font-sans leading-[1.5] text-text-secondary">
							Persistent documents, saved results, workflow capsules, and a live memory view of what the system currently knows about you.
						</p>
					</div>
					<div class="grid grid-cols-3 gap-2 text-left md:min-w-[320px]">
						<div class="rounded-[1.2rem] border border-border bg-surface-page px-3 py-3">
							<div class="text-[0.65rem] font-sans uppercase tracking-[0.12em] text-text-muted">Docs</div>
							<div class="mt-2 text-xl font-serif text-text-primary">{documents.length}</div>
						</div>
						<div class="rounded-[1.2rem] border border-border bg-surface-page px-3 py-3">
							<div class="text-[0.65rem] font-sans uppercase tracking-[0.12em] text-text-muted">Results</div>
							<div class="mt-2 text-xl font-serif text-text-primary">{results.length}</div>
						</div>
						<div class="rounded-[1.2rem] border border-border bg-surface-page px-3 py-3">
							<div class="text-[0.65rem] font-sans uppercase tracking-[0.12em] text-text-muted">Workflows</div>
							<div class="mt-2 text-xl font-serif text-text-primary">{workflows.length}</div>
						</div>
					</div>
				</div>

				<div class="inline-flex w-full max-w-[360px] rounded-full border border-border bg-surface-page p-1">
					<button
						type="button"
						class={`flex-1 rounded-full px-4 py-2 text-sm font-sans transition ${
							activeTab === 'library'
								? 'bg-surface-elevated text-text-primary shadow-sm'
								: 'text-text-secondary hover:text-text-primary'
						}`}
						on:click={() => (activeTab = 'library')}
						aria-pressed={activeTab === 'library'}
					>
						Library
					</button>
					<button
						type="button"
						class={`flex-1 rounded-full px-4 py-2 text-sm font-sans transition ${
							activeTab === 'memory'
								? 'bg-surface-elevated text-text-primary shadow-sm'
								: 'text-text-secondary hover:text-text-primary'
						}`}
						on:click={() => (activeTab = 'memory')}
						aria-pressed={activeTab === 'memory'}
					>
						Memory Profile
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
			<section class="rounded-[1.5rem] border border-border bg-surface-elevated px-4 py-4 shadow-sm md:px-5 md:py-5">
				<div class="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
					<div class="rounded-[1.3rem] border border-border bg-surface-page px-5 py-5">
						<div class="flex flex-wrap items-center justify-between gap-3">
							<div class="flex flex-wrap items-center gap-2">
								<span class="rounded-full border border-border px-3 py-1 text-[0.7rem] font-sans uppercase tracking-[0.1em] text-text-muted">
									Memory Profile
								</span>
								<span class="rounded-full border border-border px-3 py-1 text-[0.7rem] font-sans uppercase tracking-[0.1em] text-text-muted">
									{honchoEnabled ? 'Live' : 'Unavailable'}
								</span>
							</div>
							{#if honchoEnabled && personaMemories.length > 0}
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
									Forget all persona memory
								</button>
							{/if}
						</div>
						<h2 class="mt-4 text-[1.75rem] font-serif tracking-[-0.04em] text-text-primary">
							Memory Overview
						</h2>
						{#if honchoOverview}
							<p class="mt-4 text-base font-serif leading-[1.65] text-text-secondary">
								{honchoOverview}
							</p>
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
									Forget individual memory items
								</h3>
							</div>
							<span class="rounded-full border border-border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
								{personaMemories.length}
							</span>
						</div>

						<div class="mt-4 space-y-3">
							{#if !honchoEnabled}
								<div class="rounded-[1rem] border border-dashed border-border px-4 py-5 text-sm text-text-muted">
									Persona memory controls are unavailable because Honcho is disabled.
								</div>
							{:else if personaMemories.length === 0}
								<div class="rounded-[1rem] border border-dashed border-border px-4 py-5 text-sm text-text-muted">
									No persona memory items are currently stored.
								</div>
							{:else}
								{#each personaMemories as memory (memory.id)}
									<div class="rounded-[1rem] border border-border px-4 py-4">
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0 flex-1">
												<div class="flex flex-wrap items-center gap-2">
													<span class="rounded-full border border-border px-2.5 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
														{formatMemoryScope(memory.scope)}
													</span>
													{#if memory.conversationTitle}
														<span class="text-xs font-sans text-text-muted">
															{memory.conversationTitle}
														</span>
													{:else if memory.sessionId}
														<span class="text-xs font-sans text-text-muted">
															Session {memory.sessionId.slice(0, 8)}
														</span>
													{/if}
												</div>
												<p class="mt-3 text-sm font-serif leading-[1.55] text-text-secondary">
													{memory.content}
												</p>
												<div class="mt-3 text-xs font-sans text-text-muted">
													{formatMemoryTimestamp(memory.createdAt)}
												</div>
											</div>
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
										</div>
									</div>
								{/each}
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

						<div class="mt-4 space-y-3">
							{#if taskMemories.length === 0}
								<div class="rounded-[1rem] border border-dashed border-border px-4 py-5 text-sm text-text-muted">
									No task-state memory has been checkpointed yet.
								</div>
							{:else}
								{#each taskMemories as memory (memory.taskId)}
									<div class="rounded-[1rem] border border-border px-4 py-4">
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0 flex-1">
												<div class="flex flex-wrap items-center gap-2">
													<span class="rounded-full border border-border px-2.5 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
														{memory.status}
													</span>
													{#if memory.locked}
														<span class="rounded-full border border-border px-2.5 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
															Locked
														</span>
													{/if}
													{#if memory.conversationTitle}
														<span class="text-xs font-sans text-text-muted">
															{memory.conversationTitle}
														</span>
													{/if}
												</div>
												<div class="mt-3 text-sm font-sans font-medium text-text-primary">
													{memory.objective}
												</div>
												{#if memory.checkpointSummary}
													<p class="mt-3 text-sm font-serif leading-[1.55] text-text-secondary">
														{memory.checkpointSummary}
													</p>
												{/if}
												<div class="mt-3 text-xs font-sans text-text-muted">
													Updated {formatMemoryTimestamp(memory.updatedAt)}
												</div>
											</div>
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
												Forget task memory
											</button>
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				</div>
			</section>
		{/if}
	</div>
</div>
