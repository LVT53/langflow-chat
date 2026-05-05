# Deep Research Quality Slices

These are local `$to-issues` slices for the Deep Research reliability and readability work. They are not published tracker issues.

Each slice is intended to be independently grabbable, verifiable, and testable. A slice should cut through the layers it needs end-to-end: durable state, service behavior, API or worker behavior, UI state where applicable, and focused tests.

## Cleanup Passes Applied

1. **Order and dependencies normalized.** Foundational graph/state work now precedes report rendering, UX polish, depth expansion, and runtime policy.
2. **Oversized slices split.** The previous graph foundation, orchestrator loop, and report assembly work are now smaller slices for pass checkpoints, resume points, evidence notes, source quality, claims, coverage, audit, and report templates.
3. **Likely touched modules added.** Each slice names the current code areas most likely to change so implementers can start in the right boundary.
4. **Verification made explicit.** Each slice has focused verification expectations, including unit, service, component, route, or evaluation tests where useful.
5. **Slice categories added.** Slices are tagged as Foundation, Quality Gate, Report, UX, Localization, Evaluation, Budget, or Runtime so sequencing stays clear.

## Milestones

**Milestone 1: Stop Bad Reports**

Deliver enough gating and memo behavior that off-topic or weak source runs no longer publish normal Research Reports.

Slices: DRS-01 through DRS-03.

**Milestone 2: Durable Research Graph Foundation**

Persist research passes, coverage gaps, evidence notes, source quality signals, synthesis claims, evidence links, audit verdicts, limitations, and resume points.

Slices: DRS-04 through DRS-11.

**Milestone 3: Readable Claim-Grounded Reports**

Render reports from verified graph state using intent-specific templates, source ledger snapshots, and comparison-aware discovery.

Slices: DRS-12 through DRS-14.

**Milestone 4: Product Polish And Language**

Make the Research Card compact, animated, useful, and localized end-to-end.

Slices: DRS-15 and DRS-16.

**Milestone 5: Quality Harness, Budgets, Runtime**

Prove quality before raising quotas, then enforce depth budgets, concurrency, resume, and operational limits.

Slices: DRS-17 through DRS-19.

## Slices

### DRS-01. Select Report Intent During Planning

**Type:** AFK

**Category:** Foundation

**Blocked by:** None

**User stories covered:** As a user, I should see the intended report purpose before approving research so I can correct whether AlfyAI is preparing a comparison, recommendation, investigation, market scan, product scan, or limitation-focused run.

**What to build:** Add Report Intent to the Research Plan approval surface and carry the approved intent into discovery, coverage, claim typing, and report-template selection.

**Likely touched modules:** `src/lib/server/services/deep-research/planning.ts`, `src/lib/server/services/deep-research/llm-steps.ts`, `src/lib/types.ts`, `src/lib/components/chat/ResearchCard.svelte`, `src/lib/i18n.ts`, `src/lib/server/db/schema.ts`.

**Acceptance criteria**

- [ ] Research Plans persist Report Intent before approval.
- [ ] The Research Card shows Report Intent in the approval view.
- [ ] Plan Edit can revise Report Intent before source-heavy research starts.
- [ ] Discovery, coverage, and report assembly receive the approved Report Intent.
- [ ] Report assembly does not silently switch intent after research completes, except to produce an Evidence Limitation Memo when the approved intent cannot be supported.
- [ ] Tests cover plan drafting, plan editing, reload persistence, and English/Hungarian labels.

### DRS-02. Gate Reviewed Sources By Topic Relevance

**Type:** AFK

**Category:** Quality Gate

**Blocked by:** None

**User stories covered:** As a user, I should not receive a Research Report whose citations are unrelated to the approved Research Plan, even if source counts look high.

**What to build:** Make source review persist topic-relevance decisions and prevent off-topic Reviewed Sources from satisfying coverage, creating accepted Evidence Notes, or supporting Synthesis Claims.

