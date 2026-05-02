import { describe, expect, it, vi } from 'vitest';
import {
	createInlineThinkingState,
	flushInlineThinkingState,
	getTextContent,
	processInlineThinkingChunk,
	splitLeadingThinkingPreamble,
	stripLeadingResponseMarker,
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

	it('handles mixed-case Qwen thinking tags', () => {
		const state = createInlineThinkingState();
		const onVisible = vi.fn();
		const onThinking = vi.fn();

		processInlineThinkingChunk(state, 'Before<Think>Need to reason</THINK>After', {
			onVisible,
			onThinking,
		});

		expect(onVisible.mock.calls).toEqual([['Before'], ['After']]);
		expect(onThinking.mock.calls).toEqual([['Need to reason']]);
	});

	it('routes Qwen ChatML thinking traces into thinking emissions', () => {
		const state = createInlineThinkingState();
		const onVisible = vi.fn();
		const onThinking = vi.fn();

		processInlineThinkingChunk(state, 'Before<|im_start|>analysis\nTrace', {
			onVisible,
			onThinking,
		});
		processInlineThinkingChunk(state, ' details<|im_end|>After', {
			onVisible,
			onThinking,
		});

		expect(onVisible.mock.calls).toEqual([['Before'], ['After']]);
		expect(onThinking.mock.calls).toEqual([['\nTrace'], [' details']]);
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

	it('extracts assistant text from nested LangChain chunk payloads', () => {
		expect(
			getTextContent({
				data: {
					chunk: {
						content: 'Nested assistant text',
					},
				},
			})
		).toBe('Nested assistant text');
	});

	it('extracts assistant text from OpenAI content part arrays', () => {
		expect(
			getTextContent({
				choices: [
					{
						delta: {
							content: [
								{ type: 'text', text: 'Part one' },
								{ type: 'text', text: ' and two' },
							],
						},
					},
				],
			})
		).toBe('Part one and two');
	});

	it('strips a leading Langflow response marker before visible output', () => {
		expect(stripLeadingResponseMarker('responseThe United States is large.')).toBe(
			'The United States is large.'
		);
		expect(stripLeadingResponseMarker('response:The United States is large.')).toBe(
			'The United States is large.'
		);
	});

	it('splits an untagged Qwen planning preamble from visible prose', () => {
		const split = splitLeadingThinkingPreamble(
			'responseThe user wants me to write 500 words about the USA. This is a straightforward content request. I will write an informative piece.\n\n' +
				'I need to wrap the content in XML-style wrapper tags and provide it in English.\n\n' +
				'The United States is a large and diverse country.'
		);

		expect(split).toEqual({
			thinkingText:
				'The user wants me to write 500 words about the USA. This is a straightforward content request. I will write an informative piece.\n\n' +
				'I need to wrap the content in XML-style wrapper tags and provide it in English.',
			visibleText: 'The United States is a large and diverse country.',
		});
	});

	it('does not classify ordinary first-person answers as planning preambles', () => {
		expect(
			splitLeadingThinkingPreamble(
				'I need a clear thesis, strong evidence, and a concise conclusion.'
			)
		).toBeNull();
	});
});
