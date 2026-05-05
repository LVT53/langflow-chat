<script lang="ts">
	import { t } from '$lib/i18n';
	import type { I18nKey } from '$lib/i18n';
	import type {
		DeepResearchDepth,
		DeepResearchJob,
		DeepResearchJobStatus,
		DocumentWorkspaceItem,
	} from '$lib/types';

	let {
		job,
		onApprove = undefined,
		onEdit = undefined,
		onCancel = undefined,
		onOpenReport = undefined,
		onDiscussReport = undefined,
		onResearchFurther = undefined,
	}: {
		job: DeepResearchJob;
		onApprove?: ((jobId: string) => void | Promise<void>) | undefined;
		onEdit?: ((jobId: string, instructions: string) => void | Promise<void>) | undefined;
		onCancel?: ((jobId: string) => void | Promise<void>) | undefined;
		onOpenReport?: ((document: DocumentWorkspaceItem) => void) | undefined;
		onDiscussReport?: ((jobId: string) => void | Promise<void>) | undefined;
		onResearchFurther?: ((jobId: string) => void | Promise<void>) | undefined;
	} = $props();

	let isEditingPlan = $state(false);
	let planEditInstructions = $state('');
	let planEditPending = $state(false);
	let planApprovalPending = $state(false);
	let planEditError = $state<string | null>(null);

	let canCancel = $derived(job.status === 'awaiting_plan' || job.status === 'awaiting_approval');
	let activePlan = $derived(job.plan ?? job.currentPlan ?? null);
	let canApprovePlan = $derived(job.status === 'awaiting_approval' && Boolean(activePlan));
	let reportDocument = $derived(buildReportDocument(job));
	let timelineEvents = $derived((job.timeline ?? []).slice(-4));

	const depthKeys: Record<DeepResearchDepth, I18nKey> = {
		focused: 'deepResearch.depth.focused',
		standard: 'deepResearch.depth.standard',
		max: 'deepResearch.depth.max',
	};

	const statusKeys: Record<DeepResearchJobStatus, I18nKey> = {
		awaiting_plan: 'deepResearch.status.awaitingPlan',
		awaiting_approval: 'deepResearch.status.awaitingApproval',
		approved: 'deepResearch.status.approved',
		running: 'deepResearch.status.running',
		completed: 'deepResearch.status.completed',
		failed: 'deepResearch.status.failed',
		cancelled: 'deepResearch.status.cancelled',
	};

	function sourceCountLabels(sourceCounts: { discovered: number; reviewed: number; cited: number }) {
		return [
			$t('deepResearch.timeline.discovered', { count: sourceCounts.discovered }),
			$t('deepResearch.timeline.reviewed', { count: sourceCounts.reviewed }),
			$t('deepResearch.timeline.cited', { count: sourceCounts.cited }),
		];
	}

	function cancelJob() {
		if (!canCancel || !onCancel) return;
		void onCancel(job.id);
	}

	function buildReportFilename(title: string): string {
		const safeTitle = title
			.replace(/[\\/:*?"<>|]+/g, ' ')
			.replace(/\s+/g, ' ')
			.trim()
			.slice(0, 96);
		return `Research Report - ${safeTitle || 'Deep Research'}.md`;
	}

	function buildReportDocument(job: DeepResearchJob): DocumentWorkspaceItem | null {
		if (job.status !== 'completed' || !job.reportArtifactId) return null;
		const filename = buildReportFilename(job.title);
		return {
			id: `artifact:${job.reportArtifactId}`,
			source: 'knowledge_artifact',
			filename,
			title: filename,
			documentLabel: filename,
			documentRole: 'research_report',
			versionNumber: 1,
			mimeType: 'text/markdown',
			artifactId: job.reportArtifactId,
			conversationId: job.conversationId,
			previewUrl: `/api/knowledge/${job.reportArtifactId}/preview`,
			downloadUrl: `/api/knowledge/${job.reportArtifactId}/download`,
		};
	}

	function openReport() {
		if (!reportDocument || !onOpenReport) return;
		onOpenReport(reportDocument);
	}

	function discussReport() {
		if (!reportDocument || !onDiscussReport) return;
		void onDiscussReport(job.id);
	}

	function researchFurther() {
		if (!reportDocument || !onResearchFurther) return;
		void onResearchFurther(job.id);
	}

	async function approvePlan() {
		if (!canApprovePlan || !onApprove || planApprovalPending) return;
		planApprovalPending = true;
		try {
			await onApprove(job.id);
		} catch (err) {
			planEditError = err instanceof Error ? err.message : $t('deepResearch.approvePlanFailed');
		} finally {
			planApprovalPending = false;
		}
	}

	function editPlan() {
		if (!canApprovePlan || !onEdit) return;
		isEditingPlan = true;
		planEditError = null;
	}

	async function submitPlanEdit(event: SubmitEvent) {
		event.preventDefault();
		if (!canApprovePlan || !onEdit || planEditPending || planApprovalPending) return;
		const trimmedInstructions = planEditInstructions.trim();
		if (!trimmedInstructions) return;

		planEditPending = true;
		planEditError = null;
		try {
			await onEdit(job.id, trimmedInstructions);
			planEditInstructions = '';
			isEditingPlan = false;
		} catch (err) {
			planEditError = err instanceof Error ? err.message : $t('deepResearch.editPlanFailed');
		} finally {
			planEditPending = false;
		}
	}
</script>

<article
	class="research-card"
	aria-label={$t('deepResearch.cardLabel', { title: job.title })}
>
	<div class="research-card__header">
		<div class="research-card__title-group">
			<div class="research-card__eyebrow">{$t('composerTools.deepResearch')}</div>
			<h2 class="research-card__title" title={job.title}>{job.title}</h2>
		</div>
		<div class="research-card__depth">{$t(depthKeys[job.depth])}</div>
	</div>

	<div class="research-card__meta">
		<span class="research-card__status">{$t(statusKeys[job.status])}</span>
		{#if job.stage}
			<span class="research-card__stage">{job.stage}</span>
		{/if}
	</div>

	{#if activePlan}
		<section class="research-card__plan" aria-labelledby={`${job.id}-research-plan-heading`}>
			<div class="research-card__section-header">
				<h3 id={`${job.id}-research-plan-heading`}>{$t('deepResearch.planHeading')}</h3>
				<span>v{activePlan.version}</span>
			</div>

			<div class="research-card__effort" aria-label={$t('deepResearch.effortHeading')}>
				<span>
					<strong>{$t('deepResearch.expectedTime')}</strong>
					{activePlan.effortEstimate.expectedTimeBand}
				</span>
				<span>
					{$t('deepResearch.sourceCeiling', {
						count: activePlan.effortEstimate.sourceReviewCeiling,
					})}
				</span>
				<span>{activePlan.effortEstimate.relativeCostWarning}</span>
			</div>

			{#if activePlan.contextDisclosure}
				<p class="research-card__context">
					<strong>{$t('deepResearch.contextConsidered')}:</strong>
					{activePlan.contextDisclosure}
				</p>
			{/if}

			<div class="research-card__plan-text">{activePlan.renderedPlan}</div>

			{#if isEditingPlan}
				<form class="research-card__edit-form" onsubmit={submitPlanEdit}>
					<label class="research-card__edit-label" for={`${job.id}-plan-edit`}>
						{$t('deepResearch.planEditInstructions')}
					</label>
					<textarea
						id={`${job.id}-plan-edit`}
						class="research-card__edit-textarea"
						bind:value={planEditInstructions}
						disabled={planEditPending}
						rows="3"
					></textarea>
					{#if planEditError}
						<p class="research-card__error" role="alert">{planEditError}</p>
					{/if}
					<div class="research-card__edit-actions">
						<button
							type="submit"
							class="research-card__action research-card__action--primary"
							disabled={planEditPending || !planEditInstructions.trim()}
						>
							{planEditPending
								? $t('deepResearch.submittingPlanEdit')
								: $t('deepResearch.submitPlanEdit')}
						</button>
						<button
							type="button"
							class="research-card__action"
							disabled={planEditPending}
							onclick={() => {
								isEditingPlan = false;
								planEditError = null;
							}}
						>
							{$t('common.cancel')}
						</button>
					</div>
				</form>
			{:else if planEditError}
				<p class="research-card__error" role="alert">{planEditError}</p>
			{/if}
		</section>
	{/if}

	{#if timelineEvents.length > 0}
		<section class="research-card__timeline" aria-labelledby={`${job.id}-timeline-heading`}>
			<div class="research-card__section-header">
				<h3 id={`${job.id}-timeline-heading`}>{$t('deepResearch.timelineHeading')}</h3>
			</div>

			<ol class="research-card__timeline-list">
				{#each timelineEvents as event (event.id)}
					<li class="research-card__timeline-item">
						<p class="research-card__timeline-summary">{event.summary}</p>
						<div class="research-card__source-counts" aria-label="Source counts">
							{#each sourceCountLabels(event.sourceCounts) as label}
								<span>{label}</span>
							{/each}
						</div>
						{#if event.assumptions.length > 0}
							<div class="research-card__timeline-notes">
								<strong>{$t('deepResearch.timeline.assumptions')}</strong>
								<ul>
									{#each event.assumptions as assumption}
										<li>{assumption}</li>
									{/each}
								</ul>
							</div>
						{/if}
						{#if event.warnings.length > 0}
							<div class="research-card__timeline-notes research-card__timeline-notes--warning">
								<strong>{$t('deepResearch.timeline.warnings')}</strong>
								<ul>
									{#each event.warnings as warning}
										<li>{warning}</li>
									{/each}
								</ul>
							</div>
						{/if}
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	{#if canCancel}
		<div class="research-card__actions">
			{#if canApprovePlan}
				<button
					type="button"
					class="research-card__action research-card__action--primary"
					onclick={approvePlan}
					disabled={!onApprove || planApprovalPending || planEditPending}
					aria-label={$t('deepResearch.approvePlanLabel')}
					title={$t('deepResearch.approvePlanLabel')}
				>
					{$t('deepResearch.approvePlanLabel')}
				</button>
				<button
					type="button"
					class="research-card__action"
					onclick={editPlan}
					disabled={!onEdit || planApprovalPending || planEditPending}
					aria-label={$t('deepResearch.editPlanLabel')}
					title={$t('deepResearch.editPlanLabel')}
				>
					{$t('deepResearch.editPlanLabel')}
				</button>
			{/if}
			<button
				type="button"
				class="research-card__action research-card__cancel"
				onclick={cancelJob}
				disabled={!onCancel || planApprovalPending || planEditPending}
				aria-label={$t('deepResearch.cancelLabel')}
				title={$t('deepResearch.cancelLabel')}
			>
				{$t('common.cancel')}
			</button>
		</div>
	{/if}

	{#if reportDocument}
		<div class="research-card__actions">
			<button
				type="button"
				class="research-card__action research-card__action--primary"
				onclick={openReport}
				disabled={!onOpenReport}
				aria-label={$t('deepResearch.openReportLabel')}
				title={$t('deepResearch.openReportLabel')}
			>
				{$t('deepResearch.openReportLabel')}
			</button>
			<button
				type="button"
				class="research-card__action"
				onclick={discussReport}
				disabled={!onDiscussReport}
				aria-label={$t('deepResearch.discussReportLabel')}
				title={$t('deepResearch.discussReportLabel')}
			>
				{$t('deepResearch.discussReportLabel')}
			</button>
			<button
				type="button"
				class="research-card__action"
				onclick={researchFurther}
				disabled={!onResearchFurther}
				aria-label={$t('deepResearch.researchFurtherLabel')}
				title={$t('deepResearch.researchFurtherLabel')}
			>
				{$t('deepResearch.researchFurtherLabel')}
			</button>
		</div>
	{/if}
</article>

<style>
	.research-card {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		border: 1px solid color-mix(in srgb, var(--border-subtle) 76%, var(--accent) 24%);
		border-radius: 8px;
		background: color-mix(in srgb, var(--surface-elevated) 94%, var(--accent) 6%);
		padding: var(--space-md);
		box-shadow: var(--shadow-md);
	}

	.research-card__header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-md);
	}

	.research-card__title-group {
		min-width: 0;
	}

	.research-card__eyebrow {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.research-card__title {
		margin: 0.2rem 0 0;
		overflow-wrap: anywhere;
		font-size: 0.98rem;
		font-weight: 700;
		line-height: 1.35;
		color: var(--text-primary);
	}

	.research-card__depth {
		flex: 0 0 auto;
		border-radius: 999px;
		background: color-mix(in srgb, var(--surface-page) 78%, var(--surface-elevated) 22%);
		padding: 0.22rem 0.55rem;
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--text-secondary);
	}

	.research-card__meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-xs);
		font-size: 0.84rem;
		color: var(--text-secondary);
	}

	.research-card__status {
		font-weight: 700;
		color: var(--text-primary);
	}

	.research-card__stage {
		border-left: 1px solid var(--border-subtle);
		padding-left: var(--space-xs);
		font-family: monospace;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.research-card__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		justify-content: flex-end;
	}

	.research-card__plan {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		border-top: 1px solid var(--border-subtle);
		padding-top: var(--space-sm);
	}

	.research-card__timeline {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		border-top: 1px solid var(--border-subtle);
		padding-top: var(--space-sm);
	}

	.research-card__timeline-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.research-card__timeline-item {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		border-radius: 7px;
		background: color-mix(in srgb, var(--surface-page) 72%, var(--surface-elevated) 28%);
		padding: var(--space-sm);
	}

	.research-card__timeline-summary {
		margin: 0;
		font-size: 0.83rem;
		font-weight: 700;
		line-height: 1.35;
		color: var(--text-primary);
	}

	.research-card__source-counts {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		font-size: 0.74rem;
		color: var(--text-secondary);
	}

	.research-card__source-counts span {
		border-radius: 999px;
		background: var(--surface-elevated);
		padding: 0.16rem 0.42rem;
	}

	.research-card__timeline-notes {
		font-size: 0.76rem;
		line-height: 1.4;
		color: var(--text-secondary);
	}

	.research-card__timeline-notes strong {
		display: block;
		margin-bottom: 0.18rem;
		color: var(--text-primary);
	}

	.research-card__timeline-notes ul {
		margin: 0;
		padding-left: 1rem;
	}

	.research-card__timeline-notes--warning {
		color: var(--text-secondary);
	}

	.research-card__section-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-sm);
	}

	.research-card__section-header h3 {
		margin: 0;
		font-size: 0.9rem;
		font-weight: 800;
		color: var(--text-primary);
	}

	.research-card__section-header span {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--text-muted);
	}

	.research-card__effort {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		font-size: 0.78rem;
		color: var(--text-secondary);
	}

	.research-card__effort span {
		border-radius: 7px;
		background: color-mix(in srgb, var(--surface-page) 76%, var(--surface-elevated) 24%);
		padding: 0.24rem 0.45rem;
	}

	.research-card__effort strong {
		margin-right: 0.3rem;
		color: var(--text-primary);
	}

	.research-card__context {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.45;
		color: var(--text-secondary);
	}

	.research-card__context strong {
		color: var(--text-primary);
	}

	.research-card__plan-text {
		max-height: 11rem;
		overflow: auto;
		border: 1px solid var(--border-subtle);
		border-radius: 7px;
		background: var(--surface-page);
		padding: var(--space-sm);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		font-size: 0.82rem;
		line-height: 1.45;
		color: var(--text-secondary);
	}

	.research-card__edit-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-xs);
	}

	.research-card__edit-label {
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.research-card__edit-textarea {
		min-height: 5rem;
		resize: vertical;
		border: 1px solid var(--border-subtle);
		border-radius: 7px;
		background: var(--surface-page);
		padding: var(--space-sm);
		font: inherit;
		font-size: 0.84rem;
		line-height: 1.45;
		color: var(--text-primary);
	}

	.research-card__edit-textarea:focus {
		outline: 2px solid color-mix(in srgb, var(--accent) 58%, transparent);
		outline-offset: 2px;
	}

	.research-card__edit-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		justify-content: flex-end;
	}

	.research-card__error {
		margin: 0;
		font-size: 0.8rem;
		color: var(--danger);
	}

	.research-card__action {
		border: 1px solid var(--border-subtle);
		border-radius: 7px;
		background: var(--surface-page);
		padding: 0.38rem 0.7rem;
		font-size: 0.82rem;
		font-weight: 700;
		color: var(--text-secondary);
		cursor: pointer;
	}

	.research-card__action--primary {
		border-color: color-mix(in srgb, var(--accent) 48%, var(--border-subtle));
		background: var(--accent);
		color: var(--text-on-accent);
	}

	.research-card__action:hover:not(:disabled),
	.research-card__action:focus-visible:not(:disabled) {
		border-color: var(--accent);
	}

	.research-card__cancel:hover:not(:disabled),
	.research-card__cancel:focus-visible:not(:disabled) {
		border-color: color-mix(in srgb, var(--danger) 38%, var(--border-subtle));
		color: var(--danger);
	}

	.research-card__action:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	@media (max-width: 640px) {
		.research-card__header {
			flex-direction: column;
			align-items: stretch;
		}

		.research-card__depth {
			align-self: flex-start;
		}
	}
</style>
