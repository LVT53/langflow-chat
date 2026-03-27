<script lang="ts">
	import { onMount, tick } from 'svelte';
	import type {
		ArtifactSummary,
		ContextDebugState,
		ConversationContextStatus,
		TaskState,
		TaskSteeringAction,
		TaskSteeringPayload,
	} from '$lib/types';

	let {
		contextStatus = null,
		attachedArtifacts = [],
		taskState = null,
		contextDebug = null,
		onSteer = undefined,
		onManageEvidence = undefined,
	}: {
		contextStatus?: ConversationContextStatus | null;
		attachedArtifacts?: ArtifactSummary[];
		taskState?: TaskState | null;
		contextDebug?: ContextDebugState | null;
		onSteer?: ((payload: TaskSteeringPayload) => void) | undefined;
		onManageEvidence?: (() => void) | undefined;
	} = $props();

	let root = $state<HTMLDivElement | null>(null);
	let isOpen = $state(false);
	let mobile = $state(false);
	let showNewTaskForm = $state(false);
	let newTaskObjective = $state('');
	let newTaskInput = $state<HTMLInputElement | null>(null);

	const size = 38;
	const strokeWidth = 3;
	const radius = (size - strokeWidth) / 2;
	const circumference = 2 * Math.PI * radius;

	function detectMobile() {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
			mobile = false;
			return;
		}

		mobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
	}

	onMount(() => {
		detectMobile();
		window.addEventListener('resize', detectMobile);

		const handlePointerDown = (event: MouseEvent | TouchEvent) => {
			if (root && !root.contains(event.target as Node)) {
				isOpen = false;
				resetNewTaskForm();
			}
		};

		document.addEventListener('mousedown', handlePointerDown);
		document.addEventListener('touchstart', handlePointerDown, { passive: true });

		return () => {
			window.removeEventListener('resize', detectMobile);
			document.removeEventListener('mousedown', handlePointerDown);
			document.removeEventListener('touchstart', handlePointerDown);
		};
	});

	function handleClick() {
		if (mobile) {
			isOpen = !isOpen;
			if (!isOpen) {
				resetNewTaskForm();
			}
		}
	}

	function formatLayer(layer: string): string {
		return layer.replace(/_/g, ' ');
	}

	function formatCompactionMode(mode: ConversationContextStatus['compactionMode'] | undefined): string {
		switch (mode) {
			case 'deterministic':
				return 'Deterministic';
			case 'llm_fallback':
				return 'LLM fallback';
			default:
				return 'Not needed';
		}
	}

	function formatRoutingStage(stage: ContextDebugState['routingStage'] | undefined): string {
		switch (stage) {
			case 'task_router':
				return 'Task router';
			case 'evidence_rerank':
				return 'Evidence rerank';
			case 'verification_fallback':
				return 'Verification fallback';
			default:
				return 'Deterministic';
		}
	}

	function formatVerificationStatus(status: ContextDebugState['verificationStatus'] | undefined): string {
		switch (status) {
			case 'passed':
				return 'Passed';
			case 'failed':
				return 'Flagged';
			case 'fallback':
				return 'Fallback';
			default:
				return 'Skipped';
		}
	}

	function steer(action: TaskSteeringAction, artifactId?: string, objective?: string) {
		onSteer?.({ action, artifactId, objective });
	}

	function resetNewTaskForm() {
		showNewTaskForm = false;
		newTaskObjective = '';
	}

	function openEvidenceManager() {
		onManageEvidence?.();
		if (mobile) {
			isOpen = false;
			resetNewTaskForm();
		}
	}

	function formatContinuityStatus(status: string | undefined): string {
		if (status === 'dormant') return 'Dormant';
		if (status === 'archived') return 'Archived';
		return 'Active';
	}

	async function openNewTaskForm() {
		showNewTaskForm = true;
		await tick();
		newTaskInput?.focus();
		newTaskInput?.select();
	}

	function cancelNewTaskForm() {
		resetNewTaskForm();
	}

	function submitNewTask() {
		steer('start_new_task', undefined, newTaskObjective);
		resetNewTaskForm();
		if (mobile) {
			isOpen = false;
		}
	}

	function handleNewTaskKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			submitNewTask();
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			cancelNewTaskForm();
		}
	}

	let promptBudget = $derived(contextStatus ? Math.max(contextStatus.targetTokens, 1) : 1);
	let ratio = $derived(
		contextStatus
		? Math.max(0, Math.min(1, contextStatus.estimatedTokens / promptBudget))
		: 0
	);
	let dashOffset = $derived(circumference * (1 - ratio));
	let percent = $derived(Math.round(ratio * 100));
	let activeObjective = $derived(contextDebug?.activeTaskObjective ?? taskState?.objective ?? null);
	let continuity = $derived(taskState?.continuity ?? null);
	let toneClass = $derived(
		!contextStatus
			? 'ring-button--idle'
			: contextStatus.compactionMode === 'llm_fallback'
				? 'ring-button--compact'
				: contextStatus.compactionMode === 'deterministic'
					? 'ring-button--high'
					: ratio >= 0.9
						? 'ring-button--high'
						: ratio >= 0.75
							? 'ring-button--medium'
							: 'ring-button--normal'
	);
