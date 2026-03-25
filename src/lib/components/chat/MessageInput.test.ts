import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import MessageInputWrapper from './MessageInputWrapper.test.svelte';
import MessageInput from './MessageInput.svelte';

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
});
