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
			return `<div class="callout callout-${type}">${content}</div>`;
		});
	}

	return result;
}

export function parseMarkdown(markdown: string): { metadata: Record<string, unknown>; html: string } {
	const { data, content } = matter(markdown);
	const html = marked.parse(content ?? '', { async: false }) as string;
	const transformedHtml = transformCallouts(html);

	return {
		metadata: data ?? {},
		html: transformedHtml
	};
}
