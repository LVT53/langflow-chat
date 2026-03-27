<script lang="ts">
	import type {
		FocusContinuityItem,
		PersonaMemoryItem,
		TaskMemoryItem,
	} from '$lib/types';
	import type {
		FocusContinuityView,
		MemoryModal,
		PersonaMemoryFilter,
	} from '../_helpers';
	import {
		formatMemoryTimestamp,
		formatPersonaActor,
		formatPersonaClass,
		formatPersonaOrigin,
		formatPersonaSource,
		getPersonaRowKey,
		personaMemoryFilters,
	} from '../_helpers';

	let {
		activeMemoryModal,
		memoryLoading,
		memoryLoaded,
		memoryLoadError,
		honchoEnabled,
		personaMemories,
		filteredPersonaMemories,
		personaMemoryFilter,
		personaMemoryStateCounts,
		selectedPersonaMemoryIds,
		taskMemories,
		selectedTaskMemoryIds,
		focusContinuities,
		selectedFocusContinuityIds,
		focusContinuityView,
		userDisplayName,
		isMemoryActionPending,
		onClose,
		onSetPersonaMemoryFilter,
		onSetFocusContinuityView,
		onTogglePersonaSelection,
		onToggleAllPersonaSelections,
		onToggleTaskSelection,
		onToggleAllTaskSelections,
		onToggleFocusContinuitySelection,
		onToggleAllFocusContinuitySelections,
		onRunBulkPersonaForget,
		onRunBulkTaskForget,
		onRunBulkFocusContinuityForget,
		onRunMemoryAction,
	}: {
		activeMemoryModal: Exclude<MemoryModal, null>;
		memoryLoading: boolean;
		memoryLoaded: boolean;
		memoryLoadError: string;
		honchoEnabled: boolean;
		personaMemories: PersonaMemoryItem[];
		filteredPersonaMemories: PersonaMemoryItem[];
		personaMemoryFilter: PersonaMemoryFilter;
		personaMemoryStateCounts: Record<PersonaMemoryFilter, number>;
		selectedPersonaMemoryIds: string[];
		taskMemories: TaskMemoryItem[];
		selectedTaskMemoryIds: string[];
		focusContinuities: FocusContinuityItem[];
		selectedFocusContinuityIds: string[];
		focusContinuityView: FocusContinuityView;
		userDisplayName: string;
		isMemoryActionPending: (key: string) => boolean;
		onClose: () => void;
		onSetPersonaMemoryFilter: (filter: PersonaMemoryFilter) => void;
		onSetFocusContinuityView: (view: FocusContinuityView) => void;
		onTogglePersonaSelection: (id: string) => void;
		onToggleAllPersonaSelections: () => void;
		onToggleTaskSelection: (id: string) => void;
		onToggleAllTaskSelections: () => void;
		onToggleFocusContinuitySelection: (id: string) => void;
		onToggleAllFocusContinuitySelections: () => void;
		onRunBulkPersonaForget: () => void | Promise<void>;
		onRunBulkTaskForget: () => void | Promise<void>;
		onRunBulkFocusContinuityForget: () => void | Promise<void>;
		onRunMemoryAction: (payload: any, key: string, confirmationMessage?: string) => void | Promise<void>;
	} = $props();
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
	class="fixed inset-0 z-[120] flex items-center justify-center bg-surface-overlay/65 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={onClose}
>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		role="dialog"
		aria-modal="true"
		aria-labelledby={activeMemoryModal === 'persona' ? 'persona-memory-dialog-title' : 'focus-memory-dialog-title'}
		tabindex={-1}
		class="max-h-[88vh] w-full max-w-[1100px] overflow-hidden rounded-[1.6rem] border border-border bg-surface-elevated shadow-2xl"
		onclick={(event) => event.stopPropagation()}
	>
		<div class="flex items-start justify-between gap-4 border-b border-border px-5 py-4 md:px-6">
			<div>
				<div class="text-[0.72rem] font-sans uppercase tracking-[0.12em] text-text-muted">
					{activeMemoryModal === 'persona' ? 'Persona memory' : 'Focus continuity'}
				</div>
				<h3
					id={activeMemoryModal === 'persona' ? 'persona-memory-dialog-title' : 'focus-memory-dialog-title'}
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
						onclick={onRunBulkPersonaForget}
						disabled={isMemoryActionPending('forget-selected-persona')}
					>
						Forget selected ({selectedPersonaMemoryIds.length})
					</button>
				{/if}
				{#if activeMemoryModal === 'focus' && focusContinuityView === 'tasks' && selectedTaskMemoryIds.length > 0}
					<button
						type="button"
						class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
						onclick={onRunBulkTaskForget}
						disabled={isMemoryActionPending('forget-selected-task')}
					>
						Forget selected ({selectedTaskMemoryIds.length})
					</button>
				{/if}
				{#if activeMemoryModal === 'focus' && focusContinuityView === 'across_chats' && selectedFocusContinuityIds.length > 0}
					<button
						type="button"
						class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
						onclick={onRunBulkFocusContinuityForget}
						disabled={isMemoryActionPending('forget-selected-focus-continuity')}
					>
						Forget selected ({selectedFocusContinuityIds.length})
					</button>
				{/if}
				{#if activeMemoryModal === 'persona' && honchoEnabled && personaMemories.length > 0}
					<button
						type="button"
						class="rounded-full border border-danger px-3 py-1.5 text-xs font-sans font-medium text-danger transition hover:bg-danger/10 disabled:opacity-50"
						onclick={() =>
							onRunMemoryAction(
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
					onclick={onClose}
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
									onclick={() => onSetPersonaMemoryFilter(state)}
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
											onchange={onToggleAllPersonaSelections}
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
												onchange={() => onTogglePersonaSelection(memory.id)}
												aria-label={`Select ${memory.canonicalText}`}
											/>
										</td>
										<td class="px-4 py-3 align-top">
											<div class="text-sm font-sans font-medium text-text-primary">
												{formatPersonaActor(memory, userDisplayName)}
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
												onclick={() =>
													onRunMemoryAction(
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
							onclick={() => onSetFocusContinuityView('tasks')}
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
							onclick={() => onSetFocusContinuityView('across_chats')}
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
												onchange={onToggleAllTaskSelections}
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
													onchange={() => onToggleTaskSelection(memory.taskId)}
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
													onclick={() =>
														onRunMemoryAction(
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
											onchange={onToggleAllFocusContinuitySelections}
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
												onchange={() => onToggleFocusContinuitySelection(memory.continuityId)}
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
												onclick={() =>
													onRunMemoryAction(
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
