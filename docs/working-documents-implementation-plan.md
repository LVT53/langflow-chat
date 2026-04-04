# Working Documents Implementation Plan

This document turns the working-documents architecture into an execution plan for the current codebase.

It is intentionally operational. It answers:

- what gets refactored
- in what order
- which existing services stay authoritative
- where code should move instead of duplicating behavior
- how each phase is verified before the next one starts

This plan assumes the current artifact backbone, workspace foundation, and Honcho integration already exist.

## Outcome We Want

After this refactor wave, the system should behave like one coherent document product:

- generated files, uploaded files, and vault files open in one workspace
- the AI can identify the correct working document and recent versions without relying on filename guesswork
- document continuity lives in one structured path, not across several semi-overlapping heuristics
- persona memory stops absorbing document-content facts that belong in document/task continuity
- Honcho remains a semantic memory layer, but local document identity stays authoritative

## Non-Goals For This Wave

These are explicitly out of scope for the current refactor:

- in-app editing of vault files
- collaborative/shared vaults
- a second preview stack
- a second memory subsystem parallel to artifacts plus Honcho
- replacing the artifact system with a new document database
- forcing all cross-chat recall through Honcho alone

## Current Redundancies To Remove

### 1. Generated-document lineage is split across multiple systems

Current overlap:

- filename-based version lookup in [`src/lib/server/services/chat-files.ts`](../src/lib/server/services/chat-files.ts)
- artifact-link lineage through `supersedes`
- generated-output family inference in [`src/lib/server/services/evidence-family.ts`](../src/lib/server/services/evidence-family.ts)

Target:

- one working-document lineage contract
- one resolver for “latest version”, “same family”, and “previous version”

### 2. Generated outputs are artifacts, but not full logical documents

Current overlap:

- [`src/lib/server/services/knowledge/store/documents.ts`](../src/lib/server/services/knowledge/store/documents.ts) only models `source_document` and `normalized_document`
- generated outputs are first-class everywhere else

Target:

- generated outputs participate in the same logical-document model

### 3. Document continuity is mixed with workflow continuity

Current overlap:

- [`src/lib/server/services/knowledge/capsules.ts`](../src/lib/server/services/knowledge/capsules.ts) stores workflow summary and also output/source references
- working documents already have their own continuity path

Target:

- work capsules summarize workflow/process only
- document history/versioning belongs to working documents

### 4. Active-document salience is duplicated

Current overlap:

- [`src/lib/server/services/working-set.ts`](../src/lib/server/services/working-set.ts)
- [`src/lib/server/services/knowledge/context.ts`](../src/lib/server/services/knowledge/context.ts)
- [`src/lib/server/services/task-state.ts`](../src/lib/server/services/task-state.ts)

Target:

- one document resolver produces the “active document” signal
- those services consume it instead of each carrying their own generated-output heuristics

### 5. Persona memory can potentially absorb document-origin conclusions

Current overlap:

- artifacts are synced into Honcho
- persona memory reads Honcho conclusions through [`src/lib/server/services/persona-memory.ts`](../src/lib/server/services/persona-memory.ts)
- there is no strict document-origin filter yet

Target:

- persona memory holds user/persona truth
- document content stays in document/task continuity

## Target Authority Split

### Local Artifact And Document State

Authoritative for:

- document identity
- document family membership
- version chains
- active/open document state
- current retrieval target for the turn

### Honcho

Authoritative for:

- semantic long-range recall
- conversational narrative continuity
- preferences around revisions
- high-level recall of what documents existed and why they mattered

Not authoritative for:

- which version is current
- whether a deadline or temporary state is still true
- which of several similar documents the user means right now

## Phase Plan

## Phase 0: Stabilize The Contract

Goal:

- define the shared document metadata contract before moving more logic

Changes:

