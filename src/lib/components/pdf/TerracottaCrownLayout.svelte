<script lang="ts">
  interface Metadata {
    title: string;
    subtitle?: string;
    author?: string;
    date?: string;
    cover?: boolean;
  }

  interface Props {
    htmlContent: string;
    metadata: Metadata;
  }

  let { htmlContent, metadata }: Props = $props();
</script>

<svelte:options runes={true} />

<svelte:head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{metadata.title}</title>
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    @font-face {
      font-family: 'Nimbus Sans L';
      src: url('/fonts/NimbusSanL-Regular.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Nimbus Sans L';
      src: url('/fonts/NimbusSanL-RegularItalic.woff2') format('woff2');
      font-weight: 400;
      font-style: italic;
    }
    @font-face {
      font-family: 'Nimbus Sans L';
      src: url('/fonts/NimbusSanL-Bold.woff2') format('woff2');
      font-weight: 700;
      font-style: normal;
    }
    @font-face {
      font-family: 'Nimbus Sans L';
      src: url('/fonts/NimbusSanL-BoldItalic.woff2') format('woff2');
      font-weight: 700;
      font-style: italic;
    }
    @font-face {
      font-family: 'Libre Baskerville';
      src: url('/fonts/LibreBaskerville-Regular.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Libre Baskerville';
      src: url('/fonts/LibreBaskerville-Italic.woff2') format('woff2');
      font-weight: 400;
      font-style: italic;
    }
    @font-face {
      font-family: 'Libre Baskerville';
      src: url('/fonts/LibreBaskerville-Bold.woff2') format('woff2');
      font-weight: 700;
      font-style: normal;
    }
    
    @page {
      size: A4;
      margin: 60px 50px 50px 50px;
      @top-center {
        content: '';
        border-top: 4pt solid #C15F3C;
        width: 100%;
      }
    }
    
    @page :first {
      @top-center {
        content: none;
      }
    }
    
    html {
      font-size: 16px;
      line-height: 1.6;
    }
    
    body {
      font-family: 'Libre Baskerville', Georgia, serif;
      background-color: #FAFAF8;
      color: #1A1A1A;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .cover-page {
      page-break-after: always;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 48px;
      background: linear-gradient(
        180deg,
        #FAFAF8 0%,
        #F4F3EE 100%
      );
      position: relative;
    }
    
    .cover-page::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 8pt;
      background-color: #C15F3C;
    }
    
    .cover-ornament {
      width: 80px;
      height: 4px;
      background-color: #C15F3C;
      margin-bottom: 32px;
    }
    
    .cover-title {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-size: 2.5rem;
      font-weight: 700;
      color: #C15F3C;
      line-height: 1.2;
      margin-bottom: 16px;
      max-width: 80%;
    }
    
    .cover-subtitle {
      font-family: 'Nimbus Sans L', sans-serif;
      font-size: 1.25rem;
      font-weight: 400;
      color: #6B6B6B;
      letter-spacing: 0.025em;
      margin-bottom: 48px;
      max-width: 70%;
    }
    
    .cover-meta {
      margin-top: auto;
      padding-top: 48px;
      font-family: 'Nimbus Sans L', sans-serif;
    }
    
    .cover-author {
      font-size: 1rem;
      font-weight: 700;
      color: #1A1A1A;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    
    .cover-date {
      font-size: 0.875rem;
      color: #6B6B6B;
      letter-spacing: 0.025em;
    }
    
    .content {
      padding: 24px 0;
    }
    
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-weight: 700;
      line-height: 1.3;
      margin-top: 32px;
      margin-bottom: 16px;
      page-break-after: avoid;
    }
    
    h1 {
      font-size: 2rem;
      color: #C15F3C;
      border-bottom: 2px solid #C15F3C;
      padding-bottom: 8px;
      margin-top: 0;
    }
    
    h2 {
      font-size: 1.5rem;
      color: #AE5630;
    }
    
    h3 {
      font-size: 1.25rem;
      color: #AE5630;
    }
    
    h4 {
      font-size: 1.125rem;
      color: #1A1A1A;
    }
    
    h5, h6 {
      font-size: 1rem;
      color: #6B6B6B;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    p {
      margin-bottom: 16px;
      text-align: justify;
      hyphens: auto;
    }
    
    ul, ol {
      margin-bottom: 16px;
      padding-left: 24px;
    }
    
    li {
      margin-bottom: 4px;
    }
    
    a {
      color: #C15F3C;
      text-decoration: underline;
      text-decoration-color: #C15F3C;
      text-underline-offset: 2px;
    }
    
    code {
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 0.875em;
      background-color: #F5F5F0;
      padding: 2px 6px;
      border-radius: 5px;
      color: #1A1A1A;
    }
    
    pre {
      background-color: #F5F5F0;
      border: 1px solid rgba(0,0,0,0.08);
      border-radius: 6px;
      padding: 16px;
      overflow-x: auto;
      margin-bottom: 16px;
      page-break-inside: avoid;
    }
    
    pre code {
      background-color: transparent;
      padding: 0;
      font-size: 0.8125rem;
      line-height: 1.5;
    }
    
    blockquote {
      border-left: 4px solid #C15F3C;
      padding-left: 16px;
      margin-left: 0;
      margin-bottom: 16px;
      color: #6B6B6B;
      font-style: italic;
    }
    
    blockquote p:last-child {
      margin-bottom: 0;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      page-break-inside: avoid;
    }
    
    th, td {
      padding: 8px 16px;
      text-align: left;
      border-bottom: 1px solid rgba(0,0,0,0.08);
    }
    
    th {
      font-family: 'Nimbus Sans L', sans-serif;
      font-weight: 700;
      color: #C15F3C;
      border-bottom: 2px solid #C15F3C;
      text-transform: uppercase;
      font-size: 0.875rem;
      letter-spacing: 0.05em;
    }
    
    tr:nth-child(even) {
      background-color: #F4F3EE;
    }
    
    hr {
      border: none;
      border-top: 1px solid rgba(0,0,0,0.08);
      margin: 32px 0;
    }
    
    .callout {
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
      page-break-inside: avoid;
    }
    
    .callout-title {
      font-family: 'Nimbus Sans L', sans-serif;
      font-weight: 700;
      font-size: 0.875rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .callout-content {
      font-size: 0.9375rem;
      line-height: 1.5;
    }
    
    .callout-content p:last-child {
      margin-bottom: 0;
    }
    
    .callout-info {
      background-color: rgba(193, 95, 60, 0.08);
      border-left: 4px solid #C15F3C;
    }
    
    .callout-info .callout-title {
      color: #C15F3C;
    }
    
    .callout-warning {
      background-color: rgba(193, 95, 60, 0.12);
      border-left: 4px solid #AE5630;
    }
    
    .callout-warning .callout-title {
      color: #AE5630;
    }
    
    .callout-tip {
      background-color: rgba(21, 128, 61, 0.08);
      border-left: 4px solid #15803D;
    }
    
    .callout-tip .callout-title {
      color: #15803D;
    }
    
    .callout-note {
      background-color: rgba(107, 107, 107, 0.08);
      border-left: 4px solid #6B6B6B;
    }
    
    .callout-note .callout-title {
      color: #6B6B6B;
    }
    
    .text-center {
      text-align: center;
    }
    
    .text-right {
      text-align: right;
    }
    
    .page-break {
      page-break-before: always;
    }
    
    .no-break {
      page-break-inside: avoid;
    }
    
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      
      .cover-page {
        page-break-after: always;
      }
      
      h1, h2, h3 {
        page-break-after: avoid;
      }
      
      pre, table, .callout {
        page-break-inside: avoid;
      }
    }
  </style>
</svelte:head>

{#if metadata.cover}
  <div class="cover-page">
    <div class="cover-ornament"></div>
    <h1 class="cover-title">{metadata.title}</h1>
    {#if metadata.subtitle}
      <p class="cover-subtitle">{metadata.subtitle}</p>
    {/if}
    <div class="cover-meta">
      {#if metadata.author}
        <p class="cover-author">{metadata.author}</p>
      {/if}
      {#if metadata.date}
        <p class="cover-date">{metadata.date}</p>
      {/if}
    </div>
  </div>
{/if}

<main class="content">
  {@html htmlContent}
</main>
