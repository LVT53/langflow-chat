# Deep Research Stabilization Slices

These are local `$to-issues` slices for making Deep Research stable, useful under partial evidence, and resilient to poisoned planning. They are not published tracker issues.

The parent decision record is [ADR 0014](./adr/0014-deep-research-three-evidence-outcomes.md). Domain vocabulary lives in [CONTEXT.md](../CONTEXT.md), especially **Limited Research Report**, **Plan Health Check**, **Research Plan Revision Needed**, and **Plan Normalization Note**.

Each slice is intended to be independently grabbable, verifiable, and testable. A slice should cut through every integration layer needed for its behavior rather than leaving a backend-only or UI-only half-state.

## Milestones

**Milestone 1: Stop Poisoned Plans**

Make abstract decision prompts produce sane Research Plans before source-heavy work starts.

Slices: DRSS-01.

**Milestone 2: Recover From Poisoned Plans**

Catch already-approved or slipped-through poisoned plans after source review and recover with a corrected draft.

Slices: DRSS-02 through DRSS-04.

**Milestone 3: Produce Useful Partial Reports**

Add Limited Research Report as the middle outcome between normal reports and evidence limitation memos.

Slices: DRSS-05 through DRSS-06.

**Milestone 4: Prove And Polish**

Add regression coverage and run a reviewer pass over bugs, ambiguity, scope, and UX rough edges.

Slices: DRSS-07 through DRSS-08.

## Slices

### DRSS-01. Stabilize Abstract Decision Research Planning

**Type:** AFK

**Category:** Planning

**Blocked by:** None - can start immediately

**User stories covered:** As a user, when I ask Deep Research to compare unnamed architecture patterns and recommend a design, the Research Plan should frame the task as a recommendation with candidate discovery rather than inventing fake compared entities.

**What to build:** Make Research Plan generation and normalization deterministic enough that abstract decision prompts produce sane Report Intent, candidate-option discovery, domain-appropriate key questions, and a compact Plan Normalization Note. Preserve strict Comparison Report Shape for prompts with at least two named, source-searchable Compared Entities.

**Acceptance criteria**

- [ ] The architecture baseline prompt drafts a recommendation-oriented Research Plan rather than a strict comparison plan.
- [ ] The baseline plan does not persist fake Compared Entities such as "at least three architecture patterns", "identify failure modes", or "recommend one design".
- [ ] The baseline plan includes a Plan Normalization Note explaining that architecture patterns will be discovered during research instead of pre-filled as compared entities.
- [ ] The baseline key questions cover architecture patterns, failure modes, evidence/citation reliability, document inspection, security/compliance, implementation burden, and roadmap.
- [ ] The baseline key questions do not mention product or vehicle-only terms such as trim differences, dealer listings, manufacturers, rider use cases, or model years.
- [ ] Generic comparison fallback questions are domain-neutral unless topic detection justifies product, vehicle, procurement, legal, software, health, finance, or literature-review variants.
- [ ] Explicit named approach comparisons, such as RAG versus workflow graphs versus multi-agent research systems, can still use Comparison Report Shape.
- [ ] Existing named product or vehicle comparison behavior remains covered and passing.
- [ ] Tests cover both model-drafted and fallback-planned cases so syntactically valid but semantically invalid planner output is sanitized locally.

### DRSS-02. Detect Poisoned Plans Before Evidence Limitation

**Type:** AFK

**Category:** Quality Gate

**Blocked by:** DRSS-01

**User stories covered:** As a user, if Deep Research reviewed many sources but accepted none because the plan was malformed, I should be told the plan needs revision instead of being told the topic lacks evidence.

**What to build:** Add a minimal Plan Health Check that runs before an Evidence Limitation Memo when a Deep Research Job has a meaningful reviewed-source count and zero topic-relevant accepted sources. When the check detects fake entities, imperative clauses as entities, domain-mismatched key questions, or poisoned search framing, complete the job as Research Plan Revision Needed with a corrected Research Plan draft.

**Acceptance criteria**

