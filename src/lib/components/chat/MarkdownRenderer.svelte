<script lang="ts">
  import CodeBlock from './CodeBlock.svelte';
  import { renderMarkdown, renderCodeBlock, prepareCodeHighlighting } from '$lib/services/markdown';
  import {
    deriveBalancedColumnWidths,
    getTableColumnCount,
    hasExtremeUnbreakableContent,
    resolveTableOverflowMode,
  } from '$lib/services/table-layout';
  import { onMount, tick } from 'svelte';

  let {
    content = '',
    isDark = false,
    isStreaming = false
  }: {
    content?: string;
    isDark?: boolean;
    isStreaming?: boolean;
  } = $props();

  type MarkdownBlock =
    | { type: 'html'; html: string; isNew?: boolean }
    | { type: 'code'; code: string; language?: string; html: string; isNew?: boolean };

  let blocks = $state<MarkdownBlock[]>([]);
  let prevBlockCount = 0;
  let container = $state<HTMLDivElement | null>(null);
  let prevWordCount = 0;
  let prevLastBlockEl: HTMLElement | null = null;
  let renderVersion = 0;
  let resizeObserver: ResizeObserver | null = null;
  let resizeFrame = 0;
  let postRenderVersion = 0;

  // Throttle rendering during streaming so each visual update is large
  // enough that new blocks are perceivable with the fade-in animation.
  let pendingContent: string | null = null;
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;
  const STREAM_THROTTLE_MS = 40;

  function scheduleRender(src: string, darkMode: boolean, streaming: boolean) {
    pendingContent = src;
    if (throttleTimer !== null) return;
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      const latest = pendingContent!;
      pendingContent = null;
      void renderContent(latest, darkMode, streaming);
    }, STREAM_THROTTLE_MS);
  }

  async function splitMarkdownBlocks(source: string, darkMode: boolean): Promise<MarkdownBlock[]> {
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

      const html = await renderMarkdown(textLines.join('\n'), darkMode);
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
        html: renderCodeBlock(codeLines.join('\n'), language, darkMode)
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

  async function renderContent(src: string, darkMode: boolean, streaming: boolean) {
    const currentRender = ++renderVersion;
    if (src.includes('```')) {
      await prepareCodeHighlighting(src);
    }
    const newBlocks = await splitMarkdownBlocks(src, darkMode);
    if (currentRender !== renderVersion) return;
    const oldCount = prevBlockCount;
    
    blocks = newBlocks.map((b, i) => ({
      ...b,
      isNew: streaming && i >= oldCount
    }));
    
    prevBlockCount = newBlocks.length;
    
    const hasNewBlocks = blocks.some(b => b.isNew);
    if (streaming && hasNewBlocks) {
      setTimeout(() => {
        blocks = blocks.map((b) => ({ ...b, isNew: false }));
      }, 500);
    }
  }

  $effect(() => {
    const nextContent = content;
    const darkMode = isDark;
    const streaming = isStreaming;

    if (streaming) {
      scheduleRender(nextContent, darkMode, streaming);
      return;
    }

    // Flush any pending throttled render immediately when streaming stops.
    if (throttleTimer !== null) {
      clearTimeout(throttleTimer);
      throttleTimer = null;
      pendingContent = null;
    }

    void renderContent(nextContent, darkMode, streaming);
  });

  $effect(() => {
    if (!isStreaming) {
      prevWordCount = 0;
      prevLastBlockEl = null;
      prevBlockCount = 0;
    }
  });

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

  function applyBalancedTableLayout(table: HTMLTableElement) {
    const columnCount = getTableColumnCount(table);
    table.dataset.columnCount = String(columnCount);

    const wrapper = table.closest('.markdown-table-wrap');
    if (!(wrapper instanceof HTMLElement)) {
      return;
    }

    const forceScroll = columnCount > 4 || hasExtremeUnbreakableContent(table);
    wrapper.dataset.overflow = forceScroll ? 'scroll' : 'fit';

    const existingColgroup = table.querySelector('colgroup[data-balanced-columns]');
    existingColgroup?.remove();

    const widths = forceScroll ? null : deriveBalancedColumnWidths(table, columnCount);
    if (!widths) {
      return;
    }

    const colgroup = document.createElement('colgroup');
    colgroup.dataset.balancedColumns = 'true';
    for (const width of widths) {
      const col = document.createElement('col');
      col.style.width = width;
      colgroup.appendChild(col);
    }
    table.insertBefore(colgroup, table.firstChild);

    requestAnimationFrame(() => {
      if (!table.isConnected) return;
      const currentWrapper = table.closest('.markdown-table-wrap');
      if (!(currentWrapper instanceof HTMLElement)) return;

      const overflowMode = resolveTableOverflowMode({
        columnCount,
        forceScroll,
        wrapperWidth: currentWrapper.clientWidth,
        tableWidth: table.scrollWidth,
      });

      currentWrapper.dataset.overflow = overflowMode;

      if (overflowMode === 'scroll') {
        table.querySelector('colgroup[data-balanced-columns]')?.remove();
      }
    });
  }

  function enhanceRenderedTables() {
    if (!container) return;
    container.querySelectorAll<HTMLTableElement>('.markdown-table-wrap table').forEach((table) => {
      applyBalancedTableLayout(table);
    });
  }

  function handleMarkdownClick(event: MouseEvent) {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest('a[href]');
    if (!(link instanceof HTMLAnchorElement)) return;
    if (!link.href) return;

    event.preventDefault();
    event.stopPropagation();
    window.open(link.href, '_blank', 'noopener,noreferrer');
  }

  function scheduleTableEnhancement() {
    if (resizeFrame) {
      cancelAnimationFrame(resizeFrame);
    }
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      enhanceRenderedTables();
    });
  }

  onMount(() => {
    const handleViewportChange = () => scheduleTableEnhancement();
    const clickContainer = container;
    clickContainer?.addEventListener('click', handleMarkdownClick);

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleTableEnhancement();
      });
      if (container) {
        resizeObserver.observe(container);
      }
    }

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('orientationchange', handleViewportChange);
    window.visualViewport?.addEventListener('resize', handleViewportChange);
    document.fonts?.ready.then(() => scheduleTableEnhancement()).catch(() => undefined);

    return () => {
      resizeObserver?.disconnect();
      resizeObserver = null;
      if (throttleTimer !== null) {
        clearTimeout(throttleTimer);
        throttleTimer = null;
      }
      if (resizeFrame) {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = 0;
      }
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
      window.visualViewport?.removeEventListener('resize', handleViewportChange);
      clickContainer?.removeEventListener('click', handleMarkdownClick);
    };
  });

  async function runPostRenderEffects(version: number) {
    await tick();
    if (version !== postRenderVersion || !container) return;

    resizeObserver?.disconnect();
    resizeObserver?.observe(container);
    scheduleTableEnhancement();

    if (!isStreaming) return;

    const blockEls = container.querySelectorAll<HTMLElement>(':scope > .markdown-html');
    if (!blockEls.length) return;
    const lastBlockEl = blockEls[blockEls.length - 1];

    if (lastBlockEl !== prevLastBlockEl) {
      prevWordCount = 0;
      prevLastBlockEl = lastBlockEl;
    }

    prevWordCount = wrapNewWords(lastBlockEl, prevWordCount);
  }

  $effect(() => {
    blocks;
    isStreaming;

    if (!container) {
      return;
    }

    const version = ++postRenderVersion;
    void runPostRenderEffects(version);
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
        <CodeBlock code={block.code} language={block.language} contentHtml={block.html} />
      </div>
    {/if}
  {/each}
</div>

<style>
  .markdown-container {
    position: relative;
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }

  .markdown-html :global(*:last-child) {
    margin-bottom: 0;
  }

  /* Code blocks fade in as a unit when they first appear.
     During streaming, keep it subtle to avoid layout flicker. */
  .block-fade-in {
    animation: blockFadeIn 300ms ease-out forwards;
  }

  @keyframes blockFadeIn {
    from { opacity: 0.4; }
    to   { opacity: 1; }
  }

  :global(.word-new) {
    animation: wordFadeIn 200ms ease-out forwards;
  }

  @keyframes wordFadeIn {
    from { opacity: 0.3; }
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