**Likely touched modules:** `src/lib/server/services/deep-research/source-review.ts`, `src/lib/server/services/deep-research/sources.ts`, `src/lib/server/services/deep-research/coverage.ts`, `src/lib/server/services/deep-research/workflow.ts`, `src/lib/server/db/schema.ts`.

**Acceptance criteria**

- [ ] A high-scoring reviewer result for an off-topic source is persisted as rejected or off-topic.
- [ ] Off-topic Reviewed Sources cannot satisfy approved key-question coverage.
- [ ] Off-topic Reviewed Sources cannot produce accepted Evidence Notes or support Synthesis Claims.
- [ ] Rejected/off-topic source state remains inspectable in the workspace/source ledger.
- [ ] Hungarian topic matching works with diacritic-insensitive matching where applicable.
- [ ] Service tests cover the downloaded-report failure mode where high-count but unrelated sources would previously pass.

### DRS-03. Publish Evidence Limitation Memo Instead Of Bad Reports

**Type:** AFK

**Category:** Quality Gate

**Blocked by:** DRS-02

**User stories covered:** As a user, I should get a useful explanation when Deep Research cannot produce a credible report, not a polished but nonsensical report.

**What to build:** Complete weak-evidence runs with a durable Evidence Limitation Memo assembled from grounded Report Limitations and Research Workspace state instead of a Research Report artifact.

**Likely touched modules:** `src/lib/server/services/deep-research/workflow.ts`, `src/lib/server/services/deep-research/report-writer.ts`, `src/lib/server/services/deep-research/index.ts`, `src/lib/components/chat/ResearchCard.svelte`, `src/lib/i18n.ts`, `src/lib/types.ts`.

**Acceptance criteria**

- [ ] The memo output is not labeled as a Research Report.
- [ ] The memo shows reviewed scope, topic-relevant count, rejected/off-topic count, grounded limitation reasons, and next research direction.
- [ ] The memo uses the same grounded limitation/workspace state that failed-to-publish report assembly would use.
- [ ] The Research Card presents the memo as insufficient evidence, not as a failed job or system error.
- [ ] Memo Recovery Actions can represent revising the plan, adding sources, choosing deeper depth, or starting targeted follow-up research.
- [ ] Memo Recovery Actions do not silently publish a Research Report or auto-upgrade the user's selected depth.
- [ ] Tests cover service completion, card rendering, route payloads, and English/Hungarian memo labels.

### DRS-04. Persist Pass Checkpoints And Coverage Gaps

**Type:** AFK

**Category:** Foundation

**Blocked by:** DRS-02

**User stories covered:** As a user, Deep Research should work as an iterative research process with visible gap decisions, not a one-shot search that asks the report writer to rescue weak source notes.

**What to build:** Add first-class Research State Checkpoints and Coverage Gaps for each Iterative Research Pass, then update the workflow to write pass decisions before continuing, synthesizing, memoing, or publishing.

**Likely touched modules:** `src/lib/server/db/schema.ts`, `src/lib/server/services/deep-research/workflow.ts`, `src/lib/server/services/deep-research/coverage.ts`, `src/lib/server/services/deep-research/timeline.ts`, `src/lib/types.ts`.

**Acceptance criteria**

- [ ] Pass checkpoints persist pass number, search intent, lifecycle timestamps, reviewed-source references, coverage result, gap references, usage summary, and next decision.
- [ ] Coverage Gaps persist stable IDs, lifecycle state, severity, recommended next action, job, pass checkpoint, and plan question or comparison axis.
- [ ] Pass checkpoints may update while running but become immutable after a terminal Pass Decision.
- [ ] Resolved Coverage Gaps remain inspectable and link to the evidence, claims, or limitations that resolved or inherited them.
- [ ] The Activity Timeline shows compact pass decisions without exposing private reasoning.
- [ ] Tests cover creating a weak first pass, persisting gaps, and creating a targeted follow-up pass.

