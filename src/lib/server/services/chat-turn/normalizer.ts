import {
	createInlineThinkingState,
	flushInlineThinkingState,
	processInlineThinkingChunk,
	splitLeadingThinkingPreamble,
	stripLeakedToolDiagnostics,
	stripLeadingResponseMarker,
} from "$lib/services/stream-protocol";
import { processToolCallMarkers } from "./tool-call-markers";

/**
 * Canonical text normalization for assistant output.
 * Strips thinking content, tool-call markers, and leading provider markers.
 * Used by both send and stream paths.
 */
export function normalizeAssistantOutput(text: string): string {
	if (!text) return "";

	const split = splitLeadingThinkingPreamble(text, { allowOpenEnded: true });
	const inputText = split
		? split.visibleText
		: stripLeadingResponseMarker(text);

	const state = createInlineThinkingState();
	let visibleText = "";

	processInlineThinkingChunk(state, inputText, {
		onVisible(chunk) {
			visibleText += chunk;
		},
		onThinking() {},
	});
	flushInlineThinkingState(state, {
		onVisible(chunk) {
			visibleText += chunk;
		},
		onThinking() {},
	});

	let result = visibleText;
	result = processToolCallMarkers(result, () => {});
	result = stripLeakedToolDiagnostics(result);

	return result.trim();
}
