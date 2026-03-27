export const THINKING_OPEN_TAG = '<thinking>';
export const THINKING_CLOSE_TAG = '</thinking>';
export const HERMES_THINKING_OPEN_TAG = '<think>';
export const HERMES_THINKING_CLOSE_TAG = '</think>';

const THINKING_OPEN_TAGS = [THINKING_OPEN_TAG, HERMES_THINKING_OPEN_TAG] as const;
const THINKING_CLOSE_TAGS = [THINKING_CLOSE_TAG, HERMES_THINKING_CLOSE_TAG] as const;

export interface InlineThinkingState {
	buffer: string;
	insideThinking: boolean;
}

interface InlineThinkingEmitters {
	onVisible: (chunk: string) => boolean | void;
	onThinking: (chunk: string) => boolean | void;
}

interface TagMatch {
	index: number;
	tag: string;
}

export function createInlineThinkingState(): InlineThinkingState {
	return {
		buffer: '',
		insideThinking: false,
	};
}

export function getPartialTagPrefixLength(value: string, tag: string): number {
	const maxLength = Math.min(value.length, tag.length - 1);

	for (let length = maxLength; length > 0; length -= 1) {
		if (value.endsWith(tag.slice(0, length))) {
			return length;
		}
	}

	return 0;
}

function emitChunk(emit: (chunk: string) => boolean | void, chunk: string): boolean {
	if (!chunk) {
		return true;
	}

	return emit(chunk) !== false;
}

function findFirstTagMatch(value: string, tags: readonly string[]): TagMatch | null {
	let bestMatch: TagMatch | null = null;

	for (const tag of tags) {
		const index = value.indexOf(tag);
		if (index === -1) {
			continue;
		}
		if (!bestMatch || index < bestMatch.index) {
			bestMatch = { index, tag };
		}
	}

	return bestMatch;
}

function getPartialTagPrefixLengthForAny(value: string, tags: readonly string[]): number {
	let bestLength = 0;

	for (const tag of tags) {
		bestLength = Math.max(bestLength, getPartialTagPrefixLength(value, tag));
	}

	return bestLength;
}

export function processInlineThinkingChunk(
	state: InlineThinkingState,
	chunk: string,
	emitters: InlineThinkingEmitters
): boolean {
	if (!chunk) {
		return true;
	}

	state.buffer += chunk;

	while (state.buffer) {
		if (state.insideThinking) {
			const closeMatch = findFirstTagMatch(state.buffer, THINKING_CLOSE_TAGS);
			if (closeMatch) {
				const thinkingChunk = state.buffer.slice(0, closeMatch.index);
				if (!emitChunk(emitters.onThinking, thinkingChunk)) {
					return false;
				}
				state.buffer = state.buffer.slice(closeMatch.index + closeMatch.tag.length);
				state.insideThinking = false;
				continue;
			}

			const partialCloseLength = getPartialTagPrefixLengthForAny(state.buffer, THINKING_CLOSE_TAGS);
			const flushLength = state.buffer.length - partialCloseLength;
			if (flushLength > 0) {
				const thinkingChunk = state.buffer.slice(0, flushLength);
				if (!emitChunk(emitters.onThinking, thinkingChunk)) {
					return false;
				}
				state.buffer = state.buffer.slice(flushLength);
			}
			break;
		}

		const openMatch = findFirstTagMatch(state.buffer, THINKING_OPEN_TAGS);
		if (openMatch) {
			const visibleChunk = state.buffer.slice(0, openMatch.index);
			if (!emitChunk(emitters.onVisible, visibleChunk)) {
				return false;
			}
			state.buffer = state.buffer.slice(openMatch.index + openMatch.tag.length);
			state.insideThinking = true;
			continue;
		}

		const partialOpenLength = getPartialTagPrefixLengthForAny(state.buffer, THINKING_OPEN_TAGS);
		const flushLength = state.buffer.length - partialOpenLength;
		if (flushLength > 0) {
			const visibleChunk = state.buffer.slice(0, flushLength);
			if (!emitChunk(emitters.onVisible, visibleChunk)) {
				return false;
			}
			state.buffer = state.buffer.slice(flushLength);
		}
		break;
	}

	return true;
}

export function flushInlineThinkingState(
	state: InlineThinkingState,
	emitters: InlineThinkingEmitters
): boolean {
	if (!state.buffer) {
		return true;
	}

	const remainder = state.buffer;
	state.buffer = '';

	if (state.insideThinking) {
		state.insideThinking = false;
		return emitChunk(emitters.onThinking, remainder);
	}

	const isPartialOpenTag = THINKING_OPEN_TAGS.some((tag) => tag.startsWith(remainder));
	if (isPartialOpenTag) {
		return true;
	}

	return emitChunk(emitters.onVisible, remainder);
}
