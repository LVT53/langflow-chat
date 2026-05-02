import { describe, it, expect, vi } from 'vitest';

vi.mock('shiki', () => ({
  createHighlighter: vi.fn().mockResolvedValue({
    codeToHtml: vi.fn().mockReturnValue('<pre><code>mocked</code></pre>'),
  }),
}));

vi.mock('jsdom', () => ({
  JSDOM: vi.fn().mockImplementation(() => ({
    window: {},
  })),
}));

vi.mock('dompurify', () => ({
  default: vi.fn().mockReturnValue({
    sanitize: vi.fn().mockImplementation((html: string) => html),
  }),
}));

describe('Markdown Rendering Service', () => {
  it('renderMarkdown is exported as a function', async () => {
    const mod = await import('./markdown');
    expect(typeof mod.renderMarkdown).toBe('function');
  });

  it('renderHighlightedText is exported as a function', async () => {
    const mod = await import('./markdown');
    expect(typeof mod.renderHighlightedText).toBe('function');
  });

  it('initHighlighter is exported as a function', async () => {
    const mod = await import('./markdown');
    expect(typeof mod.initHighlighter).toBe('function');
  });

  it('renders markdown links as new-tab external links', async () => {
    const mod = await import('./markdown');
    const html = await mod.renderMarkdown('[Source](https://example.com/page)', false);

    expect(html).toContain('href="https://example.com/page"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer external"');
  });
});
