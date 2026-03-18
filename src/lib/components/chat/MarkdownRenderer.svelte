<script lang="ts">
  import CodeBlock from './CodeBlock.svelte';
  import { renderMarkdown, renderCodeBlock, initHighlighter } from '$lib/services/markdown';
  
  export let content: string = '';
  export let isDark: boolean = false;
  export let isStreaming: boolean = false;
  
  type MarkdownBlock =
    | { type: 'html'; html: string }
    | { type: 'code'; code: string; language?: string; html: string };

  let blocks: MarkdownBlock[] = [];

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
  
  async function initialize() {
    await initHighlighter();
    blocks = splitMarkdownBlocks(content);
  }
  
  $: if (content !== undefined || isDark !== undefined || isStreaming !== undefined) {
    initialize();
  }
</script>

<div class="markdown-container" class:is-streaming={isStreaming} aria-hidden="false">
  {#each blocks as block}
    {#if block.type === 'html'}
      <div class="prose max-w-none dark:prose-invert markdown-html">
        {@html block.html}
      </div>
    {:else}
      <CodeBlock code={block.code} language={block.language}>
        {@html block.html}
      </CodeBlock>
    {/if}
  {/each}
  {#if isStreaming}<span class="streaming-cursor">▌</span>{/if}
</div>

<style>
  .markdown-container {
    position: relative;
  }

  .markdown-html :global(*:last-child) {
    margin-bottom: 0;
  }

  .streaming-cursor {
    display: inline-block;
    animation: blink 1s step-start infinite;
    color: currentColor;
    user-select: none;
  }

  @keyframes blink {
    0%, 50% { opacity: 1 }
    51%, 100% { opacity: 0 }
  }

  /* Streaming mask effect - creates smooth fade at bottom where new content appears */
  .is-streaming::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2.5em;
    background: linear-gradient(
      to bottom,
      transparent 0%,
      var(--surface-page) 100%
    );
    pointer-events: none;
    opacity: 0.35;
    animation: streamPulse 1.8s ease-in-out infinite;
  }

  @keyframes streamPulse {
    0%, 100% { opacity: 0.25; }
    50% { opacity: 0.45; }
  }

  @media (prefers-reduced-motion: reduce) {
    .streaming-cursor {
      animation: none;
      opacity: 1;
    }

    .is-streaming::after {
      animation: none;
      opacity: 0.3;
    }
  }
</style>
