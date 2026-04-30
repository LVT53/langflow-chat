import {
	createInlineThinkingState,
	flushInlineThinkingState,
	processInlineThinkingChunk
} from '$lib/services/stream-protocol';
import { PRESERVE_TAG_RE } from './thinking-normalizer';
import { processToolCallMarkers } from './tool-call-markers';

/**
 * Canonical text normalization for assistant output.
 * Strips thinking content, tool-call markers, and preserve tags.
 * Used by both send and stream paths.
 */
export function normalizeAssistantOutput(text: string): string {
	if (!text) return '';

	const state = createInlineThinkingState();
	let visibleText = '';

	processInlineThinkingChunk(state, text, {
		onVisible(chunk) { visibleText += chunk; },
		onThinking() {},
	});
	flushInlineThinkingState(state, {
		onVisible(chunk) { visibleText += chunk; },
		onThinking() {},
	});

	let result = visibleText.replace(PRESERVE_TAG_RE, '');
	result = processToolCallMarkers(result, () => {});

	return result.trim();
}