- [ ] A high-reviewed-source, zero-topic-relevant run triggers Plan Health Check before memo generation.
- [ ] Plan Health Check detects obvious poison signals from the architecture baseline failure mode.
- [ ] A poisoned plan completes as Research Plan Revision Needed, not Evidence Limitation Memo and not failed.
- [ ] Research Plan Revision Needed is stored as an operationally completed job with a distinct stage or outcome.
- [ ] Research Plan Revision Needed creates no normal report artifact and no Report Boundary.
- [ ] The Activity Timeline records a user-facing explanation of the plan-health failure.
- [ ] A corrected Research Plan draft is created automatically when the safe correction is clear.
- [ ] If Plan Health Check passes and there is still no useful topic-relevant evidence, the existing Evidence Limitation Memo path remains available.
- [ ] Tests cover the exact high-reviewed, zero-topic-relevant, fake-entity architecture failure.

### DRSS-03. Show Plan Revision Recovery In The Research Card

**Type:** AFK

**Category:** UX

**Blocked by:** DRSS-02

**User stories covered:** As a user, when Deep Research realizes its approved plan was bad, I should see a clear recovery state in the same Research Card and be able to review the corrected plan without a new modal or wizard.

**What to build:** Present Research Plan Revision Needed inside the existing Research Card and Research Plan approval surface. The card should show that the plan needs revision, briefly explain the plan-health reason, and expose the corrected draft through approve, edit, and cancel controls.

**Acceptance criteria**

- [ ] Research Card severity for Research Plan Revision Needed is needs attention, not failed and not insufficient evidence.
- [ ] The card headline and body explain that the plan needs revision in user-facing terms.
- [ ] The corrected draft appears in the existing plan approval UI.
- [ ] The user can approve, edit, or cancel the corrected draft.
- [ ] The UI does not introduce a new modal, wizard, or separate recovery surface.
- [ ] English and Hungarian text is localized for the new state, action labels, empty/error states, and accessibility strings.
- [ ] Component or route tests cover the card state and corrected-plan controls.

### DRSS-04. Continue The Same Job From A Corrected Plan

**Type:** AFK

**Category:** Runtime

**Blocked by:** DRSS-02 and DRSS-03

**User stories covered:** As a user, approving the corrected plan should recover the same Deep Research Job instead of making me manually start over, while the poisoned attempt should not contaminate the corrected research.

**What to build:** Let approval of the corrected Research Plan continue the same Deep Research Job with a new plan version and clean execution state. Preserve the poisoned run's timeline, source ledger, and usage as diagnostic history, but prevent poisoned sources, tasks, coverage gaps, and topic-relevance counts from satisfying or blocking the corrected plan.

**Acceptance criteria**

- [ ] Approving the corrected draft reuses the same job and card.
- [ ] A new approved plan version is persisted for the corrected plan.
- [ ] Source-heavy work starts fresh from the corrected plan.
- [ ] Poisoned-run rejected sources, coverage gaps, research tasks, and topic-relevance counts do not satisfy or block corrected-plan coverage.
- [ ] Poisoned-run timeline, source ledger, and usage remain inspectable as diagnostic history.
- [ ] The job remains unsealed until the corrected run produces a Research Report or Limited Research Report.
- [ ] Retry/resume behavior remains idempotent across corrected-plan approval.
- [ ] Tests cover approving, editing, cancelling, and resuming corrected-plan recovery.

### DRSS-05. Add Limited Research Report Eligibility

**Type:** AFK

**Category:** Report Gate

**Blocked by:** DRSS-01

**User stories covered:** As a user, if Deep Research has some useful cited synthesis but not enough evidence to answer the full approved scope, I should get a shorter precise report rather than a memo that feels like total failure.

**What to build:** Add Limited Research Report as the middle report outcome. It should publish only when there is at least one useful, citation-supported Central Synthesis Claim, a narrower answerable version of the approved goal, and explicit Report Limitations for unsupported parts.

**Acceptance criteria**

- [ ] Partial but useful claim-grounded evidence can publish a Limited Research Report instead of Evidence Limitation Memo.
- [ ] Limited Research Report requires at least one useful, citation-supported Central Synthesis Claim.
- [ ] Limited Research Report narrows or omits unsupported sections rather than preserving the full original report shape.
- [ ] Missing or unsupported parts become explicit Report Limitations.
- [ ] Runs with no useful topic-relevant synthesized claims still publish Evidence Limitation Memo.
- [ ] Limited Research Report goes through Citation Audit before publication.
- [ ] Limited Research Report creates a Report Boundary.
- [ ] Metadata distinguishes Research Report, Limited Research Report, Evidence Limitation Memo, and Research Plan Revision Needed.
- [ ] Tests cover useful partial evidence, no-useful-claim memo fallback, and unsupported-claim removal.