- add a canonical working-document metadata shape to the docs and shared types
- reserve these fields for generated outputs first:
  - `documentFamilyId`
  - `documentLabel`
  - `documentRole`
  - `versionNumber`
  - `supersedesArtifactId`
  - `originConversationId`
  - `originAssistantMessageId`
  - `sourceChatFileId`

Code boundaries:

- [`src/lib/types.ts`](../src/lib/types.ts)
- [`src/lib/server/services/chat-files.ts`](../src/lib/server/services/chat-files.ts)
- docs only in this phase unless a missing shared type blocks later work

Verification:

- typecheck/build
- metadata contract documented in one place only

Done criteria:

- later phases can read/write one stable metadata contract instead of inventing their own fields

## Phase 1: Make Generated Outputs First-Class Logical Documents

Goal:

- unify generated outputs with the document model instead of keeping them as a side path

Changes:

- extend logical-document listing to include generated outputs
- map generated outputs into logical document items with:
  - display artifact
  - prompt artifact
  - family artifact ids
  - version metadata
- keep current retrieval-class handling, but make generated outputs eligible for the same document-level view/model

Code boundaries:

- [`src/lib/server/services/knowledge/store/documents.ts`](../src/lib/server/services/knowledge/store/documents.ts)
- [`src/lib/server/services/evidence-family.ts`](../src/lib/server/services/evidence-family.ts)
- any shared document mappers should stay under `knowledge/store/` or a new document-specific helper, not route files

Tests:

- logical-document listing covers generated outputs
- generated outputs with version chains collapse into one logical family view
- durable/ephemeral retrieval behavior remains unchanged unless intentionally updated

Done criteria:

- generated outputs stop being “special chat files” at the document-model layer

## Phase 2: Replace Filename-Based Versioning With Family-Based Versioning

Goal:

- stop using filename as the primary continuity key

Changes:

- when a generated file is stored/synced, assign or resolve a `documentFamilyId`
- maintain version progression through family metadata plus `supersedes`
- migrate `listRecentGeneratedFileVersions(...)` away from filename lookup
- preserve compatibility with older generated outputs that only have filename metadata

Migration strategy:

- backfill family ids lazily on read where possible
- prefer metadata plus `supersedes` link walking before any one-shot bulk migration
- only add DB tables later if metadata becomes too query-heavy or ambiguous

Code boundaries:

- [`src/lib/server/services/chat-files.ts`](../src/lib/server/services/chat-files.ts)
- [`src/lib/server/services/evidence-family.ts`](../src/lib/server/services/evidence-family.ts)
- potentially a new focused service such as:
  - `src/lib/server/services/working-documents.ts`
  - or `src/lib/server/services/knowledge/documents.ts`

Rules:

- do not duplicate family-resolution logic in `chat-files.ts` and `evidence-family.ts`
- choose one owner for family resolution and call it from both places

Tests:

- renamed file still stays in same family
- same-name different document does not incorrectly merge
- new version correctly supersedes previous version
- recent version timeline returns the correct chain

Done criteria:

- “continue the report” does not depend on the filename staying unchanged

## Phase 3: Introduce A Shared Document Resolver

Goal:

- create one authoritative resolver for which document/version the user means

Resolver priority:

1. active workspace document
2. explicit file/document name in the user message
3. latest matching family in the current conversation
4. best durable cross-chat family match

Changes:

- add a document resolver service that returns:
  - active document family
  - active artifact/version
  - recent version timeline
  - confidence and reason codes
- pipe that result into:
  - [`src/lib/server/services/knowledge/context.ts`](../src/lib/server/services/knowledge/context.ts)
  - [`src/lib/server/services/working-set.ts`](../src/lib/server/services/working-set.ts)
  - [`src/lib/server/services/task-state.ts`](../src/lib/server/services/task-state.ts)

Code boundaries:

- new service near knowledge/task-state, for example:
  - `src/lib/server/services/document-resolution.ts`
- route code may pass “currently open workspace document”, but must not implement its own resolution heuristics

