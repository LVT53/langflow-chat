# Task-State Submodule

Parent: [../AGENTS.md](../AGENTS.md) for cross-service dependencies. This file covers submodule internals only.

## Overview

Internal helpers for `task-state.ts`: project continuity, artifact chunking, control-model client, and row mappers.

## Structure

| File | Lines | Role |
|------|-------|------|
| `continuity.ts` | ~680 | Project memory buckets, task-project linking, pause/resume event handling |
| `artifacts.ts` | ~360 | Chunk sync, prompt snippet selection, historical context summarization |
| `control-model.ts` | ~90 | Context summarizer API client for routing/verification/JSON tasks |
| `mappers.ts` | ~95 | Row-to-type mappers for task states, checkpoints, evidence links, chunks |

## Where to Look

| Task | File |
|------|------|
| Project continuity status | `continuity.ts` — `resolveProjectContinuityStatus()` |
| Pause/resume signal detection | `continuity.ts` — `detectProjectContinuitySignal()` |
| Task-project linking | `continuity.ts` — `syncTaskContinuityFromTaskState()` |
| Artifact chunk sync | `artifacts.ts` — `syncArtifactChunks()` |
| Prompt snippet selection | `artifacts.ts` — `getPromptArtifactSnippets()` |
| Chunk reranking | `artifacts.ts` — uses `tei-reranker.ts` |
| Historical context summarization | `artifacts.ts` — `summarizeHistoricalContext()` |
| Control model JSON tasks | `control-model.ts` — `requestStructuredControlModel()` |
| Row mapping | `mappers.ts` — `mapTaskState()`, `mapTaskCheckpoint()`, etc. |

## Conventions

- **Project events**: `project_started`, `project_paused`, `project_resumed` events are the authority for continuity state; trust them over stale `memoryProjects.status` rows.
- **Chunking**: Small files bypass chunking via `getSmallFileThreshold()`; larger files split at paragraph/sentence boundaries with overlap.
- **Snippet selection**: Lexical score first, TEI rerank when available, fallback to first chunk if no scores.
- **Control model**: Use for structured JSON tasks (routing, verification), not for TEI reranking.
- **Mappers**: Always use `parseJsonStringArray()` for JSON text columns; never cast directly.

## Anti-Patterns

- Do not route TEI reranking through `control-model.ts`; use `tei-reranker.ts` directly.
- Do not trust `memoryProjects.status` without checking latest project state events.
- Do not add new JSON parsing logic outside `mappers.ts` or `utils/json.ts`.
- Do not duplicate chunk selection logic in routes; use `getPromptArtifactSnippets()`.