### DRS-05. Add Research Resume Points And Idempotent Pass Recovery

**Type:** AFK

**Category:** Runtime Foundation

**Blocked by:** DRS-04

**User stories covered:** As a user, a long Deep Research job should resume after crash, deploy, timeout, or worker restart without losing its research state or duplicating work.

**What to build:** Add durable Research Resume Points at pass, task, synthesis, audit, repair, and report-assembly boundaries, then make workflow advancement idempotent around them.

**Likely touched modules:** `src/lib/server/services/deep-research/workflow.ts`, `src/lib/server/services/deep-research/worker.ts`, `src/lib/server/services/deep-research/tasks.ts`, `src/lib/server/db/schema.ts`, `src/routes/api/deep-research/jobs/[id]/workflow/advance/+server.ts`.

**Acceptance criteria**

- [ ] Every running pass, required Research Task, synthesis step, citation-audit step, repair step, and report-assembly step has a durable Research Resume Point.
- [ ] Worker steps rehydrate the Research Workspace from persisted rows before model calls or state transitions.
- [ ] Retrying after a simulated crash does not duplicate pass tasks, coverage gaps, sources, timeline events, claims, or report artifacts.
- [ ] A timed-out job resumes from the latest valid Research Resume Point.
- [ ] A pass without a terminal Pass Decision can complete pending work, mark expired tasks retryable or failed, or create a recovery pass without mutating completed decisions.
- [ ] Tests cover crash after task claim, crash after pass completion, stale worker recovery, and route-level idempotency.

### DRS-06. Persist Evidence Notes As First-Class Rows

**Type:** AFK

**Category:** Foundation

**Blocked by:** DRS-02 and DRS-04

**User stories covered:** As a user, the final report should be built from auditable evidence atoms, not from source snippets or nested model-output JSON that cannot be reliably traced.

**What to build:** Add a first-class Evidence Note store and make source review plus Research Task outputs write durable Evidence Notes linked to pass checkpoints, sources, tasks, key questions, and comparison metadata when available.

**Likely touched modules:** `src/lib/server/db/schema.ts`, `src/lib/server/services/deep-research/source-review.ts`, `src/lib/server/services/deep-research/tasks.ts`, `src/lib/server/services/deep-research/synthesis.ts`, `src/lib/types.ts`.

**Acceptance criteria**

- [ ] Evidence Notes persist with stable IDs and links to job, pass checkpoint, source or task, and user/conversation ownership.
- [ ] Evidence Notes record supported key question and, when applicable, Compared Entity and Comparison Axis.
- [ ] Evidence Notes preserve normalized finding text plus enough source support for synthesis and citation audit.
- [ ] Obsolete nested evidence fields such as `reviewed_note`, `extracted_claims_json`, and task evidence JSON are removed or stopped as authoritative write targets.
- [ ] No compatibility migration is required for prior Deep Research test data.
- [ ] Tests cover rehydrating Evidence Notes across multiple Iterative Research Passes.

### DRS-07. Model Source Quality As Signals

**Type:** AFK

**Category:** Foundation

**Blocked by:** DRS-06

**User stories covered:** As a user, I should understand why a source is strong or weak for a specific claim instead of seeing a simplistic authority rank.

**What to build:** Persist Source Quality Signals for sources and Evidence Notes, including source type, independence, freshness, directness, extraction confidence, and claim fit. Derive any visible Source Authority Summary from those signals.

**Likely touched modules:** `src/lib/server/services/deep-research/source-review.ts`, `src/lib/server/services/deep-research/sources.ts`, `src/lib/server/services/deep-research/coverage.ts`, `src/lib/server/services/deep-research/citation-audit.ts`, `src/lib/server/db/schema.ts`.

**Acceptance criteria**

