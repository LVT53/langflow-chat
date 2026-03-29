# External Deployment

This file is a supplemental runtime note. Start with the root [README.md](../README.md) for the main public setup and deployment path.

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
- optional `HONCHO_OVERVIEW_WAIT_MS=10000` if your live Memory Overview queries need a longer budget than chat-side persona enrichment
- optional `HONCHO_API_KEY` for authenticated deployments

If you self-host Honcho and its deriver/summary models hit your own GPU-backed inference server, start the Honcho deployment with `DERIVER_WORKERS=2` and scale upward gradually only if queue backlog remains high without saturating the model server.

## Upload Body Size

Adapter-node defaults request bodies to `512K`, which is too small for document uploads. This project patches the production build so `npm run build` produces a server with a default `BODY_SIZE_LIMIT` of `50M`.

You can still override that explicitly in deployment:

- `BODY_SIZE_LIMIT=50M` to match the current default
- a higher value if you want more headroom
- keep it at or above the app-level 50MB upload cap so multipart overhead does not cause false failures

## Deploy Flow

```sh
./scripts/deploy.sh
```

If you manage the process outside the deploy script, restart your supervisor separately after the script completes.

Mount or persist `data/` across deploys so conversations, artifacts, and knowledge files survive restarts.