</script>

<div
	bind:this={root}
	class="ring-root relative"
>
	<button
		type="button"
		class={`ring-button ${toneClass}`}
		aria-label={contextStatus ? `Prompt budget usage ${percent}% (${contextStatus.estimatedTokens.toLocaleString()} tokens)` : 'No context yet'}
		aria-expanded={isOpen}
		onclick={handleClick}
	>
		<svg class="ring-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
			<circle
				class="ring-track"
				cx={size / 2}
				cy={size / 2}
				r={radius}
				stroke-width={strokeWidth}
			/>
			<circle
				class="ring-progress"
				cx={size / 2}
				cy={size / 2}
				r={radius}
				stroke-width={strokeWidth}
				stroke-dasharray={circumference}
				stroke-dashoffset={dashOffset}
			/>
		</svg>
		<span class="ring-value">{contextStatus ? `${percent}` : '0'}</span>
	</button>

	<div
		class="ring-popover"
		class:ring-popover--mobile={mobile}
		class:ring-popover--mobile-visible={mobile && isOpen}
		role="dialog"
		aria-label="Context focus panel"
		aria-hidden={mobile ? !isOpen : undefined}
	>
		<div class="popover-section">
			<div class="popover-label">Focus</div>
			{#if activeObjective}
				<div class="popover-copy">{activeObjective}</div>
			{:else}
				<div class="popover-empty">No active task yet.</div>
			{/if}

			<div class="popover-actions">
				<button
					type="button"
					class="popover-action-button"
					onclick={() => steer(contextDebug?.taskLocked ? 'unlock_task' : 'lock_task')}
				>
					{contextDebug?.taskLocked ? 'Unlock task' : 'Lock task'}
				</button>
				{#if showNewTaskForm}
					<div class="task-form">
						<label class="task-form-label" for="new-task-objective">Optional task name</label>
						<input
							bind:this={newTaskInput}
							id="new-task-objective"
							class="task-form-input"
							type="text"
							placeholder="Leave empty to infer from your next message"
							bind:value={newTaskObjective}
							onkeydown={handleNewTaskKeydown}
						/>
						<div class="task-form-actions">
							<button
								type="button"
								class="popover-action-button"
								onclick={submitNewTask}
							>
								Start
							</button>
							<button
								type="button"
								class="popover-action-button popover-action-button--ghost"
								onclick={cancelNewTaskForm}
							>
								Cancel
							</button>
						</div>
					</div>
				{:else}
					<button
						type="button"
						class="popover-action-button"
						onclick={openNewTaskForm}
					>
						Start new task
					</button>
				{/if}
				<button
					type="button"
					class="popover-action-button"
					onclick={openEvidenceManager}
				>
					Manage evidence
				</button>
			</div>
		</div>

		{#if continuity}
			<div class="popover-section">
				<div class="popover-label">Across chats</div>
				<div class="popover-copy">{continuity.name}</div>
				{#if continuity.summary}
					<div class="popover-copy popover-copy--muted">{continuity.summary}</div>
				{/if}
				<div class="popover-stat">
					<span>Status</span>
					<span>{formatContinuityStatus(continuity.status)}</span>
				</div>
				<div class="popover-stat">
					<span>Linked chats</span>
					<span>{continuity.linkedTaskCount}</span>
				</div>
			</div>
		{/if}

		<div class="popover-section">
			<div class="popover-label">Context</div>
			{#if contextStatus}
				<div class="popover-stat">
					<span>Prompt budget</span>
					<span>{contextStatus.estimatedTokens.toLocaleString()} / {contextStatus.targetTokens.toLocaleString()}</span>
				</div>
				<div class="popover-stat">
					<span>Pressure threshold</span>
					<span>{contextStatus.thresholdTokens.toLocaleString()}</span>
				</div>
				<div class="popover-stat">
					<span>Compaction</span>
					<span class:compaction-active={contextStatus.compactionMode !== 'none'}>
						{formatCompactionMode(contextStatus.compactionMode)}
					</span>
				</div>
				{#if contextDebug}
					<div class="popover-stat">
						<span>Routing</span>
						<span>{formatRoutingStage(contextDebug.routingStage)} · {Math.round(contextDebug.routingConfidence)}%</span>
					</div>
					<div class="popover-stat">
						<span>Verification</span>
						<span>{formatVerificationStatus(contextDebug.verificationStatus)}</span>
					</div>
					<div class="popover-stat">
						<span>Selected evidence</span>
						<span>{contextDebug.selectedEvidence.length}</span>
					</div>
					{#if contextDebug.pinnedEvidence.length > 0}
						<div class="popover-stat">
							<span>Pinned</span>
							<span>{contextDebug.pinnedEvidence.length}</span>
						</div>
					{/if}
					{#if contextDebug.excludedEvidence.length > 0}
						<div class="popover-stat">
							<span>Excluded</span>
							<span>{contextDebug.excludedEvidence.length}</span>
						</div>
					{/if}
				{/if}
				{#if attachedArtifacts.length > 0}
					<div class="popover-stat">
						<span>Attached files</span>
						<span>{attachedArtifacts.length}</span>
					</div>
				{/if}
				<div class="popover-stat">
					<span>Recent turns</span>
					<span>{contextStatus.recentTurnCount}</span>
				</div>
				{#if contextStatus.layersUsed.length > 0}
					<div class="popover-chips">
						{#each contextStatus.layersUsed as layer}
							<span class="popover-chip">{formatLayer(layer)}</span>
						{/each}
					</div>
				{/if}
			{:else}
				<div class="popover-empty">No context yet.</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.ring-root {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.ring-button {
		position: relative;
		display: flex;
		height: 44px;
		width: 44px;
		align-items: center;
		justify-content: center;
		border: 1px solid color-mix(in srgb, var(--border-default) 80%, transparent 20%);
		border-radius: 9999px;
		background: color-mix(in srgb, var(--surface-page) 76%, var(--surface-elevated) 24%);
		color: var(--text-muted);
		transition:
			border-color var(--duration-standard) var(--ease-out),
			background-color var(--duration-standard) var(--ease-out),
			transform var(--duration-standard) var(--ease-out);
	}

	.ring-button:hover,
	.ring-button:focus-visible {
		transform: translateY(-1px);
		outline: none;
	}

	.ring-button--normal {
		color: var(--accent);
	}

	.ring-button--medium {
		color: color-mix(in srgb, var(--accent) 70%, #b88a2f 30%);
	}

	.ring-button--high {
		color: var(--danger);
	}

	.ring-button--compact {
		color: color-mix(in srgb, var(--accent) 62%, var(--danger) 38%);
	}

	.ring-button--idle {
		color: var(--text-muted);
	}

	.ring-svg {
		transform: rotate(-90deg);
	}

	.ring-track,
	.ring-progress {
		fill: none;
	}

	.ring-track {
		stroke: color-mix(in srgb, var(--border-default) 72%, transparent 28%);
	}

	.ring-progress {
		stroke: currentColor;
		stroke-linecap: round;
		transition: stroke-dashoffset 180ms ease-out;
	}

	.ring-value {
		position: absolute;
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 9px;
		font-weight: 600;
		line-height: 1;
		color: var(--text-primary);
		text-transform: lowercase;
	}

	.ring-popover {
		position: absolute;
		left: 0;
		bottom: calc(100% + 10px);
		z-index: 40;
		width: min(22rem, calc(100vw - 2rem));
		border: 1px solid color-mix(in srgb, var(--border-default) 82%, transparent 18%);
		border-radius: 1rem;
		background: color-mix(in srgb, var(--surface-overlay) 92%, var(--surface-page) 8%);
		box-shadow: var(--shadow-lg);
		padding: 0.9rem;
		backdrop-filter: blur(14px);
		opacity: 0;
		transform: translateY(6px);
		pointer-events: none;
		transition:
			opacity var(--duration-standard) var(--ease-out),
			transform var(--duration-standard) var(--ease-out);
	}

	.ring-root:hover .ring-popover,
	.ring-root:focus-within .ring-popover,
	.ring-popover--mobile-visible {
		opacity: 1;
		transform: translateY(0);
		pointer-events: auto;
	}

	.ring-popover--mobile {
		position: fixed;
		left: 50%;
		right: auto;
		bottom: calc(env(safe-area-inset-bottom) + 5.5rem);
		width: min(22rem, calc(100vw - 1.5rem));
		max-height: min(70vh, 30rem);
		overflow-y: auto;
		transform: translateX(-50%) translateY(6px);
	}

	.ring-popover--mobile.ring-popover--mobile-visible {
		transform: translateX(-50%) translateY(0);
	}

	.popover-section + .popover-section {
		margin-top: 0.85rem;
		padding-top: 0.85rem;
		border-top: 1px solid color-mix(in srgb, var(--border-default) 75%, transparent 25%);
	}

	.popover-label {
		font-family: 'Nimbus Sans L', sans-serif;
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-muted);
	}

	.popover-stat {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		margin-top: 0.55rem;
		font-size: 0.82rem;
		color: var(--text-primary);
	}

	.compaction-active {
		color: var(--accent);
	}

	.popover-copy {
		margin-top: 0.5rem;
		font-size: 0.84rem;
		line-height: 1.45;
		color: var(--text-primary);
	}

	.popover-copy--muted {
		color: var(--text-secondary);
	}

	.popover-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-top: 0.7rem;
	}

	.popover-action-button {
		cursor: pointer;
		border: 1px solid color-mix(in srgb, var(--border-default) 75%, transparent 25%);
		border-radius: 9999px;
		background: color-mix(in srgb, var(--surface-page) 75%, var(--surface-elevated) 25%);
		color: var(--text-primary);
		font-family: 'Nimbus Sans L', sans-serif;
		transition:
			border-color var(--duration-standard) var(--ease-out),
			background-color var(--duration-standard) var(--ease-out);
		font-size: 0.72rem;
		padding: 0.24rem 0.5rem;
	}

	.popover-action-button:hover,
	.popover-action-button:focus-visible {
		border-color: color-mix(in srgb, var(--accent) 35%, var(--border-default) 65%);
		outline: none;
	}

	.popover-action-button--ghost {
		background: transparent;
		color: var(--text-muted);
	}

	.popover-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		margin-top: 0.65rem;
	}

	.popover-chip {
		border: 1px solid color-mix(in srgb, var(--border-default) 75%, transparent 25%);
		border-radius: 9999px;
		padding: 0.25rem 0.5rem;
		font-size: 0.7rem;
		text-transform: capitalize;
		color: var(--text-muted);
	}

	.popover-sublist {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin-top: 0.55rem;
	}

	.popover-empty {
		margin-top: 0.5rem;
		font-size: 0.82rem;
		color: var(--text-muted);
	}

	.popover-label--subtle {
		margin-bottom: -0.15rem;
		font-size: 0.68rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.task-form {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		min-width: min(17rem, calc(100vw - 4rem));
	}

	.task-form-label {
		font-size: 0.68rem;
		font-family: 'Nimbus Sans L', sans-serif;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.task-form-input {
		width: 100%;
		border: 1px solid color-mix(in srgb, var(--border-default) 78%, transparent 22%);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--surface-page) 84%, var(--surface-elevated) 16%);
		padding: 0.5rem 0.65rem;
		font-size: 0.76rem;
		color: var(--text-primary);
	}

	.task-form-input::placeholder {
		color: var(--text-muted);
	}

	.task-form-input:focus-visible {
		outline: none;
		border-color: color-mix(in srgb, var(--accent) 45%, var(--border-default) 55%);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent 75%);
	}

	.task-form-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}
</style>