- [ ] Source review records separate Source Quality Signals rather than only one generic authority tier or score.
- [ ] The same source can be evaluated differently for different Evidence Notes or Synthesis Claims.
- [ ] Coverage Assessment and Citation Audit consume Source Quality Signals when judging claim support.
- [ ] Source ledger UI may show a derived Source Authority Summary but does not replace the underlying signals.
- [ ] Tests cover a vendor page that is strong for official specs but weak for independent reliability claims.

### DRS-08. Apply Claim-Type Evidence Requirements

**Type:** AFK

**Category:** Foundation

**Blocked by:** DRS-06 and DRS-07

**User stories covered:** As a user, I should not see weak or mismatched evidence treated as support for claims that need stronger source authority.

**What to build:** Classify report-eligible conclusions by Claim Type and apply claim-type-specific Evidence Requirements as hard Claim Support Gates for central claims.

**Likely touched modules:** `src/lib/server/services/deep-research/synthesis.ts`, `src/lib/server/services/deep-research/coverage.ts`, `src/lib/server/services/deep-research/citation-audit.ts`, `src/lib/server/services/deep-research/llm-steps.ts`, `src/lib/types.ts`.

**Acceptance criteria**

- [ ] Synthesis logic distinguishes Central Claims from Non-Central Claims.
- [ ] Claim Type is persisted for every Synthesis Claim once claims exist.
- [ ] Evidence Requirements act as hard Claim Support Gates for Central Claims, not only weighted ranking hints.
- [ ] Official specification claims require official, manual, vendor, or equivalent primary evidence unless explicitly limited.
- [ ] Price or availability claims require fresh dated evidence and disclose timing.
- [ ] Reliability or user-experience claims can use independent reviews, forums, or owner reports only as labeled experiential evidence.
- [ ] High-stakes claims require stronger primary or expert evidence and explicit limitations.
- [ ] Tests cover a forum post being rejected as support for an official specification claim.

### DRS-09. Persist Synthesis Claims With Evidence Links

**Type:** AFK

**Category:** Foundation

**Blocked by:** DRS-06, DRS-07, and DRS-08

**User stories covered:** As a user, the report's conclusions should be auditable back to the evidence that supports them, qualifies them, or contradicts them.

**What to build:** Add first-class Synthesis Claims and Claim Evidence Links from each claim to supporting, qualifying, or contradicting Evidence Notes.

**Likely touched modules:** `src/lib/server/db/schema.ts`, `src/lib/server/services/deep-research/synthesis.ts`, `src/lib/server/services/deep-research/llm-steps.ts`, `src/lib/server/services/deep-research/report-writer.ts`, `src/lib/types.ts`.

**Acceptance criteria**

- [ ] Synthesis Claims persist with stable IDs and links to job, pass checkpoint or synthesis pass, plan question or report section, and ownership.
- [ ] Each accepted Synthesis Claim has explicit Claim Evidence Links to supporting Evidence Notes.
- [ ] Claim Evidence Links distinguish support, qualification, and contradiction.
- [ ] Material conflicts create Competing Synthesis Claims rather than hiding contradictory evidence inside one softened conclusion.
- [ ] Claims can be marked accepted, limited, rejected, or needs-repair without deleting the original claim row.
- [ ] Tests cover a claim rejected because its linked Evidence Notes do not support it.

### DRS-10. Assess Coverage From Claim Readiness

**Type:** AFK

**Category:** Quality Gate

**Blocked by:** DRS-04, DRS-07, and DRS-09

**User stories covered:** As a user, Deep Research should decide whether a report is ready from durable evidence and supported conclusions, not from source counts alone.

**What to build:** Update Coverage Assessment and Report Eligibility Gate to evaluate Evidence Notes, Synthesis Claims, Claim Evidence Links, Claim Readiness, Source Quality Signals, and unresolved conflicts.

