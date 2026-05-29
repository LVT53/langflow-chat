# Collapse Working Document Selection Signals

Working Document Selection is the authority for live, per-turn Working Document signal collapse. `src/lib/server/services/working-document-selection.ts` decides active workspace focus, current generated document, correction targets, recently refined generated-document family carryover, reset/move-on suppression, prompt reason-code projection, retrieval carryover inputs, and task-evidence protection ids.

Working Document Identity remains the purpose-specific id authority. It answers which artifact id represents a Working Document for display/workspace, prompt, preview/file-serving, and family matching. It does not decide whether the current turn should carry a Working Document forward.

`document-resolution.ts` remains the generated-document family ranking authority. Working Document Selection consumes that resolver for current/relevant generated-document ordering rather than reimplementing family/version ranking or raw latest-output heuristics.

Context Selection remains the prompt-budget and inclusion authority. Working Document Selection can supply strong live signals and candidate/protected ids, but Context Selection still decides whether an item becomes Prompt Context and how much of it enters the model window.

Knowledge retrieval, Context Sources, Honcho retrieval carryover, and Task Context may consume Working Document Selection views. They should not rebuild active focus, correction target, current-generated, recent-refinement, reset, or historical-family rules locally.

**Implementation Status, 2026-05-29:** implemented. WDS-01 introduced `resolveWorkingDocumentSelection(...)`; WDS-02 moved Knowledge prompt and working-set callers onto selection views; WDS-03 moved Honcho retrieval carryover and Task Context evidence protection onto selection views; WDS-04 removed the stale `active-state.ts` public helper/test and updated docs/review status.

**Considered Options**

- Keep live Working Document behavior distributed through reason codes and caller-local promotions.
- Keep `active-state.ts` as a public helper under the new selection facade.
- Make Working Document Selection the single live-signal boundary over the existing artifact, identity, and generated-family resolver boundaries.

We chose the single live-signal boundary because prompt selection, retrieval, Context Sources, and Task Context need to agree about the current Working Document without sharing stale reason-code conventions or duplicating reset/refinement heuristics.
