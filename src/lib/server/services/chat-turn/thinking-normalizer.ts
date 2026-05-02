import { getFirstChoice, getNestedObject } from "$lib/services/stream-protocol";

const THINKING_BLOCK_RE =
	/<thinking>[\s\S]*?<\/thinking>|<think>[\s\S]*?<\/think>|<\|im_start\|>\s*(?:think|analysis)[\s\S]*?<\|im_end\|>|\u597d[^\u4e00-\u9fff]*?\u5417/gi;
const THINKING_TAG_RE =
	/<\/?thinking>|<\/?think>|<\|im_start\|>\s*(?:think|analysis)?|<\|im_end\|>|\u597d|\u5417/gi;

export { THINKING_BLOCK_RE, THINKING_TAG_RE };

/**
 * Strip thinking content and tags from visible assistant text.
 */
export function normalizeVisibleAssistantText(value: string): string {
	return value
		.replace(THINKING_BLOCK_RE, "")
		.replace(THINKING_TAG_RE, "")
		.trim();
}

/**
 * Extract reasoning/thinking content from an upstream event payload.
 */
export function getReasoningContent(value: unknown): string | null {
	const payload = getNestedObject(value);
	if (!payload) return null;

	const choice = getFirstChoice(payload);
	if (choice) {
		for (const key of ["delta", "message"]) {
			if (key in choice) {
				const nestedReasoning = getReasoningContent(choice[key]);
				if (nestedReasoning) {
					return nestedReasoning;
				}
			}
		}
	}

	for (const key of [
		"reasoning",
		"reasoning_content",
		"reasoningContent",
		"reasoning_content_delta",
		"reasoningContentDelta",
		"reasoning_delta",
		"reasoningDelta",
		"reasoning_text",
		"reasoningText",
		"reasoning_summary",
		"reasoningSummary",
		"thinking",
		"thinking_content",
		"thinkingContent",
		"thought",
		"thoughts",
	]) {
		const candidate = payload[key];
		if (typeof candidate === "string" && candidate.trim()) {
			return candidate.trim();
		}
	}

	for (const key of [
		"additional_kwargs",
		"chunk",
		"data",
		"generation_info",
		"kwargs",
		"message",
		"output",
		"response_metadata",
		"result",
	]) {
		if (key in payload) {
			const nestedReasoning = getReasoningContent(payload[key]);
			if (nestedReasoning) {
				return nestedReasoning;
			}
		}
	}

	return null;
}
