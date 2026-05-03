# Deep Research is a bounded background subsystem

Deep Research is visually embedded in chat, but it is not a chat turn or a larger variant of chat streaming. We will model it as a durable background subsystem with its own job state, planning loop, activity timeline, source ledger, cancellation, and report output so Max-depth research can continue across tab closes and avoid inheriting normal chat stream limits.

The initial orchestration direction is LangGraph-first: AlfyAI owns the Deep Research domain model and uses explicit workflow stages for planning, approval, iterative discovery/review, coverage assessment, synthesis, audit, and completion. Langflow is not assumed for Deep Research, and Deep Agents is deferred as a possible future harness only if explicit graph stages become too rigid.

**Considered Options**

- Reuse the existing chat stream pipeline and represent research as a long assistant turn.
- Create a separate Deep Research subsystem and let chat display job/report cards.
- Use Langflow as the primary deep research flow runtime.
- Use Deep Agents as the primary v1 agent harness.

We chose the separate subsystem because Deep Research has different lifecycle rules: explicit opt-in, plan approval before research, long-running background execution, source-stage accounting, Report Boundary behavior, and durable report reuse.
