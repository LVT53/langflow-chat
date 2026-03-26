type MarkedModule = typeof import('marked');

type Highlighter = {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string;
  loadLanguage: (...langs: string[]) => Promise<void>;
};

const HIGHLIGHT_LANGS = {
  javascript: () => import('@shikijs/langs/javascript'),
  typescript: () => import('@shikijs/langs/typescript'),
  jsx: () => import('@shikijs/langs/jsx'),
  tsx: () => import('@shikijs/langs/tsx'),
  python: () => import('@shikijs/langs/python'),
  bash: () => import('@shikijs/langs/bash'),
  json: () => import('@shikijs/langs/json'),
  html: () => import('@shikijs/langs/html'),
  css: () => import('@shikijs/langs/css'),
  yaml: () => import('@shikijs/langs/yaml'),
  markdown: () => import('@shikijs/langs/markdown'),
  ruby: () => import('@shikijs/langs/ruby'),
  rust: () => import('@shikijs/langs/rust'),
  go: () => import('@shikijs/langs/go'),
  java: () => import('@shikijs/langs/java'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  swift: () => import('@shikijs/langs/swift'),
  csharp: () => import('@shikijs/langs/csharp'),
  cpp: () => import('@shikijs/langs/cpp'),
  php: () => import('@shikijs/langs/php'),
  sql: () => import('@shikijs/langs/sql'),
  graphql: () => import('@shikijs/langs/graphql'),
  dockerfile: () => import('@shikijs/langs/dockerfile'),
  toml: () => import('@shikijs/langs/toml'),
  xml: () => import('@shikijs/langs/xml'),
  r: () => import('@shikijs/langs/r'),
} as const;

const HIGHLIGHT_THEMES = ['github-light', 'github-dark'] as const;
const SUPPORTED_LANGUAGES = new Set(Object.keys(HIGHLIGHT_LANGS));

let markedModule: MarkedModule | null = null;
let markedPromise: Promise<void> | null = null;
let highlighter: Highlighter | null = null;
let highlighterPromise: Promise<void> | null = null;
const loadedLanguages = new Set<string>();
const languagePromises = new Map<string, Promise<void>>();

async function initMarkdownParser() {
  if (markedModule) return;

  if (!markedPromise) {
    markedPromise = (async () => {
      markedModule = await import('marked');
    })();
  }

  await markedPromise;
}

function getMarked() {
  if (!markedModule) {
    throw new Error('Markdown parser was not initialized');
  }

  return markedModule.marked;
}

async function initHighlighter() {
  if (highlighter) return;

  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [{ createBundledHighlighter }, { createJavaScriptRegexEngine }] = await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript')
      ]);

      const createHighlighter = createBundledHighlighter({
        langs: HIGHLIGHT_LANGS,
        themes: {
          'github-light': () => import('@shikijs/themes/github-light'),
          'github-dark': () => import('@shikijs/themes/github-dark'),
        },
        engine: () => createJavaScriptRegexEngine()
      });

      highlighter = await createHighlighter({
        themes: [...HIGHLIGHT_THEMES]
      });
    })();
  }

  await highlighterPromise;
}

function normalizeLanguage(lang: string): string {
  const aliases: Record<string, string> = {
    js: 'javascript', ts: 'typescript', py: 'python',
    sh: 'bash', shell: 'bash', zsh: 'bash',
    yml: 'yaml', md: 'markdown', jsx: 'jsx', tsx: 'tsx',
    rb: 'ruby', rs: 'rust', cs: 'csharp', cpp: 'cpp',
    go: 'go', java: 'java', kt: 'kotlin', swift: 'swift',
    sql: 'sql', graphql: 'graphql', dockerfile: 'dockerfile',
    toml: 'toml', xml: 'xml', php: 'php', r: 'r',
  };
  return aliases[lang.toLowerCase()] ?? lang.toLowerCase();
}

async function ensureLanguageLoaded(language: string | undefined) {
  if (!language?.trim()) return;

  const normalized = normalizeLanguage(language);
  if (!SUPPORTED_LANGUAGES.has(normalized)) return;

  await initHighlighter();

  if (loadedLanguages.has(normalized)) return;

  let loadPromise = languagePromises.get(normalized);
  if (!loadPromise) {
    loadPromise = highlighter!.loadLanguage(normalized).then(() => {
      loadedLanguages.add(normalized);
    });
    languagePromises.set(normalized, loadPromise);
  }

  await loadPromise;
}

function extractFenceLanguages(content: string): string[] {
  const languages = new Set<string>();
  const fencePattern = /^\s*```\s*([^\s`]*)\s*$/gm;

  for (const match of content.matchAll(fencePattern)) {
    if (match[1]) {
      languages.add(match[1]);
    }
  }

  return [...languages];
}

async function prepareCodeHighlighting(content: string) {
  const languages = extractFenceLanguages(content);
  if (!languages.length) return;

  await Promise.all(languages.map((language) => ensureLanguageLoaded(language)));
}

async function renderMarkdown(content: string, isDark: boolean): Promise<string> {
  await initMarkdownParser();
  if (content.includes('```')) {
    await prepareCodeHighlighting(content);
  }

  const marked = getMarked();
  const displayContent = normalizeMarkdownContent(content);
  const renderer = createMarkdownRenderer(isDark);
  const html = marked.parse(displayContent, {
    renderer: renderer as Parameters<typeof marked.parse>[1]['renderer'],
    breaks: true,
    gfm: true
  });

  return sanitizeHtml(wrapMarkdownTables(html as string));
}

function renderCodeBlock(content: string, language: string | undefined, isDark: boolean): string {
  const escapedContent = escapeHtml(content);

  if (!highlighter || !language?.trim()) {
    return sanitizeHtml(`<pre><code>${escapedContent}</code></pre>`);
  }

  const normalized = normalizeLanguage(language);

  try {
    const theme = isDark ? 'github-dark' : 'github-light';
    return highlighter.codeToHtml(content, { lang: normalized, theme });
  } catch {
    return sanitizeHtml(`<pre><code>${escapedContent}</code></pre>`);
  }
}

function normalizeMarkdownContent(content: string): string {
  if (content.startsWith('[Translation unavailable]')) {
    return content.substring('[Translation unavailable]'.length).trimStart();
  }

  return content;
}

function wrapMarkdownTables(html: string): string {
  return html
    .replace(/<table>/g, '<div class="markdown-table-wrap"><table class="markdown-table">')
    .replace(/<\/table>/g, '</table></div>');
}

function createMarkdownRenderer(isDark: boolean) {
  const marked = getMarked();
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

export { renderMarkdown, renderCodeBlock, initHighlighter, normalizeLanguage, prepareCodeHighlighting };
