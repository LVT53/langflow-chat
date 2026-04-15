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

    /* CSS Paged Media - Page setup with header and footer */
    @page {
      size: A4;
      margin: 70px 50px 60px 50px;
      @top-center {
        content: element(header-brand);
      }
      @bottom-center {
        content: counter(page);
        font-family: 'Nimbus Sans L', sans-serif;
        font-size: 10px;
        color: #6B6B6B;
      }
    }

    @page :first {
      @top-center {
        content: none;
      }
      @bottom-center {
        content: none;
      }
    }

    html {
      font-size: 16px;
      line-height: 1.7;
    }

    body {
      font-family: 'Libre Baskerville', Georgia, serif;
      background-color: #FAFAF8;
      color: #1A1A1A;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    /* Header brand element for CSS Paged Media */
    .page-header {
      position: running(header-brand);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding-bottom: 16px;
    }

    .page-header-logo {
      width: 24px;
      height: 24px;
    }

    .page-header-text {
      font-family: 'Nimbus Sans L', sans-serif;
      font-size: 12px;
      font-weight: 500;
      color: #C8A882;
      letter-spacing: 0.05em;
    }

    /* Cover page - minimal, clean design */
    .cover-page {
      page-break-after: always;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 64px 48px;
      background-color: #FAFAF8;
    }

    .cover-title {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-size: 2.25rem;
      font-weight: 700;
      color: #C8A882;
      line-height: 1.25;
      margin-bottom: 24px;
      max-width: 80%;
    }

    .cover-subtitle {
      font-family: 'Nimbus Sans L', sans-serif;
      font-size: 1.125rem;
      font-weight: 400;
      color: #6B6B6B;
      letter-spacing: 0.02em;
      margin-bottom: 56px;
      max-width: 70%;
      line-height: 1.5;
    }

    .cover-meta {
      margin-top: auto;
      padding-top: 48px;
      font-family: 'Nimbus Sans L', sans-serif;
    }

    .cover-author {
      font-size: 0.9375rem;
      font-weight: 700;
      color: #1A1A1A;
      letter-spacing: 0.03em;
      margin-bottom: 8px;
    }

    .cover-date {
      font-size: 0.875rem;
      color: #6B6B6B;
      letter-spacing: 0.02em;
    }

    .content {
      padding: 32px 0;
    }

    /* Headings - minimal, no heavy borders */
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-weight: 700;
      line-height: 1.3;
      page-break-after: avoid;
    }

    h1 {
      font-size: 1.75rem;
      color: #C8A882;
      margin-top: 0;
      margin-bottom: 20px;
    }

    h2 {
      font-size: 1.375rem;
      color: #1A1A1A;
      margin-top: 40px;
      margin-bottom: 16px;
    }

    h3 {
      font-size: 1.125rem;
      color: #1A1A1A;
      margin-top: 40px;
      margin-bottom: 16px;
    }

    h4 {
      font-size: 1rem;
      color: #1A1A1A;
      margin-top: 32px;
      margin-bottom: 12px;
    }

    h5, h6 {
      font-size: 0.9375rem;
      color: #6B6B6B;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-top: 32px;
      margin-bottom: 12px;
    }

    /* Body text - relaxed spacing */
    p {
      margin-bottom: 20px;
      text-align: justify;
      hyphens: auto;
      line-height: 1.7;
    }

    ul, ol {
      margin-bottom: 20px;
      padding-left: 28px;
    }

    li {
      margin-bottom: 8px;
      line-height: 1.6;
    }

    a {
      color: #C8A882;
      text-decoration: underline;
      text-decoration-color: #D4B896;
      text-underline-offset: 2px;
    }

    /* Code - subtle, clean */
    code {
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 0.875em;
      background-color: #F5F5F0;
      padding: 2px 6px;
      border-radius: 4px;
      color: #1A1A1A;
    }

    pre {
      background-color: #F5F5F0;
      border: 1px solid rgba(0,0,0,0.06);
      border-radius: 6px;
      padding: 20px;
      overflow-x: auto;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    pre code {
      background-color: transparent;
      padding: 0;
      font-size: 0.8125rem;
      line-height: 1.6;
    }

    /* Images - responsive, page-break safe */
    img {
      max-width: 100%;
      height: auto;
      display: block;
      margin: 24px auto;
      page-break-inside: avoid;
      border-radius: 4px;
    }

    figure {
      margin: 24px 0;
      page-break-inside: avoid;
      text-align: center;
    }

    figure img {
      margin: 0 auto 12px auto;
    }

    figcaption {
      font-family: 'Nimbus Sans L', sans-serif;
      font-size: 0.8125rem;
      color: #6B6B6B;
      font-style: italic;
      margin-top: 8px;
    }

    /* Blockquotes - minimal left border */
    blockquote {
      border-left: 2px solid #D4B896;
      padding-left: 20px;
      margin-left: 0;
      margin-bottom: 20px;
      color: #6B6B6B;
      font-style: italic;
    }

    blockquote p:last-child {
      margin-bottom: 0;
    }

    /* Tables - subtle, clean */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    th, td {
      padding: 10px 16px;
      text-align: left;
      border-bottom: 1px solid rgba(0,0,0,0.06);
    }

    th {
      font-family: 'Nimbus Sans L', sans-serif;
      font-weight: 700;
      color: #1A1A1A;
      border-bottom: 1px solid rgba(0,0,0,0.12);
      font-size: 0.875rem;
      letter-spacing: 0.02em;
    }

    tr:nth-child(even) {
      background-color: rgba(0,0,0,0.02);
    }

    hr {
      border: none;
      border-top: 1px solid rgba(0,0,0,0.08);
      margin: 40px 0;
    }

    /* Callouts - minimal, subtle backgrounds */
    .callout {
      border-radius: 6px;
      padding: 20px;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    .callout-title {
      font-family: 'Nimbus Sans L', sans-serif;
      font-weight: 700;
      font-size: 0.8125rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .callout-content {
      font-size: 0.9375rem;
      line-height: 1.6;
    }

    .callout-content p:last-child {
      margin-bottom: 0;
    }

    .callout-info {
      background-color: rgba(200, 168, 130, 0.06);
      border-left: 2px solid #C8A882;
    }

    .callout-info .callout-title {
      color: #C8A882;
    }

    .callout-warning {
      background-color: rgba(200, 168, 130, 0.1);
      border-left: 2px solid #D4B896;
    }

    .callout-warning .callout-title {
      color: #B8956A;
    }

    .callout-tip {
      background-color: rgba(21, 128, 61, 0.05);
      border-left: 2px solid #15803D;
    }

    .callout-tip .callout-title {
      color: #15803D;
    }

    .callout-note {
      background-color: rgba(107, 107, 107, 0.05);
      border-left: 2px solid #6B6B6B;
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

<!-- Header brand element for CSS Paged Media -->
<div class="page-header">
  <svg class="page-header-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 112" aria-hidden="true">
    <path fill="none" stroke="#C8A882" stroke-width="4.2" stroke-linecap="round"
      d="M50 19 C46 40 36 64 24 88"/>
    <path fill="none" stroke="#C8A882" stroke-width="4.2" stroke-linecap="round"
      d="M50 19 C54 40 64 64 76 88"/>
    <line x1="27" y1="57" x2="73" y2="57" stroke="#C8A882" stroke-width="2.2" stroke-linecap="round"/>
    <line x1="27" y1="52" x2="27" y2="62" stroke="#C8A882" stroke-width="1.8" stroke-linecap="round" opacity="0.75"/>
    <line x1="73" y1="52" x2="73" y2="62" stroke="#C8A882" stroke-width="1.8" stroke-linecap="round" opacity="0.75"/>
    <line x1="14" y1="90" x2="36" y2="90" stroke="#C8A882" stroke-width="3.2" stroke-linecap="round"/>
    <line x1="64" y1="90" x2="86" y2="90" stroke="#C8A882" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="50" cy="19" r="3.5" fill="#C8A882"/>
  </svg>
  <span class="page-header-text">AlfyAI</span>
</div>

{#if metadata.cover}
  <div class="cover-page">
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
