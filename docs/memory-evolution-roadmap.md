# Memory Evolution Roadmap

This note captures the next-wave memory upgrades to revisit after the current working-documents refactor.

The goal is to move from “good multi-layer memory” toward a system that is closer to self-updating across persona, task, document, and time-sensitive domains.

## Key Upgrade Ideas

### 1. Stronger Domain Separation

Keep these memory classes distinct:

- persona memory
- task/workflow memory
- document memory
- temporal memory
- preference memory

Each one should have its own decay, supersession, and retrieval rules.

### 2. Event-Sourced Memory Updates

Prefer explicit memory events such as:

- deadline extended
- project paused
- project resumed
- preference updated
- document superseded

That is more reliable than inferring everything from snapshots.

### 3. Confidence And Freshness Everywhere

Every memory candidate should eventually carry:

- confidence
- freshness
- provenance
- scope
- supersession status

Temporal memory already does part of this. The rest of the system should catch up.

### 4. Better Active-State Inference

Current “what matters now” should come from:

- current chat
- active workspace document
- recent generated outputs
- recent user corrections
- explicit pause/complete language

This needs to stay local and structured rather than relying only on semantic memory.

### 5. Cross-Domain Contradiction Handling

The system should eventually resolve contradictions such as:

- old deadline vs extended deadline
- old preferred draft vs newer preferred draft
- old active project vs paused or completed project

That requires generalized supersession, not just time-aware decay.

### 6. Maintenance And Repair Loops

Long-term memory quality improves if background maintenance can:

- dedupe memories
- downgrade stale items
- compress redundant clusters
- identify low-confidence facts
- move old working documents from active to historical

### 7. Retrieval That Learns From User Behavior

The system should eventually adapt based on:

- which versions the user reopens
- which outputs keep being refined
- which memories the user corrects
- which artifacts are ignored

That would make salience more self-updating over time.

## Guardrail

Any future memory feature should answer three things clearly:

1. What memory domain does this belong to?
2. Which subsystem is authoritative for it?
3. How does it expire, supersede, or get repaired?

If those answers are not clear, the feature should not be added yet.

## Implementation Waves

The current codebase already implements part of the temporal-memory upgrade:

- temporal metadata for relative constraints
- freshness-aware overview/prompt filtering
- historical phrasing for expired temporal memories
- local temporal truth overriding stale Honcho overview text
- partial splitting of `situational_context`

The remaining work should land in deliberate waves so the system gets smarter without creating another overlapping memory stack.

### Wave 1: Finish Structured Domain Boundaries

Goal:

- make persona, task, document, temporal, and preference memory authorities explicit in code

Changes:

- add a small authority map doc block to the public memory/task-state surfaces
- finish routing document-origin material away from persona paths everywhere, not just current persona clustering
- separate active-constraint selection from broad persona summarization on the read path
- make preference supersession metadata consistent with temporal supersession metadata

Primary files:

- `src/lib/server/services/persona-memory.ts`
- `src/lib/server/services/memory.ts`
- `src/lib/server/services/task-state.ts`
- `src/lib/server/services/honcho.ts`
- `src/lib/types.ts`

Acceptance:

- no document-origin content appears in persona summaries unless explicitly transformed into user-preference or user-profile facts
- active constraints can be rendered independently from broader persona memory
- one source-of-truth note exists for each memory domain

Verification:

- persona-memory tests for domain filtering
- memory overview tests for separate active-constraint rendering
- Honcho adapter tests for attribution/origin filtering

### Wave 2: Event-Sourced Memory Updates

Goal:

- move important state changes from “best-effort inferred snapshot” toward explicit memory events

Changes:

- add normalized event shapes such as:
  - `deadline_set`
  - `deadline_extended`
  - `deadline_completed`
  - `project_started`
  - `project_paused`
  - `project_resumed`
  - `preference_updated`
  - `document_superseded`
- derive current state from the newest relevant event plus supporting memory records
- thread event creation through existing turn finalization or maintenance paths rather than adding a parallel queue

Primary files:

- `src/lib/server/services/persona-memory.ts`
- `src/lib/server/services/memory-maintenance.ts`
- `src/lib/server/services/task-state/continuity.ts`
- `src/lib/server/services/chat-turn/finalize.ts`
- `src/lib/server/db/schema.ts`

Acceptance:

- a newer deadline extension displaces older deadline truth deterministically
- project pause/resume language updates active-state without waiting for a full dream sweep
- document supersession can be represented as an event as well as artifact metadata

Verification:

- temporal supersession regression tests
- task continuity tests for pause/resume
- schema/backfill tests if event rows are persisted

### Wave 3: Cross-Domain Contradiction Handling

Goal:

- generalize supersession beyond temporal constraints

Current progress:

- task continuity now consumes the newest project state event on the read path
- explicit user pause/resume phrasing can update project continuity immediately instead of waiting for passive age-based decay
- high-confidence persona facts such as current location/current role now supersede older contradictory facts deterministically and emit `persona_fact_updated` history
- task-state artifact preference writes now collapse contradictory pinned/excluded versions within the same working-document family

Changes:

- add contradiction resolution rules for:
  - preferences
  - active projects
  - preferred document versions
  - role/location/availability-like situational facts
- unify “superseded by” metadata semantics across persona and task continuity
- teach overview generation to suppress contradicted items without deleting them

Primary files:

- `src/lib/server/services/persona-memory.ts`
- `src/lib/server/services/memory.ts`
- `src/lib/server/services/task-state/continuity.ts`
- `src/lib/server/services/document-resolution.ts`

