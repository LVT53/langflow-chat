import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ResearchCard from './ResearchCard.svelte';
import type { DeepResearchJob, DocumentWorkspaceItem } from '$lib/types';
import { uiLanguage } from '$lib/stores/settings';

function makeDeepResearchJob(overrides: Partial<DeepResearchJob> = {}): DeepResearchJob {
	const now = Date.now();
	return {
		id: overrides.id ?? 'research-job-1',
		conversationId: overrides.conversationId ?? 'conv-1',
		triggerMessageId: overrides.triggerMessageId ?? 'user-1',
		depth: overrides.depth ?? 'standard',
		status: overrides.status ?? 'awaiting_approval',
		stage: overrides.stage ?? 'plan_drafted',
		title: overrides.title ?? 'Research battery recycling policy',
		userRequest: overrides.userRequest ?? 'Research battery recycling policy',
		createdAt: overrides.createdAt ?? now,
		updatedAt: overrides.updatedAt ?? now,
		completedAt: overrides.completedAt ?? null,
		cancelledAt: overrides.cancelledAt ?? null,
		...overrides,
	};
}

describe('ResearchCard', () => {
	afterEach(() => {
		uiLanguage.set('en');
	});

	it('renders a shell-only card when no Research Plan is present', () => {
		const { getByRole, getByText, queryByText, queryByRole } = render(ResearchCard, {
			job: makeDeepResearchJob({
				status: 'awaiting_plan',
				stage: 'job_shell_created',
				plan: null,
			}),
		});

		expect(
			getByRole('article', { name: 'Deep Research: Research battery recycling policy' })
		).toBeInTheDocument();
		expect(getByText('Standard')).toBeInTheDocument();
		expect(getByText('Awaiting plan')).toBeInTheDocument();
		expect(getByText('Drafting research plan...')).toBeInTheDocument();
		expect(getByText('Drafting plan')).toBeInTheDocument();
		expect(getByRole('button', { name: 'Cancel Deep Research' })).toBeInTheDocument();
		expect(queryByText('Research Plan')).not.toBeInTheDocument();
		expect(queryByRole('button', { name: 'Approve Research Plan' })).not.toBeInTheDocument();
		expect(queryByRole('button', { name: 'Edit Research Plan' })).not.toBeInTheDocument();
	});

	it('localizes plan sections and timeline step labels in Hungarian', () => {
		uiLanguage.set('hu');
		const { getAllByText, getByText, queryByText } = render(ResearchCard, {
			job: makeDeepResearchJob({
				plan: {
					version: 1,
					renderedPlan: '',
					rawPlan: {
						goal: 'Hasonlítsd össze az akkumulátor-újrahasznosítási szabályokat.',
						depth: 'standard',
						researchBudget: {
							sourceReviewCeiling: 40,
							synthesisPassCeiling: 2,
						},
						keyQuestions: ['Mely szabályok változtak mostanában?'],
						sourceScope: {
							includePublicWeb: true,
							planningContextDisclosure: null,
						},
						reportShape: [],
						constraints: [],
						deliverables: ['Rövid összehasonlító jelentés'],
					},
					contextDisclosure: null,
					effortEstimate: {
						selectedDepth: 'standard',
						expectedTimeBand: '10-25 perc',
						sourceReviewCeiling: 40,
						relativeCostWarning: 'Közepes relatív költség.',
					},
				},
			}),
		});

		expect(getByText('Kulcskérdések')).toBeInTheDocument();
		expect(getByText('Eredmények')).toBeInTheDocument();
		expect(getByText('Terv elkészült')).toBeInTheDocument();
		expect(getAllByText('Jóváhagyásra vár').length).toBeGreaterThan(0);
		expect(queryByText('Key questions')).not.toBeInTheDocument();
		expect(queryByText('Plan drafted')).not.toBeInTheDocument();
	});

	it('shows a persisted Research Plan and approval affordances when awaiting approval', () => {
		const { getByRole, getByText, queryByText } = render(ResearchCard, {
			job: makeDeepResearchJob({
				plan: {
					version: 1,
					renderedPlan:
						'Research Plan\n\nGoal: Compare EU and US battery recycling policy.\n\nKey questions:\n- Which rules changed recently?',
					contextDisclosure: 'Planning considered 2 knowledge items and 1 attachment item.',
					effortEstimate: {
						selectedDepth: 'standard',
						expectedTimeBand: '10-25 minutes',
						sourceReviewCeiling: 40,
						relativeCostWarning:
							'Moderate relative cost; use for serious multi-source synthesis.',
					},
				},
			}),
		});

		expect(getByText('Research Plan')).toBeInTheDocument();
		expect(getByText(/Compare EU and US battery recycling policy/)).toBeInTheDocument();
		expect(getByText('10-25 minutes')).toBeInTheDocument();
		expect(getByText('Up to 40 sources')).toBeInTheDocument();
		expect(queryByText(/Moderate relative cost/)).not.toBeInTheDocument();
		expect(getByText(/Planning considered 2 knowledge items/)).toBeInTheDocument();
		expect(getByRole('button', { name: 'Approve Research Plan' })).toBeInTheDocument();
		expect(getByRole('button', { name: 'Edit Research Plan' })).toBeInTheDocument();
		expect(getByRole('button', { name: 'Cancel Deep Research' })).toBeInTheDocument();
	});

	it('shows a compact Activity Timeline with source counts and warnings', () => {
		const { getByText, queryByText } = render(ResearchCard, {
			job: makeDeepResearchJob({
				status: 'running',
				stage: 'source_review',
				timeline: [
					{
						id: 'timeline-1',
						jobId: 'research-job-1',
						conversationId: 'conv-1',
						userId: 'user-1',
						taskId: null,
						stage: 'source_review',
						kind: 'stage_completed',
						occurredAt: '2026-05-05T10:30:00.000Z',
						messageKey: 'deepResearch.timeline.sourceReviewCompleted',
						messageParams: {},
						sourceCounts: {
							discovered: 12,
							reviewed: 5,
							cited: 2,
						},
						assumptions: ['Public web sources are enough for the initial pass.'],
						warnings: ['One source could not be opened and was skipped.'],
						summary: 'Reviewed 5 candidate sources.',
						createdAt: '2026-05-05T10:30:00.000Z',
					},
				],
			} as Partial<DeepResearchJob> & { timeline: unknown[] }),
		});

		expect(getByText('Activity Timeline')).toBeInTheDocument();
		expect(getByText('Reviewed 5 candidate sources.')).toBeInTheDocument();
		expect(getByText('12 discovered')).toBeInTheDocument();
		expect(getByText('5 reviewed')).toBeInTheDocument();
		expect(getByText('2 cited')).toBeInTheDocument();
		expect(queryByText('Public web sources are enough for the initial pass.')).not.toBeInTheDocument();
		expect(queryByText('Assumptions')).not.toBeInTheDocument();
		expect(getByText('One source could not be opened and was skipped.')).toBeInTheDocument();
	});

	it('shows source ledger progress with distinct discovered, reviewed, and cited counts', () => {
		const { getByText } = render(ResearchCard, {
			job: makeDeepResearchJob({
				status: 'running',
				stage: 'source_review',
				timeline: [],
				sourceCounts: {
					discovered: 12,
					reviewed: 5,
					cited: 2,
				},
			}),
		});

		expect(getByText('Sources')).toBeInTheDocument();
		expect(getByText('12 discovered')).toBeInTheDocument();
		expect(getByText('5 reviewed')).toBeInTheDocument();
		expect(getByText('2 cited')).toBeInTheDocument();
	});

	it('lists only reviewed and cited sources without presenting discovered-only sources as evidence', () => {
		const { getByText, queryByText } = render(ResearchCard, {
			job: makeDeepResearchJob({
				status: 'completed',
				stage: 'report_ready',
				sourceCounts: {
					discovered: 3,
					reviewed: 2,
					cited: 1,
				},
				sources: [
					{
						id: 'source-discovered',
						jobId: 'research-job-1',
						conversationId: 'conv-1',
						status: 'discovered',
						url: 'https://example.com/discovered',
						title: 'Discovered-only source',
						provider: 'web_search',
						discoveredAt: '2026-05-05T10:10:00.000Z',
						reviewedAt: null,
						citedAt: null,
					},
					{
						id: 'source-reviewed',
						jobId: 'research-job-1',
						conversationId: 'conv-1',
						status: 'reviewed',
						url: 'https://example.com/reviewed',
						title: 'Reviewed source',
						provider: 'web_search',
						reviewedNote: 'Relevant background source.',
						discoveredAt: '2026-05-05T10:11:00.000Z',
						reviewedAt: '2026-05-05T10:20:00.000Z',
						citedAt: null,
					},
					{
						id: 'source-cited',
						jobId: 'research-job-1',
						conversationId: 'conv-1',
						status: 'cited',
						url: 'https://example.com/cited',
						title: 'Cited source',
						provider: 'web_search',
						citationNote: 'Supports a report claim.',
						discoveredAt: '2026-05-05T10:12:00.000Z',
						reviewedAt: '2026-05-05T10:21:00.000Z',
						citedAt: '2026-05-05T10:30:00.000Z',
					},
				],
			}),
		});

		expect(getByText('Reviewed sources')).toBeInTheDocument();
		expect(getByText('Reviewed source')).toBeInTheDocument();
		expect(getByText('Relevant background source.')).toBeInTheDocument();
		expect(getByText('Cited source')).toBeInTheDocument();
		expect(getByText('Supports a report claim.')).toBeInTheDocument();
		expect(queryByText('Discovered-only source')).not.toBeInTheDocument();
	});

	it('does not render unexpected private reasoning fields from timeline payloads', () => {
		const { container, getByText, queryByText } = render(ResearchCard, {
			job: makeDeepResearchJob({
				status: 'running',
				stage: 'source_discovery',
				timeline: [
					{
						id: 'timeline-1',
						jobId: 'research-job-1',
						conversationId: 'conv-1',
						userId: 'user-1',
						taskId: null,
						stage: 'source_discovery',
						kind: 'stage_completed',
						occurredAt: '2026-05-05T10:20:00.000Z',
						messageKey: 'deepResearch.timeline.sourceDiscoveryCompleted',
						messageParams: {
							privateReasoning: 'chain-of-thought source strategy',
						},
						sourceCounts: {
							discovered: 8,
							reviewed: 0,
							cited: 0,
						},
						assumptions: [],
						warnings: [],
						summary: 'Discovered 8 candidate sources.',
						createdAt: '2026-05-05T10:20:00.000Z',
						privateReasoning: 'The worker privately ranked alternate search branches.',
						chainOfThought: 'Do not render this hidden reasoning.',
					},
				],
			} as Partial<DeepResearchJob> & { timeline: unknown[] }),
		});

		expect(getByText('Discovered 8 candidate sources.')).toBeInTheDocument();
		expect(queryByText(/chain-of-thought source strategy/)).not.toBeInTheDocument();
		expect(queryByText(/privately ranked alternate search branches/)).not.toBeInTheDocument();
		expect(queryByText(/hidden reasoning/)).not.toBeInTheDocument();
		expect(container).not.toHaveTextContent('chain-of-thought');
	});

	it('lets the user submit a freeform Plan Edit while awaiting approval', async () => {
		const onEdit = vi.fn(async () => {});
		const { getByRole, getByLabelText, queryByLabelText } = render(ResearchCard, {
			job: makeDeepResearchJob({
				plan: {
					version: 1,
					renderedPlan: 'Research Plan\n\nGoal: Compare EU and US battery recycling policy.',
					contextDisclosure: null,
					effortEstimate: {
						selectedDepth: 'standard',
						expectedTimeBand: '10-25 minutes',
						sourceReviewCeiling: 40,
						relativeCostWarning:
							'Moderate relative cost; use for serious multi-source synthesis.',
					},
				},
			}),
			onEdit,
		});

		expect(queryByLabelText('Edit plan instructions')).not.toBeInTheDocument();

		await fireEvent.click(getByRole('button', { name: 'Edit Research Plan' }));
		const instructions = getByLabelText('Edit plan instructions');
		await fireEvent.input(instructions, {
			target: { value: 'Focus more on EU enforcement and recent recycling targets.' },
		});
		await fireEvent.click(getByRole('button', { name: 'Submit Plan Edit' }));

		expect(onEdit).toHaveBeenCalledWith(
			'research-job-1',
			'Focus more on EU enforcement and recent recycling targets.'
		);
		await waitFor(() => {
			expect(queryByLabelText('Edit plan instructions')).not.toBeInTheDocument();
		});
	});

	it('locks approval actions while approving and hides edit affordances after approval', async () => {
		let finishApproval: () => void = () => {};
		const onApprove = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finishApproval = resolve;
				})
		);
		const awaitingApprovalJob = makeDeepResearchJob({
			plan: {
				version: 1,
				renderedPlan: 'Research Plan\n\nGoal: Compare EU and US battery recycling policy.',
				contextDisclosure: null,
				effortEstimate: {
					selectedDepth: 'standard',
					expectedTimeBand: '10-25 minutes',
					sourceReviewCeiling: 40,
					relativeCostWarning:
						'Moderate relative cost; use for serious multi-source synthesis.',
				},
			},
		});
		const { getByRole, queryByRole, rerender } = render(ResearchCard, {
			job: awaitingApprovalJob,
			onApprove,
			onEdit: vi.fn(),
		});

		await fireEvent.click(getByRole('button', { name: 'Approve Research Plan' }));

		expect(onApprove).toHaveBeenCalledWith('research-job-1');
		expect(getByRole('button', { name: 'Approve Research Plan' })).toBeDisabled();
		expect(getByRole('button', { name: 'Edit Research Plan' })).toBeDisabled();

		finishApproval();
		await rerender({
			job: {
				...awaitingApprovalJob,
				status: 'approved',
				stage: 'plan_approved',
			},
			onApprove,
			onEdit: vi.fn(),
		});

		expect(queryByRole('button', { name: 'Approve Research Plan' })).not.toBeInTheDocument();
		expect(queryByRole('button', { name: 'Edit Research Plan' })).not.toBeInTheDocument();
	});

	it('lets approved and running jobs manually advance the research workflow', async () => {
		const onAdvanceResearch = vi.fn();
		const { getByRole, rerender } = render(ResearchCard, {
			job: makeDeepResearchJob({
				status: 'approved',
				stage: 'plan_approved',
			}),
			onAdvanceResearch,
		});

		await fireEvent.click(getByRole('button', { name: 'Advance research' }));
		expect(onAdvanceResearch).toHaveBeenCalledWith('research-job-1');

		await rerender({
			job: makeDeepResearchJob({
				status: 'running',
				stage: 'source_review',
			}),
			onAdvanceResearch,
		});
		await fireEvent.click(getByRole('button', { name: 'Advance research' }));

		expect(onAdvanceResearch).toHaveBeenCalledTimes(2);
	});

	it('does not show manual workflow advance for completed, cancelled, or failed jobs', () => {
		for (const status of ['completed', 'cancelled', 'failed'] as const) {
			const { queryByRole, unmount } = render(ResearchCard, {
				job: makeDeepResearchJob({
					status,
					stage: status === 'completed' ? 'report_ready' : status,
					reportArtifactId: status === 'completed' ? 'artifact-report-1' : null,
				}),
				onAdvanceResearch: vi.fn(),
			});

			expect(queryByRole('button', { name: 'Advance research' })).not.toBeInTheDocument();
			unmount();
		}
	});

	it('shows an approval error without opening the Plan Edit form', async () => {
		const onApprove = vi.fn(async () => {
			throw new Error('Approval route unavailable');
		});
		const { getByRole } = render(ResearchCard, {
			job: makeDeepResearchJob({
				plan: {
					version: 1,
					renderedPlan: 'Research Plan\n\nGoal: Compare EU and US battery recycling policy.',
					contextDisclosure: null,
					effortEstimate: {
						selectedDepth: 'standard',
						expectedTimeBand: '10-25 minutes',
						sourceReviewCeiling: 40,
						relativeCostWarning:
							'Moderate relative cost; use for serious multi-source synthesis.',
					},
				},
			}),
			onApprove,
			onEdit: vi.fn(),
		});

		await fireEvent.click(getByRole('button', { name: 'Approve Research Plan' }));

		await waitFor(() => {
			expect(getByRole('alert')).toHaveTextContent('Approval route unavailable');
		});
	});

	it('shows Report Actions on completed Research Reports and calls their handlers', async () => {
		const onDiscussReport = vi.fn();
		const onResearchFurther = vi.fn();
		const { getByRole } = render(ResearchCard, {
			job: makeDeepResearchJob({
				status: 'completed',
				stage: 'report_ready',
				reportArtifactId: 'artifact-report-1',
				completedAt: Date.now(),
			}),
			onDiscussReport,
			onResearchFurther,
		});

		await fireEvent.click(getByRole('button', { name: 'Discuss Report' }));
		await fireEvent.click(getByRole('button', { name: 'Research Further' }));

		expect(onDiscussReport).toHaveBeenCalledWith('research-job-1');
		expect(onResearchFurther).toHaveBeenCalledWith('research-job-1');
	});

	it('does not show Report Actions before a Research Report is completed', () => {
		const { queryByRole } = render(ResearchCard, {
			job: makeDeepResearchJob({
				status: 'running',
				stage: 'synthesis',
				reportArtifactId: null,
			}),
			onDiscussReport: vi.fn(),
			onResearchFurther: vi.fn(),
		});

		expect(queryByRole('button', { name: 'Discuss Report' })).not.toBeInTheDocument();
		expect(queryByRole('button', { name: 'Research Further' })).not.toBeInTheDocument();
	});

	it('opens a completed fake Research Report in the document workspace', async () => {
		const onOpenReport = vi.fn<(document: DocumentWorkspaceItem) => void>();
		const { getByRole } = render(ResearchCard, {
			job: makeDeepResearchJob({
				status: 'completed',
				stage: 'report_ready',
				reportArtifactId: 'artifact-report-1',
				completedAt: Date.now(),
			}),
			onOpenReport,
		});

		await fireEvent.click(getByRole('button', { name: 'Open Report' }));

		expect(onOpenReport).toHaveBeenCalledWith({
			id: 'artifact:artifact-report-1',
			source: 'knowledge_artifact',
			filename: 'Research Report - Research battery recycling policy.md',
			title: 'Research Report - Research battery recycling policy.md',
			documentLabel: 'Research Report - Research battery recycling policy.md',
			documentRole: 'research_report',
			versionNumber: 1,
			mimeType: 'text/markdown',
			artifactId: 'artifact-report-1',
			conversationId: 'conv-1',
			previewUrl: '/api/knowledge/artifact-report-1/preview',
			downloadUrl: '/api/knowledge/artifact-report-1/download',
		});
	});
});