### DRSS-06. Render And Present Limited Research Reports

**Type:** AFK

**Category:** Report UX

**Blocked by:** DRSS-05

**User stories covered:** As a user, a Limited Research Report should read like a useful Decision Brief, not like an error, a source dump, or a normal report pretending to be complete.

**What to build:** Render Limited Research Reports with a clear label, answer-first summary, supported findings, narrowed scope, visible limitations, citations, and source list. Present the outcome in the Research Card and report viewer as completed but limited.

**Acceptance criteria**

- [ ] Limited Research Report has distinct labeling in the Research Card and report viewer.
- [ ] The report leads with the best supported answer and clearly states the narrowed scope.
- [ ] Unsupported requested sections are omitted, downgraded, or represented as Report Limitations.
- [ ] Limitations are visible near the conclusion and in the provenance/detail area.
- [ ] Citations and source ledger snapshot remain durable.
- [ ] Research Card severity maps Limited Research Report to completed.
- [ ] English and Hungarian labels, headings, actions, empty states, and accessibility strings are localized.
- [ ] Tests cover Markdown rendering, card payloads, route payloads, and report viewer behavior.

### DRSS-07. Add Stabilization Evaluation Fixtures

**Type:** AFK

**Category:** Evaluation

**Blocked by:** DRSS-01 through DRSS-06

**User stories covered:** As a maintainer, I need repeatable fixtures that catch planner pollution, poisoned-plan recovery, and partial-report behavior before we raise budgets or trust live web runs.

**What to build:** Add Golden Research Fixtures and evaluation checks for the new stabilization behaviors: abstract architecture recommendation planning, named comparison preservation, high-reviewed zero-topic Plan Health Check recovery, same-job corrected-plan rerun, and Limited Research Report publication.

**Acceptance criteria**

- [ ] The architecture baseline is a golden fixture with expected recommendation intent, no fake Compared Entities, and no product/vehicle question leakage.
- [ ] A named approach comparison fixture proves strict Comparison Report Shape remains available.
- [ ] A named product or vehicle comparison fixture proves product-specific fallback questions remain available only where appropriate.
- [ ] A high-reviewed, zero-topic-relevant poisoned-plan fixture completes as Research Plan Revision Needed.
- [ ] A corrected-plan approval fixture proves same-job clean execution state.
- [ ] A partial-evidence fixture publishes Limited Research Report.
- [ ] A no-useful-claim fixture still publishes Evidence Limitation Memo.
- [ ] The evaluation command or focused test path is documented so AFK agents can run it deterministically.

### DRSS-08. Reviewer And Polish Pass

**Type:** AFK

**Category:** Review

**Blocked by:** DRSS-01 through DRSS-07

**User stories covered:** As the product owner, I want one final pass that actively looks for bugs, ambiguity, scope creep, inconsistent language, and UX gaps before we treat the stabilization work as complete.

**What to build:** Perform a reviewer and polish pass over the completed stabilization work. Review code paths, tests, docs, copy, card states, report outcomes, edge cases, and scope boundaries. Fix small issues directly where safe, and write down larger follow-up issues instead of silently expanding the slice.

**Acceptance criteria**

- [ ] Review the full outcome state machine for Research Report, Limited Research Report, Evidence Limitation Memo, and Research Plan Revision Needed.
- [ ] Review planner normalization for false positives, false negatives, and regressions on named comparisons.
- [ ] Review Plan Health Check thresholds and user-facing explanations for ambiguity or over-triggering.
- [ ] Review same-job corrected-plan recovery for resume/idempotency issues.
- [ ] Review Limited Research Report rendering for unsupported claims, hidden limitations, and source-ledger consistency.
- [ ] Review English and Hungarian copy for clarity, consistency, and non-debug wording.
- [ ] Review tests for gaps, brittle assertions, missing edge cases, and fixture realism.
- [ ] Run the focused stabilization tests plus the broader relevant Deep Research test suite.
- [ ] Fix small polish issues found during review without broadening scope.
- [ ] Record any larger bugs, ambiguities, scope issues, or follow-up work in a local review note or follow-up slice list.
