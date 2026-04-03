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
			expect(getByText('Generated Files')).toBeInTheDocument();
			expect(getByText('report.pdf')).toBeInTheDocument();
			expect(scrollContainer.scrollTop).toBe(960);
		});
	});

	it('renders a generating file card with the pending shimmer state', async () => {
		const pendingGeneratedFile: ChatGeneratedFileListItem = {
			id: 'pending-file-1',
			conversationId: 'conv-1',
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

		expect(getByText('Generated Files')).toBeInTheDocument();
		expect(getByText('draft-report.pdf')).toBeInTheDocument();
		expect(getByText('Generating...')).toBeInTheDocument();
		expect(getByTestId('generating-progress')).toBeInTheDocument();
		expect(queryByLabelText('Download draft-report.pdf')).toBeNull();
	});
});
