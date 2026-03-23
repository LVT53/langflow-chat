<script lang="ts">
  import CodeBlock from './CodeBlock.svelte';
  import { renderMarkdown, renderCodeBlock, initHighlighter } from '$lib/services/markdown';

  export let content: string = '';
  export let isDark: boolean = false;
  export let isStreaming: boolean = false;

  type MarkdownBlock =
    | { type: 'html'; html: string; isNew?: boolean }
    | { type: 'code'; code: string; language?: string; html: string; isNew?: boolean };

  let blocks: MarkdownBlock[] = [];
  let prevBlockCount = 0;

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

  function splitMarkdownBlocks(source: string): MarkdownBlock[] {
    const normalizedSource = source.startsWith('[Translation unavailable]')
      ? source.substring('[Translation unavailable]'.length).trimStart()
      : source;
    const lines = normalizedSource.split('\n');
    const nextBlocks: MarkdownBlock[] = [];
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
    const oldCount = prevBlockCount;
    blocks = newBlocks.map((b, i) => ({
      ...b,
      isNew: (isStreaming && i >= oldCount) || (blocks[i]?.isNew === true)
    }));
    prevBlockCount = newBlocks.length;
    if (isStreaming && newBlocks.length > oldCount) {
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
      renderContent(content);
    }
  }
</script>

<div class="markdown-container" class:is-streaming={isStreaming} aria-hidden="false">
  {#each blocks as block}
    {#if block.type === 'html'}
      <div class="prose max-w-none dark:prose-invert markdown-html" class:block-fade-in={block.isNew}>
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

  @media (prefers-reduced-motion: reduce) {
    .block-fade-in {
      animation: none;
      opacity: 1;
    }
  }
</style>
