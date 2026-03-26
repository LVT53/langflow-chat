<script lang="ts">
	import { onMount } from 'svelte';
	import { isDark } from '$lib/stores/theme';
	import { renderMarkdown } from '$lib/services/markdown';
	import type {
		ArtifactSummary,
		FocusContinuityItem,
		KnowledgeDocumentItem,
		KnowledgeMemoryPayload,
		PersonaMemoryItem,
		TaskMemoryItem,
		WorkCapsule,
	} from '$lib/types';
	import type { PageData } from './$types';

	export let data: PageData;

	type KnowledgeTab = 'library' | 'memory';
	type MemoryModal = 'persona' | 'focus' | null;
	type LibraryModal = 'documents' | 'results' | 'workflows' | null;
	type PersonaMemoryFilter = 'active' | 'dormant' | 'archived';
	type FocusContinuityView = 'tasks' | 'across_chats';
	const personaMemoryFilters: PersonaMemoryFilter[] = ['active', 'dormant', 'archived'];

	let documents = (data.documents ?? []) as KnowledgeDocumentItem[];
	let results = (data.results ?? []) as ArtifactSummary[];
	let workflows = (data.workflows ?? []) as WorkCapsule[];
	let personaMemories = [] as PersonaMemoryItem[];
	let taskMemories = [] as TaskMemoryItem[];
	let focusContinuities = [] as FocusContinuityItem[];
	let memorySummary = {
		personaCount: 0,
		taskCount: 0,
		focusContinuityCount: 0,
		overview: null,
	};
	const honchoEnabled = data.honchoEnabled ?? false;

	let activeTab: KnowledgeTab = 'library';
	let deletingArtifactIds = new Set<string>();
	let pendingMemoryActionKey: string | null = null;
	let pendingKnowledgeActionKey: string | null = null;
	let manageError = '';
	let memoryLoaded = false;
	let memoryLoading = false;
	let memoryLoadError = '';
	let activeMemoryModal = null as MemoryModal;
	let activeLibraryModal = null as LibraryModal;
	let honchoOverviewHtml = '';
	let selectedPersonaMemoryIds = [] as string[];
	let personaMemoryFilter: PersonaMemoryFilter = 'active';
	let selectedTaskMemoryIds = [] as string[];
	let selectedFocusContinuityIds = [] as string[];
	let focusContinuityView: FocusContinuityView = 'tasks';
	const userDisplayName = data.userDisplayName?.trim() || 'You';
	$: deletingArtifactCount = deletingArtifactIds.size;
	$: filteredPersonaMemories = personaMemories.filter(
		(memory) => memory.state === personaMemoryFilter
	);
	$: personaMemoryStateCounts = {
		active: personaMemories.filter((memory) => memory.state === 'active').length,
		dormant: personaMemories.filter((memory) => memory.state === 'dormant').length,
		archived: personaMemories.filter((memory) => memory.state === 'archived').length,
	};
	$: focusContinuityItemCount = taskMemories.length + focusContinuities.length;

	$: honchoOverview = memorySummary.overview?.trim() ?? '';
	$: void renderHonchoOverview(honchoOverview, $isDark);

	let overviewRenderVersion = 0;

	function escapeHtml(value: string): string {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;');
	}

	async function renderHonchoOverview(source: string, isDarkMode: boolean) {
		const renderVersion = ++overviewRenderVersion;

		if (!source) {
			honchoOverviewHtml = '';
			return;
		}

		try {
			const overviewHtml = await renderMarkdown(source, isDarkMode);
			if (renderVersion !== overviewRenderVersion) return;
			honchoOverviewHtml = overviewHtml;
		} catch {
			if (renderVersion !== overviewRenderVersion) return;
			honchoOverviewHtml = `<p>${escapeHtml(source)}</p>`;
		}
	}

	function isDeletingArtifact(id: string): boolean {
		return deletingArtifactIds.has(id);
	}

	function getDefaultPersonaMemoryFilter(memories: PersonaMemoryItem[]): PersonaMemoryFilter {
		if (memories.some((memory) => memory.state === 'active')) return 'active';
		if (memories.some((memory) => memory.state === 'dormant')) return 'dormant';
		if (memories.some((memory) => memory.state === 'archived')) return 'archived';
		return 'active';
	}

	function applyMemoryPayload(payload: KnowledgeMemoryPayload) {
		personaMemories = payload.personaMemories ?? [];
		taskMemories = payload.taskMemories ?? [];
		focusContinuities = payload.focusContinuities ?? [];
		memorySummary = payload.summary ?? {
			personaCount: 0,
			taskCount: 0,
			focusContinuityCount: 0,
			overview: null,
		};
		if (activeMemoryModal === 'persona') {
			personaMemoryFilter = getDefaultPersonaMemoryFilter(personaMemories);
		}
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
		resetModalSelections();
		activeLibraryModal = null;
		activeMemoryModal = kind;
		if (kind === 'persona') {
			personaMemoryFilter = getDefaultPersonaMemoryFilter(personaMemories);
		}
		if (kind === 'focus') {
			focusContinuityView = 'tasks';
		}
		void ensureMemoryLoaded();
	}

	function closeMemoryModal() {
		activeMemoryModal = null;
		resetModalSelections();
	}

	function openLibraryModal(kind: Exclude<LibraryModal, null>) {
		activeMemoryModal = null;
		resetModalSelections();
		activeLibraryModal = kind;
	}

	function closeLibraryModal() {
		activeLibraryModal = null;
	}

	function isMemoryActionPending(key: string): boolean {
		return pendingMemoryActionKey === key;
	}

	function resetModalSelections() {
		selectedPersonaMemoryIds = [];
		selectedTaskMemoryIds = [];
		selectedFocusContinuityIds = [];
	}

	function togglePersonaSelection(id: string) {
		selectedPersonaMemoryIds = selectedPersonaMemoryIds.includes(id)
			? selectedPersonaMemoryIds.filter((value) => value !== id)
			: [...selectedPersonaMemoryIds, id];
	}

	function toggleTaskSelection(id: string) {
		selectedTaskMemoryIds = selectedTaskMemoryIds.includes(id)
			? selectedTaskMemoryIds.filter((value) => value !== id)
			: [...selectedTaskMemoryIds, id];
	}

	function toggleAllPersonaSelections() {
		selectedPersonaMemoryIds =
			selectedPersonaMemoryIds.length === filteredPersonaMemories.length
				? []
				: filteredPersonaMemories.map((memory) => memory.id);
	}

	function toggleAllTaskSelections() {
		selectedTaskMemoryIds =
			selectedTaskMemoryIds.length === taskMemories.length
				? []
				: taskMemories.map((memory) => memory.taskId);
	}

	function toggleFocusContinuitySelection(id: string) {
		selectedFocusContinuityIds = selectedFocusContinuityIds.includes(id)
			? selectedFocusContinuityIds.filter((value) => value !== id)
			: [...selectedFocusContinuityIds, id];
	}

	function toggleAllFocusContinuitySelections() {
		selectedFocusContinuityIds =
			selectedFocusContinuityIds.length === focusContinuities.length
				? []
				: focusContinuities.map((memory) => memory.continuityId);
	}

	function getPrimaryPersonaScope(memory: PersonaMemoryItem): 'self' | 'assistant_about_user' {
		return memory.members[0]?.scope ?? 'self';
	}

	function formatPersonaActor(memory: PersonaMemoryItem): string {
		return getPrimaryPersonaScope(memory) === 'assistant_about_user' ? 'AlfyAI' : userDisplayName;
	}

	function formatPersonaOrigin(memory: PersonaMemoryItem): string {
		const scope = getPrimaryPersonaScope(memory);
		const sourceLabel = scope === 'assistant_about_user' ? 'Assistant inference' : 'Direct memory';
		return `${sourceLabel} · ${memory.sourceCount} source${memory.sourceCount === 1 ? '' : 's'}`;
	}

	function formatPersonaSource(memory: PersonaMemoryItem): string {
		if (memory.conversationTitles.length > 0) {
			return memory.conversationTitles.join(', ');
		}
		if (memory.members.some((member) => Boolean(member.sessionId))) {
			return 'Conversation memory';
		}
		return 'General memory';
	}

	function formatPersonaClass(memoryClass: PersonaMemoryItem['memoryClass']): string {
		return memoryClass.replace(/_/g, ' ');
	}

	function formatMemoryTimestamp(timestamp: number): string {
		return new Intl.DateTimeFormat(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short',
		}).format(timestamp);
	}

	function getPersonaRowKey(memory: PersonaMemoryItem, index: number): string {
		return `${memory.state}:${memory.id}:${index}`;
	}

	function formatArtifactSize(sizeBytes: number | null | undefined): string {
		if (!sizeBytes) return 'Unknown size';
		return `${Math.ceil(sizeBytes / 1024)} KB`;
	}

	function formatDocumentKind(document: KnowledgeDocumentItem): string {
		return document.normalizedAvailable ? 'Indexed document' : 'Source-only document';
	}

	function getLibraryBulkAction(kind: Exclude<LibraryModal, null>) {
		if (kind === 'documents') return 'forget_all_documents' as const;
		if (kind === 'results') return 'forget_all_results' as const;
		return 'forget_all_workflows' as const;
	}

	function getLibraryBulkKey(kind: Exclude<LibraryModal, null>): string {
		return `forget-all-${kind}`;
	}

	function getLibraryBulkLabel(kind: Exclude<LibraryModal, null>): string {
		if (kind === 'documents') return 'Forget all documents';
		if (kind === 'results') return 'Forget all results';
		return 'Forget all workflows';
	}

	function getLibraryBulkConfirmation(kind: Exclude<LibraryModal, null>): string {
		if (kind === 'documents') {
			return 'Forget all documents from the Knowledge Base? This removes uploaded files and their normalized text artifacts.';
		}
		if (kind === 'results') {
			return 'Forget all saved results from the Knowledge Base?';
		}
		return 'Forget all workflows from the Knowledge Base?';
	}

	function getLibraryItemCount(kind: Exclude<LibraryModal, null>): number {
		if (kind === 'documents') return documents.length;
		if (kind === 'results') return results.length;
		return workflows.length;
	}

	async function refreshKnowledgeLibrary() {
		const response = await fetch('/api/knowledge');
		const result = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(result.error ?? 'Failed to refresh the Knowledge Base.');
		}
		documents = result.documents ?? [];
		results = result.results ?? [];
		workflows = result.workflows ?? [];
	}

	async function submitMemoryAction(
		payload:
			| { action: 'forget_persona_memory'; clusterId?: string; conclusionId?: string }
			| { action: 'forget_all_persona_memory' }
			| { action: 'forget_task_memory'; taskId: string }
			| { action: 'forget_focus_continuity'; continuityId: string }
			| { action: 'forget_project_memory'; projectId: string }
	): Promise<KnowledgeMemoryPayload> {
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
		return result as KnowledgeMemoryPayload;
	}

	async function runMemoryAction(
		payload:
			| { action: 'forget_persona_memory'; clusterId?: string; conclusionId?: string }
			| { action: 'forget_all_persona_memory' }
			| { action: 'forget_task_memory'; taskId: string }
			| { action: 'forget_focus_continuity'; continuityId: string }
			| { action: 'forget_project_memory'; projectId: string },
		key: string,
		confirmationMessage?: string
	) {
		if (isMemoryActionPending(key)) return;
		if (confirmationMessage && !window.confirm(confirmationMessage)) return;

		manageError = '';
		pendingMemoryActionKey = key;

		try {
			const result = await submitMemoryAction(payload);
			applyMemoryPayload(result);
			if (payload.action === 'forget_persona_memory') {
				const forgottenId = payload.clusterId ?? payload.conclusionId;
				selectedPersonaMemoryIds = selectedPersonaMemoryIds.filter((id) => id !== forgottenId);
			}
			if (payload.action === 'forget_task_memory') {
				selectedTaskMemoryIds = selectedTaskMemoryIds.filter((id) => id !== payload.taskId);
			}
			if (payload.action === 'forget_all_persona_memory') {
				selectedPersonaMemoryIds = [];
			}
			if (payload.action === 'forget_focus_continuity') {
				selectedFocusContinuityIds = selectedFocusContinuityIds.filter(
					(id) => id !== payload.continuityId
				);
			}
			if (payload.action === 'forget_project_memory') {
				selectedFocusContinuityIds = selectedFocusContinuityIds.filter(
					(id) => id !== payload.projectId
				);
			}
		} catch (error) {
			manageError =
				error instanceof Error ? error.message : 'Failed to update memory profile.';
		} finally {
			pendingMemoryActionKey = null;
		}
	}

	async function runBulkPersonaForget() {
		if (selectedPersonaMemoryIds.length === 0) return;
		if (
			!window.confirm(
				`Forget ${selectedPersonaMemoryIds.length} selected persona memory item${selectedPersonaMemoryIds.length === 1 ? '' : 's'}?`
			)
		) {
			return;
		}

		manageError = '';
		pendingMemoryActionKey = 'forget-selected-persona';

		try {
			let result: KnowledgeMemoryPayload | null = null;
			if (selectedPersonaMemoryIds.length === personaMemories.length && honchoEnabled) {
				result = await submitMemoryAction({ action: 'forget_all_persona_memory' });
			} else {
				for (const id of selectedPersonaMemoryIds) {
					result = await submitMemoryAction({ action: 'forget_persona_memory', clusterId: id });
				}
			}
			if (result) {
				applyMemoryPayload(result);
			}
			selectedPersonaMemoryIds = [];
		} catch (error) {
			manageError =
				error instanceof Error ? error.message : 'Failed to update memory profile.';
		} finally {
			pendingMemoryActionKey = null;
		}
	}

	async function runBulkTaskForget() {
		if (selectedTaskMemoryIds.length === 0) return;
		if (
			!window.confirm(
				`Forget ${selectedTaskMemoryIds.length} selected task memory item${selectedTaskMemoryIds.length === 1 ? '' : 's'}?`
			)
		) {
			return;
		}

		manageError = '';
		pendingMemoryActionKey = 'forget-selected-task';

		try {
			let result: KnowledgeMemoryPayload | null = null;
			for (const id of selectedTaskMemoryIds) {
				result = await submitMemoryAction({ action: 'forget_task_memory', taskId: id });
			}
			if (result) {
				applyMemoryPayload(result);
			}
			selectedTaskMemoryIds = [];
		} catch (error) {
			manageError =
				error instanceof Error ? error.message : 'Failed to update memory profile.';
		} finally {
			pendingMemoryActionKey = null;
		}
	}

	async function runBulkFocusContinuityForget() {
		if (selectedFocusContinuityIds.length === 0) return;
		if (
			!window.confirm(
				`Forget ${selectedFocusContinuityIds.length} selected continuity item${selectedFocusContinuityIds.length === 1 ? '' : 's'} across chats?`
			)
		) {
			return;
		}

		manageError = '';
		pendingMemoryActionKey = 'forget-selected-focus-continuity';

		try {
			let result: KnowledgeMemoryPayload | null = null;
			for (const id of selectedFocusContinuityIds) {
				result = await submitMemoryAction({
					action: 'forget_focus_continuity',
					continuityId: id,
				});
			}
			if (result) {
				applyMemoryPayload(result);
			}
			selectedFocusContinuityIds = [];
		} catch (error) {
			manageError =
				error instanceof Error ? error.message : 'Failed to update memory profile.';
		} finally {
			pendingMemoryActionKey = null;
		}
	}

	function isKnowledgeActionPending(key: string): boolean {
		return pendingKnowledgeActionKey === key;
	}

	async function runKnowledgeAction(
		action: 'forget_all_documents' | 'forget_all_results' | 'forget_all_workflows' | 'forget_everything',
		key: string,
		confirmationMessage: string
	) {
		if (isKnowledgeActionPending(key)) return;
		if (!window.confirm(confirmationMessage)) return;

		manageError = '';
		pendingKnowledgeActionKey = key;

		try {
			const response = await fetch('/api/knowledge/actions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ action }),
			});
			const result = await response.json().catch(() => ({}));
			if (!response.ok || result.success === false) {
				throw new Error(result.error ?? result.message ?? 'Failed to update the Knowledge Base.');
			}

			await refreshKnowledgeLibrary();
			if (action === 'forget_everything' || memoryLoaded || activeTab === 'memory') {
				await ensureMemoryLoaded(true);
			}
			if (action === 'forget_everything') {
				activeMemoryModal = null;
				activeLibraryModal = null;
				resetModalSelections();
			}
		} catch (error) {
			manageError = error instanceof Error ? error.message : 'Failed to update the Knowledge Base.';
		} finally {
			pendingKnowledgeActionKey = null;
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
			if (!response.ok || payload.success === false) {
				throw new Error(
					payload.message ?? payload.error ?? 'Failed to remove artifact.'
				);
			}
			await refreshKnowledgeLibrary();
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
		if (event.key === 'Escape' && activeLibraryModal) {
			closeLibraryModal();
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

				<div class="flex justify-end">
					<button
						type="button"
						class="rounded-full border border-danger px-4 py-2 text-sm font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
						on:click={() =>
							runKnowledgeAction(
								'forget_everything',
								'forget-everything',
								'Forget everything in the Knowledge Base? This removes persona memory, task continuity, across-chat continuity, documents, results, workflows, and stored evidence traces, but keeps the chat conversations themselves.'
							)}
						disabled={isKnowledgeActionPending('forget-everything')}
					>
						{isKnowledgeActionPending('forget-everything') ? 'Resetting…' : 'Forget everything'}
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
				<div class="space-y-2">
					<h2 class="text-lg font-sans font-semibold text-text-primary">Library</h2>
					<p class="max-w-[720px] text-sm font-sans leading-[1.6] text-text-secondary">
						Documents, saved results, and workflow capsules now open in dedicated table views so larger libraries stay easy to scan.
					</p>
				</div>
				<div class="mt-5 grid gap-4 lg:grid-cols-3">
					<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
						<div class="flex items-center justify-between gap-3">
							<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Documents</div>
							<span class="rounded-full border border-border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
								{documents.length}
							</span>
						</div>
						<p class="mt-4 text-sm font-sans leading-[1.6] text-text-secondary">
							Uploaded files are managed as single logical documents, while their extracted text stays available behind the scenes for retrieval.
						</p>
						<button
							type="button"
							class="mt-4 rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
							on:click={() => openLibraryModal('documents')}
						>
							Manage documents
						</button>
					</div>

					<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
						<div class="flex items-center justify-between gap-3">
							<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Results</div>
							<span class="rounded-full border border-border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
								{results.length}
							</span>
						</div>
						<p class="mt-4 text-sm font-sans leading-[1.6] text-text-secondary">
							Saved generated outputs that remain available for recall and later refinement.
						</p>
						<button
							type="button"
							class="mt-4 rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
							on:click={() => openLibraryModal('results')}
						>
							Manage results
						</button>
					</div>

					<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
						<div class="flex items-center justify-between gap-3">
							<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">Workflows</div>
							<span class="rounded-full border border-border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
								{workflows.length}
							</span>
						</div>
						<p class="mt-4 text-sm font-sans leading-[1.6] text-text-secondary">
							Reusable workflow capsules summarizing patterns, source inputs, and output history.
						</p>
						<button
							type="button"
							class="mt-4 rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
							on:click={() => openLibraryModal('workflows')}
						>
							Manage workflows
						</button>
					</div>
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
					<div class="grid gap-4 lg:grid-cols-2">
						<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
							<div class="flex items-center justify-between gap-3">
								<div>
									<h3 class="text-lg font-sans font-semibold text-text-primary">
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
								{:else if memoryLoaded && personaMemories.length === 0}
									<span class="text-xs font-sans text-text-muted">
										No stored persona memory yet.
									</span>
								{/if}
							</div>
						</div>

						<div class="rounded-[1.3rem] border border-border bg-surface-page px-4 py-4">
							<div class="flex items-center justify-between gap-3">
								<div>
									<h3 class="text-lg font-sans font-semibold text-text-primary">
										Manage focus continuity
									</h3>
								</div>
								<span class="rounded-full border border-border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
									{focusContinuityItemCount}
								</span>
							</div>

							<p class="mt-4 text-sm font-sans leading-[1.6] text-text-secondary">
								Focus continuity combines per-chat task checkpoints with across-chat continuity groups in one background system.
							</p>

							<div class="mt-4 flex flex-wrap items-center gap-3">
								<button
									type="button"
									class="rounded-full border border-border px-4 py-2 text-sm font-sans font-medium text-text-primary transition hover:bg-surface-elevated"
									on:click={() => openMemoryModal('focus')}
								>
									Manage focus continuity
								</button>
								{#if memoryLoaded && focusContinuityItemCount === 0}
									<span class="text-xs font-sans text-text-muted">
										No focus continuity has been captured yet.
									</span>
								{/if}
							</div>
						</div>
					</div>

					<div class="mt-6 rounded-[1.3rem] border border-border bg-surface-page px-5 py-5">
						<h2 class="text-[1.75rem] font-serif tracking-[-0.04em] text-text-primary">
							Memory Overview
						</h2>
						{#if honchoOverview}
							<div class="memory-markdown prose mt-4 max-w-none text-base leading-[1.65] text-text-secondary dark:prose-invert">
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
			aria-labelledby={
				activeMemoryModal === 'persona'
					? 'persona-memory-dialog-title'
					: 'focus-memory-dialog-title'
			}
			tabindex={-1}
			class="max-h-[88vh] w-full max-w-[1100px] overflow-hidden rounded-[1.6rem] border border-border bg-surface-elevated shadow-2xl"
			on:click|stopPropagation
		>
			<div class="flex items-start justify-between gap-4 border-b border-border px-5 py-4 md:px-6">
				<div>
					<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
						{activeMemoryModal === 'persona'
							? 'Persona memory'
							: 'Focus continuity'}
					</div>
					<h3
						id={
							activeMemoryModal === 'persona'
								? 'persona-memory-dialog-title'
								: 'focus-memory-dialog-title'
						}
						class="mt-2 text-xl font-serif tracking-[-0.03em] text-text-primary"
					>
						{activeMemoryModal === 'persona'
							? 'Manage stored persona memories'
							: 'Manage focus continuity'}
					</h3>
					<p class="mt-2 text-sm font-sans leading-[1.6] text-text-secondary">
						{activeMemoryModal === 'persona'
							? 'Review memory items in a compact table and forget individual entries without scrolling through long cards.'
							: 'Inspect both per-chat task continuity and across-chat continuity groups without treating long-horizon work as a separate project UI.'}
					</p>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					{#if activeMemoryModal === 'persona' && selectedPersonaMemoryIds.length > 0}
						<button
							type="button"
							class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
							on:click={runBulkPersonaForget}
							disabled={isMemoryActionPending('forget-selected-persona')}
						>
							Forget selected ({selectedPersonaMemoryIds.length})
						</button>
					{/if}
					{#if activeMemoryModal === 'focus' && focusContinuityView === 'tasks' && selectedTaskMemoryIds.length > 0}
						<button
							type="button"
							class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
							on:click={runBulkTaskForget}
							disabled={isMemoryActionPending('forget-selected-task')}
						>
							Forget selected ({selectedTaskMemoryIds.length})
						</button>
					{/if}
					{#if activeMemoryModal === 'focus' && focusContinuityView === 'across_chats' && selectedFocusContinuityIds.length > 0}
						<button
							type="button"
							class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
							on:click={runBulkFocusContinuityForget}
							disabled={isMemoryActionPending('forget-selected-focus-continuity')}
						>
							Forget selected ({selectedFocusContinuityIds.length})
						</button>
					{/if}
					{#if activeMemoryModal === 'persona' && honchoEnabled && personaMemories.length > 0}
						<button
							type="button"
							class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
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
				{#if memoryLoading && !memoryLoaded}
					<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm font-sans text-text-muted">
						Loading memory profile…
					</div>
				{:else if memoryLoadError && !memoryLoaded}
					<div class="rounded-[1.2rem] border border-danger bg-surface-page px-4 py-5 text-sm font-sans text-danger">
						{memoryLoadError}
					</div>
				{:else if activeMemoryModal === 'persona'}
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
							<div class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
								{#each personaMemoryFilters as state}
									<button
										type="button"
										class={`rounded-full border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] ${
											personaMemoryFilter === state
												? 'border-border bg-surface-elevated text-text-primary'
												: 'border-border text-text-muted'
										}`}
										on:click={() => {
											personaMemoryFilter = state;
											selectedPersonaMemoryIds = [];
										}}
									>
										{state} ({personaMemoryStateCounts[state]})
									</button>
								{/each}
							</div>
							<table class="min-w-[880px] w-full border-collapse">
								<thead>
									<tr class="border-b border-border bg-surface-elevated/70 text-left">
										<th class="w-12 px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">
											<input
												type="checkbox"
												checked={filteredPersonaMemories.length > 0 && selectedPersonaMemoryIds.length === filteredPersonaMemories.length}
												on:change={toggleAllPersonaSelections}
												aria-label="Select all persona memories"
											/>
										</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Actor</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Memory</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Class</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Source</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Last seen</th>
										<th class="px-4 py-3 text-right text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Action</th>
									</tr>
								</thead>
								<tbody>
									{#each filteredPersonaMemories as memory, index (getPersonaRowKey(memory, index))}
										<tr class="border-b border-border last:border-b-0">
											<td class="px-4 py-3 align-top">
												<input
													type="checkbox"
													checked={selectedPersonaMemoryIds.includes(memory.id)}
													on:change={() => togglePersonaSelection(memory.id)}
													aria-label={`Select ${memory.canonicalText}`}
												/>
											</td>
											<td class="px-4 py-3 align-top">
												<div class="text-sm font-sans font-medium text-text-primary">
													{formatPersonaActor(memory)}
												</div>
												<div class="mt-1 text-xs font-sans text-text-muted">
													{formatPersonaOrigin(memory)}
												</div>
											</td>
											<td class="px-4 py-3 align-top">
												<div class="memory-preview text-sm font-serif leading-[1.55] text-text-secondary" title={memory.canonicalText}>
													{memory.canonicalText}
												</div>
												{#if memory.members.length > 1}
													<details class="mt-2 text-xs font-sans text-text-muted">
														<summary>Show raw memories ({memory.members.length})</summary>
														<div class="mt-2 space-y-2">
															{#each memory.members as member (`${memory.id}-${member.id}`)}
																<div>
																	<div>{member.content}</div>
																	<div class="mt-1 text-[0.68rem] text-text-muted">
																		{member.conversationTitle ?? 'Conversation memory'} · {formatMemoryTimestamp(member.createdAt)}
																	</div>
																</div>
															{/each}
														</div>
													</details>
												{/if}
											</td>
											<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">
												<div>{formatPersonaClass(memory.memoryClass)}</div>
												<div class="mt-1 text-xs text-text-muted">
													Salience {memory.salienceScore}
												</div>
											</td>
											<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">
												{formatPersonaSource(memory)}
											</td>
											<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">
												{formatMemoryTimestamp(memory.lastSeenAt)}
											</td>
											<td class="px-4 py-3 align-top text-right">
												<button
													type="button"
													class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
													on:click={() =>
														runMemoryAction(
															{ action: 'forget_persona_memory', clusterId: memory.id },
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
					<div class="border-b border-border px-4 py-3">
						<div class="flex flex-wrap items-center gap-2">
							<button
								type="button"
								class={`rounded-full border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] ${
									focusContinuityView === 'tasks'
										? 'border-border bg-surface-elevated text-text-primary'
										: 'border-border text-text-muted'
								}`}
								on:click={() => {
									focusContinuityView = 'tasks';
									selectedTaskMemoryIds = [];
								}}
							>
								Tasks ({taskMemories.length})
							</button>
							<button
								type="button"
								class={`rounded-full border px-3 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] ${
									focusContinuityView === 'across_chats'
										? 'border-border bg-surface-elevated text-text-primary'
										: 'border-border text-text-muted'
								}`}
								on:click={() => {
									focusContinuityView = 'across_chats';
									selectedFocusContinuityIds = [];
								}}
							>
								Across chats ({focusContinuities.length})
							</button>
						</div>
					</div>

					{#if focusContinuityView === 'tasks'}
						{#if taskMemories.length === 0}
							<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm font-sans text-text-muted">
								No task-state continuity has been checkpointed yet.
							</div>
						{:else}
							<div class="overflow-x-auto rounded-[1.2rem] border border-border bg-surface-page">
								<table class="min-w-[980px] w-full border-collapse">
									<thead>
										<tr class="border-b border-border bg-surface-elevated/70 text-left">
											<th class="w-12 px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">
												<input
													type="checkbox"
													checked={taskMemories.length > 0 && selectedTaskMemoryIds.length === taskMemories.length}
													on:change={toggleAllTaskSelections}
													aria-label="Select all task continuity items"
												/>
											</th>
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
													<input
														type="checkbox"
														checked={selectedTaskMemoryIds.includes(memory.taskId)}
														on:change={() => toggleTaskSelection(memory.taskId)}
														aria-label={`Select ${memory.objective}`}
													/>
												</td>
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
														class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
														on:click={() =>
															runMemoryAction(
																{ action: 'forget_task_memory', taskId: memory.taskId },
																`task-${memory.taskId}`,
																'Forget this task continuity? The conversation can still continue, but its long-horizon checkpoints will be cleared.'
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
					{:else if focusContinuities.length === 0}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm font-sans text-text-muted">
							No across-chat continuity groups have been captured yet.
						</div>
					{:else}
						<div class="overflow-x-auto rounded-[1.2rem] border border-border bg-surface-page">
							<table class="min-w-[980px] w-full border-collapse">
								<thead>
									<tr class="border-b border-border bg-surface-elevated/70 text-left">
										<th class="w-12 px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">
											<input
												type="checkbox"
												checked={focusContinuities.length > 0 && selectedFocusContinuityIds.length === focusContinuities.length}
												on:change={toggleAllFocusContinuitySelections}
												aria-label="Select all across-chat continuity items"
											/>
										</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Continuity</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Summary</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Status</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Linked chats</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Updated</th>
										<th class="px-4 py-3 text-right text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Action</th>
									</tr>
								</thead>
								<tbody>
									{#each focusContinuities as memory (memory.continuityId)}
										<tr class="border-b border-border last:border-b-0">
											<td class="px-4 py-3 align-top">
												<input
													type="checkbox"
													checked={selectedFocusContinuityIds.includes(memory.continuityId)}
													on:change={() => toggleFocusContinuitySelection(memory.continuityId)}
													aria-label={`Select ${memory.name}`}
												/>
											</td>
											<td class="px-4 py-3 align-top">
												<div class="text-sm font-sans font-medium text-text-primary">
													{memory.name}
												</div>
												<div class="mt-1 text-xs font-sans text-text-muted">
													{memory.linkedTaskCount} linked task{memory.linkedTaskCount === 1 ? '' : 's'}
												</div>
											</td>
											<td class="px-4 py-3 align-top">
												<div class="memory-preview text-sm font-serif leading-[1.55] text-text-secondary" title={memory.summary ?? ''}>
													{memory.summary ?? 'No continuity summary stored yet.'}
												</div>
											</td>
											<td class="px-4 py-3 align-top">
												<span class="rounded-full border border-border px-2.5 py-1 text-[0.68rem] font-sans uppercase tracking-[0.1em] text-text-muted">
													{memory.status}
												</span>
											</td>
											<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">
												{memory.conversationTitles.length > 0
													? memory.conversationTitles.join(', ')
													: 'Conversation memory'}
											</td>
											<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">
												{formatMemoryTimestamp(memory.updatedAt)}
											</td>
											<td class="px-4 py-3 align-top text-right">
												<button
													type="button"
													class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
													on:click={() =>
														runMemoryAction(
															{ action: 'forget_focus_continuity', continuityId: memory.continuityId },
															`focus-continuity-${memory.continuityId}`,
															'Forget this across-chat continuity group? Conversation history will stay intact.'
														)}
													disabled={isMemoryActionPending(`focus-continuity-${memory.continuityId}`)}
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

{#if activeLibraryModal}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 z-[120] flex items-center justify-center bg-surface-overlay/65 p-4 backdrop-blur-sm"
		on:click={closeLibraryModal}
	>
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			role="dialog"
			aria-modal="true"
			tabindex={-1}
			class="max-h-[88vh] w-full max-w-[1180px] overflow-hidden rounded-[1.6rem] border border-border bg-surface-elevated shadow-2xl"
			on:click|stopPropagation
		>
			<div class="flex items-start justify-between gap-4 border-b border-border px-5 py-4 md:px-6">
				<div>
					<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
						{activeLibraryModal === 'documents'
							? 'Documents'
							: activeLibraryModal === 'results'
								? 'Results'
								: 'Workflows'}
					</div>
					<h3 class="mt-2 text-xl font-serif tracking-[-0.03em] text-text-primary">
						{activeLibraryModal === 'documents'
							? 'Manage documents'
							: activeLibraryModal === 'results'
								? 'Manage saved results'
								: 'Manage workflows'}
					</h3>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					{#if activeLibraryModal && getLibraryItemCount(activeLibraryModal) > 0}
						<button
							type="button"
							class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
							on:click={() =>
								runKnowledgeAction(
									getLibraryBulkAction(activeLibraryModal),
									getLibraryBulkKey(activeLibraryModal),
									getLibraryBulkConfirmation(activeLibraryModal)
								)}
							disabled={isKnowledgeActionPending(getLibraryBulkKey(activeLibraryModal))}
						>
							{isKnowledgeActionPending(getLibraryBulkKey(activeLibraryModal))
								? 'Removing…'
								: getLibraryBulkLabel(activeLibraryModal)}
						</button>
					{/if}
					<button
						type="button"
						class="btn-icon-bare h-10 w-10 rounded-full text-icon-muted hover:text-text-primary"
						on:click={closeLibraryModal}
						aria-label="Close library manager"
					>
						<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
							<line x1="18" x2="6" y1="6" y2="18" />
							<line x1="6" x2="18" y1="6" y2="18" />
						</svg>
					</button>
				</div>
			</div>

			<div class="max-h-[calc(88vh-104px)] overflow-y-auto px-5 py-5 md:px-6">
				{#if pendingKnowledgeActionKey}
					<div
						class="mb-4 rounded-[1rem] border border-border bg-surface-page px-4 py-3 text-sm font-sans text-text-secondary shadow-sm"
						role="status"
						aria-live="polite"
					>
						Updating the Knowledge Base…
					</div>
				{/if}
				{#if deletingArtifactCount > 0}
					<div
						class="mb-4 rounded-[1rem] border border-border bg-surface-page px-4 py-3 text-sm font-sans text-text-secondary shadow-sm"
						role="status"
						aria-live="polite"
					>
						Removing {deletingArtifactCount} item{deletingArtifactCount === 1 ? '' : 's'} from the Knowledge Base…
					</div>
				{/if}
				{#if activeLibraryModal === 'documents'}
					{#if documents.length === 0}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm text-text-muted">
							No documents yet.
						</div>
					{:else}
						<div class="overflow-x-auto rounded-[1.2rem] border border-border bg-surface-page">
							<table class="min-w-[980px] w-full border-collapse">
								<thead>
									<tr class="border-b border-border bg-surface-elevated/70 text-left">
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Name</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Type</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Size</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Summary</th>
										<th class="px-4 py-3 text-right text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Action</th>
									</tr>
								</thead>
								<tbody>
									{#each documents as artifact (artifact.id)}
										<tr
											class={`border-b border-border last:border-b-0 ${
												isDeletingArtifact(artifact.id) ? 'opacity-60' : ''
											}`}
										>
											<td class="px-4 py-3 align-top text-sm font-sans font-medium text-text-primary">{artifact.name}</td>
											<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">{formatDocumentKind(artifact)}</td>
											<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">{formatArtifactSize(artifact.sizeBytes)}</td>
											<td class="px-4 py-3 align-top">
												<div class="memory-preview text-sm font-serif leading-[1.55] text-text-secondary">
													{artifact.summary ?? 'No summary stored.'}
												</div>
											</td>
											<td class="px-4 py-3 align-top text-right">
												<button
													type="button"
													class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
													on:click={() => removeArtifact(artifact.id, artifact.name)}
													disabled={isDeletingArtifact(artifact.id)}
													aria-busy={isDeletingArtifact(artifact.id)}
												>
													{isDeletingArtifact(artifact.id) ? 'Removing…' : 'Remove'}
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				{:else if activeLibraryModal === 'results'}
					{#if results.length === 0}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm text-text-muted">
							No saved results yet.
						</div>
					{:else}
						<div class="overflow-x-auto rounded-[1.2rem] border border-border bg-surface-page">
							<table class="min-w-[940px] w-full border-collapse">
								<thead>
									<tr class="border-b border-border bg-surface-elevated/70 text-left">
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Name</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Type</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Summary</th>
										<th class="px-4 py-3 text-right text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Action</th>
									</tr>
								</thead>
								<tbody>
									{#each results as artifact (artifact.id)}
										<tr
											class={`border-b border-border last:border-b-0 ${
												isDeletingArtifact(artifact.id) ? 'opacity-60' : ''
											}`}
										>
											<td class="px-4 py-3 align-top text-sm font-sans font-medium text-text-primary">{artifact.name}</td>
											<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">{artifact.type}</td>
											<td class="px-4 py-3 align-top">
												<div class="memory-preview text-sm font-serif leading-[1.55] text-text-secondary">
													{artifact.summary ?? 'No summary stored.'}
												</div>
											</td>
											<td class="px-4 py-3 align-top text-right">
												<button
													type="button"
													class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
													on:click={() => removeArtifact(artifact.id, artifact.name)}
													disabled={isDeletingArtifact(artifact.id)}
													aria-busy={isDeletingArtifact(artifact.id)}
												>
													{isDeletingArtifact(artifact.id) ? 'Removing…' : 'Remove'}
												</button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				{:else}
					{#if workflows.length === 0}
						<div class="rounded-[1.2rem] border border-dashed border-border bg-surface-page px-4 py-5 text-sm text-text-muted">
							No workflow capsules yet.
						</div>
					{:else}
						<div class="overflow-x-auto rounded-[1.2rem] border border-border bg-surface-page">
							<table class="min-w-[1080px] w-full border-collapse">
								<thead>
									<tr class="border-b border-border bg-surface-elevated/70 text-left">
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Name</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Task summary</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Workflow summary</th>
										<th class="px-4 py-3 text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Linked artifacts</th>
										<th class="px-4 py-3 text-right text-[0.68rem] font-sans uppercase tracking-[0.12em] text-text-muted">Action</th>
									</tr>
								</thead>
								<tbody>
									{#each workflows as capsule (capsule.artifact.id)}
										<tr
											class={`border-b border-border last:border-b-0 ${
												isDeletingArtifact(capsule.artifact.id) ? 'opacity-60' : ''
											}`}
										>
											<td class="px-4 py-3 align-top text-sm font-sans font-medium text-text-primary">{capsule.artifact.name}</td>
											<td class="px-4 py-3 align-top">
												<div class="memory-preview text-sm font-serif leading-[1.55] text-text-secondary">
													{capsule.taskSummary ?? 'No task summary stored.'}
												</div>
											</td>
											<td class="px-4 py-3 align-top">
												<div class="memory-preview text-sm font-serif leading-[1.55] text-text-secondary">
													{capsule.workflowSummary ?? 'No workflow summary stored.'}
												</div>
											</td>
											<td class="px-4 py-3 align-top text-sm font-sans text-text-secondary">
												{capsule.sourceArtifactIds.length} docs / {capsule.outputArtifactIds.length} outputs
											</td>
											<td class="px-4 py-3 align-top text-right">
												<button
													type="button"
													class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
													on:click={() => removeArtifact(capsule.artifact.id, capsule.artifact.name)}
													disabled={isDeletingArtifact(capsule.artifact.id)}
													aria-busy={isDeletingArtifact(capsule.artifact.id)}
												>
													{isDeletingArtifact(capsule.artifact.id) ? 'Removing…' : 'Remove'}
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
	button {
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
	}

	input[type='checkbox'] {
		cursor: pointer;
	}

	.memory-markdown :global(*:last-child) {
		margin-bottom: 0;
	}

	.memory-markdown :global(p + p),
	.memory-markdown :global(ul + p),
	.memory-markdown :global(ol + p) {
		margin-top: 0.85rem;
	}

	.memory-markdown :global(strong) {
		color: var(--text-primary);
		font-weight: 600;
	}

	.memory-markdown :global(ul),
	.memory-markdown :global(ol) {
		padding-left: 1.25rem;
	}

	.memory-markdown :global(pre) {
		background: var(--surface-code);
		border-color: var(--border-default);
	}

	.memory-markdown :global(code) {
		color: var(--text-primary);
	}

	.memory-markdown :global(:not(pre) > code) {
		background: color-mix(in srgb, var(--surface-code) 90%, transparent 10%);
	}

	.memory-markdown :global(pre code) {
		background: transparent;
		color: inherit;
	}

	.memory-preview {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		overflow: hidden;
	}
</style>