**Likely touched modules:** `src/lib/server/services/deep-research/coverage.ts`, `src/lib/server/services/deep-research/workflow.ts`, `src/lib/server/services/deep-research/tasks.ts`, `src/lib/server/services/deep-research/timeline.ts`.

**Acceptance criteria**

- [ ] Reviewed-source counts remain visible progress telemetry but cannot alone satisfy report eligibility.
- [ ] Coverage Assessment checks Evidence Note coverage for approved key questions.
- [ ] Coverage Assessment checks whether enough Synthesis Claims are accepted or repairable for the approved Research Plan.
- [ ] Central claims that fail their Claim Support Gate create Coverage Gaps, Repair Passes, rejected claims, or Report Limitations.
- [ ] Unsupported Non-Central Claims can be removed, downgraded, or converted into Report Limitations without blocking an otherwise useful Research Report.
- [ ] Unresolved material Claim Conflicts create Coverage Gaps, Repair Passes, or Report Limitations.
- [ ] Tests cover a job with enough reviewed sources but too few supported Synthesis Claims producing a gap or memo instead of a normal report.

### DRS-11. Audit Claim Graph And Run Repair Passes

**Type:** AFK

**Category:** Quality Gate

**Blocked by:** DRS-09 and DRS-10

**User stories covered:** As a user, cited conclusions should be verified against their supporting evidence before the final report is rendered.

**What to build:** Make Citation Audit verify the Claim Graph before Markdown citation cleanup and produce durable Citation Audit Verdicts that can trigger Repair Passes or Report Limitations.

**Likely touched modules:** `src/lib/server/services/deep-research/citation-audit.ts`, `src/lib/server/services/deep-research/workflow.ts`, `src/lib/server/services/deep-research/report-writer.ts`, `src/lib/server/db/schema.ts`, `src/lib/types.ts`.

**Acceptance criteria**

- [ ] Citation Audit reads Synthesis Claims, Evidence Notes, and Claim Evidence Links as its primary input.
- [ ] Citation Audit checks Claim Type Evidence Requirements before marking claims supported.
- [ ] Citation Audit cannot mark a Central Claim supported when its Claim Support Gate failed, even if many weaker notes agree.
- [ ] Citation Audit produces first-class verdicts such as supported, partially supported, unsupported, contradicted, or needs repair.
- [ ] Audit-triggered repair work creates a Repair Pass instead of hiding new research or replacement claims inside audit side effects.
- [ ] Markdown citation cleanup runs only after claim-graph verification.
- [ ] Tests cover a Markdown-looking citation that is rejected because linked Evidence Notes do not support the claim.

### DRS-12. Assemble Structured Reports From Verified Claims

**Type:** AFK

**Category:** Report

**Blocked by:** DRS-01, DRS-03, DRS-09, and DRS-11

**User stories covered:** As a user, I should receive a coherent Research Report that reads like synthesized analysis, not a repeated list of loosely connected source notes.

**What to build:** Assemble a Structured Research Report from accepted or limited Synthesis Claims and verified Claim Evidence Links, then render Markdown from the structured report model using intent-specific templates.

**Likely touched modules:** `src/lib/server/services/deep-research/report-writer.ts`, `src/lib/server/services/deep-research/llm-steps.ts`, `src/lib/server/services/deep-research/index.ts`, `src/lib/components/document-workspace/DocumentPreviewRenderer.svelte`, `src/lib/types.ts`.

**Acceptance criteria**

- [ ] The report pipeline validates required structured fields before Markdown output.
- [ ] Every Structured Research Report includes Report Core: title, scope, answer-first executive summary, capped key findings, methodology/source basis, limitations, and Source Ledger Snapshot.
- [ ] Report Shape Templates are selected by Report Intent.
- [ ] Comparison, recommendation, investigation, market scan, product scan, and memo shapes each have appropriate sections.
- [ ] Report sections, key findings, recommendations, comparison rows, and limitations retain claim IDs and evidence-link references until final rendering.
- [ ] The report-writing model may improve organization and prose but cannot introduce new cited substance outside accepted or limited Synthesis Claims.
- [ ] Tests cover the `docs/test-report.md` failure pattern so source-note dumps cannot pass as readable reports.

