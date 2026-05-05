# Deep Research Roadmap

This roadmap breaks Deep Research into independently testable vertical slices. The scope is intentionally ambitious, but each slice should prove a user-visible behavior with persistence, service behavior, UI state, and tests where applicable.

## Vertical Slices

1. **Feature Flag + Empty Entry Point**
   - Composer can show Deep Research Mode behind a flag, but starting it only creates a disabled/placeholder path.
   - Deep Research is hidden by default until enabled in admin/runtime config.
   - When enabled, the composer shows a minimal single-icon Deep Research control.
   - Clicking the icon opens a small popover with Focused, Standard, and Max.
   - Selecting one depth toggles Deep Research Mode on with that depth.
   - Clicking the active icon again toggles Deep Research Mode off.
   - The composer does not expose source controls, blocked sites, date ranges, or advanced settings.
   - The user must explicitly select a Deep Research depth before sending a Deep Research request.
   - No depth is selected by default; the user chooses one of the three depths.
   - Use a research/depth icon such as Telescope rather than a plain search icon.
   - Tooltip text identifies Deep Research and the active depth.
   - Turning Deep Research Mode off before sending returns the message to Normal Chat.
   - Do not add a global "always use deep research" preference.
   - Verifiable: normal chat is unaffected; flag off hides everything.

2. **Deep Research Job Shell**
   - Create a job record and render a Research Card in chat.
   - Sending with Deep Research selected creates the triggering user message plus a Research Card.
   - The Research Card represents the Deep Research Job lifecycle on the assistant side.
   - Do not create a normal assistant answer for the Deep Research Job.
   - Deep Research cannot be started directly inside a sealed conversation.
   - A conversation may have only one active or uncompleted Deep Research Job.
   - A cancelled or failed job does not block another job in the same unsealed conversation.
   - Starting a Deep Research Job clears any queued normal follow-up turn.
   - Normal follow-up queueing is disabled while a Deep Research Job is active.
   - Plan Edit belongs inside the Research Card and is not the normal queued-turn mechanism.
   - Verifiable: job persists across reload; card reloads from server state.

3. **Cancellation Before Plan**
   - Cancel an unapproved job.
   - Before a Research Plan exists, cancellation marks or removes the Research Card as cancelled.
   - While awaiting approval, cancellation marks the job/card as cancelled and leaves the conversation usable.
   - In an existing chat, keep the triggering user message and cancelled Research Card for history.
   - In a brand-new chat, cleanup of an otherwise empty cancelled conversation may be deferred beyond v1.
   - Cancellation is available directly from the Research Card.
   - Verifiable: no Report Boundary; existing chat remains usable.

4. **Research Plan Draft**
   - Generate and persist a first Research Plan from the user request.
   - Use app-owned server service code and structured plan output, not Langflow.
   - Do not call web search during plan drafting.
   - May use Planning Context from current chat and relevant knowledge library summaries.
   - Persist the raw structured plan and the rendered user-facing plan.
   - Validate the drafted plan against the selected depth and Research Budget before showing it.
   - Show a coarse pre-approval effort/cost disclosure: selected depth, expected time band, source review ceiling, and relative cost warning.
   - Do not promise exact runtime, exact source counts, or exact cost in v1.
   - Verifiable: card shows plan; reload preserves it; no source-heavy research starts.

5. **Plan Edit Loop**
   - User submits freeform Plan Edit; system returns a revised Research Plan.
   - Verifiable: plan versions are persisted; edit does not start research.

6. **Plan Approval**
   - Approving the plan transitions the job into an approved/runnable state.
   - Verifiable: approved plan is immutable; later edits are blocked.

7. **Activity Timeline**
   - Persist and display timeline events.
   - Verifiable: timeline survives reload and supports English/Hungarian strings.

