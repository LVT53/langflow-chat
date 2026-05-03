import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import FileProductionCard from './FileProductionCard.svelte';
import type { FileProductionJob } from '$lib/types';

function makeJob(overrides: Partial<FileProductionJob>): FileProductionJob {
	return {
		id: 'job-1',
		conversationId: 'conv-1',
		assistantMessageId: 'assistant-1',
		title: 'Quarterly report',
		status: 'queued',
		stage: null,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		files: [],
		warnings: [],
		error: null,
		...overrides,
	};
}

describe('FileProductionCard', () => {
	it('renders a queued zero-file job with a cancel action', async () => {
		const onCancel = vi.fn();
		const { getByRole, getByText } = render(FileProductionCard, {
			job: makeJob({ status: 'queued' }),
			onCancel,
		});

		expect(getByText('Queued')).toBeInTheDocument();
		expect(getByText('No files yet')).toBeInTheDocument();
		expect(getByText('Waiting for the file worker.')).toBeInTheDocument();

		await fireEvent.click(getByRole('button', { name: 'Cancel file production' }));

		expect(onCancel).toHaveBeenCalledWith('job-1');
	});

	it('renders a retryable failed job with its safe error and retry action', async () => {
		const onRetry = vi.fn();
		const { getByRole, getByText } = render(FileProductionCard, {
			job: makeJob({
				status: 'failed',
				error: {
					code: 'renderer_timeout',
					message: 'Renderer timed out.',
					retryable: true,
				},
			}),
			onRetry,
		});

		expect(getByText('Needs attention')).toBeInTheDocument();
		expect(getByText('Document rendering timed out.')).toBeInTheDocument();

		await fireEvent.click(getByRole('button', { name: 'Retry file production' }));

		expect(onRetry).toHaveBeenCalledWith('job-1');
	});

	it('uses localized safe text for known limit errors instead of raw diagnostics', () => {
		const { getByText, queryByText } = render(FileProductionCard, {
			job: makeJob({
				status: 'failed',
				error: {
					code: 'too_many_outputs',
					message: 'limit=5 actual=6',
					retryable: false,
				},
			}),
		});

		expect(getByText('Too many outputs were requested.')).toBeInTheDocument();
		expect(queryByText('limit=5 actual=6')).toBeNull();
	});
});
