# External Deployment

This app now includes Honcho-backed context compaction, file ingestion, and a user-scoped knowledge base.

## Runtime Requirements

- Node.js 20+
- Writable `data/` directory for SQLite, uploads, and generated artifacts
- Honcho service reachable from the app server
- Langflow service reachable from the app server

## Recommended Linux Packages

The upload fallback pipeline works without macOS-only tools. For best document extraction quality on Linux, install:

```sh
apt-get update && apt-get install -y poppler-utils unzip binutils
```

These provide:

- `pdftotext` for PDF extraction
- `unzip` for `docx`, `xlsx`, and `pptx` XML extraction
- `strings` as a final text fallback for unsupported binaries

If one or more tools are missing, uploads still succeed; the app simply falls back to the next available extraction strategy.

## Required Environment

Set the usual application secrets plus the Honcho and Langflow configuration:

- `SESSION_SECRET`
- `LANGFLOW_API_KEY`
- `HONCHO_ENABLED=true`
- `HONCHO_BASE_URL`
- `HONCHO_WORKSPACE`
- optional `HONCHO_API_KEY` for authenticated deployments

## Deploy Flow

```sh
npm ci
npm run build
node build
```

Mount or persist `data/` across deploys so conversations, artifacts, and knowledge files survive restarts.
