import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import MessageInputWrapper from './MessageInputWrapper.test.svelte';
import MessageInput from './MessageInput.svelte';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('MessageInput', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('renders correctly', () => {
		const { getByPlaceholderText } = render(MessageInput);
		expect(getByPlaceholderText('Type a message...')).toBeDefined();
	});

	it('disables send button when input is empty', () => {
		const { getByLabelText } = render(MessageInput);
		const button = getByLabelText('Send message') as HTMLButtonElement;
		
		expect(button.disabled).toBe(true);
	});

	it('enables send button when input has text', async () => {
		const { getByPlaceholderText, getByLabelText } = render(MessageInput);
		const input = getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
		const button = getByLabelText('Send message') as HTMLButtonElement;
		
		await fireEvent.input(input, { target: { value: 'Hello' } });
		expect(button.disabled).toBe(false);
	});

	it('dispatches send event and clears input on enter key', async () => {
		const mockSend = vi.fn();
		const { getByPlaceholderText } = render(MessageInputWrapper, { onSend: mockSend });
		const input = getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
		
		await fireEvent.input(input, { target: { value: 'Hello World' } });
		await fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
		
		expect(mockSend).toHaveBeenCalledTimes(1);
		expect(mockSend).toHaveBeenCalledWith('Hello World');
		expect(input.value).toBe('');
	});

	it('inserts newline but does not send on shift+enter', async () => {
		const mockSend = vi.fn();
		const { getByPlaceholderText } = render(MessageInputWrapper, { onSend: mockSend });
		const input = getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
		
		await fireEvent.input(input, { target: { value: 'Line 1\nLine 2' } });
		await fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
		
		expect(mockSend).not.toHaveBeenCalled();
		expect(input.value).toBe('Line 1\nLine 2');
	});

	it('does not send if input is only whitespace', async () => {
		const mockSend = vi.fn();
		const { getByPlaceholderText, getByLabelText } = render(MessageInputWrapper, { onSend: mockSend });
		const input = getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
		const button = getByLabelText('Send message') as HTMLButtonElement;
		
		await fireEvent.input(input, { target: { value: '   \n  ' } });
		
		expect(button.disabled).toBe(true);
		
		await fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
		expect(mockSend).not.toHaveBeenCalled();
	});

	it('shows character count and blocks send when over limit', async () => {
		const maxLength = 10;
		const mockSend = vi.fn();
		const { getByPlaceholderText, getByLabelText, getByText } = render(MessageInputWrapper, { maxLength, onSend: mockSend });
		const input = getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
		const button = getByLabelText('Send message') as HTMLButtonElement;
		
		await fireEvent.input(input, { target: { value: '123456789' } });
		expect(getByText('9/10')).toBeDefined();
		expect(button.disabled).toBe(false);

		await fireEvent.input(input, { target: { value: '12345678901' } });
		expect(getByText('11/10')).toBeDefined();
		expect(button.disabled).toBe(true);

		await fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
		expect(mockSend).not.toHaveBeenCalled();
	});

	it('dispatches optional task objective from the focus panel', async () => {
		const steerSpy = vi.fn();
		const { getByRole, getByPlaceholderText } = render(MessageInputWrapper, {
			onSteer: steerSpy,
			contextStatus: {
				conversationId: 'conv-1',
				userId: 'user-1',
				estimatedTokens: 1200,
				maxContextTokens: 262144,
				thresholdTokens: 209715,
				targetTokens: 157286,
				compactionApplied: false,
				compactionMode: 'none',
				routingStage: 'deterministic',
				routingConfidence: 0,
				verificationStatus: 'skipped',
				layersUsed: [],
				workingSetCount: 0,
				workingSetArtifactIds: [],
				workingSetApplied: false,
				taskStateApplied: false,
				promptArtifactCount: 0,
				recentTurnCount: 0,
				summary: null,
				updatedAt: Date.now(),
			},
			contextDebug: {
				activeTaskId: null,
				activeTaskObjective: 'Current task',
				taskLocked: false,
				routingStage: 'deterministic',
				routingConfidence: 0,
				verificationStatus: 'skipped',
				selectedEvidence: [],
				selectedEvidenceBySource: [],
				pinnedEvidence: [],
				excludedEvidence: [],
			},
		});

		await fireEvent.click(getByRole('button', { name: 'Start new task' }));
		const taskInput = getByPlaceholderText('Leave empty to infer from your next message') as HTMLInputElement;
		await fireEvent.input(taskInput, { target: { value: 'Prepare internship applications' } });
		await fireEvent.click(getByRole('button', { name: 'Start' }));

		expect(steerSpy).toHaveBeenCalledWith({
			action: 'start_new_task',
			artifactId: undefined,
			objective: 'Prepare internship applications',
		});
	});

	it('disables send while an attachment upload is still in progress', async () => {
		let resolveUpload: ((value: unknown) => void) | null = null;
		fetchMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveUpload = resolve;
				})
		);

		const artifact = {
			id: 'artifact-1',
			type: 'source_document' as const,
			retrievalClass: 'durable' as const,
			name: 'recipe.txt',
			mimeType: 'text/plain',
			sizeBytes: 12,
			conversationId: 'conv-1',
			summary: 'Dinner recipe',
			createdAt: Date.now(),
			updatedAt: Date.now(),
		};

		const sendSpy = vi.fn();
		const { container, getByPlaceholderText, getByLabelText, getByText } = render(
			MessageInputWrapper,
			{
				conversationId: 'conv-1',
				attachmentsEnabled: true,
				onSend: sendSpy,
			}
		);

		const textarea = getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
		const sendButton = getByLabelText('Send message') as HTMLButtonElement;
		const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

		await fireEvent.input(textarea, { target: { value: 'Use this file' } });
		expect(sendButton.disabled).toBe(false);

		const file = new File(['hello'], 'recipe.txt', { type: 'text/plain' });
		await fireEvent.change(fileInput, { target: { files: [file] } });

		await waitFor(() => {
			expect(getByText('Uploading file...')).toBeDefined();
			expect(sendButton.disabled).toBe(true);
		});

		resolveUpload?.({
			ok: true,
			json: async () => ({
				artifact,
				promptReady: true,
				promptArtifactId: 'normalized-1',
				readinessError: null,
			}),
		});

		await waitFor(() => {
			expect(sendButton.disabled).toBe(false);
		});
		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('blocks send when an uploaded attachment is not prompt-ready', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({
				artifact: {
					id: 'artifact-2',
					type: 'source_document',
					retrievalClass: 'durable',
					name: 'scan.pdf',
					mimeType: 'application/pdf',
					sizeBytes: 128,
					conversationId: 'conv-1',
					summary: null,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				},
				promptReady: false,
				promptArtifactId: null,
				readinessError: 'This file could not be prepared for chat.',
			}),
		});

		const sendSpy = vi.fn();
		const { container, getByPlaceholderText, getByLabelText, findByText } = render(
			MessageInputWrapper,
			{
				conversationId: 'conv-1',
				attachmentsEnabled: true,
				onSend: sendSpy,
			}
		);

		const textarea = getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
		const sendButton = getByLabelText('Send message') as HTMLButtonElement;
		const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

		await fireEvent.input(textarea, { target: { value: 'Use this file' } });
		await fireEvent.change(fileInput, {
			target: { files: [new File(['scan'], 'scan.pdf', { type: 'application/pdf' })] },
		});

		expect(await findByText(/scan\.pdf: This file could not be prepared for chat\./i)).toBeDefined();
		expect(sendButton.disabled).toBe(true);

		await fireEvent.click(sendButton);
		expect(sendSpy).not.toHaveBeenCalled();
	});

	it('ignores stale async draft emissions after send clears the composer', async () => {
		let resolveConversation: ((id: string) => void) | null = null;
		const ensureConversation = vi.fn(
			() =>
				new Promise<string>((resolve) => {
					resolveConversation = resolve;
				})
		);
		const sendSpy = vi.fn();
		const draftSpy = vi.fn();
		const { getByPlaceholderText } = render(MessageInputWrapper, {
			ensureConversation,
			onSend: (message: string) =>
				sendSpy({
					message,
					attachmentIds: [],
					attachments: [],
					conversationId: null,
				}),
			onDraftChange: draftSpy,
		});

		const input = getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
		await fireEvent.input(input, { target: { value: 'Race me' } });
		await fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

		expect(sendSpy).toHaveBeenCalledWith({
			message: 'Race me',
			attachmentIds: [],
			attachments: [],
			conversationId: null,
		});
		expect(draftSpy).not.toHaveBeenCalled();

		resolveConversation?.('conv-race');
		await waitFor(() => {
			expect(ensureConversation).toHaveBeenCalledTimes(1);
		});
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(draftSpy).not.toHaveBeenCalled();
	});

	it('queues the next message on Enter while generation is in progress', async () => {
		const queueSpy = vi.fn();
		const { getByPlaceholderText, queryByTestId } = render(MessageInputWrapper, {
			isGenerating: true,
			onQueue: queueSpy,
		});

		const input = getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
		await fireEvent.input(input, { target: { value: 'Queue this next' } });
		await fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

		expect(queueSpy).toHaveBeenCalledTimes(1);
		expect(queueSpy).toHaveBeenCalledWith('Queue this next');
		expect(input.value).toBe('');
		expect(queryByTestId('queue-button')).toBeNull();
	});

	it('does not clear the draft when the queue slot is already occupied', async () => {
		const queueSpy = vi.fn();
		const { getByPlaceholderText } = render(MessageInputWrapper, {
			isGenerating: true,
			hasQueuedMessage: true,
			queuedMessagePreview: 'Already queued',
			onQueue: queueSpy,
		});

		const input = getByPlaceholderText('Type a message...') as HTMLTextAreaElement;
		await fireEvent.input(input, { target: { value: 'Keep this draft' } });
		await fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

		expect(queueSpy).not.toHaveBeenCalled();
		expect(input.value).toBe('Keep this draft');
	});

	it('allows deleting the queued message from the banner', async () => {
		const deleteSpy = vi.fn();
		const { getByTestId } = render(MessageInputWrapper, {
			hasQueuedMessage: true,
			queuedMessagePreview: 'Already queued',
			onDeleteQueuedMessage: deleteSpy,
		});

		await fireEvent.click(getByTestId('delete-queued-button'));

		expect(deleteSpy).toHaveBeenCalledTimes(1);
	});
});
