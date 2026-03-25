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

## Upload Body Size

Adapter-node defaults request bodies to `512K`, which is too small for document uploads. This project now patches the production build so `npm run build` produces a server with a default `BODY_SIZE_LIMIT` of `32M`.

You can still override that explicitly in deployment:

- `BODY_SIZE_LIMIT=32M` or higher if you want more headroom
- keep it above the app-level 25MB knowledge-upload limit so multipart overhead does not cause false failures

## Deploy Flow

```sh
npm ci
npm run build
node build
```

Mount or persist `data/` across deploys so conversations, artifacts, and knowledge files survive restarts.