Acceptance:

- older contradicted items remain auditable but no longer appear as active truth
- version preferences and project state follow the newest supported signal

Verification:

- overview tests for contradicted-memory suppression
- resolver tests for preferred-version supersession
- continuity tests for project-state replacement

### Wave 4: Better Active-State Inference

Goal:

- make “what matters now” come from structured live signals, not only semantic similarity

Changes:

- add an `active_state` assembly layer that combines:
  - current chat intent
  - active workspace document
  - most recently refined document family
  - recent generated outputs
  - recent user corrections
  - explicit pause/complete language
- expose that layer to prompt construction without duplicating working-set heuristics
- ensure it can degrade cleanly when a signal is absent

Primary files:

- `src/lib/server/services/working-set.ts`
- `src/lib/server/services/knowledge/context.ts`
- `src/lib/server/services/document-resolution.ts`
- `src/lib/server/services/task-state.ts`
- `src/routes/(app)/chat/[conversationId]/+page.svelte`

Acceptance:

- prompt context reflects the active document/task even when semantic match is weak
- old active topics fall back naturally when newer live signals win

Verification:

- working-set ranking tests
- document-resolution tests
- end-to-end chat refinement tests around active workspace focus

Current progress:

- explicit user-correction/refinement phrasing now feeds working-set scoring and generated-document prompt eligibility as a structured live signal rather than only relying on semantic match
- active workspace focus, current generated-document selection, and correction signals now flow through one shared active-state helper instead of being recomputed separately in working-set refresh and task evidence selection
- the most recently refined working-document family now stays active through that shared helper as well, so generic follow-up turns can keep refining the right family without falling back to whichever unrelated generated output happened to be newest
- explicit move-on / completion phrasing now suppresses stale document carryover through that same helper, and Honcho prompt assembly uses the shared active-state path too instead of keeping a separate document-focus heuristic
- prompt-time working-set selection now recomputes live document carryover from that helper as well, so stale reason codes persisted from the previous turn do not keep an old generated document alive by accident before the next working-set refresh runs
- retrieval-side generated-document ordering now consumes the same family/reset signals, so a recently refined family can stay active on generic follow-up turns without also pulling unrelated generated-document families unless the query explicitly matches them
- transport-path regression coverage now locks that active workspace document signal through the browser streaming client and chat stream route as well, so the focused document id is still present when Langflow context assembly runs

### Wave 5: Maintenance And Repair Loops

Goal:

- keep memory quality stable over time without manual cleanup

Changes:

- add periodic repair actions that:
  - dedupe clusters
  - compress low-value overlap
  - downgrade stale but unsuperseded items
  - mark dormant document families as historical
  - identify low-confidence memories for reduced salience
- keep repairs idempotent and serialized through existing maintenance scheduling

Primary files:

- `src/lib/server/services/memory-maintenance.ts`
- `src/lib/server/services/persona-memory.ts`
- `src/lib/server/services/task-state/continuity.ts`
- `src/lib/server/services/chat-files.ts`

Acceptance:

- repeated maintenance runs do not duplicate or oscillate memory state
- dormant/stale items shrink without deleting useful history

Verification:

- maintenance idempotency tests
- duplicate-cluster cleanup tests
- generated-document historical downgrade tests

Current progress:

- per-user memory maintenance now also reruns generated-output retrieval-class repair through the existing `evidence-family.ts` duplicate classifier, so low-value duplicate drafts stay compressed out of broad retrieval without adding a second repair subsystem
- that same maintenance path now also marks dormant generated-document families as `historical` in the shared working-document metadata contract, and that lifecycle state now flows through logical document mapping plus the shared workspace/library UI instead of living in a side cache
- persona-cluster refresh now also reapplies deterministic salience repair through the existing cluster pipeline, so weakly supported dormant memories and low-confidence preferences lose prominence without being deleted or moved into a second maintenance-only store

### Wave 6: Retrieval That Learns From Behavior

Goal:

- let salience update based on how the user actually works

Changes:

- track signals such as:
  - reopened document versions
  - repeated refinements on the same family
  - user corrections to memory statements
  - ignored suggested artifacts
- convert those signals into bounded salience adjustments rather than opaque permanent boosts
- use those adjustments in working-set and memory overview ranking

Primary files:

- `src/lib/server/services/working-set.ts`
- `src/lib/server/services/document-resolution.ts`
- `src/lib/server/services/memory.ts`
- `src/lib/server/db/schema.ts`

Acceptance:

- frequently reopened/refined documents rise in relevance
- corrected memories become less assertive until reaffirmed
- ignored stale items gradually lose rank

Verification:

Current progress:

- focused document turns now emit `document_refined` memory events keyed by working-document family when available, so repeated refinement behavior is recorded deterministically from the server-side turn pipeline instead of depending on browser-only telemetry
- generated-document retrieval ordering now consumes recent `document_refined` counts as a small bounded boost, which helps repeatedly refined families stay relevant on generic follow-up turns without replacing explicit query/document matching
- working-set ranking now consumes those same recent `document_refined` counts as a smaller-than-focus, smaller-than-correction boost, so retrieval and prompt-side carryover share the same bounded behavior signal instead of learning from separate heuristics

- ranking tests with behavior-signal fixtures
- correction/salience regression tests
- migration tests if new interaction-signal tables are added

## Delivery Order

Recommended implementation order:

1. Wave 1
2. Wave 2
3. Wave 3
4. Wave 4
5. Wave 5
6. Wave 6

This order keeps the foundational authority and event model in place before behavior learning and long-tail maintenance are added.
