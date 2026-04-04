# TEI Retrieval Roadmap

This document is the implementation plan for wiring Hugging Face Text Embeddings Inference (TEI) into AlfyAI.

Current intended models:

- Embedder: `bge-m3`
- Reranker: `bge-reranker-v2-m3`

The design goal is to make retrieval smarter and faster without changing authority boundaries. Deterministic app rules still decide active document focus, temporal truth, pinned/excluded evidence, working-document lineage, and memory deletion. TEI adds semantic shortlist generation and top-N reranking on top of those rules.

## Authority Order

1. Deterministic app rules
2. TEI embedder shortlist
3. TEI reranker refinement
4. Existing bounded modifiers such as recency and behavior signals

Do not invert that order. TEI should improve candidate quality, not become a second source of truth.

## Wave Plan

### Wave 1: Runtime and Client Foundation

- Add runtime config for TEI embedder/reranker endpoints and limits through `env.ts` and `config-store.ts`
- Add thin server-owned TEI clients:
  - `tei-embedder.ts`
  - `tei-reranker.ts`
- Keep API keys env-only and allow runtime overrides for endpoint/model/limit values
- Add unit tests for request formatting, fallback behavior, and response parsing

### Wave 2: Embedding Persistence

- Add durable embedding storage for:
  - knowledge/vault/generated artifacts
  - persona-memory clusters
  - task continuity/task-state rows
- Persist source-text hashes so re-embedding stays idempotent
- Keep storage local; do not introduce a second external vector service in this wave

### Wave 3: Embedding Refresh and Backfill

- Recompute embeddings when canonical source text changes
- Backfill missing embeddings lazily from maintenance paths instead of blocking request routes
- Reuse existing maintenance orchestration rather than inventing a second scheduler

### Wave 4: Replace Existing Rerank-Shaped Control-Model Paths

- Replace current LLM JSON rerank calls with TEI `/rerank` in:
  - `task-state.ts`
  - `task-state/artifacts.ts`
  - `prompt-context.ts`
  - `message-evidence.ts`
- Preserve deterministic protection rules and existing fallback behavior

### Wave 5: Semantic Retrieval for Knowledge and Working Documents

- Add embedding shortlist + rerank to:
  - `knowledge/store/documents.ts`
  - `knowledge/context.ts`
  - `document-resolution.ts`
- Keep working-document focus, family/version continuity, historical-family penalties, and explicit query matches above semantic scoring

### Wave 6: Semantic Retrieval for Persona Memory

- Add semantic shortlist selection for persona-memory clusters and overview candidates
- Keep freshness, supersession, correction penalties, and domain boundaries deterministic
- Do not let semantic similarity revive expired temporal facts as active truth

### Wave 7: Semantic Retrieval for Task Continuity

- Add semantic shortlist selection for task/objective retrieval
- Keep project continuity transitions and active/inactive task truth deterministic
- Use embeddings to find relevant older tasks; do not let embeddings rewrite continuity state

### Wave 8: Observability and Evaluation

- Add compact diagnostics for:
  - TEI latency
  - fallback usage
  - candidate counts before/after rerank
  - which retrieval mode won
- Add targeted fixtures for semantic-hit / lexical-miss cases

## Implementation Guardrails

- TEI is advisory for ranking, not authoritative for identity or truth
- Every TEI-backed path must degrade safely to the current lexical/deterministic behavior
- Do not bypass `config-store.ts` for runtime-resolved TEI config
- Do not let Langflow/tool nodes own retrieval authority that belongs in app services
