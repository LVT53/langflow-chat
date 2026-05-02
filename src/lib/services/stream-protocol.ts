export const THINKING_OPEN_TAG = "<thinking>";
export const THINKING_CLOSE_TAG = "</thinking>";
export const DEEPSEEK_THINKING_OPEN_TAG = "<think>";
export const DEEPSEEK_THINKING_CLOSE_TAG = "</think>";
export const QWEN_CHATML_THINKING_OPEN_TAG = "<|im_start|>think";
export const QWEN_CHATML_ANALYSIS_OPEN_TAG = "<|im_start|>analysis";
export const QWEN_CHATML_THINKING_CLOSE_TAG = "<|im_end|>";

const THINKING_OPEN_TAGS = [
	THINKING_OPEN_TAG,
	DEEPSEEK_THINKING_OPEN_TAG,
	QWEN_CHATML_THINKING_OPEN_TAG,
	QWEN_CHATML_ANALYSIS_OPEN_TAG,
] as const;
const THINKING_CLOSE_TAGS = [
	THINKING_CLOSE_TAG,
	DEEPSEEK_THINKING_CLOSE_TAG,
	QWEN_CHATML_THINKING_CLOSE_TAG,
] as const;

export interface InlineThinkingState {
	buffer: string;
	insideThinking: boolean;
}

export interface LeadingThinkingPreambleSplit {
	thinkingText: string;
	visibleText: string;
}

interface InlineThinkingEmitters {
	onVisible: (chunk: string) => boolean | undefined;
	onThinking: (chunk: string) => boolean | undefined;
}

interface TagMatch {
	index: number;
	tag: string;
}

