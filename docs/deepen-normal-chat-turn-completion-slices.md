# Deepen Normal Chat Turn Completion Slices

These are local `$to-issues` slices for deepening Normal Chat Turn Completion from the architecture review. They are not published tracker issues.

The review's top recommendation is to move the durable completion ordering out of the `/send` route adapter and into the deeper chat-turn service boundary, while reusing the same completion core from stream completion without changing SSE behavior, stop/reconnect behavior, or file-production linkage.

The relevant review evidence points at `src/routes/api/chat/send/+server.ts`, `src/lib/server/services/chat-turn/stream-completion.ts`, `src/lib/server/services/chat-turn/finalize.ts`, and `src/lib/server/services/chat-turn/normalizer.ts`. Nearby coverage already exists in `stream-completion.test.ts`, `send/send.test.ts`, `normalizer.test.ts`, and `finalize.test.ts`.

Each slice below is a vertical tracer bullet: it should cut through the route adapter, shared service boundary, persistence/evidence sequencing, and tests needed to prove the behavior end to end.

## Evidence And Constraints

- Review HTML source: `/private/var/folders/6c/llmb9__97ngcxtc26hvg8jzh0000gn/T/architecture-review-20260529-134900.html`
- Top recommendation: deepen Normal Chat Turn Completion by moving durable completion ordering out of the `/send` route adapter and into the deeper chat-turn service boundary, while reusing the same completion core from stream completion without changing SSE behavior, stop/reconnect behavior, or file-production linkage.
- The review's `in-process` pill is a same-process/internal refactor label, not a status signal that the work has already started or is only partially done.
- Context7 evidence: SvelteKit `+server.ts` handlers are route modules that return `Response`; Vitest supports module mocks and spies for focused service-extraction tests; Drizzle supports transaction callbacks for grouping durable persistence work.
- Subagent findings: `/send` still carries inline durable completion sequencing; `finalize.ts` is the deep boundary for durable post-turn fan-out; stream completion must keep SSE, file-production, stop, and reconnect concerns stable while the shared completion shape deepens.

## Milestones

**Milestone 1: Lock The Current Contract**

Capture the non-stream completion behavior in focused regression tests before moving code.

Slices: NCTC-01.

**Milestone 2: Extract The Shared Durable Core**

Move the durable `/send` completion sequence into the shared service boundary while preserving the exact `/send` response and persistence path.

Slices: NCTC-02 through NCTC-03.

**Milestone 3: Reuse The Core From Stream Completion**

Have stream completion call the shared durable core without altering SSE end payloads, reconnect semantics, or file-production job linking.

Slices: NCTC-04 through NCTC-05.

**Milestone 4: Prove The Boundary And Close It Out**

Exercise retry, stop, disconnect, file-producing turns, and the final response assembly contract after the refactor.

Slices: NCTC-06 through NCTC-07.

## Slices

### NCTC-01. Capture The Normal Chat Completion Contract

**Type:** AFK

**Category:** Regression Test

**Blocked by:** None - can start immediately

**User stories covered:** As a maintainer, I need the current normal chat completion contract pinned down before refactoring so that send and stream keep behaving the same for completed turns.

**What to build:** Add focused regression coverage around the existing non-stream completion path and the stream completion path that proves the current ordering, visible assistant output normalization, assistant metadata persistence, and post-turn side effects. Treat the review's current behavior as the baseline, not the target architecture.

**Acceptance criteria**

- [ ] Tests pin the current `/send` completion ordering for message persistence, Skill Control operations, assistant metadata, evidence handling, and post-turn fan-out.
- [ ] Tests pin the current stream completion end-of-turn behavior closely enough to guard against accidental SSE or payload drift during the refactor.
- [ ] Tests cover the visible assistant-output normalization contract so the same visible text shape is asserted in both paths.
- [ ] Tests cover at least one file-producing turn so the existing completion contract is not narrowed to text-only responses.
- [ ] The regression coverage is narrow and focused on the current boundary, not a broad rewrite of unrelated chat behavior.
- [ ] The coverage includes the current completion response contract for visible assistant output and persisted assistant metadata.

**Verification**

- [ ] Run the touched completion tests only if they are cheap enough.
- [ ] Inspect the new assertions for obvious mismatch with the current route/service split.

### NCTC-02. Extract The Shared Durable Send Completion Core

**Type:** AFK

**Category:** Service Refactor

**Blocked by:** NCTC-01

**User stories covered:** As a user, when I send a normal chat turn, the exact `/send` completion path should keep producing the same response and persistence outcome while the durable sequencing moves into the shared service boundary.

**What to build:** Extract the durable `/send` completion sequence into a shared service core. Preserve the exact route-visible completion path, including how the assistant turn is persisted and how the route response is shaped, while making the route adapter a thin transport layer.

**Acceptance criteria**

- [ ] The durable completion ordering no longer lives only inside `/send`.
- [ ] The shared core owns the normal completion sequence that `/send` invokes.
- [ ] The `/send` response and persistence path remain exact enough that the route still behaves the same to callers.
- [ ] The refactor does not change the assistant-visible output contract.
- [ ] The shared core remains compatible with finalize and normalizer boundaries.

**Verification**

- [ ] The existing `/send` tests continue to pass against the same behavior.
- [ ] The shared core has direct coverage for its sequencing contract.
- [ ] The extracted core can be tested with focused service mocks or spies instead of full route integration.

### NCTC-03. Return A Completion Result Contract For Send Metadata

**Type:** AFK

**Category:** Service Contract

**Blocked by:** NCTC-02

**User stories covered:** As a user, the assistant completion response should still include the right context sources, working set, task, evidence, Honcho, and assistant metadata signals when a normal chat turn completes.

