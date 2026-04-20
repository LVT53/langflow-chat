import { getNestedObject, getFirstChoice } from '$lib/services/stream-protocol';

const THINKING_BLOCK_RE = /<thinking>[\r\n]*[\r\n\ta-zA-Z0-9_./:,'\"{}\u4e00-\u9fff-]*?<\/thinking>|<\/think>[\r\n]*[\r\n\ta-zA-Z0-9_./:,'\"{}\u4e00-\u9fff-]*?<\/think>/gi;
const THINKING_TAG_RE = /<\/?thinking>|<\/?think>/gi;
const PRESERVE_TAG_RE = /<\/?preserve>/gi;

export { THINKING_BLOCK_RE, THINKING_TAG_RE, PRESERVE_TAG_RE };

/**
 * Strip thinking content and tags from visible assistant text.
 */
export function normalizeVisibleAssistantText(value: string): string {
	return value
		.replace(THINKING_BLOCK_RE, '')
		.replace(THINKING_TAG_RE, '')
		.replace(PRESERVE_TAG_RE, '')
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
		for (const key of ['delta', 'message']) {
			if (key in choice) {
				const nestedReasoning = getReasoningContent(choice[key]);
				if (nestedReasoning) {
					return nestedReasoning;
				}
			}
		}
	}

	if (typeof payload.reasoning === 'string' && payload.reasoning.trim()) {
		return payload.reasoning.trim();
	}

	if (
		typeof payload.reasoning_content === 'string' &&
		payload.reasoning_content.trim()
	) {
		return payload.reasoning_content.trim();
	}

	if (typeof payload.thinking === 'string' && payload.thinking.trim()) {
		return payload.thinking.trim();
	}

	if ('data' in payload) {
		return getReasoningContent(payload.data);
	}

	return null;
}