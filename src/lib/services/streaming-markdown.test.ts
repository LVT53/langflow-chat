import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderStreamingMarkdown } from './streaming-markdown';

vi.mock('./markdown', () => ({
	renderMarkdown: vi.fn((content: string, _isDark: boolean) => {
		return `<p>${content}</p>`;
	})
}));

import { renderMarkdown } from './markdown';

describe('renderStreamingMarkdown', () => {
	beforeEach(() => {
		vi.mocked(renderMarkdown).mockImplementation((content: string, _isDark: boolean) => {
			if (content.includes('```')) {
				const parts = content.split('```');
				const lang = parts[1]?.split('\n')[0] ?? '';
				const code = parts[1]?.substring(lang.length + 1) ?? '';
				const preamble = parts[0] ? `<p>${parts[0].trim()}</p>` : '';
				return `${preamble}<pre><code>${code}</code></pre>`;
			}
			return `<p>${content.trim()}</p>`;
		});
	});

	it('complete markdown (no open code fence) renders normally and isComplete is true', () => {
		const result = renderStreamingMarkdown('Hello **world**', false);
		expect(result.isComplete).toBe(true);
		expect(result.html).toContain('Hello **world**');
		expect(renderMarkdown).toHaveBeenCalledWith('Hello **world**', false);
	});

	it('content ending mid-code-block renders code block and isComplete is false', () => {
		const content = 'Some text\n```js\nconst x = 1';
		const result = renderStreamingMarkdown(content, false);
		expect(result.isComplete).toBe(false);
		expect(renderMarkdown).toHaveBeenCalledWith(content + '\n```', false);
		expect(result.html).not.toMatch(/<\/code><\/pre>\s*$/);
	});

	it('content ending mid-bold renders gracefully without error', () => {
		const content = 'Hello **word';
		expect(() => renderStreamingMarkdown(content, false)).not.toThrow();
		const result = renderStreamingMarkdown(content, false);
		expect(result.isComplete).toBe(true);
		expect(typeof result.html).toBe('string');
	});

	it('progressive content all renders without error', () => {
		const tokens = ['He', 'Hello', 'Hello wor', 'Hello world'];
		for (const token of tokens) {
			expect(() => renderStreamingMarkdown(token, false)).not.toThrow();
			const result = renderStreamingMarkdown(token, false);
			expect(typeof result.html).toBe('string');
		}
	});

	it('uses dark theme when isDark is true', () => {
		renderStreamingMarkdown('test', true);
		expect(renderMarkdown).toHaveBeenCalledWith('test', true);
	});

	it('content with closed code fence is marked complete', () => {
		const content = '```js\nconst x = 1\n```';
		const result = renderStreamingMarkdown(content, false);
		expect(result.isComplete).toBe(true);
	});

	it('trimmed html for in-progress code block does not have closing pre/code tags at end', () => {
		vi.mocked(renderMarkdown).mockReturnValueOnce(
			'<pre><code>partial code</code></pre>'
		);
		const result = renderStreamingMarkdown('```js\npartial code', false);
		expect(result.isComplete).toBe(false);
		expect(result.html).not.toMatch(/<\/code><\/pre>\s*$/);
		expect(result.html).toContain('partial code');
	});
});
