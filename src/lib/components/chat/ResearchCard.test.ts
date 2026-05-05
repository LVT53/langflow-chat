import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
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
});
