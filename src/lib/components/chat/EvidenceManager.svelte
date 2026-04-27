<script lang="ts">
	import EvidencePreferenceControl from './EvidencePreferenceControl.svelte';
	import { t } from '$lib/i18n';
	import type {
		ContextDebugState,
		EvidencePreference,
		TaskSteeringPayload,
	} from '$lib/types';

	let {
		open = false,
		contextDebug = null,
		onClose = undefined,
		onSteer = undefined,
	}: {
		open?: boolean;
		contextDebug?: ContextDebugState | null;
		onClose?: (() => void) | undefined;
		onSteer?: ((payload: TaskSteeringPayload) => void) | undefined;
	} = $props();

	function close() {
		onClose?.();
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			close();
		}
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			close();
		}
	}

	function preferenceFor(artifactId: string): EvidencePreference {
		if (contextDebug?.excludedEvidence.some((item) => item.artifactId === artifactId)) {
			return 'excluded';
		}
		if (contextDebug?.pinnedEvidence.some((item) => item.artifactId === artifactId)) {
			return 'pinned';
		}
		return 'auto';
	}

	let pinnedIds = $derived(new Set(contextDebug?.pinnedEvidence.map((item) => item.artifactId) ?? []));
	let excludedIds = $derived(
		new Set(contextDebug?.excludedEvidence.map((item) => item.artifactId) ?? [])
	);
	let selectedRows = $derived(
		contextDebug?.selectedEvidence.filter(
			(item) => !pinnedIds.has(item.artifactId) && !excludedIds.has(item.artifactId)
		) ?? []
	);

	function steer(payload: TaskSteeringPayload) {
		onSteer?.(payload);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div
		class="evidence-overlay"
		role="dialog"
		aria-label={$t('evidenceManager.title')}
		aria-modal="true"
		tabindex="-1"
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div class="evidence-panel">
			<div class="panel-header">
				<h2 class="panel-title">Manage evidence</h2>
				<button type="button" class="panel-close" aria-label={$t('evidenceManager.close')} onclick={close}>
					<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
						<path d="M6 6 18 18" />
						<path d="M18 6 6 18" />
					</svg>
				</button>
			</div>

			<div class="panel-body">
				<div class="section">
					<div class="section-header">
						<h3>Current selection</h3>
						<span>{selectedRows.length}</span>
					</div>
					{#if selectedRows.length > 0}
						<div class="row-list">
							{#each selectedRows as item (item.artifactId)}
								<div class="evidence-row">
									<div class="row-copy">
										<div class="row-title">{item.name}</div>
										<div class="row-meta">
											<span class="row-chip">{item.sourceType}</span>
											{#if item.reason}
												<span>{item.reason}</span>
											{/if}
										</div>
									</div>
									<EvidencePreferenceControl
										artifactId={item.artifactId}
										preference={preferenceFor(item.artifactId)}
										onSteer={steer}
									/>
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-state">No active evidence is selected right now.</div>
					{/if}
				</div>

				<div class="section">
					<div class="section-header">
						<h3>Pinned</h3>
						<span>{contextDebug?.pinnedEvidence.length ?? 0}</span>
					</div>
					{#if (contextDebug?.pinnedEvidence.length ?? 0) > 0}
						<div class="row-list">
							{#each contextDebug?.pinnedEvidence ?? [] as item (item.artifactId)}
								<div class="evidence-row">
									<div class="row-copy">
										<div class="row-title">{item.name}</div>
										<div class="row-meta">
											<span class="row-chip">{item.sourceType}</span>
											<span>Pinned by you</span>
										</div>
									</div>
									<EvidencePreferenceControl
										artifactId={item.artifactId}
										preference="pinned"
										onSteer={steer}
									/>
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-state">No pinned evidence.</div>
					{/if}
				</div>

				<div class="section">
					<div class="section-header">
						<h3>Excluded</h3>
						<span>{contextDebug?.excludedEvidence.length ?? 0}</span>
					</div>
					{#if (contextDebug?.excludedEvidence.length ?? 0) > 0}
						<div class="row-list">
							{#each contextDebug?.excludedEvidence ?? [] as item (item.artifactId)}
								<div class="evidence-row">
									<div class="row-copy">
										<div class="row-title">{item.name}</div>
										<div class="row-meta">
											<span class="row-chip">{item.sourceType}</span>
											<span>Excluded from auto-selection</span>
										</div>
									</div>
									<EvidencePreferenceControl
										artifactId={item.artifactId}
										preference="excluded"
										onSteer={steer}
									/>
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-state">No excluded evidence.</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.evidence-overlay {
		position: fixed;
		inset: 0;
		z-index: 70;
		display: flex;
		justify-content: flex-end;
		background: rgba(8, 10, 13, 0.22);
		backdrop-filter: blur(2px);
	}

	.evidence-panel {
		display: flex;
		height: 100%;
		width: min(26rem, 100vw);
		flex-direction: column;
		background: color-mix(in srgb, var(--surface-overlay) 96%, var(--surface-page) 4%);
		box-shadow: var(--shadow-lg);
	}

	.panel-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		border-bottom: 1px solid color-mix(in srgb, var(--border-default) 78%, transparent 22%);
		padding: 1rem 1rem 0.85rem;
	}

	.panel-title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.panel-close {
		cursor: pointer;
		display: inline-flex;
		height: 2.25rem;
		width: 2.25rem;
		align-items: center;
		justify-content: center;
		border: 1px solid color-mix(in srgb, var(--border-default) 78%, transparent 22%);
		border-radius: 9999px;
		background: transparent;
		color: var(--text-muted);
	}

	.panel-body {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}

	.section + .section {
		margin-top: 1rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.55rem;
	}

	.section-header h3 {
		margin: 0;
		font-size: 0.88rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.section-header span {
		font-size: 0.74rem;
		color: var(--text-muted);
	}

	.row-list {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}

	.evidence-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		border: 1px solid color-mix(in srgb, var(--border-subtle) 75%, transparent 25%);
		border-radius: 0.9rem;
		background: color-mix(in srgb, var(--surface-elevated) 55%, transparent 45%);
		padding: 0.75rem;
	}

	.row-copy {
		min-width: 0;
		flex: 1;
	}

	.row-title {
		font-size: 0.84rem;
		line-height: 1.35;
		color: var(--text-primary);
		word-break: break-word;
	}

	.row-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem 0.45rem;
		margin-top: 0.28rem;
		font-size: 0.72rem;
		line-height: 1.4;
		color: var(--text-muted);
	}

	.row-chip {
		border: 1px solid color-mix(in srgb, var(--border-default) 72%, transparent 28%);
		border-radius: 9999px;
		padding: 0.12rem 0.42rem;
		text-transform: capitalize;
	}

	.empty-state {
		border: 1px dashed color-mix(in srgb, var(--border-default) 72%, transparent 28%);
		border-radius: 0.9rem;
		padding: 0.8rem;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	@media (max-width: 767px) {
		.evidence-panel {
			width: 100vw;
		}
	}
</style>