**What to build:** Shape the shared completion result so `/send` can assemble context sources, working-set status, task state, evidence, Honcho metadata, and assistant-message metadata from one durable contract instead of stitching the response together in the route. Fold Skill Control operations and assistant metadata sequencing into that same completion result path so the response stays complete without duplicating logic.

**Acceptance criteria**

- [ ] `/send` receives a single completion result object that can drive contextSources, working set, task, evidence, Honcho, and assistant metadata assembly.
- [ ] Skill Control sequencing and assistant metadata persistence happen through the shared completion path, not route-local orchestration.
- [ ] Evidence persistence remains part of the same durable completion flow.
- [ ] Existing completion metadata remains visible through the same response contract.
- [ ] The route adapter no longer owns the durable ordering for these steps.

**Verification**

- [ ] Tests cover the completion result contract and the metadata fields it assembles.
- [ ] The `/send` path still behaves identically from the user's perspective.

### NCTC-04. Reuse The Shared Durable Core From Stream Completion

**Type:** AFK

**Category:** Stream Completion

**Blocked by:** NCTC-02 and NCTC-03

**User stories covered:** As a user watching a streaming turn, the stream should keep its existing SSE end payloads, reconnect behavior, and completion handoff while reusing the shared durable core.

**What to build:** Reuse the shared durable completion core from stream completion while keeping all stream-specific behavior stable. Preserve SSE payloads, reconnect behavior, and file-production handoff, and keep the stream-specific completion concerns in the stream boundary rather than reintroducing route-local sequencing.

**Acceptance criteria**

- [ ] Stream completion reuses the shared durable core instead of duplicating durable sequencing.
- [ ] SSE end payloads remain unchanged.
- [ ] Stop and reconnect behavior remain unchanged.
- [ ] File-production job linking still happens through the same stream completion contract.
- [ ] Stream-specific completion details stay in the stream-completion boundary, not the route.

**Verification**

- [ ] Stream completion tests continue to pass with no event-shape drift.
- [ ] Stop/reconnect coverage still proves the same user-visible behavior.

### NCTC-05. Preserve Generated-File Lifecycle While Sharing Completion Core

**Type:** AFK

**Category:** File Production

**Blocked by:** NCTC-04

**User stories covered:** As a user producing files from chat, generated-file job linking and lifecycle behavior should keep working while the shared completion core is introduced.

**What to build:** Keep the generated-file and file-production lifecycle stable while the shared completion core is adopted. This slice owns the part of the user-visible completion path that proves generated files still link to durable jobs, still appear in the expected completion result, and still survive the refactor without duplicating file-production logic in the route.

**Acceptance criteria**

- [ ] Generated-file job linking remains durable and associated with the completed turn.
- [ ] File-production lifecycle behavior remains unchanged from the user's perspective.
- [ ] The shared completion core does not split file-production behavior across route-local helpers.
- [ ] The completion result still exposes the expected file-related metadata for the caller.
- [ ] The behavior remains aligned with the existing stream completion handoff for file-producing turns.

**Verification**

- [ ] File-producing turn coverage still passes after the refactor.
- [ ] Generated-file assertions still match the pre-refactor behavior.

### NCTC-06. Prove Retry, Stop, And Passive Disconnect Still Hold

**Type:** AFK

**Category:** Boundary Proof

**Blocked by:** NCTC-03, NCTC-04, and NCTC-05

**User stories covered:** As a user, retries, stops, and passive disconnects should still complete or abort the same way after the completion refactor.

**What to build:** Add the final proof coverage that exercises the shared completion boundary across retry, stop, and passive disconnect scenarios. Confirm that the user-visible completion response still assembles context sources, working set, task, evidence, Honcho, and assistant metadata through the same shared completion result contract.

**Acceptance criteria**

- [ ] Retry behavior still produces the expected completion outcome.
- [ ] Stop and passive disconnect behavior still differ the same way they did before.
- [ ] Context sources, evidence, Honcho sync, working-set assembly, and assistant metadata still flow through the completion result contract.
- [ ] The final boundary is documented well enough that future changes know where durable completion belongs.

**Verification**

- [ ] Run the cheapest focused regression set that covers retry, stop, and passive disconnect turns.
- [ ] Inspect the final doc for any stale placeholders, broken headings, or mismatched dependency text.

### NCTC-07. Review And Document The Final Boundary

**Type:** AFK

**Category:** Review

**Blocked by:** NCTC-02 through NCTC-06

**User stories covered:** As a maintainer, I need the final chat-turn completion boundary documented and reviewed so future changes know where the durable work belongs.

**What to build:** Write down the final boundary after extraction: what lives in the route adapter, what lives in the shared durable core, what remains stream-specific, and how the completion result contract carries context sources, working set, task, evidence, Honcho, assistant metadata, and file-production details. Review the finished path for scope creep, duplicated logic, and any accidental drift from the review recommendation.

**Acceptance criteria**

- [ ] The final boundary is described in the doc without reintroducing horizontal layer tickets.
- [ ] The route adapter, shared durable core, stream-specific concerns, and completion result contract are clearly separated in the write-up.
- [ ] The doc explains where context sources, working-set signals, task state, evidence, Honcho, assistant metadata, and file-production details are assembled.
- [ ] The final boundary review notes any open follow-up work instead of silently broadening the slice.
- [ ] The doc still reads like a local issue draft rather than a published tracker issue.

**Verification**

- [ ] Read the revised document end to end for stale wording, broken dependency chains, or layer-style slices.
- [ ] Confirm the issue-style fields are present for every slice and that the new evidence section appears before milestones.
