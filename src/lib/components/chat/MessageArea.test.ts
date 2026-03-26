import { render, fireEvent } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import MessageArea from './MessageArea.svelte';
import type { ChatMessage } from '$lib/types';

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
});
