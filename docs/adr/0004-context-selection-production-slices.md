# Migrate context selection in production TDD slices

Normal Chat context selection will be migrated through independently testable production slices rather than a broad rewrite. Each slice must start from behavior tests, ship with enough fallback and observability to run in production, and remove the context-selection debt it replaces.

**Slice Order**

1. Add compact `[CONTEXT_TRACE]` logs and consolidate overlapping success-path context, attachment, and TEI logs.
2. Treat open workspace documents as weak context signals unless paired with explicit user wording or selection intent.
3. Replace `essential` prompt sections with protected-but-budgeted inclusion levels.
4. Normalize attachments into budgeted context candidates instead of per-attachment full-content prompt sections.
5. Normalize generated outputs and recent conversation turns so recency alone cannot promote large body text.
6. Normalize pinned/preferred evidence so preference affects ranking and protection without forcing full body inclusion.
7. Introduce the chat-turn context-selection boundary as the single source of truth for candidate promotion and inclusion levels.
8. Apply the budget ladder across reserved, core, support, and awareness context.
9. Remove replaced distributed prompt assembly, duplicated budget logic, stale latest-output heuristics, and obsolete diagnostics.

We chose this order because trace-first gives production visibility, weak active-document behavior addresses the most likely accidental prompt bloat, and later slices can then migrate attachments, generated outputs, pinned evidence, and budgets behind one verified context-selection boundary without leaving parallel behavior behind.