8. **Research Usage Accounting**
   - Record Research Usage for plan generation and later internal model/tool calls.
   - Store Research Usage in research-specific usage rows rather than fake chat messages.
   - Keep existing message usage events for Normal Chat.
   - Aggregate usage by Deep Research Job, Research Task, conversation, user, model, provider, and billing month.
   - Internal Deep Research usage must not create fake chat messages or inflate normal message counts.
   - The Research Card and conversation cost surfaces can show total job cost once available.
   - After completion, user-facing usage may show runtime, discovered/reviewed/cited source counts, and actual or estimated cost.
   - Token/model/provider details remain in analytics/admin views rather than the main report UI.
   - Verifiable: plan draft cost appears in analytics without creating a fake assistant message.

9. **Mock Worker Execution**
   - Background worker advances a job through fake stages and completes a fake report.
   - Verifiable: tab can close; reload shows current/completed state.

10. **Report Boundary**
   - Completed fake job seals the conversation.
   - Verifiable: composer disabled/read-only; Discuss Report and Research Further actions visible.

11. **Research Report Artifact**
    - Store a fake report as a durable workspace document and open it from the Research Card.
    - Verifiable: report is not just chat text; workspace opens it.

12. **Source Ledger Schema**
    - Add discovered/reviewed/cited source records with counts.
    - Verifiable: counts display correctly; discovered-only sources cannot be cited.

13. **Public Web Discovery**
    - First real discovery pass using existing web research/search services.
    - Verifiable: sources are persisted as Discovered Sources.

14. **Source Triage**
    - Deduplicate, authority-score, and select sources for review.
    - Verifiable: duplicate URLs collapse; low-quality sources are not inflated.

15. **Source Review**
    - Open/extract/summarize selected sources into Reviewed Sources.
    - Verifiable: reviewed notes persist; reviewed count is distinct from discovered count.

16. **Coverage Assessment v1**
    - Evaluate key-question coverage and produce Coverage Gaps.
    - Verifiable: insufficient coverage loops; sufficient coverage proceeds.

17. **Iterative Loop**
    - Coverage Gaps generate targeted follow-up discovery/review passes.
    - Verifiable: loop stops at sufficient coverage or Research Budget exhaustion.

18. **Parallel Research Tasks**
    - Run bounded tasks in parallel for key questions/source clusters.
    - Verifiable: Pass Barrier waits for completion/failure/skip.

19. **Task Failure Handling**
    - Failed tasks retry or become Coverage Gaps.
    - Verifiable: non-critical failure does not fail the whole job.

20. **Synthesis Notes**
    - Convert reviewed notes into structured findings.
    - Verifiable: findings map back to Reviewed Sources.

21. **Report Writer**
    - Produce a semi-fixed Research Report from findings.
    - Verifiable: title, summary, findings, body, source list, limitations.

22. **Citation Audit**
    - Verify claims against cited Reviewed Sources.
    - Verifiable: unsupported claims are repaired, removed, or limited.

23. **Complete With Limitations**
    - Allow completion when a useful report exists but gaps remain.
    - Verifiable: limitations show in report and timeline.

24. **Real Report Boundary**
    - Completion of an audited real report seals the conversation.
    - Verifiable: cancellation still does not seal; completion does.

25. **Discuss Report**
    - Start a new Normal Chat seeded by the report.
    - Verifiable: original conversation stays sealed; new chat has report context.

26. **Research Further**
    - Start a new Deep Research Job seeded by the report.
    - Verifiable: new plan references report context; still requires approval.

27. **Planning Context From Knowledge Library**
    - Use relevant library context for plan drafting only.
    - Verifiable: context-considered disclosure; not automatically Research Sources.

28. **Attached Files as Research Sources**
    - Files attached to the Deep Research request can become Research Sources.
    - Verifiable: source scope disclosed in plan before approval.

29. **Depth Budgets**
    - Apply Focused, Standard, and Max budgets.
    - Verifiable: budgets cap discovery/review/tasks; actual counts are disclosed.

30. **Hungarian End-to-End Pass**
    - Plan, card, timeline, and report prose use Hungarian when requested.
    - Verifiable: no mixed prose except citations/source titles.

31. **Admin/Operational Controls**
    - Add concurrency, cancellation, stale-job recovery, and worker restart behavior.
    - Verifiable: closing the tab and restarting the server have predictable outcomes.