Tests:

- explicit file mention beats generic latest-output match
- active workspace document beats ambiguous cross-chat recall
- cross-chat family lookup still works when no workspace doc is open

Done criteria:

- generated-output boosting and latest-output selection are no longer hand-rolled in multiple services

## Phase 4: Fold Attachments And Vault Documents Into The Workspace

Goal:

- one viewer/workspace behavior across chat and knowledge

Changes:

- all supported generated files open in the workspace
- chat attachments open in the same workspace
- vault documents open in the same workspace shell when invoked from chat or knowledge
- keep the current preview renderer as the only preview engine

Code boundaries:

- [`src/routes/(app)/chat/[conversationId]/+page.svelte`](../src/routes/(app)/chat/[conversationId]/+page.svelte)
- [`src/lib/components/chat/DocumentWorkspace.svelte`](../src/lib/components/chat/DocumentWorkspace.svelte)
- [`src/lib/components/knowledge/FilePreview.svelte`](../src/lib/components/knowledge/FilePreview.svelte)
- client-side open-document helpers may live next to the chat route if still page-local

Mobile rules:

- workspace remains default-closed
- desktop uses side pane
- mobile uses full-screen or sheet presentation of the same workspace concept
- no separate mobile-only document model

Tests:

- workspace remains closed by default
- generated files open into workspace
- supported attachments open into workspace
- preview behavior remains identical between modal and embedded shells

Done criteria:

- the user sees one document system, not chat files vs vault files vs attachments

## Phase 5: Separate Persona Memory From Document Memory

Goal:

- keep user/persona truth clean while still letting the AI remember document content and history

Changes:

- add source/origin filtering for Honcho-to-persona ingestion
- prevent document-derived conclusions from entering persona memory clusters
- document-derived semantic recall should stay usable for retrieval and continuity, just not in the Memory Profile persona layer

Code boundaries:

- [`src/lib/server/services/honcho.ts`](../src/lib/server/services/honcho.ts)
- [`src/lib/server/services/persona-memory.ts`](../src/lib/server/services/persona-memory.ts)
- [`src/lib/server/services/memory.ts`](../src/lib/server/services/memory.ts)

Rules:

- do not weaken document recall
- do not route document continuity into persona memory just because Honcho can summarize it

Tests:

- persona memories still include real user preferences and identity
- document-content summaries no longer surface as persona/profile memories
- forgetting persona memory does not incorrectly delete document lineage

Done criteria:

- Memory Profile describes the user, not the contents of their files

## Phase 6: Narrow Work Capsules To Workflow-Only Continuity

Goal:

- reduce overlap between workflow memory and document lineage

Changes:

- keep work capsules for:
  - task summary
  - workflow summary
  - reusable patterns
- stop relying on work capsules for document identity/version continuity
- if capsules reference outputs, treat those references as workflow context, not document-family authority

Code boundaries:

- [`src/lib/server/services/knowledge/capsules.ts`](../src/lib/server/services/knowledge/capsules.ts)
- [`src/lib/server/services/task-state.ts`](../src/lib/server/services/task-state.ts)

Tests:

- workflow summaries still reference outputs when useful
- document resolution still works even if capsule references are reduced

Done criteria:

- work capsules summarize “how the work went”, not “which exact version is current”

## Phase 7: Version Timeline And Compare UX

Goal:

- make iterative refinement visible, not just AI-internal

Changes:

- add per-family version timeline in workspace
- add jump-to-source-message
- add compare mode for text-like documents first
- expose family labels and version numbers in the workspace tabs or header

Code boundaries:

- [`src/lib/components/chat/DocumentWorkspace.svelte`](../src/lib/components/chat/DocumentWorkspace.svelte)
- [`src/lib/components/knowledge/FilePreview.svelte`](../src/lib/components/knowledge/FilePreview.svelte)
- new timeline/diff helpers if needed under `src/lib/components/chat/` or `src/lib/utils/`