### DRS-13. Use Entity-Axis Discovery For Comparison Reports

**Type:** AFK

**Category:** Quality Gate

**Blocked by:** DRS-01, DRS-04, DRS-06, and DRS-10

**User stories covered:** As a user asking for a comparison, I should not get a one-sided or noisy report because discovery searched only broad topic phrases.

**What to build:** Derive comparison-oriented discovery queries from Compared Entities and Comparison Axes in the approved Research Plan, then preserve entity/axis support through source review, coverage, and report assembly.

**Likely touched modules:** `src/lib/server/services/deep-research/planning.ts`, `src/lib/server/services/deep-research/discovery.ts`, `src/lib/server/services/deep-research/source-review.ts`, `src/lib/server/services/deep-research/coverage.ts`, `src/lib/server/services/deep-research/report-writer.ts`.

**Acceptance criteria**

- [ ] Comparison plans expose Compared Entities and central Comparison Axes when the request makes them available.
- [ ] Discovery creates targeted entity/axis queries instead of relying only on broad goal and key-question text.
- [ ] Source review records intended and actual entity/axis support for discovered comparison sources.
- [ ] Coverage Assessment creates targeted gaps when an entity or central axis lacks topic-relevant reviewed support.
- [ ] Tests cover a comparison where one entity has support and the other does not, resulting in targeted follow-up or memo.

### DRS-14. Scope Source Ledger And Snapshot Source Identity

**Type:** AFK

**Category:** Report

**Blocked by:** DRS-02, DRS-06, and DRS-12

**User stories covered:** As a user, I should be able to scan sources that affected the research without confusing discovered-only search results for cited evidence.

**What to build:** Scope the default Source Ledger to cited, reviewed topic-relevant, and useful rejected/off-topic sources, attach a durable Source Ledger Snapshot to completed outputs, and show favicon identity where available.

**Likely touched modules:** `src/lib/server/services/deep-research/sources.ts`, `src/lib/server/services/deep-research/report-writer.ts`, `src/lib/components/chat/ResearchCard.svelte`, `src/lib/components/document-workspace/DocumentPreviewRenderer.svelte`, `src/lib/types.ts`.

**Acceptance criteria**

- [ ] The default Source Ledger shows Cited Sources, topic-relevant Reviewed Sources, and rejected/off-topic Reviewed Sources when they explain limitations.
- [ ] Discovered-only sources are collapsed or available only in diagnostics/activity detail by default.
- [ ] Completed Research Reports and Evidence Limitation Memos include a durable Source Ledger Snapshot.
- [ ] Reopening a completed output uses its Source Ledger Snapshot instead of regenerating the ledger from mutable live rows.
- [ ] Source rows show a favicon for normal public web URLs.
- [ ] Missing or blocked favicons degrade to the current icon without layout shift.
- [ ] Tests cover snapshot persistence, reopened report rendering, favicon URL generation, and fallback rendering.

### DRS-15. Polish Research Card Progress And Interactions

**Type:** AFK

**Category:** UX

**Blocked by:** DRS-03, DRS-04, DRS-10, and DRS-11

**User stories covered:** As a user, the Deep Research card should feel compact, alive, and informative while work is running.

**What to build:** Add Research Card Severity, coarse Stage Progress Ring, Stage Detail Reveal, compact timeline behavior, smooth top-fade Progress Reveal Motion, final time near cost, and interaction fixes.

**Likely touched modules:** `src/lib/components/chat/ResearchCard.svelte`, `src/lib/components/chat/ResearchCard.test.ts`, `src/lib/components/chat/MessageArea.test.ts`, `src/lib/i18n.ts`, `src/lib/types.ts`.

