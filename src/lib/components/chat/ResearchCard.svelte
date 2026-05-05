<script lang="ts">
	import { t } from '$lib/i18n';
	import type { I18nKey } from '$lib/i18n';
	import type {
		DeepResearchDepth,
		DeepResearchJob,
		DeepResearchJobStatus,
		DeepResearchPlanSummary,
		DocumentWorkspaceItem,
	} from '$lib/types';

	type VisiblePlanSection = {
		heading: string;
		items: string[];
	};

	type VisiblePlan = {
		sections: VisiblePlanSection[];
	};

	type TimelineStep = {
		id: string;
		labelKey: I18nKey;
		stages: string[];
		status: 'completed' | 'active' | 'pending';
		events: DeepResearchJob['timeline'];
	};

	let {
		job,
		onApprove = undefined,
		onEdit = undefined,
		onCancel = undefined,
		onOpenReport = undefined,
		onDiscussReport = undefined,
		onResearchFurther = undefined,
		onAdvanceResearch = undefined,
	}: {
		job: DeepResearchJob;
		onApprove?: ((jobId: string) => void | Promise<void>) | undefined;
		onEdit?: ((jobId: string, instructions: string) => void | Promise<void>) | undefined;
		onCancel?: ((jobId: string) => void | Promise<void>) | undefined;
		onOpenReport?: ((document: DocumentWorkspaceItem) => void) | undefined;
		onDiscussReport?: ((jobId: string) => void | Promise<void>) | undefined;
		onResearchFurther?: ((jobId: string) => void | Promise<void>) | undefined;
		onAdvanceResearch?: ((jobId: string) => void | Promise<void>) | undefined;
	} = $props();

	let isEditingPlan = $state(false);
	let planEditInstructions = $state('');
	let planEditPending = $state(false);
	let planApprovalPending = $state(false);
	let advancePending = $state(false);
	let planEditError = $state<string | null>(null);
	let advanceError = $state<string | null>(null);

	let isOptimisticJob = $derived(job.id.startsWith('pending-deep-research-'));
	let canCancel = $derived(
		!isOptimisticJob && (job.status === 'awaiting_plan' || job.status === 'awaiting_approval')
	);
	let canAdvanceResearch = $derived(job.status === 'approved' || job.status === 'running');
	let activePlan = $derived(job.plan ?? job.currentPlan ?? null);
	let canApprovePlan = $derived(job.status === 'awaiting_approval' && Boolean(activePlan));
	let reportDocument = $derived(buildReportDocument(job));
	let sourceCounts = $derived(job.sourceCounts ?? { discovered: 0, reviewed: 0, cited: 0 });
	let visiblePlan = $derived(activePlan ? buildVisiblePlan(activePlan) : null);
	let timelineSteps = $derived(buildTimelineSteps(job));
	let costLabel = $derived(formatCostLabel(job.usageSummary?.totalCostUsdMicros ?? 0));
	let hasSourceLedgerProgress = $derived(
		sourceCounts.discovered > 0 || sourceCounts.reviewed > 0 || sourceCounts.cited > 0
	);
	let visibleSources = $derived(
		(job.sources ?? [])
			.filter((source) => source.reviewedAt || source.citedAt)
			.slice(0, 4)
	);

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

	function isInternalApprovalConstraint(value: string): boolean {
		return /do not start source-heavy research until the research plan is approved/i.test(value) ||
			/ne induljon forrásigényes kutatás/i.test(value);
	}

	function compactItems(items: Array<string | null | undefined>): string[] {
		return items
			.map((item) => item?.trim() ?? '')
			.filter((item) => item.length > 0 && !isInternalApprovalConstraint(item));
	}

	function buildVisiblePlan(plan: DeepResearchPlanSummary): VisiblePlan {
		if (plan.rawPlan) {
			const rawPlan = plan.rawPlan;
			const sections: VisiblePlanSection[] = [];
			const keyQuestions = compactItems(rawPlan.keyQuestions);
			if (keyQuestions.length > 0) {
				sections.push({ heading: $t('deepResearch.plan.keyQuestions'), items: keyQuestions });
			}

			const deliverables = compactItems(rawPlan.deliverables);
			if (deliverables.length > 0) {
				sections.push({ heading: $t('deepResearch.plan.deliverables'), items: deliverables });
			}

			return { sections };
		}

		return parseRenderedPlan(plan.renderedPlan);
	}

	function parseRenderedPlan(renderedPlan: string): VisiblePlan {
		const lines = renderedPlan
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => {
				if (!line) return false;
				if (/^#\s+/.test(line)) return false;
				if (/^(Research Plan|Kutatási terv)$/i.test(line)) return false;
				if (/^(Cost|Költség):/i.test(line)) return false;
				if (/^(Key questions|Kulcskérdések|Deliverables|Eredmények|Research steps|Kutatási lépések):?$/i.test(line)) return false;
				if (isInternalApprovalConstraint(line.replace(/^-\s*/, ''))) return false;
				return true;
			});
		const goalIndex = lines.findIndex((line) => /^(Goal|Cél):/i.test(line));
		const remaining = lines.filter((_, index) => index !== goalIndex);
		const goalLine = goalIndex >= 0 ? lines[goalIndex]?.replace(/^(Goal|Cél):\s*/i, '').trim() : '';
		const sections: VisiblePlanSection[] = [];
		if (goalLine) {
			sections.push({ heading: $t('deepResearch.plan.goal'), items: [goalLine] });
		}
		const keyQuestionItems = remaining.filter((line) => !/^(Goal|Cél|Expected report shape|Várt jelentésszerkezet):/i.test(line));
		if (keyQuestionItems.length > 0) {
			sections.push({
				heading: $t('deepResearch.plan.keyQuestions'),
				items: keyQuestionItems,
			});
		}
		return {
			sections,
		};
	}

	function formatCostLabel(costUsdMicros: number): string | null {
		if (!Number.isFinite(costUsdMicros) || costUsdMicros <= 0) return null;
		return $t('deepResearch.estimatedCost', {
			cost: `$${(costUsdMicros / 1_000_000).toFixed(4)}`,
		});
	}

	function buildTimelineSteps(job: DeepResearchJob): TimelineStep[] {
		const currentIndex = activeTimelineIndex(job);
		return TIMELINE_STEP_DEFINITIONS.map((step, index) => ({
			...step,
			status:
				job.status === 'completed' || index < currentIndex
					? 'completed'
					: index === currentIndex
						? 'active'
						: 'pending',
			events: (job.timeline ?? []).filter((event) => step.stages.includes(event.stage)),
		}));
	}

	function activeTimelineIndex(job: DeepResearchJob): number {
		if (job.status === 'completed') return TIMELINE_STEP_DEFINITIONS.length - 1;
		if (job.status === 'awaiting_approval') return 2;
		const stage = job.stage ?? '';
		const index = TIMELINE_STEP_DEFINITIONS.findIndex((step) => step.stages.includes(stage));
		return Math.max(0, index);
	}

	const TIMELINE_STEP_DEFINITIONS = [
		{ id: 'plan', labelKey: 'deepResearch.timeline.planDrafting', stages: ['plan_generation'] },
		{ id: 'plan-drafted', labelKey: 'deepResearch.timeline.planDrafted', stages: ['plan_drafted', 'plan_revised'] },
		{ id: 'approval', labelKey: 'deepResearch.timeline.awaitingApproval', stages: ['plan_approved'] },
		{ id: 'discovery', labelKey: 'deepResearch.timeline.discoveringSources', stages: ['source_discovery'] },
		{ id: 'review', labelKey: 'deepResearch.timeline.reviewingSources', stages: ['source_review'] },
		{ id: 'coverage', labelKey: 'deepResearch.timeline.checkingCoverage', stages: ['coverage_assessment'] },
		{ id: 'gaps', labelKey: 'deepResearch.timeline.fillingGaps', stages: ['research_tasks'] },
		{ id: 'synthesis', labelKey: 'deepResearch.timeline.synthesizing', stages: ['synthesis'] },
		{ id: 'audit', labelKey: 'deepResearch.timeline.auditingCitations', stages: ['citation_audit', 'citation_audit_failed'] },
		{ id: 'writing', labelKey: 'deepResearch.timeline.writingReport', stages: ['report_writing', 'report_ready'] },
		{ id: 'completed', labelKey: 'deepResearch.timeline.completed', stages: ['completed'] },
	] satisfies Array<Omit<TimelineStep, 'status' | 'events'>>;

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

	async function advanceResearch() {
		if (!canAdvanceResearch || !onAdvanceResearch || advancePending) return;
		advancePending = true;
		advanceError = null;
		try {
			await onAdvanceResearch(job.id);
		} catch (err) {
			advanceError = err instanceof Error ? err.message : $t('deepResearch.advanceWorkflowFailed');
		} finally {
			advancePending = false;
		}
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
		<span class={`research-card__status research-card__status--${job.status}`}>
			<span class="research-card__status-dot" aria-hidden="true"></span>
			{$t(statusKeys[job.status])}
		</span>
		{#if job.status === 'completed' && costLabel}
			<span class="research-card__cost">{costLabel}</span>
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
					{job.runtimeEstimate?.label ?? activePlan.effortEstimate.expectedTimeBand}
				</span>
				<span>
					{$t('deepResearch.sourceCeiling', {
						count: activePlan.effortEstimate.sourceReviewCeiling,
					})}
				</span>
			</div>

			{#if activePlan.contextDisclosure}
				<p class="research-card__context">
					<strong>{$t('deepResearch.contextConsidered')}:</strong>
					{activePlan.contextDisclosure}
				</p>
			{/if}

			{#if visiblePlan}
				<div class="research-card__plan-text">
					{#each visiblePlan.sections as section}
						<div class="research-card__plan-section">
							<strong>{section.heading}</strong>
							<ul>
								{#each section.items as item}
									<li>{item.replace(/^-\s*/, '')}</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{/if}

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
	{:else if job.status === 'awaiting_plan'}
		<section class="research-card__planning" aria-live="polite">
			<div class="research-card__planning-spinner" aria-hidden="true"></div>
			<div>
				<strong>{$t('deepResearch.planningInProgress')}</strong>
				<p>{$t('deepResearch.planningInProgressDetail')}</p>
			</div>
		</section>
	{/if}

	{#if hasSourceLedgerProgress}
		<section class="research-card__sources" aria-labelledby={`${job.id}-sources-heading`}>
			<div class="research-card__section-header">
				<h3 id={`${job.id}-sources-heading`}>{$t('deepResearch.sourcesHeading')}</h3>
			</div>
			<div class="research-card__source-counts" aria-label={$t('deepResearch.sourceCountsLabel')}>
				{#each sourceCountLabels(sourceCounts) as label}
					<span>{label}</span>
				{/each}
			</div>
			{#if visibleSources.length > 0}
				<div class="research-card__reviewed-sources">
					<strong>{$t('deepResearch.reviewedSourcesHeading')}</strong>
					<ul>
						{#each visibleSources as source (source.id)}
							<li>
								<a href={source.url} target="_blank" rel="noreferrer">
									{source.title ?? source.url}
								</a>
								<span>
									{source.citedAt
										? $t('deepResearch.sourceStatus.cited')
										: $t('deepResearch.sourceStatus.reviewed')}
								</span>
								{#if source.citationNote ?? source.reviewedNote}
									<p>{source.citationNote ?? source.reviewedNote}</p>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>
	{/if}

	{#if timelineSteps.length > 0}
		<section class="research-card__timeline" aria-labelledby={`${job.id}-timeline-heading`}>
			<div class="research-card__section-header">
				<h3 id={`${job.id}-timeline-heading`}>{$t('deepResearch.timelineHeading')}</h3>
			</div>

			<ol class="research-card__timeline-list">
				{#each timelineSteps as step (step.id)}
					<li class={`research-card__timeline-item research-card__timeline-item--${step.status}`}>
						<div class="research-card__timeline-marker" aria-hidden="true"></div>
						<div class="research-card__timeline-body">
							<p class="research-card__timeline-summary">{$t(step.labelKey)}</p>
							{#each step.events ?? [] as event (event.id)}
								<div class="research-card__timeline-event">
									<p>{event.summary}</p>
									<div class="research-card__source-counts" aria-label={$t('deepResearch.sourceCountsLabel')}>
										{#each sourceCountLabels(event.sourceCounts) as label}
											<span>{label}</span>
										{/each}
									</div>
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
								</div>
							{/each}
						</div>
					</li>
				{/each}
			</ol>
		</section>
	{/if}

	{#if advanceError}
		<p class="research-card__error" role="alert">{advanceError}</p>
	{/if}

	{#if canAdvanceResearch}
		<div class="research-card__actions">
			<button
				type="button"
				class="research-card__action"
				onclick={advanceResearch}
				disabled={!onAdvanceResearch || advancePending}
				aria-label={$t('deepResearch.advanceWorkflowLabel')}
				title={$t('deepResearch.advanceWorkflowHelp')}
			>
				{advancePending
					? $t('deepResearch.advancingWorkflow')
					: $t('deepResearch.advanceWorkflowLabel')}
			</button>
		</div>
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
		gap: var(--space-md);
		border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border-subtle));
		border-radius: 8px;
		background: var(--surface-elevated);
		padding: var(--space-lg);
		box-shadow: none;
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
		font-weight: 600;
		letter-spacing: 0;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.research-card__title {
		margin: 0.2rem 0 0;
		overflow-wrap: anywhere;
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.35;
		color: var(--text-primary);
	}

	.research-card__depth {
		flex: 0 0 auto;
		border-radius: 999px;
		border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border-subtle));
		background: color-mix(in srgb, var(--accent) 8%, var(--surface-page));
		padding: 0.22rem 0.55rem;
		font-size: 0.78rem;
		font-weight: 500;
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
		display: inline-flex;
		align-items: center;
		gap: 0.36rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.research-card__status-dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 999px;
		background: var(--text-muted);
	}

	.research-card__status--running .research-card__status-dot,
	.research-card__status--approved .research-card__status-dot,
	.research-card__status--awaiting_plan .research-card__status-dot,
	.research-card__status--awaiting_approval .research-card__status-dot {
		background: #f97316;
		animation: research-pulse 1.4s ease-in-out infinite;
	}

	.research-card__status--completed .research-card__status-dot {
		background: #22c55e;
	}

	.research-card__cost {
		border-left: 1px solid var(--border-subtle);
		padding-left: var(--space-xs);
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-secondary);
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
		gap: var(--space-md);
		border-top: 1px solid var(--border-subtle);
		padding-top: var(--space-md);
	}

	.research-card__planning {
		display: grid;
		grid-template-columns: 1.25rem minmax(0, 1fr);
		gap: var(--space-sm);
		align-items: start;
		border-top: 1px solid var(--border-subtle);
		padding-top: var(--space-md);
		color: var(--text-secondary);
	}

	.research-card__planning strong {
		display: block;
		font-size: 0.9rem;
		color: var(--text-primary);
	}

	.research-card__planning p {
		margin: 0.2rem 0 0;
		font-size: 0.82rem;
		line-height: 1.45;
		color: var(--text-muted);
	}

	.research-card__planning-spinner {
		margin-top: 0.1rem;
		width: 1rem;
		height: 1rem;
		border: 2px solid color-mix(in srgb, var(--accent) 24%, transparent);
		border-top-color: var(--accent);
		border-radius: 999px;
		animation: research-spin 0.9s linear infinite;
	}

	.research-card__sources,
	.research-card__timeline {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
		border-top: 1px solid var(--border-subtle);
		padding-top: var(--space-md);
	}

	.research-card__timeline-list {
		display: flex;
		flex-direction: column;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.research-card__timeline-item {
		position: relative;
		display: grid;
		grid-template-columns: 0.7rem minmax(0, 1fr);
		gap: 0.7rem;
		padding: 0 0 var(--space-sm);
	}

	.research-card__timeline-item::before {
		content: "";
		position: absolute;
		top: 0.72rem;
		bottom: 0;
		left: 0.28rem;
		width: 1px;
		background: var(--border-subtle);
	}

	.research-card__timeline-item--completed::before {
		background: color-mix(in srgb, var(--accent) 45%, var(--border-subtle));
	}

	.research-card__timeline-item:last-child::before {
		display: none;
	}

	.research-card__timeline-marker {
		position: relative;
		z-index: 1;
		margin-top: 0.32rem;
		width: 0.58rem;
		height: 0.58rem;
		border: 1px solid var(--border-subtle);
		border-radius: 999px;
		background: var(--surface-page);
	}

	.research-card__timeline-item--completed .research-card__timeline-marker {
		border-color: #22c55e;
		background: #22c55e;
	}

	.research-card__timeline-item--active .research-card__timeline-marker {
		border-color: #f97316;
		background: #f97316;
		animation: research-pulse 1.4s ease-in-out infinite;
	}

	.research-card__timeline-body {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.research-card__timeline-summary {
		margin: 0;
		font-size: 0.83rem;
		font-weight: 500;
		line-height: 1.35;
		color: var(--text-primary);
	}

	.research-card__timeline-item--pending .research-card__timeline-summary {
		color: var(--text-muted);
	}

	.research-card__timeline-event {
		border-radius: 7px;
		background: var(--surface-page);
		padding: var(--space-sm);
	}

	.research-card__timeline-event p {
		margin: 0 0 0.35rem;
		font-size: 0.8rem;
		color: var(--text-secondary);
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
		background: var(--surface-page);
		padding: 0.16rem 0.42rem;
	}

	.research-card__reviewed-sources {
		font-size: 0.78rem;
		line-height: 1.4;
		color: var(--text-secondary);
	}

	.research-card__reviewed-sources strong {
		display: block;
		margin-bottom: 0.3rem;
		color: var(--text-primary);
	}

	.research-card__reviewed-sources ul {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.research-card__reviewed-sources li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.15rem 0.45rem;
		border-radius: 7px;
		background: var(--surface-page);
		padding: 0.45rem 0.55rem;
	}

	.research-card__reviewed-sources a {
		overflow-wrap: anywhere;
		font-weight: 600;
		color: var(--text-primary);
		text-decoration: none;
	}

	.research-card__reviewed-sources a:hover {
		text-decoration: underline;
	}

	.research-card__reviewed-sources span {
		border-radius: 999px;
		background: var(--surface-page);
		padding: 0.08rem 0.36rem;
		font-size: 0.7rem;
		font-weight: 500;
		color: var(--text-muted);
	}

	.research-card__reviewed-sources p {
		grid-column: 1 / -1;
		margin: 0;
		color: var(--text-secondary);
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
		font-weight: 600;
		color: var(--text-primary);
	}

	.research-card__section-header span {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-muted);
	}

	.research-card__effort {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
		font-size: 0.78rem;
		color: var(--text-secondary);
	}

	.research-card__effort span {
		border-radius: 7px;
		background: var(--surface-page);
		padding: 0.3rem 0.5rem;
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
		border: 1px solid var(--border-subtle);
		border-radius: 7px;
		background: var(--surface-page);
		padding: var(--space-md);
		overflow-wrap: anywhere;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-secondary);
	}

	.research-card__plan-goal,
	.research-card__plan-section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.research-card__plan-goal + .research-card__plan-section,
	.research-card__plan-section + .research-card__plan-section {
		margin-top: var(--space-sm);
	}

	.research-card__plan-goal strong,
	.research-card__plan-section strong {
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.research-card__plan-goal p {
		margin: 0;
	}

	.research-card__plan-section ul {
		display: flex;
		flex-direction: column;
		gap: 0.22rem;
		margin: 0;
		padding-left: 1rem;
	}

	.research-card__edit-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-sm);
	}

	.research-card__edit-label {
		font-size: 0.78rem;
		font-weight: 600;
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
		margin-top: var(--space-xs);
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
		font-weight: 600;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--duration-standard) var(--ease-out),
			border-color var(--duration-standard) var(--ease-out),
			color var(--duration-standard) var(--ease-out),
			transform var(--duration-standard) var(--ease-out);
	}

	.research-card__action--primary {
		border-color: color-mix(in srgb, var(--accent) 48%, var(--border-subtle));
		background: var(--accent);
		color: var(--text-on-accent);
	}

	@keyframes research-pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.72;
		}
	}

	@keyframes research-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.research-card__status-dot,
		.research-card__timeline-marker,
		.research-card__planning-spinner {
			animation: none !important;
		}

		.research-card__action {
			transition: none;
		}

		.research-card__action:hover:not(:disabled),
		.research-card__action:focus-visible:not(:disabled) {
			transform: none;
		}
	}

	.research-card__action:hover:not(:disabled),
	.research-card__action:focus-visible:not(:disabled) {
		border-color: color-mix(in srgb, var(--accent) 55%, var(--border-subtle));
		background: color-mix(in srgb, var(--accent) 10%, var(--surface-page));
		color: var(--text-primary);
		transform: translateY(-1px);
	}

	.research-card__action--primary:hover:not(:disabled),
	.research-card__action--primary:focus-visible:not(:disabled) {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 88%, black);
		color: var(--text-on-accent);
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
