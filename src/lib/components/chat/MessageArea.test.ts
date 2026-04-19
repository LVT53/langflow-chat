import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import MessageArea from './MessageArea.svelte';
import type { ChatGeneratedFileListItem, ChatMessage } from '$lib/types';

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
			generatedFiles: [],
		});

		expect(getByText('Conversation Ready')).toBeInTheDocument();
		expect(
			getByText('Your messages and generated files will appear here.')
		).toBeInTheDocument();
	});

	it('scrolls to reveal generated files when they appear at the end of the chat', async () => {
		const initialMessage: ChatMessage = {
			id: 'assistant-1',
			renderKey: 'assistant-1',
			role: 'assistant',
			content: 'Here is the report.',
			timestamp: Date.now(),
			isStreaming: false,
			isThinkingStreaming: false,
		};
		const generatedFile: ChatGeneratedFileListItem = {
			id: 'file-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			filename: 'report.pdf',
			mimeType: 'application/pdf',
			sizeBytes: 2048,
			createdAt: Date.now(),
			status: 'success',
		};

		const { container, getByText, rerender } = render(MessageArea, {
			messages: [initialMessage],
			conversationId: 'conv-1',
			isThinkingActive: false,
			contextDebug: null,
			generatedFiles: [],
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
			generatedFiles: [generatedFile],
		});

		await waitFor(() => {
			expect(getByText('report.pdf')).toBeInTheDocument();
			expect(scrollContainer.scrollTop).toBe(960);
		});
	});

	it('renders a generating file card with the pending shimmer state', async () => {
		const pendingGeneratedFile: ChatGeneratedFileListItem = {
			id: 'pending-file-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-1',
			filename: 'draft-report.pdf',
			mimeType: 'application/octet-stream',
			sizeBytes: 0,
			createdAt: Date.now(),
			status: 'generating',
		};

		const { getByText, getByTestId, queryByLabelText } = render(MessageArea, {
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
			generatedFiles: [pendingGeneratedFile],
		});

		expect(getByText('draft-report.pdf')).toBeInTheDocument();
		expect(getByText('Generating...')).toBeInTheDocument();
		expect(getByTestId('generating-progress')).toBeInTheDocument();
		expect(queryByLabelText('Download draft-report.pdf')).toBeNull();
	});

	it('renders generated files above the evidence toggle inside the latest assistant response', () => {
		const messageTimestamp = Date.now();
		const evidenceItem = {
			id: 'evidence-1',
			title: 'Research note',
			sourceType: 'document' as const,
			status: 'selected' as const,
		};
		const generatedFile: ChatGeneratedFileListItem = {
			id: 'file-inline-1',
			conversationId: 'conv-1',
			assistantMessageId: 'assistant-inline-1',
			filename: 'summary.txt',
			mimeType: 'text/plain',
			sizeBytes: 128,
			createdAt: messageTimestamp,
			status: 'success',
		};

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
			generatedFiles: [generatedFile],
		});

		const generatedFileName = getByText('summary.txt');
		const evidenceToggle = getByRole('button', { name: /Evidence/i });
		expect(
			generatedFileName.compareDocumentPosition(evidenceToggle) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
	});

	it('keeps generated files attached to the assistant response that created them', () => {
		const firstAssistantId = 'assistant-created-file';
		const secondAssistantId = 'assistant-follow-up';
		const generatedFile: ChatGeneratedFileListItem = {
			id: 'file-scoped-1',
			conversationId: 'conv-1',
			assistantMessageId: firstAssistantId,
			filename: 'scope.txt',
			mimeType: 'text/plain',
			sizeBytes: 32,
			createdAt: Date.now(),
			status: 'success',
		};

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
			generatedFiles: [generatedFile],
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
			generatedFiles: [generatedFile],
		});

		expect(getByText('scope.txt')).toBeInTheDocument();
		expect(assistantMessages[0]).toHaveTextContent('scope.txt');
		expect(assistantMessages[1]).not.toHaveTextContent('scope.txt');
	});
});