**Acceptance criteria**

- [ ] Research Card derives user-facing severity separately from operational job status.
- [ ] Awaiting approval maps to needs attention; running maps to working; completed report maps to completed; memo maps to insufficient evidence; cancellation maps to cancelled; infrastructure failure maps to failed.
- [ ] Stage Progress Ring represents coarse workflow stage progress, not exact percent or runtime.
- [ ] Stage Detail Reveal shows Meaningful Pass Progress, open Coverage Gaps, resolved Claim Conflicts, or audit-driven repair state when meaningful.
- [ ] The compact header stays stage-oriented and avoids mechanical pass-floor phrasing.
- [ ] Newly appearing states use smooth tight top-fade motion without layout jump.
- [ ] Timeline rows omit black filler rows and routine repeated source counts.
- [ ] Final Research Time appears near completed-job cost summary.
- [ ] Tests cover popup dismissal, compact timeline rows, severity mapping, and final time rendering.

### DRS-16. Run Hungarian End-To-End Deep Research Pass

**Type:** AFK

**Category:** Localization

**Blocked by:** DRS-03, DRS-12, and DRS-15

**User stories covered:** As a Hungarian user, Deep Research should not mix English operational copy into the plan, card, timeline, report, or limitation states.

**What to build:** Add an end-to-end Hungarian verification pass and fill missing i18n keys found by that pass.

**Likely touched modules:** `src/lib/i18n.ts`, `src/lib/server/services/deep-research/language.ts`, `src/lib/server/services/deep-research/planning.ts`, `src/lib/server/services/deep-research/report-writer.ts`, `src/lib/components/chat/ResearchCard.svelte`.

**Acceptance criteria**

- [ ] Plan, Research Card, timeline, report headings, limitations, memo labels, and recovery actions render in Hungarian when research language is Hungarian.
- [ ] Source titles, quoted source names, product names, URLs, and citations may remain in their original language.
- [ ] Tests or fixtures assert that key UI strings are not hardcoded English.
- [ ] The output stays readable with Hungarian date and source-count phrasing.

### DRS-17. Add Deep Research Evaluation Harness

**Type:** AFK

**Category:** Evaluation

**Blocked by:** DRS-02, DRS-05, DRS-06, DRS-09, DRS-10, DRS-11, DRS-12, and DRS-16

**User stories covered:** As a user, Deep Research quality should improve measurably instead of relying on manual review of one generated report.

**What to build:** Add a repeatable Deep Research Evaluation Harness with Golden Research Fixtures for source relevance, graph durability, claim support, report readability, crash recovery, localization, and Kimi-inspired hard-search behavior.

**Likely touched modules:** `src/lib/server/services/deep-research/*.test.ts`, `docs/test-report.md`, possible `src/lib/server/services/deep-research/evaluation.*` test helpers.

**Acceptance criteria**

- [ ] Fixtures cover off-topic high-authority sources.
- [ ] Fixtures cover enough reviewed sources but weak Evidence Notes.
- [ ] Fixtures cover unsupported Central Claims and removable Non-Central Claims.
- [ ] Fixtures cover Claim Conflicts and competing claims.
- [ ] Fixtures cover multi-turn search, cross-validation, conflict correction, and cautious verification before answering.
- [ ] Fixtures cover crash/resume across multiple Iterative Research Passes.
- [ ] Fixtures cover Hungarian plan, timeline, memo, and report output.
- [ ] A regression fixture based on `docs/test-report.md` or its failure pattern prevents repeated source-snippet reports from passing.
- [ ] Evaluation treats readable synthesis, claim grounding, source relevance, citation support, durable resume, and localization as separate acceptance dimensions.
- [ ] The harness is runnable in CI or the existing test workflow without live web dependency.

### DRS-18. Raise Deep Research Depth Budgets And Pass Floors

**Type:** AFK

**Category:** Budget

