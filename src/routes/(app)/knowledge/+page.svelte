<script lang="ts">
	import {
		deleteKnowledgeArtifact,
		fetchKnowledgeLibrary,
		fetchKnowledgeMemory,
		fetchKnowledgeMemoryOverview,
		submitKnowledgeBulkAction,
		submitKnowledgeMemoryAction,
		type KnowledgeBulkAction,
		type KnowledgeMemoryActionPayload,
		fetchVaults,
		createVault,
		renameVault,
		deleteVault,
		fetchStorageQuota,
		type Vault,
		type StorageQuota,
	} from '$lib/client/api/knowledge';
	import { isDark } from '$lib/stores/theme';
	import { renderMarkdown } from '$lib/services/markdown';
	import KnowledgeLibraryModal from './_components/KnowledgeLibraryModal.svelte';
	import KnowledgeLibraryView from './_components/KnowledgeLibraryView.svelte';
	import KnowledgeMemoryModal from './_components/KnowledgeMemoryModal.svelte';
	import KnowledgeMemoryView from './_components/KnowledgeMemoryView.svelte';
	import VaultSidebar from './_components/VaultSidebar.svelte';
	import type {
		ArtifactSummary,
		FocusContinuityItem,
		KnowledgeDocumentItem,
		KnowledgeMemoryPayload,
		KnowledgeMemorySummary,
		PersonaMemoryItem,
		TaskMemoryItem,
		WorkCapsule,
	} from '$lib/types';
	import {
		getDefaultPersonaMemoryFilter,
		getFocusContinuityItemCount,
		getLibraryBulkAction,
		getLibraryBulkConfirmation,
		getLibraryBulkKey,
	} from './_helpers';
	import type {
		FocusContinuityView,
		KnowledgeTab,
		LibraryModal,
		MemoryModal,
		PersonaMemoryFilter,
	} from './_helpers';
	import type { PageProps } from './$types';

	const OVERVIEW_POLL_INTERVAL_MS = 20_000;
	const OVERVIEW_POLL_MAX_ATTEMPTS = 15;

	let { data }: PageProps = $props();
	const getData = () => data;
	const initialDocuments = (getData().documents ?? []) as KnowledgeDocumentItem[];
	const initialResults = (getData().results ?? []) as ArtifactSummary[];
	const initialWorkflows = (getData().workflows ?? []) as WorkCapsule[];
	const initialVaults = (getData().vaults ?? []) as Vault[];

	let documents = $state<KnowledgeDocumentItem[]>(initialDocuments);
	let results = $state<ArtifactSummary[]>(initialResults);
	let workflows = $state<WorkCapsule[]>(initialWorkflows);
	let vaults = $state<Vault[]>(initialVaults);
	let activeVaultId = $state<string | null>(initialVaults[0]?.id ?? null);
	let storageQuota = $state<StorageQuota | null>(null);
	let personaMemories = $state<PersonaMemoryItem[]>([]);
	let taskMemories = $state<TaskMemoryItem[]>([]);
	let focusContinuities = $state<FocusContinuityItem[]>([]);
	let memorySummary = $state<KnowledgeMemorySummary>({
		personaCount: 0,
		taskCount: 0,
		focusContinuityCount: 0,
		overview: null,
		overviewSource: null,
		overviewStatus: 'disabled',
		overviewUpdatedAt: null,
		overviewLastAttemptAt: null,
		durablePersonaCount: 0,
	});
	const honchoEnabled = getData().honchoEnabled ?? false;

	let activeTab = $state<KnowledgeTab>('library');
	let deletingArtifactIds = $state(new Set<string>());
	let pendingMemoryActionKey = $state<string | null>(null);
	let pendingKnowledgeActionKey = $state<string | null>(null);
	let manageError = $state('');
	let memoryLoaded = $state(false);
	let memoryLoading = $state(false);
	let memoryLoadError = $state('');
	let liveOverviewRefreshing = $state(false);
	let liveOverviewPollAttempts = $state(0);
	let memoryTabVisible = $state(true);
	let activeMemoryModal = $state<MemoryModal>(null);
	let activeLibraryModal = $state<LibraryModal>(null);
	let honchoOverviewHtml = $state('');
	let selectedPersonaMemoryIds = $state<string[]>([]);
	let personaMemoryFilter = $state<PersonaMemoryFilter>('active');
	let selectedTaskMemoryIds = $state<string[]>([]);
	let selectedFocusContinuityIds = $state<string[]>([]);
	let focusContinuityView = $state<FocusContinuityView>('tasks');
	const userDisplayName = getData().userDisplayName?.trim() || 'You';
	let deletingArtifactCount = $derived(deletingArtifactIds.size);
	let filteredPersonaMemories = $derived(personaMemories.filter(
		(memory) => memory.state === personaMemoryFilter
	));
	let personaMemoryStateCounts = $derived.by(() => ({
		active: personaMemories.filter((memory) => memory.state === 'active').length,
		dormant: personaMemories.filter((memory) => memory.state === 'dormant').length,
		archived: personaMemories.filter((memory) => memory.state === 'archived').length,
	}));
	let focusContinuityItemCount = $derived(
		getFocusContinuityItemCount({ taskMemories, focusContinuities })
	);

	let honchoOverview = $derived(memorySummary.overview?.trim() ?? '');
	let honchoOverviewSource = $derived(memorySummary.overviewSource);
	let honchoOverviewStatus = $derived(memorySummary.overviewStatus);
	let honchoOverviewUpdatedAt = $derived(memorySummary.overviewUpdatedAt);
	let honchoOverviewLastAttemptAt = $derived(memorySummary.overviewLastAttemptAt);
	let durablePersonaCount = $derived(memorySummary.durablePersonaCount);
	$effect(() => {
		void renderHonchoOverview(honchoOverview, $isDark);
	});

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

	function applyMemoryPayload(payload: KnowledgeMemoryPayload) {
		personaMemories = payload.personaMemories ?? [];
		taskMemories = payload.taskMemories ?? [];
		focusContinuities = payload.focusContinuities ?? [];
		memorySummary = payload.summary
			? {
					personaCount: payload.summary.personaCount ?? 0,
					taskCount: payload.summary.taskCount ?? 0,
					focusContinuityCount: payload.summary.focusContinuityCount ?? 0,
					overview: payload.summary.overview ?? null,
					overviewSource: payload.summary.overviewSource ?? null,
					overviewStatus:
						payload.summary.overviewStatus ?? (honchoEnabled ? 'not_enough_durable_memory' : 'disabled'),
					overviewUpdatedAt: payload.summary.overviewUpdatedAt ?? null,
					overviewLastAttemptAt: payload.summary.overviewLastAttemptAt ?? null,
					durablePersonaCount: payload.summary.durablePersonaCount ?? 0,
				}
			: {
			personaCount: 0,
			taskCount: 0,
			focusContinuityCount: 0,
			overview: null,
			overviewSource: null,
			overviewStatus: honchoEnabled ? 'not_enough_durable_memory' : 'disabled',
			overviewUpdatedAt: null,
			overviewLastAttemptAt: null,
			durablePersonaCount: 0,
		};
		if (activeMemoryModal === 'persona') {
			personaMemoryFilter = getDefaultPersonaMemoryFilter(personaMemories);
		}
		memoryLoaded = true;
		memoryLoadError = '';
	}

	function applyMemoryOverviewSummary(summary: KnowledgeMemorySummary) {
		memorySummary = {
			...memorySummary,
			personaCount: summary.personaCount || memorySummary.personaCount,
			overview: summary.overview ?? null,
			overviewSource: summary.overviewSource ?? null,
			overviewStatus:
				summary.overviewStatus ?? (honchoEnabled ? 'not_enough_durable_memory' : 'disabled'),
			overviewUpdatedAt: summary.overviewUpdatedAt ?? null,
			overviewLastAttemptAt: summary.overviewLastAttemptAt ?? null,
			durablePersonaCount: summary.durablePersonaCount ?? memorySummary.durablePersonaCount,
		};
	}

	async function ensureMemoryLoaded(force = false) {
		if (memoryLoading) return;
		if (memoryLoaded && !force) return;

		memoryLoading = true;
		memoryLoadError = '';

		try {
			const result = await fetchKnowledgeMemory();
			applyMemoryPayload(result);
		} catch (error) {
			memoryLoadError =
				error instanceof Error ? error.message : 'Failed to load memory profile.';
		} finally {
			memoryLoading = false;
		}
	}

	function shouldPollLiveOverview(): boolean {
		if (!honchoEnabled || !memoryLoaded || memoryLoading) return false;
		if (activeTab !== 'memory' || !memoryTabVisible) return false;
		if (honchoOverviewSource === 'honcho_live') return false;
		if (
			honchoOverviewStatus === 'disabled' ||
			honchoOverviewStatus === 'not_enough_durable_memory'
		) {
			return false;
		}
		return true;
	}

	async function refreshLiveOverview(force = false) {
		if (liveOverviewRefreshing || !honchoEnabled || !memoryLoaded) return;
		if (!force && liveOverviewPollAttempts >= OVERVIEW_POLL_MAX_ATTEMPTS) return;

		liveOverviewRefreshing = true;
		if (!force) {
			liveOverviewPollAttempts += 1;
		}

		try {
			const payload = await fetchKnowledgeMemoryOverview({ force });
			applyMemoryOverviewSummary(payload.summary);
		} catch (error) {
			if (force) {
				manageError =
					error instanceof Error
						? error.message
						: 'Failed to refresh the live memory overview.';
			}
		} finally {
			liveOverviewRefreshing = false;
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

	function setPersonaMemoryFilter(filter: PersonaMemoryFilter) {
		personaMemoryFilter = filter;
		selectedPersonaMemoryIds = [];
	}

	function setFocusContinuityView(view: FocusContinuityView) {
		focusContinuityView = view;
		if (view === 'tasks') {
			selectedTaskMemoryIds = [];
			return;
		}
		selectedFocusContinuityIds = [];
	}

	async function refreshKnowledgeLibrary() {
		const result = await fetchKnowledgeLibrary();
		documents = result.documents ?? [];
		results = result.results ?? [];
		workflows = result.workflows ?? [];
	}

	async function submitMemoryAction(
		payload: KnowledgeMemoryActionPayload
	): Promise<KnowledgeMemoryPayload> {
		return submitKnowledgeMemoryAction(payload);
	}

	async function runMemoryAction(
		payload: KnowledgeMemoryActionPayload,
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
		action: KnowledgeBulkAction,
		key: string,
		confirmationMessage: string
	) {
		if (isKnowledgeActionPending(key)) return;
		if (!window.confirm(confirmationMessage)) return;

		manageError = '';
		pendingKnowledgeActionKey = key;

		try {
			const result = await submitKnowledgeBulkAction(action);
			if (result.success === false) {
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
			const payload = await deleteKnowledgeArtifact(id);
			if (payload.success === false) {
				throw new Error(payload.message ?? payload.error ?? 'Failed to remove artifact.');
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

	function runLibraryBulkAction(kind: Exclude<LibraryModal, null>) {
		return runKnowledgeAction(
			getLibraryBulkAction(kind),
			getLibraryBulkKey(kind),
			getLibraryBulkConfirmation(kind)
		);
	}

	async function handleVaultSelect(payload: { id: string }) {
		activeVaultId = payload.id;
	}

	function setActiveVault(vaultId: string | null) {
		activeVaultId = vaultId;
	}

	async function handleVaultCreate(payload: { name: string; color: string }) {
		try {
			const vault = await createVault(payload.name, payload.color);
			vaults = [...vaults, vault];
			activeVaultId = vault.id;
		} catch (error) {
			manageError = error instanceof Error ? error.message : 'Failed to create vault.';
		}
	}

	async function handleVaultRename(payload: { id: string; name: string }) {
		try {
			const updated = await renameVault(payload.id, payload.name);
			vaults = vaults.map((v) => (v.id === payload.id ? updated : v));
		} catch (error) {
			manageError = error instanceof Error ? error.message : 'Failed to rename vault.';
		}
	}

	async function handleVaultDelete(payload: { id: string }) {
		try {
			await deleteVault(payload.id);
			const remainingVaults = vaults.filter((v) => v.id !== payload.id);
			vaults = remainingVaults;
			if (activeVaultId === payload.id) {
				activeVaultId = remainingVaults[0]?.id ?? null;
			}
			await refreshStorageQuota();
		} catch (error) {
			manageError = error instanceof Error ? error.message : 'Failed to delete vault.';
		}
	}

	async function handleVaultUpload(payload: { vaultId: string; response: { artifact: { id: string; name: string } } }) {
		await refreshStorageQuota();
		await refreshKnowledgeLibrary();
	}

	async function refreshStorageQuota() {
		try {
			storageQuota = await fetchStorageQuota();
		} catch (error) {
			console.error('Failed to refresh storage quota:', error);
		}
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && activeMemoryModal) {
			closeMemoryModal();
		}
		if (event.key === 'Escape' && activeLibraryModal) {
			closeLibraryModal();
		}
	}

	$effect(() => {
		if (typeof document === 'undefined') return;
		const handleVisibilityChange = () => {
			memoryTabVisible = !document.hidden;
		};
		handleVisibilityChange();
		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	});

	$effect(() => {
		if (!shouldPollLiveOverview()) {
			liveOverviewPollAttempts = 0;
			return;
		}

		let cancelled = false;
		let intervalId: ReturnType<typeof window.setInterval> | null = null;

		const startPolling = async () => {
			await refreshLiveOverview(false);
			if (cancelled || honchoOverviewSource === 'honcho_live') return;
			intervalId = window.setInterval(() => {
				if (cancelled || liveOverviewRefreshing) return;
				if (liveOverviewPollAttempts >= OVERVIEW_POLL_MAX_ATTEMPTS) {
					if (intervalId) {
						window.clearInterval(intervalId);
						intervalId = null;
					}
					return;
				}
				void refreshLiveOverview(false);
			}, OVERVIEW_POLL_INTERVAL_MS);
		};

		void startPolling();

		return () => {
			cancelled = true;
			if (intervalId) {
				window.clearInterval(intervalId);
			}
		};
	});

	$effect(() => {
		void refreshStorageQuota();
	});
</script>

<svelte:head>
	<title>Knowledge Base</title>
</svelte:head>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="knowledge-page flex h-full min-h-0 flex-row overflow-hidden bg-surface-page">
	<aside class="vault-sidebar-container flex h-full w-[17.5rem] shrink-0 border-r border-border-subtle/70 bg-surface-page/80 px-3 py-6">
		<div class="flex min-h-0 w-full flex-1 rounded-[1.6rem] border border-border bg-surface-elevated/90 p-3 shadow-sm">
			<VaultSidebar
				{vaults}
				{activeVaultId}
				quota={storageQuota}
				onSelect={handleVaultSelect}
				onCreate={handleVaultCreate}
				onRename={handleVaultRename}
				onDelete={handleVaultDelete}
				onUpload={handleVaultUpload}
			/>
		</div>
	</aside>

	<div class="main-content flex flex-1 flex-col overflow-y-auto px-5 py-6 md:px-8">
		<div class="mx-auto flex w-full max-w-[1040px] flex-col gap-8">
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
						onclick={() => selectTab('library')}
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
						onclick={() => selectTab('memory')}
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
						onclick={() =>
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
			<KnowledgeLibraryView
				{vaults}
				{activeVaultId}
				{documents}
				{results}
				{workflows}
				quota={storageQuota}
				onOpenLibraryModal={openLibraryModal}
				onSelectVault={setActiveVault}
			/>
		{:else}
			<KnowledgeMemoryView
				{memoryLoading}
				{memoryLoaded}
				{memoryLoadError}
				personaMemoryCount={personaMemories.length}
				{focusContinuityItemCount}
				{honchoEnabled}
				{honchoOverview}
				{honchoOverviewSource}
				{honchoOverviewStatus}
				{honchoOverviewHtml}
				{honchoOverviewUpdatedAt}
				{honchoOverviewLastAttemptAt}
				{durablePersonaCount}
				{liveOverviewRefreshing}
				onRetryLoadMemory={() => void ensureMemoryLoaded(true)}
				onRetryLiveOverview={() => void refreshLiveOverview(true)}
				onOpenMemoryModal={openMemoryModal}
			/>
		{/if}
		</div>
	</div>
</div>

{#if activeMemoryModal}
	<KnowledgeMemoryModal
		activeMemoryModal={activeMemoryModal}
		{memoryLoading}
		{memoryLoaded}
		{memoryLoadError}
		{honchoEnabled}
		{personaMemories}
		{filteredPersonaMemories}
		{personaMemoryFilter}
		{personaMemoryStateCounts}
		{selectedPersonaMemoryIds}
		{taskMemories}
		{selectedTaskMemoryIds}
		{focusContinuities}
		{selectedFocusContinuityIds}
		{focusContinuityView}
		{userDisplayName}
		{isMemoryActionPending}
		onClose={closeMemoryModal}
		onSetPersonaMemoryFilter={setPersonaMemoryFilter}
		onSetFocusContinuityView={setFocusContinuityView}
		onTogglePersonaSelection={togglePersonaSelection}
		onToggleAllPersonaSelections={toggleAllPersonaSelections}
		onToggleTaskSelection={toggleTaskSelection}
		onToggleAllTaskSelections={toggleAllTaskSelections}
		onToggleFocusContinuitySelection={toggleFocusContinuitySelection}
		onToggleAllFocusContinuitySelections={toggleAllFocusContinuitySelections}
		onRunBulkPersonaForget={runBulkPersonaForget}
		onRunBulkTaskForget={runBulkTaskForget}
		onRunBulkFocusContinuityForget={runBulkFocusContinuityForget}
		onRunMemoryAction={runMemoryAction}
	/>
{/if}

{#if activeLibraryModal}
	<KnowledgeLibraryModal
		activeLibraryModal={activeLibraryModal}
		{documents}
		{results}
		{workflows}
		{pendingKnowledgeActionKey}
		{deletingArtifactCount}
		{isKnowledgeActionPending}
		{isDeletingArtifact}
		onClose={closeLibraryModal}
		onRunKnowledgeAction={runLibraryBulkAction}
		onRemoveArtifact={removeArtifact}
	/>
{/if}

<style>
	button {
		cursor: pointer;
	}

	button:disabled {
		cursor: not-allowed;
	}

	:global(.knowledge-page input[type='checkbox']) {
		cursor: pointer;
	}

	:global(.memory-markdown *:last-child) {
		margin-bottom: 0;
	}

	:global(.memory-markdown p + p),
	:global(.memory-markdown ul + p),
	:global(.memory-markdown ol + p) {
		margin-top: 0.85rem;
	}

	:global(.memory-markdown strong) {
		color: var(--text-primary);
		font-weight: 600;
	}

	:global(.memory-markdown ul),
	:global(.memory-markdown ol) {
		padding-left: 1.25rem;
	}

	:global(.memory-markdown pre) {
		background: var(--surface-code);
		border-color: var(--border-default);
	}

	:global(.memory-markdown code) {
		color: var(--text-primary);
	}

	:global(.memory-markdown :not(pre) > code) {
		background: color-mix(in srgb, var(--surface-code) 90%, transparent 10%);
	}

	:global(.memory-markdown pre code) {
		background: transparent;
		color: inherit;
	}

	:global(.memory-preview) {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 3;
		overflow: hidden;
	}
</style>