Tests:

- latest version is marked correctly
- previous versions are navigable
- compare mode picks the right version pair

Done criteria:

- the user can reason about document evolution without leaving chat

## Phase 8: Observability And Cutover Cleanup

Goal:

- finish the consolidation and remove transitional duplication

Changes:

- remove stale filename-only fallback code once family-based lineage is proven
- remove transitional preview/modal paths that duplicate the workspace
- add focused diagnostics around:
  - document family resolution
  - active document selection
  - version supersession
- keep logs high-signal only

Tests:

- regression sweep across chat file generation, workspace opening, retrieval, and memory profile boundaries

Done criteria:

- one path for document identity
- one path for preview/workspace
- one path for AI document selection

## Verification Matrix

Each phase should be gated by a narrow verification set instead of one massive end-of-project test run.

### Server-Side

- document family resolution tests
- chat-file sync/version tests
- working-set selection tests
- knowledge-context retrieval tests
- persona-memory filtering tests

### Client-Side

- generated file click-to-workspace tests
- workspace open/close/select tests
- embedded preview tests
- mobile presentation logic tests where practical

### Integration

- generated file created in chat, then referred to in a later turn
- generated file renamed/refined and still resolved as same family
- saved-to-vault document remains same working document, not a separate identity
- document does not appear in persona profile as if it were user identity

## Rollout Rules

1. Do not begin schema/table expansion until metadata-only family resolution is clearly insufficient.
2. Do not build a second document store for “working docs”.
3. Do not hide family logic in route files.
4. Do not expand Honcho responsibility to become the document identity system.
5. Keep migration paths reversible while filename fallback still exists.

## After This Wave: What “Perfect / Self-Updating In Every Domain” Would Require

This refactor will make document continuity much more coherent, but it will not make the system universally perfect.

To move toward that longer-term goal, the system would need:

### 1. Stronger Domain Separation Across Memory Types

- persona memory
- task/workflow memory
- document memory
- temporal memory
- preference memory

Each of those needs different decay, update, and supersession rules. The current refactor mainly strengthens the document side of that split.

### 2. Event-Sourced Memory Updates

Instead of mostly inferred snapshots, the system would benefit from explicit memory events such as:

- user preference updated
- deadline extended
- document version superseded
- project paused
- project resumed

That would make self-updating behavior more deterministic.

### 3. Confidence And Freshness As First-Class Selection Signals

Every memory candidate should carry:

- confidence
- freshness
- scope
- provenance
- supersession status

The system already does some of this for temporal memory, but not consistently across all memory classes.

### 4. Active State Derived From Ongoing Signals

For “perfect” current-state behavior, the app should infer what is active now from:

- current chat
- current workspace document
- recent generated outputs
- recent user corrections
- explicit pause/complete language

This should be local and structured, not delegated to semantic memory alone.

### 5. Better Cross-Domain Contradiction Handling

Eventually the system should automatically detect and resolve contradictions such as:

- old deadline vs extended deadline
- old preferred draft vs newly preferred draft
- old project status vs paused/completed status

That requires a generalized supersession model, not only temporal supersession.

### 6. Memory Review And Repair Loops

Long-term reliability improves if the system can periodically:

- detect stale or duplicate clusters
- compress redundant memories
- flag low-confidence facts
- downgrade old working documents from active to historical

This should happen as maintenance, not on the synchronous chat path.

### 7. Retrieval Personalization Based On User Behavior

To become more self-updating, retrieval should learn from:

- which document versions the user returns to
- which outputs get refined repeatedly
- which files are opened but not reused
- which memory/profile facts the user corrects

That would let the system adapt salience automatically instead of relying only on static heuristics.

## Final Guardrail

If a future change cannot clearly answer:

- is this persona memory, task memory, document memory, or temporal state?
- which subsystem is authoritative for it?
- how does it supersede or expire?

then it is not ready to merge.
