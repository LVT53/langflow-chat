import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import FileProductionCard from './FileProductionCard.svelte';
import type { FileProductionJob } from '$lib/types';
import { uiLanguage } from '$lib/stores/settings';

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
	it('renders an active job as a shimmer-only card with an icon cancel action', async () => {
		const onCancel = vi.fn();
		const { container, getByRole, queryByText } = render(FileProductionCard, {
			job: makeJob({ status: 'queued' }),
			onCancel,
		});

		expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
		expect(container.querySelector('[data-motion="smooth-shimmer"]')).toBeInTheDocument();
		expect(queryByText('Queued')).toBeNull();
		expect(queryByText('Quarterly report')).toBeNull();
		expect(queryByText('No files yet')).toBeNull();
		expect(queryByText('Waiting for the file worker.')).toBeNull();

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

		expect(getByText('Error')).toBeInTheDocument();
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

	it('opens produced files with a v1 fallback while background metadata sync catches up', async () => {
		const onOpenDocument = vi.fn();
		const { getByRole } = render(FileProductionCard, {
			job: makeJob({
				status: 'succeeded',
				files: [
					{
						id: 'file-1',
						filename: 'report.pdf',
						mimeType: 'application/pdf',
						sizeBytes: 2048,
						downloadUrl: '/api/chat/files/file-1/download',
						previewUrl: '/api/chat/files/file-1/preview',
						versionNumber: null,
					},
				],
			}),
			onOpenDocument,
		});

		await fireEvent.click(getByRole('button', { name: 'Preview report.pdf' }));

		expect(onOpenDocument).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'file-1',
				source: 'chat_generated_file',
				versionNumber: 1,
			})
		);
	});

	it('uses Hungarian safe text for document render failures when the UI language is Hungarian', () => {
		uiLanguage.set('hu');
		const { getByText, queryByText, unmount } = render(FileProductionCard, {
			job: makeJob({
				status: 'failed',
				error: {
					code: 'unsupported_pdf_block',
					message: 'table details leaked',
					retryable: false,
				},
			}),
		});

		expect(getByText('Ez a PDF-renderelő még nem támogatja ezt a blokkot.')).toBeInTheDocument();
		expect(queryByText('table details leaked')).toBeNull();

		unmount();
		uiLanguage.set('en');
	});
});
