import { fireEvent, render, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ResearchCard from './ResearchCard.svelte';
import type { DeepResearchJob } from '$lib/types';

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
		expect(getByText('job_shell_created')).toBeInTheDocument();
		expect(getByRole('button', { name: 'Cancel Deep Research' })).toBeInTheDocument();
		expect(queryByText('Research Plan')).not.toBeInTheDocument();
		expect(queryByRole('button', { name: 'Approve Research Plan' })).not.toBeInTheDocument();
		expect(queryByRole('button', { name: 'Edit Research Plan' })).not.toBeInTheDocument();
	});

	it('shows a persisted Research Plan and approval affordances when awaiting approval', () => {
		const { getByRole, getByText } = render(ResearchCard, {
			job: makeDeepResearchJob({
				plan: {
					version: 1,
					renderedPlan:
						'Research Plan\n\nGoal: Compare EU and US battery recycling policy.\n\nKey questions:\n- Which rules changed recently?',
					contextDisclosure: 'Planning considered 2 knowledge items and 1 attachment item.',
					effortEstimate: {
						selectedDepth: 'standard',
						expectedTimeBand: '30-60 minutes',
						sourceReviewCeiling: 40,
						relativeCostWarning:
							'Moderate relative cost; use for serious multi-source synthesis.',
					},
				},
			}),
		});

		expect(getByText('Research Plan')).toBeInTheDocument();
		expect(getByText(/Compare EU and US battery recycling policy/)).toBeInTheDocument();
		expect(getByText('30-60 minutes')).toBeInTheDocument();
		expect(getByText('Up to 40 sources')).toBeInTheDocument();
		expect(getByText(/Planning considered 2 knowledge items/)).toBeInTheDocument();
		expect(getByRole('button', { name: 'Approve Research Plan' })).toBeInTheDocument();
		expect(getByRole('button', { name: 'Edit Research Plan' })).toBeInTheDocument();
		expect(getByRole('button', { name: 'Cancel Deep Research' })).toBeInTheDocument();
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
						expectedTimeBand: '30-60 minutes',
						sourceReviewCeiling: 40,
						relativeCostWarning:
							'Moderate relative cost; use for serious multi-source synthesis.',
					},
				},
			}),
			onEdit,
		});

		expect(queryByLabelText('Plan edit instructions')).not.toBeInTheDocument();

		await fireEvent.click(getByRole('button', { name: 'Edit Research Plan' }));
		const instructions = getByLabelText('Plan edit instructions');
		await fireEvent.input(instructions, {
			target: { value: 'Focus more on EU enforcement and recent recycling targets.' },
		});
		await fireEvent.click(getByRole('button', { name: 'Submit Plan Edit' }));

		expect(onEdit).toHaveBeenCalledWith(
			'research-job-1',
			'Focus more on EU enforcement and recent recycling targets.'
		);
		await waitFor(() => {
			expect(queryByLabelText('Plan edit instructions')).not.toBeInTheDocument();
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
					expectedTimeBand: '30-60 minutes',
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
						expectedTimeBand: '30-60 minutes',
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
});