export function createInlineThinkingState(): InlineThinkingState {
	return {
		buffer: "",
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

function emitChunk(
	emit: (chunk: string) => boolean | undefined,
	chunk: string,
): boolean {
	if (!chunk) {
		return true;
	}

	return emit(chunk) !== false;
}

function findFirstTagMatch(
	value: string,
	tags: readonly string[],
): TagMatch | null {
	let bestMatch: TagMatch | null = null;
	const lowerValue = value.toLowerCase();

	for (const tag of tags) {
		const index = lowerValue.indexOf(tag.toLowerCase());
		if (index === -1) {
			continue;
		}
		if (!bestMatch || index < bestMatch.index) {
			bestMatch = { index, tag };
		}
	}

	return bestMatch;
}

function getPartialTagPrefixLengthForAny(
	value: string,
	tags: readonly string[],
): number {
	let bestLength = 0;

	for (const tag of tags) {
		bestLength = Math.max(bestLength, getPartialTagPrefixLength(value, tag));
	}

	return bestLength;
}

export function processInlineThinkingChunk(
	state: InlineThinkingState,
	chunk: string,
	emitters: InlineThinkingEmitters,
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
				state.buffer = state.buffer.slice(
					closeMatch.index + closeMatch.tag.length,
				);
				state.insideThinking = false;
				continue;
			}

			const partialCloseLength = getPartialTagPrefixLengthForAny(
				state.buffer,
				THINKING_CLOSE_TAGS,
			);
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

		const partialOpenLength = getPartialTagPrefixLengthForAny(
			state.buffer,
			THINKING_OPEN_TAGS,
		);
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
	emitters: InlineThinkingEmitters,
): boolean {
	if (!state.buffer) {
		return true;
	}

	const remainder = state.buffer;
	state.buffer = "";

	if (state.insideThinking) {
		state.insideThinking = false;
		return emitChunk(emitters.onThinking, remainder);
	}

	const isPartialOpenTag = THINKING_OPEN_TAGS.some((tag) =>
		tag.startsWith(remainder),
	);
	if (isPartialOpenTag) {
		return true;
	}

	return emitChunk(emitters.onVisible, remainder);
}

const LEADING_RESPONSE_MARKER_RE =
	/^response(?:(?=[A-Z])|:\s*(?=\S)|[\t ]+(?=(?:the user|user|this is|okay,|i\s+(?:need|should|will|can|must|am going)|i'll|let me)\b)|\n+(?=\S)|$)/i;

const THINKING_PREAMBLE_STARTS = [
	"the user wants me",
	"the user asked me",
	"the user asks me",
	"the user is asking me",
	"user wants me",
	"user asked me",
	"user asks me",
	"this is a straightforward",
	"this is straightforward",
	"this is a simple",
	"this is simple",
	"okay, let me",
] as const;

const THINKING_PREAMBLE_START_RE =
	/^(?:(?:the user|user)\s+(?:wants|asked|asks|is asking)\s+me\b|this is (?:a )?(?:straightforward|simple|content request)\b|okay,\s*let me\b)/i;

const THINKING_PREAMBLE_PARAGRAPH_RE =
	/(?:\b(?:the user|user)\s+(?:wants|asked|asks|is asking)\s+me\b|\bi\s+(?:need|should|will|can|must|am going)\b|\bi'll\b|\bthis is (?:a )?(?:straightforward|simple|content request)\b|(?:okay,\s*)?let me\b|\bprovide it in english\b|\bwrap the content\b)/i;
const DANGLING_THINKING_DELIMITER_RE =
	/<\/?(?:thinking|think)>|<\|im_start\|>\s*(?:think|analysis)?|<\|im_end\|>/gi;

export function stripLeadingResponseMarker(value: string): string {
	return value.replace(LEADING_RESPONSE_MARKER_RE, "");
}

export function looksLikeLeadingThinkingPreamble(value: string): boolean {
	return THINKING_PREAMBLE_START_RE.test(
		stripLeadingResponseMarker(value).trimStart(),
	);
}

export function mayStartLeadingThinkingPreamble(value: string): boolean {
	const rawCandidate = value.trimStart().toLowerCase();
	if ("response".startsWith(rawCandidate)) {
		return true;
	}

	const candidate = stripLeadingResponseMarker(value).trimStart().toLowerCase();
	if (!candidate) {
		return true;
	}

	return THINKING_PREAMBLE_STARTS.some(
		(start) => start.startsWith(candidate) || candidate.startsWith(start),
	);
}

function isThinkingPreambleParagraph(value: string): boolean {
	return THINKING_PREAMBLE_PARAGRAPH_RE.test(value.trim());
}

function stripDanglingThinkingDelimiters(value: string): string {
	return value.replace(DANGLING_THINKING_DELIMITER_RE, "").trim();
}

export function splitLeadingThinkingPreamble(
	value: string,
	options: { allowOpenEnded?: boolean } = {},
): LeadingThinkingPreambleSplit | null {
	const stripped = stripLeadingResponseMarker(value).trimStart();
	if (!looksLikeLeadingThinkingPreamble(stripped)) {
		return null;
	}

	const boundaryMatches = [...stripped.matchAll(/\n{2,}/g)];
	for (const match of boundaryMatches) {
		if (match.index === undefined) {
			continue;
		}

		const boundaryEnd = match.index + match[0].length;
		const thinkingCandidate = stripped.slice(0, match.index).trim();
		const cleanedThinkingCandidate =
			stripDanglingThinkingDelimiters(thinkingCandidate);
		const visibleCandidate = stripped.slice(boundaryEnd).trimStart();
		const nextParagraph = visibleCandidate.split(/\n{2,}/, 1)[0]?.trim() ?? "";
		if (!cleanedThinkingCandidate || !nextParagraph) {
			continue;
		}

		const thinkingParagraphs = cleanedThinkingCandidate
			.split(/\n{2,}/)
			.map((paragraph) => paragraph.trim())
			.filter(Boolean);

		if (
			thinkingParagraphs.length > 0 &&
			thinkingParagraphs.every(isThinkingPreambleParagraph) &&
			!isThinkingPreambleParagraph(nextParagraph)
		) {
			return {
				thinkingText: cleanedThinkingCandidate,
				visibleText: visibleCandidate,
			};
		}
	}

	return options.allowOpenEnded
		? {
				thinkingText: stripDanglingThinkingDelimiters(stripped),
				visibleText: "",
			}
		: null;
}

export const FRIENDLY_STREAM_ERRORS = {
	timeout: "The response is taking too long. Please try again.",
	network:
		"We could not reach the chat service. Check your connection and try again.",
	backend_failure:
		"We hit a temporary issue generating a response. Please try again.",
	capacity_exceeded:
		"Our servers are handling too many requests right now. Please wait a moment and try again.",
	file_too_large:
		"The uploaded file exceeds the maximum allowed size. Please upload a smaller file.",
	message_too_long:
		"Your message is too long. Please shorten it and try again.",
	provider_tool_rounds:
		"The AI needed too many tool-call rounds for this request. Please try a simpler request.",
} as const;

export type StreamErrorCode = keyof typeof FRIENDLY_STREAM_ERRORS;

// --- Internal stream parsing helpers ---
function getNestedObject(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}
	return value as Record<string, unknown>;
}

function getFirstChoice(
	payload: Record<string, unknown>,
): Record<string, unknown> | null {
	if (
		!payload ||
		!Array.isArray(payload.choices) ||
		payload.choices.length === 0
	) {
		return null;
	}

	const [firstChoice] = payload.choices;
	return getNestedObject(firstChoice);
}

function getTextFromContentBlocks(value: unknown): string {
	if (!Array.isArray(value)) {
		return "";
	}

	const prioritized: Array<{ text: string; priority: number }> = [];

	for (const block of value) {
		const blockRecord = getNestedObject(block);
		if (!blockRecord || !Array.isArray(blockRecord.contents)) {
			continue;
		}

		for (const content of blockRecord.contents) {
			const contentRecord = getNestedObject(content);
			if (!contentRecord) {
				continue;
			}

			const text =
				typeof contentRecord.text === "string" ? contentRecord.text.trim() : "";
			if (!text) {
				continue;
			}

			const header = getNestedObject(contentRecord.header);
			const headerTitle =
				typeof header?.title === "string"
					? header.title.toLowerCase().trim()
					: "";

			if (headerTitle.includes("input")) {
				continue;
			}

			const priority =
				headerTitle.includes("output") ||
				headerTitle.includes("answer") ||
				headerTitle.includes("response")
					? 2
					: 1;

			prioritized.push({ text, priority });
		}
	}

	if (prioritized.length === 0) {
		return "";
	}

	const highestPriority = prioritized.reduce(
		(best, entry) => Math.max(best, entry.priority),
		0,
	);

	return prioritized
		.filter((entry) => entry.priority === highestPriority)
		.map((entry) => entry.text)
		.join("\n")
		.trim();
}

function getTextFromContentParts(value: unknown): string {
	if (!Array.isArray(value)) {
		return "";
	}

	return value
		.map((part) => {
			if (typeof part === "string") {
				return part;
			}

			const partRecord = getNestedObject(part);
			if (!partRecord) {
				return "";
			}

			const text = partRecord.text;
			if (typeof text === "string") {
				return text;
			}

			return "";
		})
		.filter(Boolean)
		.join("");
}

function getTextContent(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	const payload = getNestedObject(value);
	if (!payload) return "";

	const choice = getFirstChoice(payload);
	if (choice) {
		for (const key of ["delta", "message"]) {
			if (key in choice) {
				const nestedContent = getTextContent(choice[key]);
				if (nestedContent) {
					return nestedContent;
				}
			}
		}
	}

	for (const key of ["text", "chunk", "content"]) {
		const candidate = payload[key];
		if (typeof candidate === "string" && candidate.length > 0) {
			return candidate;
		}
		if (key === "content") {
			const contentPartsText = getTextFromContentParts(candidate);
			if (contentPartsText) {
				return contentPartsText;
			}
		}
	}

	if ("content_blocks" in payload) {
		const contentBlocksText = getTextFromContentBlocks(payload.content_blocks);
		if (contentBlocksText) {
			return contentBlocksText;
		}
	}

	for (const key of [
		"delta",
		"message",
		"chunk",
		"kwargs",
		"output",
		"response",
		"result",
		"data",
	]) {
		if (key in payload) {
			const nestedText = getTextContent(payload[key]);
			if (nestedText) {
				return nestedText;
			}
		}
	}

	return "";
}

// Exported for stream.ts import
export {
	getFirstChoice,
	getNestedObject,
	getTextContent,
	getTextFromContentBlocks,
};
