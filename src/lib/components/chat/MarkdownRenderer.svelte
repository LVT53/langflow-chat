<script lang="ts">
  import CodeBlock from './CodeBlock.svelte';
  import { renderMarkdown, renderCodeBlock, prepareCodeHighlighting } from '$lib/services/markdown';
  import { afterUpdate } from 'svelte';

  export let content: string = '';
  export let isDark: boolean = false;
  export let isStreaming: boolean = false;

  type MarkdownBlock =
    | { type: 'html'; html: string; isNew?: boolean }
    | { type: 'code'; code: string; language?: string; html: string; isNew?: boolean };

  let blocks: MarkdownBlock[] = [];
  let prevBlockCount = 0;
  let container: HTMLDivElement;
  let prevWordCount = 0;
  let prevLastBlockEl: HTMLElement | null = null;
  let renderVersion = 0;
  const tableColumnPresets: Record<number, string[]> = {
    2: ['44%', '56%'],
    3: ['34%', '33%', '33%'],
    4: ['28%', '24%', '24%', '24%'],
  };

  // Throttle rendering during streaming so each visual update is large
  // enough that new blocks are perceivable with the fade-in animation.
  let pendingContent: string | null = null;
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;
  const STREAM_THROTTLE_MS = 80;

  function scheduleRender(src: string) {
    pendingContent = src;
    if (throttleTimer !== null) return;
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      const latest = pendingContent!;
      pendingContent = null;
      void renderContent(latest);
    }, STREAM_THROTTLE_MS);
  }

  async function splitMarkdownBlocks(source: string): Promise<MarkdownBlock[]> {
    const normalizedSource = source.startsWith('[Translation unavailable]')
      ? source.substring('[Translation unavailable]'.length).trimStart()
      : source;
    const lines = normalizedSource.split('\n');
    const nextBlocks: MarkdownBlock[] = [];
    const textLines: string[] = [];
    const codeLines: string[] = [];
    let language: string | undefined;
    let inCodeBlock = false;

    const flushText = async () => {
      if (!textLines.length) return;

      const html = await renderMarkdown(textLines.join('\n'), isDark);
      if (html.trim()) {
        nextBlocks.push({ type: 'html', html });
      }
      textLines.length = 0;
    };

    const flushCode = () => {
      nextBlocks.push({
        type: 'code',
        code: codeLines.join('\n'),
        language,
        html: renderCodeBlock(codeLines.join('\n'), language, isDark)
      });
      codeLines.length = 0;
      language = undefined;
    };

    for (const line of lines) {
      const openingFenceMatch = line.match(/^\s*```\s*([^\s`]*)\s*$/);
      const closingFenceMatch = line.match(/^\s*```\s*$/);

      if (!inCodeBlock && openingFenceMatch) {
        await flushText();
        inCodeBlock = true;
        language = openingFenceMatch[1] || undefined;
        continue;
      }

      if (inCodeBlock && closingFenceMatch) {
        flushCode();
        inCodeBlock = false;
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
      } else {
        textLines.push(line);
      }
    }

    await flushText();

    if (inCodeBlock) {
      flushCode();
    }

    return nextBlocks;
  }

  async function renderContent(src: string) {
    const currentRender = ++renderVersion;
    if (src.includes('```')) {
      await prepareCodeHighlighting(src);
    }
    const newBlocks = await splitMarkdownBlocks(src);
    if (currentRender !== renderVersion) return;
    const oldCount = prevBlockCount;
    
    blocks = newBlocks.map((b, i) => ({
      ...b,
      isNew: isStreaming && i >= oldCount
    }));
    
    prevBlockCount = newBlocks.length;
    
    const hasNewBlocks = blocks.some(b => b.isNew);
    if (isStreaming && hasNewBlocks) {
      setTimeout(() => {
        blocks = blocks.map((b) => ({ ...b, isNew: false }));
      }, 500);
    }
  }

  $: if (content !== undefined || isDark !== undefined || isStreaming !== undefined) {
    if (isStreaming) {
      scheduleRender(content);
    } else {
      // Flush any pending throttled render immediately when streaming stops
      if (throttleTimer !== null) {
        clearTimeout(throttleTimer);
        throttleTimer = null;
        pendingContent = null;
      }
      void renderContent(content);
    }
  }

  $: if (!isStreaming) {
    prevWordCount = 0;
    prevLastBlockEl = null;
    prevBlockCount = 0;
  }

  // Walk the last html block's DOM and wrap newly arrived words in animated spans.
  // Words at index < startIndex are already rendered; only wrap words >= startIndex.
  // Returns the total word count after processing.
  function wrapNewWords(element: HTMLElement, startIndex: number): number {
    let wordIndex = 0;

    function processNode(node: Node): void {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent ?? '';
        const parts = text.split(/(\s+)/);

        // Fast path: check if any word in this text node is new
        let tempCount = wordIndex;
        let nodeHasNew = false;
        for (const part of parts) {
          if (part.trim()) {
            if (tempCount >= startIndex) { nodeHasNew = true; break; }
            tempCount++;
          }
        }

        if (!nodeHasNew) {
          for (const part of parts) { if (part.trim()) wordIndex++; }
          return;
        }

        const fragment = document.createDocumentFragment();
        for (const part of parts) {
          if (!part.trim()) {
            fragment.appendChild(document.createTextNode(part));
          } else {
            if (wordIndex >= startIndex) {
              const span = document.createElement('span');
              span.className = 'word-new';
              span.textContent = part;
              fragment.appendChild(span);
            } else {
              fragment.appendChild(document.createTextNode(part));
            }
            wordIndex++;
          }
        }
        node.parentNode!.replaceChild(fragment, node);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = (node as Element).tagName;
        if (tagName === 'SCRIPT' || tagName === 'STYLE') return;
        Array.from(node.childNodes).forEach(processNode);
      }
    }

    Array.from(element.childNodes).forEach(processNode);
    return wordIndex;
  }

  function getTableColumnCount(table: HTMLTableElement): number {
    const headerRow = table.tHead?.rows?.[0];
    const firstBodyRow = table.tBodies?.[0]?.rows?.[0];
    const firstRow = headerRow ?? firstBodyRow ?? table.rows?.[0];
    return firstRow ? Array.from(firstRow.cells).reduce((sum, cell) => sum + (cell.colSpan || 1), 0) : 0;
  }

  function hasExtremeUnbreakableContent(table: HTMLTableElement): boolean {
    return Array.from(table.querySelectorAll('th, td')).some((cell) => {
      const tokens = (cell.textContent ?? '').split(/\s+/).filter(Boolean);
      return tokens.some((token) => token.length >= 52);
    });
  }

  function applyBalancedTableLayout(table: HTMLTableElement) {
    const columnCount = getTableColumnCount(table);
    table.dataset.columnCount = String(columnCount);

    const wrapper = table.closest('.markdown-table-wrap');
    if (!(wrapper instanceof HTMLElement)) {
      return;
    }

    wrapper.dataset.overflow = columnCount > 4 || hasExtremeUnbreakableContent(table) ? 'scroll' : 'fit';

    const existingColgroup = table.querySelector('colgroup[data-balanced-columns]');
    existingColgroup?.remove();

    const preset = tableColumnPresets[columnCount];
    if (!preset) {
      return;
    }

    const colgroup = document.createElement('colgroup');
    colgroup.dataset.balancedColumns = 'true';
    for (const width of preset) {
      const col = document.createElement('col');
      col.style.width = width;
      colgroup.appendChild(col);
    }
    table.insertBefore(colgroup, table.firstChild);
  }

  function enhanceRenderedTables() {
    if (!container) return;
    container.querySelectorAll<HTMLTableElement>('.markdown-table-wrap table').forEach((table) => {
      applyBalancedTableLayout(table);
    });
  }

  afterUpdate(() => {
    if (container) {
      enhanceRenderedTables();
    }

    if (!isStreaming || !container) return;

    const blockEls = container.querySelectorAll<HTMLElement>(':scope > .markdown-html');
    if (!blockEls.length) return;
    const lastBlockEl = blockEls[blockEls.length - 1];

    if (lastBlockEl !== prevLastBlockEl) {
      prevWordCount = 0;
      prevLastBlockEl = lastBlockEl;
    }

    prevWordCount = wrapNewWords(lastBlockEl, prevWordCount);
  });
</script>

<div class="markdown-container" bind:this={container} aria-hidden="false">
  {#each blocks as block}
    {#if block.type === 'html'}
      <div class="prose max-w-none dark:prose-invert markdown-html">
        {@html block.html}
      </div>
    {:else}
      <div class:block-fade-in={block.isNew}>
        <CodeBlock code={block.code} language={block.language}>
          {@html block.html}
        </CodeBlock>
      </div>
    {/if}
  {/each}
</div>

<style>
  .markdown-container {
    position: relative;
  }

  .markdown-html :global(*:last-child) {
    margin-bottom: 0;
  }

  /* Code blocks fade in as a unit when they first appear */
  .block-fade-in {
    animation: blockFadeIn 450ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  @keyframes blockFadeIn {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* Word-level fade-in for streaming text (applied via JS to dynamically created spans) */
  :global(.word-new) {
    animation: wordFadeIn 150ms ease-out forwards;
  }

  @keyframes wordFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .block-fade-in {
      animation: none;
      opacity: 1;
    }
    :global(.word-new) {
      animation: none;
      opacity: 1;
    }
  }
</style>
