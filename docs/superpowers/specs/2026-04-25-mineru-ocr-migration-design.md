# MinerU OCR Migration — Design Spec

**Date:** 2026-04-25
**Status:** Designed
**Goal:** Replace the Liteparse+Tesseract+Paddle OCR stack with MinerU,
a state-of-the-art document parsing engine, running as a Docker service.

## Motivation

The current OCR pipeline uses `@llamaindex/liteparse` with Tesseract.js WASM
at 150 DPI, producing garbled output on digital PDFs with mixed content and
Hungarian text. MinerU achieves 86.2 on OmniDocBench (vs Tesseract's ~60),
supports 109 languages with auto-detection, and handles all document formats
natively (PDF, DOCX, PPTX, XLSX, images, web pages).

## Architecture

```
File Upload/Generate → extractDocumentText() → MINERU_API_URL/file_parse
                                                      │
                                              MinerU Docker container
                                              pipeline backend (CPU) or
                                              vlm-engine (GPU if available)
                                                      │
                                              Returns markdown JSON
                                                      │
                               { text: markdown, normalizedName, mimeType }
```

Single extraction path for ALL file types. No branching, no language config,
no format detection. MinerU handles everything.

## What Gets Removed

### Files (3 deleted)
- `src/lib/server/services/ocr/paddle-adapter.ts`
- `src/routes/api/ocr/paddle/+server.ts`
- `src/routes/api/ocr/paddle/server.test.ts`

### Dependencies (1 removed)
- `@llamaindex/liteparse` (and all transitive deps: tesseract.js, pdf.js, etc.)

### Config Variables (8 removed)
- `DOCUMENT_PARSER_OCR_ENABLED`
- `DOCUMENT_PARSER_OCR_SERVER_URL`
- `DOCUMENT_PARSER_PADDLE_BACKEND_URL`
- `DOCUMENT_PARSER_OCR_LANGUAGE`
- `DOCUMENT_PARSER_NUM_WORKERS`
- `DOCUMENT_PARSER_MAX_PAGES`
- `DOCUMENT_PARSER_DPI`
- `DOCUMENT_PARSER_TIMEOUT_MS`

### UI Fields (8 removed from admin panel)
- OCR Enabled toggle
- OCR Server URL
- Paddle Backend URL
- OCR Language dropdown
- Num Workers
- Max Pages
- DPI
- Timeout MS

### Tests (2 deleted, 1 updated)
- `src/lib/server/services/document-extraction.test.ts` — replaced
- `src/routes/api/ocr/paddle/server.test.ts` — deleted
- `src/routes/api/knowledge/upload/upload.test.ts` — updated if needed

## What Gets Added

### Files (0 new — rewriting existing files)
- `src/lib/server/services/document-extraction.ts` — complete rewrite

### Config Variables (2 added)
| Variable | Default | Description |
|----------|---------|-------------|
| `MINERU_API_URL` | `http://127.0.0.1:8001` | MinerU API base URL |
| `MINERU_TIMEOUT_MS` | `300000` (5 min) | Request timeout in ms |

### UI Fields (2 added to admin panel)
- MinerU API URL (text input, placeholder: `http://127.0.0.1:8001`)
- MinerU Timeout (number input, seconds, default: 300)

### Tests (1 new)
- `src/lib/server/services/document-extraction.test.ts` — rewritten for MinerU

## Public API Contract (unchanged)

```typescript
interface ExtractionResult {
  text: string | null;      // now stores markdown instead of plain text
  normalizedName: string;   // unchanged
  mimeType: string;         // now 'text/markdown' instead of 'text/plain'
}

export function extractDocumentText(
  filePath: string,
  mimeType: string | null,
  originalName: string
): Promise<ExtractionResult>;

export function resetDocumentExtractionExecutableCache(): void;
```

## New Implementation Detail

```typescript
// src/lib/server/services/document-extraction.ts

async function extractDocumentText(
  filePath: string,
  mimeType: string | null,
  originalName: string
): Promise<ExtractionResult> {
  const normalizedName = toNormalizedName(originalName);

  try {
    const fileBuffer = await readFile(filePath);
    const formData = new FormData();
    formData.append('file', new Blob([fileBuffer]), originalName);

    const config = getConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.mineruTimeoutMs);

    const response = await fetch(`${config.mineruApiUrl}/file_parse`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error('[MINERU] request_failed', {
        status: response.status,
        filePath,
      });
      return { text: null, normalizedName, mimeType: 'text/markdown' };
    }

    const data = await response.json();
    const markdown = data?.markdown ?? data?.text ?? '';

    if (!markdown.trim()) {
      console.info('[MINERU] empty_result', { filePath });
      return { text: null, normalizedName, mimeType: 'text/markdown' };
    }

    console.info('[MINERU] extraction_success', {
      filePath,
      textLength: markdown.length,
    });

    return { text: markdown.trim(), normalizedName, mimeType: 'text/markdown' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = error instanceof DOMException && error.name === 'AbortError';

    console.error('[MINERU] extraction_error', {
      filePath,
      timedOut,
      message,
    });

    return { text: null, normalizedName, mimeType: 'text/markdown' };
  }
}
```

## Edge Cases

| Case | Behavior |
|------|----------|
| MinerU unreachable | Log error, return `text: null` |
| MinerU returns 4xx/5xx | Log error with status, return `text: null` |
| MinerU returns empty markdown | Log empty, return `text: null` |
| Request times out | Log timeout, return `text: null` |
| Password-protected PDF | MinerU rejects, logged, return null |
| Chat-generated code files | MinerU returns them as-is (text files) |
| Concurrent uploads | Each call is independent, no shared state |
| Very large file (~100MB) | Timeout covers it; MinerU sliding window handles long docs |
| Honcho sync after extraction | No change — consumes extracted text |
| Readiness check | Markdown passes 24-char / 12-alphanumeric threshold |

## Files Touched (full list)

| File | Action |
|------|--------|
| `src/lib/server/services/document-extraction.ts` | Rewrite |
| `src/lib/server/env.ts` | Remove 8 OCR vars, add 2 MinerU vars |
| `src/lib/server/config-store.ts` | Mirror env.ts changes |
| `.env.example` | Replace OCR section with MinerU section |
| `src/routes/(app)/settings/_components/SettingsAdminSystemPane.svelte` | Replace OCR fields with MinerU fields |
| `src/lib/server/services/chat-files.ts` | Remove binary image skip logic |
| `src/lib/server/services/ocr/paddle-adapter.ts` | Delete |
| `src/routes/api/ocr/paddle/+server.ts` | Delete |
| `src/routes/api/ocr/paddle/server.test.ts` | Delete |
| `src/lib/server/services/document-extraction.test.ts` | Replace with new tests |
| `package.json` | Remove `@llamaindex/liteparse` |

## Deployment Guide (for user)

After code changes are deployed:

```bash
# 1. Pull and run MinerU Docker container
docker pull opendatalab/mineru:latest
docker run -d --name mineru \
  -p 8001:8001 \
  --restart unless-stopped \
  opendatalab/mineru:latest

# 2. Verify MinerU is running
curl http://127.0.0.1:8001/docs

# 3. Add to .env on deployment server
MINERU_API_URL=http://127.0.0.1:8001
MINERU_TIMEOUT_MS=300000

# 4. Deploy the SvelteKit app
npm run db:prepare
npm run build
npm start

# 5. Test with a file upload
# Upload any PDF/image through the knowledge UI
# Verify text is extracted correctly in the knowledge library
```
