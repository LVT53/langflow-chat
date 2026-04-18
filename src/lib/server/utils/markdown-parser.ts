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
	// Sanitize YAML frontmatter: strip backslash-escaped quotes that cause parse errors.
	// AI-generated frontmatter sometimes produces \" instead of plain quotes in YAML values.
	// Extract frontmatter block (between first --- and second ---), strip escaped quotes,
	// then reconstruct and parse.
	let sanitizedMarkdown = markdown;
	const frontmatterMatch = markdown.match(/^---\r?\n([\r\n\ta-zA-Z0-9_./:-]+)\r?\n---\r?\n?([\r\n\ta-zA-Z0-9_./:-]+)/);
	if (frontmatterMatch) {
		const frontmatter = frontmatterMatch[1];
		const body = frontmatterMatch[2] ?? '';
		const sanitizedFrontmatter = frontmatter.replace(/\\+([\\'\"`])/g, '$1');
		sanitizedMarkdown = `---\n${sanitizedFrontmatter}\n---\n${body}`;
	}

	const { data, content } = matter(sanitizedMarkdown);
	const html = marked.parse(content ?? '', { async: false }) as string;
	const transformedHtml = transformCallouts(html);

	return {
		metadata: data ?? {},
		html: transformedHtml
	};
}
