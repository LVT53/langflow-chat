import { marked } from 'marked';
import { createHighlighter } from 'shiki';

let highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null;
let highlighterPromise: Promise<void> | null = null;

async function initHighlighter() {
  if (highlighter) return;
  
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      highlighter = await createHighlighter({
        themes: ['github-light', 'github-dark'],
        langs: ['javascript', 'typescript', 'python', 'bash', 'json', 'html', 'css', 'yaml', 'markdown']
      });
    })();
  }
  
  await highlighterPromise;
}

function renderMarkdown(content: string, isDark: boolean): string {
  const displayContent = normalizeMarkdownContent(content);
  const renderer = createMarkdownRenderer(isDark);
  const html = marked.parse(displayContent, {
    renderer: renderer as Parameters<typeof marked.parse>[1]['renderer'],
    breaks: true,
    gfm: true
  });

  return sanitizeHtml(html as string);
}

function renderCodeBlock(content: string, language: string | undefined, isDark: boolean): string {
  const escapedContent = escapeHtml(content);

  if (!highlighter || !language?.trim()) {
    return sanitizeHtml(`<pre><code>${escapedContent}</code></pre>`);
  }

  try {
    const theme = isDark ? 'github-dark' : 'github-light';
    return sanitizeHtml(highlighter.codeToHtml(content, { lang: language, theme }));
  } catch (error) {
    return sanitizeHtml(`<pre><code>${escapedContent}</code></pre>`);
  }
}

function normalizeMarkdownContent(content: string): string {
  if (content.startsWith('[Translation unavailable]')) {
    return content.substring('[Translation unavailable]'.length).trimStart();
  }

  return content;
}

function createMarkdownRenderer(isDark: boolean) {
  const renderer = new marked.Renderer();

  renderer.code = ({ text, lang = '' }) => renderCodeBlock(text, lang, isDark);

  return renderer;
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+=(['"]).*?\1/gi, '')
    .replace(/\son\w+=([^\s>]+)/gi, '')
    .replace(/\s(?:href|src)\s*=\s*(['"])\s*javascript:[\s\S]*?\1/gi, '')
    .replace(/\sstyle\s*=\s*(['"])[\s\S]*?\1/gi, '');
}

// Helper function to escape HTML
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return text.replace(/[&<>"']/g, m => map[m]);
}

export { renderMarkdown, renderCodeBlock, initHighlighter };
