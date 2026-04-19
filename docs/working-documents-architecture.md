# Working Documents Architecture

This document defines the concrete upgrade path from the current mix of chat-generated files, chat attachments, knowledge artifacts, and preview modals into one coherent **working documents** system.

It is grounded in the current codebase, not a greenfield rewrite.

For the execution order, file ownership, migrations, and verification gates, see [Working Documents Implementation Plan](./working-documents-implementation-plan.md).

## Goals

1. A user should be able to iteratively work on an AI-generated or user-uploaded document while still seeing the rest of the chat.
2. The AI should remember working documents created in chat.
3. The AI should be able to distinguish multiple documents, versions, and refinements across chats.
4. Document continuity should be artifact-backed, not tied to any manual organization action.
5. The implementation must consolidate existing systems rather than creating a second preview, memory, or persistence path.

## Current Foundation

The repo already has most of the substrate required for this:

- Chat-generated files are stored in `chat_generated_files` and mirrored into `generated_output` artifacts in [`src/lib/server/services/chat-files.ts`](../src/lib/server/services/chat-files.ts).
- Generated outputs already sync to Honcho through `syncArtifactToHoncho(...)`.
- Generated outputs already participate in working-set and retrieval logic through:
  - [`src/lib/server/services/working-set.ts`](../src/lib/server/services/working-set.ts)
  - [`src/lib/server/services/knowledge/context.ts`](../src/lib/server/services/knowledge/context.ts)
- The rich preview stack already exists in [`src/lib/components/knowledge/FilePreview.svelte`](../src/lib/components/knowledge/FilePreview.svelte).
- Chat-generated files already use that previewer through [`src/lib/components/chat/GeneratedFile.svelte`](../src/lib/components/chat/GeneratedFile.svelte) and `/api/chat/files/[id]/preview`.

That means the right move is **consolidation**, not a new document platform.

## Product Model

The user-facing concept should be:

- `Document`

Documents can originate from:

- AI-generated chat output
- uploaded attachment
- imported or uploaded library file

Documents can exist in states such as:

- `working`
- `saved`
- `archived`

Documents can have:

- one active version
- a version lineage
- chat references
- AI-visible summary/content memory

The library remains a document surface, not a separate persistence concept.

## Technical Model

### 1. Artifact Backbone Stays Primary

Do not replace the artifact system. Reuse it as the canonical document substrate:

- `source_document`
- `normalized_document`
- `generated_output`
- `work_capsule`

The working-documents refactor should continue to build on:

- artifact rows
- artifact links
- working-set scoring
- Honcho sync

### 2. Introduce Document Workspace State

The chat route becomes the owner of the currently open working document(s):

- default closed
- opens when the user clicks a generated file or attachment
- desktop: right-side pane
- mobile: full-screen workspace layer

The route-owned state is the first authoritative signal for “which document is active right now”.

Initial route state:

- `workspaceOpen`
- `workspaceDocuments`
- `activeWorkspaceDocumentId`

Current first implementation slice:

- generated chat files open into the workspace
- the workspace reuses the existing `FilePreview` renderer in embedded mode

Later slices should open library documents and uploaded attachments through the same workspace path.

### 3. One Preview System

There must remain exactly one rich file renderer:

- [`src/lib/components/knowledge/FilePreview.svelte`](../src/lib/components/knowledge/FilePreview.svelte)

This component now supports two shells:

- `modal`
- `embedded`

Do not introduce:

- a second chat-only document viewer
- a second library-only viewer
- a second generated-file viewer

### 4. Document Identity And Versioning

The current generated-file continuity is useful, but still too filename-based.

Target durable identity model:

- `documentFamilyId`
- `documentRole`
- `documentLabel`
- `versionNumber`
- `supersedesArtifactId`
- `originConversationId`
- `originAssistantMessageId`
- `sourceChatFileId`

The important rule:

- filename changes must not break lineage

This should be implemented by extending artifact metadata first, and only moving to dedicated DB tables if the metadata-only approach becomes too opaque or query-heavy.

Recommended eventual tables:

- `generated_document_families`
- `generated_document_versions`

Do not introduce those tables until the metadata contract and resolver rules are stable.

### 5. Document Reference Resolver

