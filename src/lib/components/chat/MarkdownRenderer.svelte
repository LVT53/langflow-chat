<script lang="ts">
  import CodeBlock from './CodeBlock.svelte';
  import { renderMarkdown, renderCodeBlock, initHighlighter } from '$lib/services/markdown';
  import { afterUpdate } from 'svelte';

  export let content: string = '';
  export let isDark: boolean = false;
  export let isStreaming: boolean = false;

  type MarkdownBlock =
    | { type: 'html'; html: string; isNew?: boolean; key: string }
    | { type: 'code'; code: string; language?: string; html: string; isNew?: boolean; key: string };

  let blocks: MarkdownBlock[] = [];
  let renderedBlockKeys = new Set<string>();
  let container: HTMLDivElement;
  let prevWordCount = 0;
  let prevLastBlockEl: HTMLElement | null = null;

  // Generate a stable key for a block based on its content and position
  function generateBlockKey(block: Omit<MarkdownBlock, 'key'>, index: number): string {
    const content = block.type === 'code' ? block.code : block.html;
    // Include type, index, content length, and content prefix to ensure uniqueness
    return `${block.type}:${index}:${content.length}:${content.slice(0, 50)}`;
  }

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
      renderContent(latest);
    }, STREAM_THROTTLE_MS);
  }

  function splitMarkdownBlocks(source: string): Array<Omit<MarkdownBlock, 'key' | 'isNew'>> {
    const normalizedSource = source.startsWith('[Translation unavailable]')
      ? source.substring('[Translation unavailable]'.length).trimStart()
      : source;
    const lines = normalizedSource.split('\n');
    const nextBlocks: Array<Omit<MarkdownBlock, 'key' | 'isNew'>> = [];
    const textLines: string[] = [];
    const codeLines: string[] = [];
    let language: string | undefined;
    let inCodeBlock = false;

    const flushText = () => {
      if (!textLines.length) return;

      const html = renderMarkdown(textLines.join('\n'), isDark);
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
      const openingFenceMatch = line.match(/^\s*```([^\s`]*)\s*$/);
      const closingFenceMatch = line.match(/^\s*```\s*$/);

      if (!inCodeBlock && openingFenceMatch) {
        flushText();
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

    flushText();

    if (inCodeBlock) {
      flushCode();
    }

    return nextBlocks;
  }

  async function renderContent(src: string) {
    await initHighlighter();
    const newBlocks = splitMarkdownBlocks(src);
    
    // Generate keys and determine which blocks are new
    blocks = newBlocks.map((b, i) => {
      const key = generateBlockKey(b, i);
      const isNew = isStreaming && !renderedBlockKeys.has(key);
      
      // Track this block as rendered
      if (isStreaming) {
        renderedBlockKeys.add(key);
      }
      
      return {
        ...b,
        key,
        isNew
      };
    });
    
    // Clear isNew flags after animation
    if (isStreaming) {
      const hasNewBlocks = blocks.some(b => b.isNew);
      if (hasNewBlocks) {
        setTimeout(() => {
          blocks = blocks.map((b) => ({ ...b, isNew: false }));
        }, 500);
      }
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
      renderContent(content);
    }
  }

  $: if (!isStreaming) {
    prevWordCount = 0;
    prevLastBlockEl = null;
    renderedBlockKeys.clear();
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

  afterUpdate(() => {
    if (!isStreaming || !container) return;

    // Only animate the last HTML (text) block, not code blocks
    // Code blocks should appear as complete units with their own animation
    const htmlBlockEls = container.querySelectorAll<HTMLElement>(':scope > .markdown-html');
    if (!htmlBlockEls.length) return;
    
    const lastHtmlBlockEl = htmlBlockEls[htmlBlockEls.length - 1];

    // Reset word count when the active block changes (e.g. a new block was added)
    if (lastHtmlBlockEl !== prevLastBlockEl) {
      prevWordCount = 0;
      prevLastBlockEl = lastHtmlBlockEl;
    }

    prevWordCount = wrapNewWords(lastHtmlBlockEl, prevWordCount);
  });
</script>

<div class="markdown-container" bind:this={container} aria-hidden="false">
  {#each blocks as block (block.key)}
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
