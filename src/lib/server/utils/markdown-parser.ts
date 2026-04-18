import { marked } from 'marked';
import matter from 'gray-matter';

const CALLOUT_TYPES = ['info', 'warning', 'tip', 'note'] as const;

function transformCallouts(html: string): string {
	let result = html;

	for (const type of CALLOUT_TYPES) {
		const regex = new RegExp(
			`<blockquote>\\s*<p>\\[!${type}\\]\\s*([\\s\\S]*?)<\\/p>\\s*<\\/blockquote>`,
			'gi'
		);

		result = result.replace(regex, (_match, content) => {
			return `<div class=\"callout callout-${type}\">${content}</div>`;
		});
	}

	return result;
}

export function parseMarkdown(markdown: string): { metadata: Record<string, unknown>; html: string } {
	// Defensively strip thinking tags that might appear at the start of the markdown
	// (edge case: thinking content leaks into the final response).
	let cleanMarkdown = markdown;
	const thinkingStartMatch = markdown.match(/^<thinking>[\r\n]*/i);
	if (thinkingStartMatch) {
		const afterThinking = markdown.slice(thinkingStartMatch[0].length);
		const thinkingEndIndex = afterThinking.indexOf('</thinking>');
		if (thinkingEndIndex !== -1) {
			cleanMarkdown = afterThinking.slice(thinkingEndIndex + '</thinking>'.length).trimStart();
		}
	}

	let metadata: Record<string, unknown> = {};
	let content = cleanMarkdown;

	// gray-matter handles YAML frontmatter extraction and parsing internally.
	// Wrap in try-catch so malformed YAML (e.g. unquoted colons in values) doesn't crash the response.
	try {
		const parsed = matter(cleanMarkdown);
		metadata = parsed.data ?? {};
		content = parsed.content ?? '';
	} catch {
		// Malformed YAML frontmatter — fall back to treating the entire input as markdown body.
		// This keeps the chat response visible instead of crashing on a YAML parse error.
		content = cleanMarkdown;
	}

	const html = marked.parse(content, { async: false }) as string;
	const transformedHtml = transformCallouts(html);

	return {
		metadata,
		html: transformedHtml,
	};
}