**Blocked by:** DRS-10 and DRS-17

**User stories covered:** As a user, Focused, Standard, and Max Deep Research should produce deeper and more meaningful results without mixing budget changes into report-quality gate work.

**What to build:** Raise depth-specific source ceilings, pass budgets, repair budgets, concurrency defaults, and minimum pass floors as configurable policy defaults.

**Likely touched modules:** `src/lib/server/services/deep-research/planning.ts`, `src/lib/server/services/deep-research/model-config.ts`, `src/lib/deep-research-models.ts`, `src/lib/server/config-store.ts`, `src/lib/i18n.ts`, `src/lib/types.ts`.

**Acceptance criteria**

- [ ] Focused defaults to reviewing up to 24 sources, Pass Budget 2-3 Meaningful Research Passes, Repair Pass Budget 1, Source Processing Concurrency 6, and Model Reasoning Concurrency 2.
- [ ] Standard defaults to reviewing up to 75 sources, Pass Budget 3-5 Meaningful Research Passes, Repair Pass Budget 2, Source Processing Concurrency 12, and Model Reasoning Concurrency 4.
- [ ] Max defaults to reviewing up to 200 sources, Pass Budget 5-8 Meaningful Research Passes, Repair Pass Budget 3, Source Processing Concurrency 24, and Model Reasoning Concurrency 8.
- [ ] Values are configurable policy defaults, not permanent hardcoded constants.
- [ ] Depth Pass Floor defaults are Focused 2, Standard 3, and Max 5 Meaningful Research Passes.
- [ ] Only Meaningful Research Passes count toward Minimum Pass Expectations.
- [ ] No depth may publish a normal Research Report before satisfying its Minimum Pass Expectation.
- [ ] Focused remains Deep Research; quick few-search tasks belong in Normal Chat web search.
- [ ] Pre-approval effort estimates reflect the new ceilings without promising exact runtime, source counts, or cost.
- [ ] Tests cover source ceilings, Pass Budgets, Repair Pass Budgets, concurrency defaults, pass floors, and plan validation.

### DRS-19. Enforce Runtime, Concurrency, And Recovery Policy

**Type:** AFK

**Category:** Runtime

**Blocked by:** DRS-05 and DRS-18

**User stories covered:** As a user, deeper research should run predictably, resume after operational interruptions, and avoid runaway cost or stuck jobs.

**What to build:** Add Runtime Policy enforcement around active-job limits, concurrency limits, timeout windows, retry behavior, overrun handling, cancellation, and durable recovery.

**Likely touched modules:** `src/lib/server/services/deep-research/worker.ts`, `src/lib/server/services/deep-research/workflow.ts`, `src/lib/server/config-store.ts`, `src/routes/api/deep-research/jobs/[id]/worker/advance/+server.ts`, `src/routes/api/deep-research/jobs/[id]/cancel/+server.ts`, `src/lib/components/chat/ResearchCard.svelte`.

**Acceptance criteria**

- [ ] Runtime Policy is configurable through the same admin/config path as other model-facing operational policy.
- [ ] One conversation may have at most one running Deep Research Job by default.
- [ ] One user may have up to two running Deep Research Jobs by default.
- [ ] Global active-job and worker caps are configurable and conservative by default.
- [ ] Research Concurrency Budget is enforced per job, per user, and globally.
- [ ] Synthesis, coverage assessment, citation audit, report assembly, and repair decisions remain low-concurrency coordination steps even when source review runs in parallel.
- [ ] When runtime is exhausted at a safe boundary, the orchestrator runs Coverage Assessment and chooses Research Report, Evidence Limitation Memo, or failure from durable state.
- [ ] User cancellation stops new work, marks running tasks cancelled where practical, preserves the Research Workspace, and shows cancelled Research Card Severity.
- [ ] Tests cover cancellation, timeout recovery, active-job rejection, concurrency-limit enforcement, and worker restart recovery.
