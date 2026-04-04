# TEI Retrieval Roadmap

This document is the implementation plan for wiring Hugging Face Text Embeddings Inference (TEI) into AlfyAI.

Current intended models:

- Embedder: `bge-m3`
- Reranker: `bge-reranker-v2-m3`

The design goal is to make retrieval smarter and faster without changing authority boundaries. Deterministic app rules still decide active document focus, temporal truth, pinned/excluded evidence, working-document lineage, and memory deletion. TEI adds semantic shortlist generation and top-N reranking on top of those rules.

Current status:

- Wave 1 complete: runtime config and thin TEI clients are live
- Wave 2 complete: unified local embedding persistence is live through `semantic_embeddings`
- Wave 3 complete: artifact/task/persona writes now queue async embedding refreshes, and `memory-maintenance.ts` runs lazy user-scoped embedding backfill
- Wave 5 complete for knowledge/documents: artifact retrieval now uses stored-embedding shortlist plus TEI rerank before the higher-level working-document resolver applies family/focus/history authority
- Wave 6 complete for persona prompt recall: surviving persona clusters now get semantic shortlist plus bounded rerank scoring when building query-time persona prompt context
- Wave 4 started: rerank-shaped evidence/chunk/historical/tool paths now use the TEI reranker
- Semantic shortlist retrieval waves are still pending

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
- Current status: complete, using one shared `semantic_embeddings` table keyed by `(userId, subjectType, subjectId, modelName)` rather than three separate embedding tables. This keeps the persistence substrate lighter while still supporting later artifact/persona/task retrieval waves.

### Wave 3: Embedding Refresh and Backfill

- Recompute embeddings when canonical source text changes
- Backfill missing embeddings lazily from maintenance paths instead of blocking request routes
- Reuse existing maintenance orchestration rather than inventing a second scheduler
- Current status: complete through `semantic-embedding-refresh.ts`, which queues async refreshes from artifact creation, task-state writes, and persona-cluster sync, while `memory-maintenance.ts` performs the slower per-user backfill sweep.

### Wave 4: Replace Existing Rerank-Shaped Control-Model Paths

- Replace current LLM JSON rerank calls with TEI `/rerank` in:
  - `task-state.ts`
  - `task-state/artifacts.ts`
  - `prompt-context.ts`
  - `message-evidence.ts`
- Preserve deterministic protection rules and existing fallback behavior
- Current status: complete for these four call sites. The generic control-model path remains in place for routing, verification, dream/semantic JSON tasks, and other non-rerank responsibilities.

### Wave 5: Semantic Retrieval for Knowledge and Working Documents

- Add embedding shortlist + rerank to:
  - `knowledge/store/documents.ts`
  - `knowledge/context.ts`
  - `document-resolution.ts`
- Keep working-document focus, family/version continuity, historical-family penalties, and explicit query matches above semantic scoring
- Current status: complete. `knowledge/store/documents.ts` now broadens user-scoped artifact candidates, scores them with stored artifact embeddings, reranks the shortlist through TEI when available, and passes those semantic/rerank boosts into `knowledge/context.ts` and `document-resolution.ts` without bypassing existing family/focus/history rules.

### Wave 6: Semantic Retrieval for Persona Memory

- Add semantic shortlist selection for persona-memory clusters and overview candidates
- Keep freshness, supersession, correction penalties, and domain boundaries deterministic
- Do not let semantic similarity revive expired temporal facts as active truth
- Current status: complete for query-time prompt recall. `persona-memory.ts` now filters archived/historical/expired/corrected items deterministically, then blends lexical, stored-embedding, and bounded rerank signals when selecting prompt-time persona context. The Knowledge Memory overview remains deterministic and classified rather than semantic-search-driven.

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
