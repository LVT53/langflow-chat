# Knowledge Subsystem

Parent: [../AGENTS.md](../AGENTS.md) covers cross-service knowledge flow. This file documents the internal `knowledge/` structure only.

## Overview

Artifact storage, retrieval, and working-document lifecycle. All semantic retrieval uses TEI embedder/reranker through shared boundaries.

## Structure

```
store.ts (facade — re-exports store/*)
  ├── store/core.ts         ← artifact CRUD, WORKING_SET_*_BUDGET constants
  ├── store/attachments.ts  ← upload → extract → dedupe → link
  ├── store/documents.ts    ← normalized docs, semantic retrieval (Wave 5)
  ├── store/vaults.ts       ← vault CRUD
  ├── store/cleanup.ts      ← cross-reference-aware deletion
  └── store/document-metadata.ts ← generated-document family metadata
context.ts                ← working-set ranking, compaction, active-state integration
capsules.ts               ← work capsules, generated outputs (not lineage authority)
import.ts                 ← Obsidian/Notion ZIP import handler
```

## Where to Look

| Task | File |
|------|------|
| Create artifact + chunks | `store/core.ts` `createArtifact()` |
| Upload + readiness | `store/attachments.ts` `saveUploadedArtifact()` |
| Semantic document search | `store/documents.ts` `searchVaultDocuments()` |
| Vault CRUD | `store/vaults.ts` |
| Delete with ref checks | `store/cleanup.ts` `deleteArtifactForUser()` |
| Working-set ranking | `context.ts` `selectWorkingSetArtifactsForPrompt()` |
| Compaction status | `context.ts` `refreshConversationContextStatus()` |
| Work capsule create | `capsules.ts` `createWorkCapsule()` |
| Import ZIP | `import.ts` `importFromZip()` |

## Conventions

- **Token budgets**: `WORKING_SET_DOCUMENT_TOKEN_BUDGET` (4k), `WORKING_SET_OUTPUT_TOKEN_BUDGET` (2k), `WORKING_SET_PROMPT_TOKEN_BUDGET` (20k) live in `store/core.ts`
- **Semantic retrieval**: `store/documents.ts` composes lexical fetch + embedding shortlist + TEI rerank; keeps deterministic filters above TEI scores
- **Vault uploads**: `conversationId` may be null; skip `attached_to_conversation` link when null
- **Document families**: metadata-driven via `store/document-metadata.ts`; `document-resolution.ts` is authority for "which version is current"
- **Capsules**: workflow summaries only; document lineage lives in artifact metadata + links
- **Observability**: `[CONTEXT] Working document selection` summary in `context.ts`; extend it rather than per-candidate logs

## Anti-Patterns

- Do NOT create a second artifact persistence path outside `store/core.ts`
- Do NOT duplicate vault search ranking in routes; use `searchVaultDocuments()`
- Do NOT make capsules the authority for document lineage
- Do NOT route TEI reranking through control-model chat completions
- Do NOT add per-candidate debug logs; keep retrieval observability summary-level
- Do NOT bypass `document-resolution.ts` for generated-document selection heuristics
