import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import MessageArea from './MessageArea.svelte';
import type { ChatMessage, FileProductionJob } from '$lib/types';

Object.defineProperty(window, 'matchMedia', {
	writable: true,
	value: (query: string) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener: () => undefined,
		removeListener: () => undefined,
		addEventListener: () => undefined,
		removeEventListener: () => undefined,
		dispatchEvent: () => false,
	}),
});

Object.defineProperty(HTMLElement.prototype, 'animate', {
	writable: true,
	value: () => ({
		finished: Promise.resolve(),
		cancel: () => undefined,
		finish: () => undefined,
	}),
});

describe('MessageArea', () => {
	beforeEach(() => {
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	function makeFileProductionJob(
		assistantMessageId: string,
		overrides: Partial<FileProductionJob> = {}
	): FileProductionJob {
		const now = Date.now();
		return {
			id: overrides.id ?? `job-${assistantMessageId}`,
			conversationId: 'conv-1',
			assistantMessageId,
			title: overrides.title ?? 'Report',
			status: overrides.status ?? 'succeeded',
			stage: overrides.stage ?? null,
			createdAt: overrides.createdAt ?? now,
			updatedAt: overrides.updatedAt ?? now,
			warnings: overrides.warnings ?? [],
			error: overrides.error ?? null,
			files: overrides.files ?? [
				{
					id: 'file-1',
					filename: 'report.pdf',
					mimeType: 'application/pdf',
					sizeBytes: 2048,
					downloadUrl: '/api/chat/files/file-1/download',
					previewUrl: '/api/chat/files/file-1/preview',
				},
			],
		};
	}

	it('preserves the expanded thinking block when a streaming placeholder id is replaced', async () => {
		const initialMessage: ChatMessage = {
			id: 'temp-assistant-id',
			renderKey: 'temp-assistant-id',
			role: 'assistant',
			content: 'Final answer',
			timestamp: Date.now(),
			thinking: 'step one\nstep two',
			thinkingSegments: [{ type: 'text', content: 'step one\nstep two' }],
			isStreaming: true,
			isThinkingStreaming: false,
		};

		const { getByRole, getByText, rerender } = render(MessageArea, {
			messages: [initialMessage],
			conversationId: 'conv-1',
			isThinkingActive: false,
			contextDebug: null,
		});

		await fireEvent.click(getByRole('button', { name: 'Thought' }));
		expect(getByText(/step one\s+step two/)).toBeTruthy();

		await rerender({
			messages: [
				{
					...initialMessage,
					id: 'persisted-assistant-id',
					renderKey: 'temp-assistant-id',
					isStreaming: false,
				},
			],
			conversationId: 'conv-1',
			isThinkingActive: false,
			contextDebug: null,
		});

		expect(getByText(/step one\s+step two/)).toBeTruthy();
	});

	it('shows a ready state for empty conversations', () => {
		const { getByText } = render(MessageArea, {
			messages: [],
			conversationId: 'conv-1',
			isThinkingActive: false,
			contextDebug: null,
		});

		expect(getByText('Conversation Ready')).toBeInTheDocument();
		expect(
			getByText('Your messages and generated files will appear here.')
		).toBeInTheDocument();
	});

	it('scrolls to reveal file-production cards when they appear at the end of the chat', async () => {
		const initialMessage: ChatMessage = {
			id: 'assistant-1',
			renderKey: 'assistant-1',
			role: 'assistant',
			content: 'Here is the report.',
			timestamp: Date.now(),
			isStreaming: false,
			isThinkingStreaming: false,
		};
		const job = makeFileProductionJob('assistant-1', { title: 'Report' });

		const { container, getByText, rerender } = render(MessageArea, {
			messages: [initialMessage],
			conversationId: 'conv-1',
			isThinkingActive: false,
			contextDebug: null,
			fileProductionJobs: [],
		});

		const scrollContainer = container.querySelector('[aria-live="polite"]') as HTMLDivElement;
		expect(scrollContainer).toBeTruthy();

		let scrollHeight = 640;
		Object.defineProperty(scrollContainer, 'clientHeight', {
			configurable: true,
			value: 640,
		});
		Object.defineProperty(scrollContainer, 'scrollHeight', {
			configurable: true,
			get: () => scrollHeight,
		});

		scrollContainer.scrollTop = 0;
		await fireEvent.scroll(scrollContainer);

		scrollHeight = 960;
		await rerender({
			messages: [initialMessage],
			conversationId: 'conv-1',
			isThinkingActive: false,
			contextDebug: null,
			fileProductionJobs: [job],
		});

		await waitFor(() => {
			expect(getByText('report.pdf')).toBeInTheDocument();
			expect(scrollContainer.scrollTop).toBe(960);
		});
	});

	it('renders a running file-production card instead of a temporary generated-file row', async () => {
		const runningJob = makeFileProductionJob('assistant-1', {
			id: 'job-running',
			title: 'Draft report',
			status: 'running',
			files: [],
		});

		const { getByText, queryByText } = render(MessageArea, {
			messages: [
				{
					id: 'assistant-1',
					renderKey: 'assistant-1',
					role: 'assistant',
					content: 'I am generating the file now.',
					timestamp: Date.now(),
					isStreaming: true,
					isThinkingStreaming: false,
				},
			],
			conversationId: 'conv-1',
			isThinkingActive: false,
			contextDebug: null,
			fileProductionJobs: [runningJob],
		});

		expect(getByText('Draft report')).toBeInTheDocument();
		expect(getByText('Building')).toBeInTheDocument();
		expect(queryByText('Generating...')).toBeNull();
	});

	it('renders file-production cards above the evidence toggle inside the latest assistant response', () => {
		const messageTimestamp = Date.now();
		const evidenceItem = {
			id: 'evidence-1',
			title: 'Research note',
			sourceType: 'document' as const,
			status: 'selected' as const,
		};
		const job = makeFileProductionJob('assistant-inline-1', {
			id: 'job-inline-1',
			title: 'Summary',
			files: [
				{
					id: 'file-inline-1',
					filename: 'summary.txt',
					mimeType: 'text/plain',
					sizeBytes: 128,
					downloadUrl: '/api/chat/files/file-inline-1/download',
					previewUrl: '/api/chat/files/file-inline-1/preview',
				},
			],
		});

		const { getByText, getByRole } = render(MessageArea, {
			messages: [
				{
					id: 'assistant-inline-1',
					renderKey: 'assistant-inline-1',
					role: 'assistant',
					content: 'Here is the finished file.',
					timestamp: messageTimestamp,
					isStreaming: false,
					isThinkingStreaming: false,
					evidenceSummary: {
						structuredWebSearch: false,
						groups: [
							{
								sourceType: 'document',
								label: 'Documents',
								reranked: false,
								items: [evidenceItem],
							},
						],
					},
				},
			],
			conversationId: 'conv-1',
			isThinkingActive: false,
			contextDebug: null,
			fileProductionJobs: [job],
		});

		const producedFileName = getByText('summary.txt');
		const evidenceToggle = getByRole('button', { name: /Evidence/i });
		expect(
			producedFileName.compareDocumentPosition(evidenceToggle) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
	});

	it('keeps file-production cards attached to the assistant response that created them', () => {
		const firstAssistantId = 'assistant-created-file';
		const secondAssistantId = 'assistant-follow-up';
		const job = makeFileProductionJob(firstAssistantId, {
			id: 'job-scoped-1',
			title: 'Scoped file',
			files: [
				{
					id: 'file-scoped-1',
					filename: 'scope.txt',
					mimeType: 'text/plain',
					sizeBytes: 32,
					downloadUrl: '/api/chat/files/file-scoped-1/download',
					previewUrl: '/api/chat/files/file-scoped-1/preview',
				},
			],
		});

		const { container, getByText, rerender } = render(MessageArea, {
			messages: [
				{
					id: firstAssistantId,
					renderKey: firstAssistantId,
					role: 'assistant',
					content: 'First response',
					timestamp: Date.now(),
					isStreaming: false,
					isThinkingStreaming: false,
				},
				{
					id: secondAssistantId,
					renderKey: secondAssistantId,
					role: 'assistant',
					content: 'Second response',
					timestamp: Date.now() + 1,
					isStreaming: false,
					isThinkingStreaming: false,
				},
			],
			conversationId: 'conv-1',
			isThinkingActive: false,
			contextDebug: null,
			fileProductionJobs: [job],
		});

		const assistantMessages = container.querySelectorAll('[data-testid="assistant-message"]');
		expect(getByText('scope.txt')).toBeInTheDocument();
		expect(assistantMessages[0]).toHaveTextContent('scope.txt');
		expect(assistantMessages[1]).not.toHaveTextContent('scope.txt');

		void rerender({
			messages: [
				{
					id: firstAssistantId,
					renderKey: firstAssistantId,
					role: 'assistant',
					content: 'First response',
					timestamp: Date.now(),
					isStreaming: false,
					isThinkingStreaming: false,
				},
				{
					id: secondAssistantId,
					renderKey: secondAssistantId,
					role: 'assistant',
					content: 'Second response',
					timestamp: Date.now() + 1,
					isStreaming: false,
					isThinkingStreaming: false,
				},
			],
			conversationId: 'conv-1',
			isThinkingActive: false,
			contextDebug: null,
			fileProductionJobs: [job],
		});

		expect(getByText('scope.txt')).toBeInTheDocument();
		expect(assistantMessages[0]).toHaveTextContent('scope.txt');
		expect(assistantMessages[1]).not.toHaveTextContent('scope.txt');
	});

	it('renders file-production jobs as grouped cards for the assistant response', () => {
		const messageTimestamp = Date.now();
		const fileProductionJob: FileProductionJob = {
			id: 'job-grouped-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-job-1',
			title: 'Quarterly report package',
			status: 'succeeded',
			stage: null,
			createdAt: messageTimestamp,
			updatedAt: messageTimestamp,
			warnings: [],
			error: null,
			files: [
				{
					id: 'file-pdf',
					filename: 'quarterly-report.pdf',
					mimeType: 'application/pdf',
					sizeBytes: 2048,
					downloadUrl: '/api/chat/files/file-pdf/download',
					previewUrl: '/api/chat/files/file-pdf/preview',
				},
				{
					id: 'file-html',
					filename: 'quarterly-report.html',
					mimeType: 'text/html',
					sizeBytes: 4096,
					downloadUrl: '/api/chat/files/file-html/download',
					previewUrl: '/api/chat/files/file-html/preview',
				},
			],
		};

		const { container, getByText } = render(MessageArea, {
			messages: [
				{
					id: 'assistant-job-1',
					renderKey: 'assistant-job-1',
					role: 'assistant',
					content: 'I created the report package.',
					timestamp: messageTimestamp,
					isStreaming: false,
					isThinkingStreaming: false,
				},
			],
			conversationId: 'conv-1',
			isThinkingActive: false,
			contextDebug: null,
			fileProductionJobs: [fileProductionJob],
		});

		expect(container.querySelectorAll('[data-testid="file-production-card"]')).toHaveLength(1);
		expect(getByText('Quarterly report package')).toBeInTheDocument();
		expect(getByText('quarterly-report.pdf')).toBeInTheDocument();
		expect(getByText('quarterly-report.html')).toBeInTheDocument();
		expect(getByText('2 files')).toBeInTheDocument();
	});

	it('emits retry and cancel actions from file-production cards', async () => {
		const onRetryFileProductionJob = vi.fn();
		const onCancelFileProductionJob = vi.fn();
		const messageTimestamp = Date.now();
		const failedJob: FileProductionJob = {
			id: 'job-failed',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-job-actions',
			title: 'Failed report',
			status: 'failed',
			stage: null,
			createdAt: messageTimestamp,
			updatedAt: messageTimestamp,
			warnings: [],
			error: {
				code: 'renderer_timeout',
				message: 'Renderer timed out.',
				retryable: true,
			},
			files: [],
		};
		const runningJob: FileProductionJob = {
			...failedJob,
			id: 'job-running',
			title: 'Running report',
			status: 'running',
			error: null,
		};

		const { getByRole } = render(MessageArea, {
			messages: [
				{
					id: 'assistant-job-actions',
					renderKey: 'assistant-job-actions',
					role: 'assistant',
					content: 'Working on files.',
					timestamp: messageTimestamp,
					isStreaming: false,
					isThinkingStreaming: false,
				},
			],
			conversationId: 'conv-1',
			isThinkingActive: false,
			contextDebug: null,
			fileProductionJobs: [failedJob, runningJob],
			onRetryFileProductionJob,
			onCancelFileProductionJob,
		});

		await fireEvent.click(getByRole('button', { name: 'Retry file production' }));
		await fireEvent.click(getByRole('button', { name: 'Cancel file production' }));

		expect(onRetryFileProductionJob).toHaveBeenCalledWith('job-failed');
		expect(onCancelFileProductionJob).toHaveBeenCalledWith('job-running');
	});
});
