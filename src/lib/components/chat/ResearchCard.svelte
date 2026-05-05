<script lang="ts">
	import { t } from '$lib/i18n';
	import type { I18nKey } from '$lib/i18n';
	import type { DeepResearchDepth, DeepResearchJob, DeepResearchJobStatus } from '$lib/types';

	let {
		job,
		onApprove = undefined,
		onEdit = undefined,
		onCancel = undefined,
	}: {
		job: DeepResearchJob;
		onApprove?: ((jobId: string) => void | Promise<void>) | undefined;
		onEdit?: ((jobId: string) => void | Promise<void>) | undefined;
		onCancel?: ((jobId: string) => void | Promise<void>) | undefined;
	} = $props();

	let canCancel = $derived(job.status === 'awaiting_plan' || job.status === 'awaiting_approval');
	let activePlan = $derived(job.plan ?? job.currentPlan ?? null);
	let canApprovePlan = $derived(job.status === 'awaiting_approval' && Boolean(activePlan));

	const depthKeys: Record<DeepResearchDepth, I18nKey> = {
		focused: 'deepResearch.depth.focused',
		standard: 'deepResearch.depth.standard',
		max: 'deepResearch.depth.max',
	};

	const statusKeys: Record<DeepResearchJobStatus, I18nKey> = {
		awaiting_plan: 'deepResearch.status.awaitingPlan',
		awaiting_approval: 'deepResearch.status.awaitingApproval',
		running: 'deepResearch.status.running',
		completed: 'deepResearch.status.completed',
		failed: 'deepResearch.status.failed',
		cancelled: 'deepResearch.status.cancelled',
	};

	function cancelJob() {
		if (!canCancel || !onCancel) return;
		void onCancel(job.id);
	}

	function approvePlan() {
		if (!canApprovePlan || !onApprove) return;
		void onApprove(job.id);
	}

	function editPlan() {
		if (!canApprovePlan || !onEdit) return;
		void onEdit(job.id);
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
		</section>
	{/if}

	{#if canCancel}
		<div class="research-card__actions">
			{#if canApprovePlan}
				<button
					type="button"
					class="research-card__action research-card__action--primary"
					onclick={approvePlan}
					disabled={!onApprove}
					aria-label={$t('deepResearch.approvePlanLabel')}
					title={$t('deepResearch.approvePlanLabel')}
				>
					{$t('deepResearch.approvePlanLabel')}
				</button>
				<button
					type="button"
					class="research-card__action"
					onclick={editPlan}
					disabled={!onEdit}
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
				disabled={!onCancel}
				aria-label={$t('deepResearch.cancelLabel')}
				title={$t('deepResearch.cancelLabel')}
			>
				{$t('common.cancel')}
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
