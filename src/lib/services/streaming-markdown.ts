import { renderMarkdown } from './markdown';

/**
 * Renders markdown content that may be in a partially-streamed state.
 * Handles unclosed code fences by temporarily closing them for rendering.
 *
 * @param content - The (possibly incomplete) markdown string received so far
 * @param isDark - Whether to use the dark theme for syntax highlighting
 * @returns { html: string; isComplete: boolean }
 *   - html: rendered HTML string
 *   - isComplete: true when content is not mid-code-block (rendering is final for this chunk)
 */
export async function renderStreamingMarkdown(
	content: string,
	isDark: boolean
): Promise<{ html: string; isComplete: boolean }> {
	const fenceCount = (content.match(/```/g) || []).length;
	const inCodeBlock = fenceCount % 2 !== 0;

	if (inCodeBlock) {
		const tempContent = content + '\n```';
		const html = await renderMarkdown(tempContent, isDark);
		const trimmedHtml = html.replace(/<\/code><\/pre>\s*$/, '');
		return { html: trimmedHtml, isComplete: false };
	}

	return { html: await renderMarkdown(content, isDark), isComplete: true };
}