The AI needs a structured resolver, not just more memory text.

Add a resolver that maps references like:

- “update the PDF”
- “continue the proposal”
- “compare the last two versions”
- “use the slides from yesterday”

to a concrete document family/version.

Resolver priority:

1. currently open workspace document
2. explicitly named document
3. latest matching document in this conversation
4. best cross-chat match from durable artifacts + Honcho narrative context

This resolver should plug into existing context assembly, not create a parallel prompt-memory path.

Expected future home:

- a dedicated server service near:
  - [`src/lib/server/services/knowledge/context.ts`](../src/lib/server/services/knowledge/context.ts)
  - [`src/lib/server/services/task-state.ts`](../src/lib/server/services/task-state.ts)

### 6. Honcho’s Role

Honcho should remember narrative continuity, content summaries, and user preferences about document revisions.

Honcho should **not** be the authority for document identity.

Authority split:

- local artifact + lineage metadata = document identity
- Honcho = long-range semantic memory and narrative recall

That means unsaved generated files should still be synced into AI-visible memory, which is already partially true today through `generated_output` artifacts.

## Rollout Plan

### Phase 1: Workspace Foundation

Goal:

- give chat a default-closed working-document pane without introducing a new renderer

Deliverables:

- route-owned workspace state in [`src/routes/(app)/chat/[conversationId]/+page.svelte`](../src/routes/(app)/chat/[conversationId]/+page.svelte)
- new workspace component in [`src/lib/components/chat/DocumentWorkspace.svelte`](../src/lib/components/chat/DocumentWorkspace.svelte)
- `FilePreview` embedded mode
- generated files open the workspace instead of relying only on per-row modal state

Outcome:

- user can keep chat visible while reviewing a generated document on desktop
- mobile already follows the same concept via a full-screen workspace layer

### Phase 2: Fold Attachments And Library Docs Into The Same Workspace

Goal:

- remove separate “attachment viewer” mental models

Deliverables:

- route-level document-opening helpers for:
  - generated files
  - chat attachments
  - library documents
- replace attachment-only modal openings with workspace openings across chat, knowledge, and search surfaces

Outcome:

- one document-opening behavior across chat and knowledge surfaces

### Phase 3: Durable Document Identity

Goal:

- stop using filename-only version continuity for generated documents

Deliverables:

- artifact metadata schema for document families and explicit version lineage
- migration from “recent versions by filename” to “recent versions by family”
- consistent `supersedes` chains for refinements

Outcome:

- renames do not break document memory
- cross-chat follow-up is more reliable

### Phase 4: Resolver And Prompt Integration

Goal:

- make the AI reliably understand which document the user is referring to

Deliverables:

- new document reference resolver service
- prompt-context integration that elevates:
  - active workspace document
  - latest family version
  - recent family timeline
- explicit resolver diagnostics in context debug output

Outcome:

- the AI can continue the right document without relying on ambiguous filename matches

### Phase 5: Version Timeline And Compare Mode

Goal:

- make revision work visible and inspectable for the user

Deliverables:

- version timeline in the workspace
- jump-to-source-message support
- side-by-side comparison for text-like documents first

Outcome:

- users can reason about what changed between drafts without leaving chat

## Guardrails

These rules are mandatory for future implementation:

- No second preview stack
- No second persistence model for working documents outside the artifact backbone unless the family/version layer proves necessary
- No second AI-memory subsystem parallel to artifacts + Honcho
- No library-only document behavior that bypasses the workspace
- No desktop-only concept that changes the product model on mobile

## Current Implementation Status

Implemented now:

- phase 1 workspace foundation
- generated-file opening routed through the chat page’s workspace state
- shared `FilePreview` renderer supports embedded workspace mode

Not implemented yet:

- workspace opening for attachments and library docs
- durable family/version identity beyond current generated-output metadata
- document reference resolver
- version timeline / compare mode

## Verification Strategy

Every phase should include:

- targeted Svelte component tests for open/select/close behavior
- route tests where SSE or generated-file behavior changes
- build verification

Minimum regression checks for the current phase:

- generated-file row still downloads and saves correctly
- generated-file click opens workspace instead of breaking preview access
- workspace remains closed by default
- no parallel modal preview path remains for supported document opens
