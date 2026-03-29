import { describe, expect, it, vi } from 'vitest';
import {
	createInlineThinkingState,
	extractVisibleTextFromModelResponse,
	flushInlineThinkingState,
	processInlineThinkingChunk,
} from './stream-protocol';

describe('stream-protocol', () => {
	it('routes inline thinking tags into separate visible and thinking emissions', () => {
		const state = createInlineThinkingState();
		const onVisible = vi.fn();
		const onThinking = vi.fn();

		processInlineThinkingChunk(state, 'Before<thinking>Need to reason</thinking>After', {
			onVisible,
			onThinking,
		});

		expect(onVisible.mock.calls).toEqual([['Before'], ['After']]);
		expect(onThinking.mock.calls).toEqual([['Need to reason']]);
	});

	it('handles thinking tags split across chunks and tag boundaries', () => {
		const state = createInlineThinkingState();
		const onVisible = vi.fn();
		const onThinking = vi.fn();

		processInlineThinkingChunk(state, 'Before<think', { onVisible, onThinking });
		processInlineThinkingChunk(state, '>Need to rea', { onVisible, onThinking });
		processInlineThinkingChunk(state, 'son</think>After', { onVisible, onThinking });

		expect(onVisible.mock.calls).toEqual([['Before'], ['After']]);
		expect(onThinking.mock.calls).toEqual([['Need to rea'], ['son']]);
	});

	it('drops a trailing partial open tag when flushing visible content', () => {
		const state = createInlineThinkingState();
		const onVisible = vi.fn();
		const onThinking = vi.fn();

		processInlineThinkingChunk(state, 'Visible<think', { onVisible, onThinking });
		flushInlineThinkingState(state, { onVisible, onThinking });

		expect(onVisible.mock.calls).toEqual([['Visible']]);
		expect(onThinking).not.toHaveBeenCalled();
	});

	it('flushes unfinished inline thinking as thinking content', () => {
		const state = createInlineThinkingState();
		const onVisible = vi.fn();
		const onThinking = vi.fn();

		processInlineThinkingChunk(state, '<thinking>Unfinished', { onVisible, onThinking });
		flushInlineThinkingState(state, { onVisible, onThinking });

		expect(onVisible).not.toHaveBeenCalled();
		expect(onThinking.mock.calls).toEqual([['Unfinished']]);
	});

	it('extracts visible text and unwraps preserve tags from a completed model response', () => {
		const result = extractVisibleTextFromModelResponse(
			'<thinking>Reasoning</thinking>\n<preserve>Final answer</preserve>'
		);

		expect(result).toBe('\nFinal answer');
	});
});
