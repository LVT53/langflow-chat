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
});
