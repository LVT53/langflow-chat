<script lang="ts">
  interface FontData {
    nimbusRegular: string;
    nimbusRegularItalic: string;
    nimbusBold: string;
    nimbusBoldItalic: string;
    libreRegular: string;
    libreItalic: string;
    libreBold: string;
  }

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
    fontData?: FontData;
  }

  let { htmlContent, metadata, fontData }: Props = $props();
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
      src: url('{fontData?.nimbusRegular || '/fonts/NimbusSanL-Regular.woff2'}') format('woff2');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Nimbus Sans L';
      src: url('{fontData?.nimbusRegularItalic || '/fonts/NimbusSanL-RegularItalic.woff2'}') format('woff2');
      font-weight: 400;
      font-style: italic;
    }
    @font-face {
      font-family: 'Nimbus Sans L';
      src: url('{fontData?.nimbusBold || '/fonts/NimbusSanL-Bold.woff2'}') format('woff2');
      font-weight: 700;
      font-style: normal;
    }
    @font-face {
      font-family: 'Nimbus Sans L';
      src: url('{fontData?.nimbusBoldItalic || '/fonts/NimbusSanL-BoldItalic.woff2'}') format('woff2');
      font-weight: 700;
      font-style: italic;
    }
    @font-face {
      font-family: 'Libre Baskerville';
      src: url('{fontData?.libreRegular || '/fonts/LibreBaskerville-Regular.woff2'}') format('woff2');
      font-weight: 400;
      font-style: normal;
    }
    @font-face {
      font-family: 'Libre Baskerville';
      src: url('{fontData?.libreItalic || '/fonts/LibreBaskerville-Italic.woff2'}') format('woff2');
      font-weight: 400;
      font-style: italic;
    }
    @font-face {
      font-family: 'Libre Baskerville';
      src: url('{fontData?.libreBold || '/fonts/LibreBaskerville-Bold.woff2'}') format('woff2');
      font-weight: 700;
      font-style: normal;
    }

    /*
     * NOTE: Header and footer are rendered by Playwright's headerTemplate/footerTemplate.
     * CSS @page rules are not supported by Chromium for complex elements like SVGs.
     * See src/lib/server/services/pdf-generator.ts for the template definitions.
     */

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

    /* Cover page - professional design with brand accent */
    .cover-page {
      page-break-after: always;
      height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 80px 60px;
      background: linear-gradient(180deg, #FAFAF8 0%, rgba(193, 95, 60, 0.03) 100%);
      border-top: 6px solid #C15F3C;
      position: relative;
    }

    .cover-page::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 120px;
      height: 3px;
      background: linear-gradient(90deg, transparent, #C15F3C, transparent);
    }

    .cover-logo {
      width: 48px;
      height: 54px;
      margin-bottom: 24px;
      opacity: 0.85;
    }

    .cover-title {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-size: 2.25rem;
      font-weight: 700;
      color: #1A1A1A;
      line-height: 1.25;
      margin-bottom: 24px;
      max-width: 80%;
    }

    .cover-subtitle {
      font-family: 'Nimbus Sans L', system-ui, sans-serif;
      font-size: 1.125rem;
      font-weight: 400;
      color: #6B6B6B;
      letter-spacing: 0.01em;
      margin-bottom: 56px;
      max-width: 70%;
      line-height: 1.5;
    }

    .cover-meta {
      margin-top: auto;
      padding-top: 48px;
      font-family: 'Nimbus Sans L', system-ui, sans-serif;
    }

    .cover-author {
      font-size: 0.9375rem;
      font-weight: 700;
      color: #1A1A1A;
      letter-spacing: 0.02em;
      margin-bottom: 8px;
    }

    .cover-date {
      font-size: 0.875rem;
      color: #6B6B6B;
      letter-spacing: 0.01em;
    }

    .content {
      padding: 0;
      max-width: 100%;
      width: 100%;
    }

    /* Constrain content to page margins */
    body > :global(*) {
      max-width: calc(100% - 100px);
      margin-left: auto;
      margin-right: auto;
    }

    /* Headings - clean hierarchy with accent color on h1 only */
    :global(.content h1), :global(.content h2), :global(.content h3), :global(.content h4), :global(.content h5), :global(.content h6) {
      font-family: 'Libre Baskerville', Georgia, serif;
      font-weight: 700;
      line-height: 1.3;
      page-break-after: avoid;
      color: #1A1A1A;
    }

    :global(.content h1) {
      font-size: 1.75rem;
      color: #C15F3C;
      margin-top: 0;
      margin-bottom: 20px;
    }

    :global(.content h2) {
      font-size: 1.375rem;
      color: #C15F3C;
      margin-top: 56px;
      margin-bottom: 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(193, 95, 60, 0.25);
    }

    :global(.content h2 + p) {
      margin-top: 8px;
    }

    :global(.content h3) {
      font-size: 1.125rem;
      margin-top: 40px;
      margin-bottom: 14px;
    }

    :global(.content h3 + p) {
      margin-top: 6px;
    }

    :global(.content h4) {
      font-size: 1rem;
      margin-top: 28px;
      margin-bottom: 12px;
    }

    :global(.content h5), :global(.content h6) {
      font-family: 'Nimbus Sans L', system-ui, sans-serif;
      font-size: 0.875rem;
      color: #6B6B6B;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-top: 24px;
      margin-bottom: 10px;
    }

    /* Body text - relaxed spacing */
    :global(.content p) {
      margin-bottom: 16px;
      text-align: justify;
      hyphens: auto;
      line-height: 1.7;
    }

    :global(.content ul), :global(.content ol) {
      margin-bottom: 16px;
      padding-left: 28px;
    }

    :global(.content ul) {
      list-style-type: disc;
    }

    :global(.content ul li::marker) {
      color: #C15F3C;
    }

    :global(.content li) {
      margin-bottom: 6px;
      line-height: 1.6;
    }

    :global(.content a) {
      color: #C15F3C;
      text-decoration: underline;
      text-decoration-color: rgba(193, 95, 60, 0.4);
      text-underline-offset: 2px;
    }

    /* Code - subtle, clean */
    :global(.content code) {
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 0.875em;
      background-color: #F5F5F0;
      padding: 2px 6px;
      border-radius: 4px;
      color: #1A1A1A;
    }

    :global(.content pre) {
      background-color: #F5F5F0;
      border: 1px solid rgba(0,0,0,0.06);
      border-radius: 6px;
      padding: 20px;
      overflow-x: auto;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    :global(.content pre code) {
      background-color: transparent;
      padding: 0;
      font-size: 0.8125rem;
      line-height: 1.6;
    }

    /* Images - prevent overflow, resize for page width, avoid page breaks */
    :global(.content img) {
      max-width: min(100%, calc(100% - 100px));
      max-height: 350px;
      width: auto;
      height: auto;
      display: block;
      margin: 24px auto;
      page-break-before: avoid;
      page-break-after: avoid;
      page-break-inside: avoid;
      break-inside: avoid;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      object-fit: contain;
      overflow: hidden;
    }

    :global(.content figure) {
      margin: 24px 0;
      page-break-before: avoid;
      page-break-after: avoid;
      page-break-inside: avoid;
      break-inside: avoid;
      text-align: center;
      max-width: 100%;
      overflow: hidden;
    }

    :global(.content figure img) {
      margin: 0 auto 12px auto;
      max-width: min(100%, calc(100% - 100px));
    }

    :global(.content figcaption) {
      font-family: 'Nimbus Sans L', system-ui, sans-serif;
      font-size: 0.8125rem;
      color: #6B6B6B;
      font-style: italic;
      margin-top: 8px;
    }

    /* Blockquotes - minimal left border with accent color */
    :global(.content blockquote) {
      border-left: 3px solid #C15F3C;
      padding-left: 20px;
      margin-left: 0;
      margin-bottom: 20px;
      color: #4A4A4A;
      font-style: italic;
    }

    :global(.content blockquote p:last-child) {
      margin-bottom: 0;
    }

    /* Tables - subtle, clean */
    :global(.content table) {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    :global(.content th), :global(.content td) {
      padding: 10px 16px;
      text-align: left;
      border-bottom: 1px solid rgba(0,0,0,0.06);
    }

    :global(.content th) {
      font-family: 'Nimbus Sans L', system-ui, sans-serif;
      font-weight: 700;
      color: #1A1A1A;
      border-bottom: 1px solid rgba(0,0,0,0.12);
      font-size: 0.875rem;
      letter-spacing: 0.01em;
    }

    :global(.content tr:nth-child(even)) {
      background-color: rgba(0,0,0,0.02);
    }

    :global(.content hr) {
      border: none;
      border-top: 2px solid rgba(193, 95, 60, 0.3);
      margin: 56px 0;
    }

    /* Callouts - minimal, subtle backgrounds with accent colors */
    :global(.content .callout) {
      border-radius: 6px;
      padding: 20px;
      margin-bottom: 20px;
      page-break-inside: avoid;
    }

    :global(.content .callout-title) {
      font-family: 'Nimbus Sans L', system-ui, sans-serif;
      font-weight: 700;
      font-size: 0.8125rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    :global(.content .callout-content) {
      font-size: 0.9375rem;
      line-height: 1.6;
    }

    :global(.content .callout-content p:last-child) {
      margin-bottom: 0;
    }

    :global(.content .callout-info) {
      background-color: rgba(193, 95, 60, 0.06);
      border-left: 3px solid #C15F3C;
    }

    :global(.content .callout-info .callout-title) {
      color: #C15F3C;
    }

    :global(.content .callout-warning) {
      background-color: rgba(193, 95, 60, 0.1);
      border-left: 3px solid #C15F3C;
    }

    :global(.content .callout-warning .callout-title) {
      color: #A05030;
    }

    :global(.content .callout-tip) {
      background-color: rgba(21, 128, 61, 0.05);
      border-left: 3px solid #15803D;
    }

    :global(.content .callout-tip .callout-title) {
      color: #15803D;
    }

    :global(.content .callout-note) {
      background-color: rgba(107, 107, 107, 0.05);
      border-left: 3px solid #6B6B6B;
    }

    :global(.content .callout-note .callout-title) {
      color: #6B6B6B;
    }

    :global(.content .text-center) {
      text-align: center;
    }

    :global(.content .text-right) {
      text-align: right;
    }

    :global(.content .page-break) {
      page-break-before: always;
    }

    :global(.content .no-break) {
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

      :global(.content h1), :global(.content h2), :global(.content h3) {
        page-break-after: avoid;
      }

      :global(.content pre), :global(.content table), :global(.content .callout) {
        page-break-inside: avoid;
      }
    }
  </style>
</svelte:head>

{#if metadata.cover}
  <div class="cover-page">
    <svg class="cover-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 112" aria-hidden="true">
      <path fill="none" stroke="#C15F3C" stroke-width="4.2" stroke-linecap="round" d="M50 19 C46 40 36 64 24 88"/>
      <path fill="none" stroke="#C15F3C" stroke-width="4.2" stroke-linecap="round" d="M50 19 C54 40 64 64 76 88"/>
      <line x1="27" y1="57" x2="73" y2="57" stroke="#C15F3C" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="27" y1="52" x2="27" y2="62" stroke="#C15F3C" stroke-width="1.8" stroke-linecap="round" opacity="0.75"/>
      <line x1="73" y1="52" x2="73" y2="62" stroke="#C15F3C" stroke-width="1.8" stroke-linecap="round" opacity="0.75"/>
      <line x1="14" y1="90" x2="36" y2="90" stroke="#C15F3C" stroke-width="3.2" stroke-linecap="round"/>
      <line x1="64" y1="90" x2="86" y2="90" stroke="#C15F3C" stroke-width="3.2" stroke-linecap="round"/>
      <circle cx="50" cy="19" r="3.5" fill="#C15F3C"/>
    </svg>
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
