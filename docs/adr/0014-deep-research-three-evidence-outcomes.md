# Deep Research separates evidence outcomes from plan-revision recovery

Deep Research will distinguish three evidence completion grades: **Research Report**, **Limited Research Report**, and **Evidence Limitation Memo**. It will also use **Research Plan Revision Needed** as a distinct recovery outcome when source-heavy work reveals that the approved **Research Plan** was likely poisoned or mis-scoped.

A **Research Report** is the normal cited decision artifact when the approved **Research Plan** is supported well enough to answer the requested scope. A **Limited Research Report** is the cited decision artifact when some useful, claim-grounded evidence exists but the approved scope cannot be answered with normal-report confidence. An **Evidence Limitation Memo** is reserved for runs where no useful synthesized answer can be supported despite a healthy enough plan, such as near-zero topic-relevant evidence, unsupported central claims, or exhausted budget without a credible narrower answer. **Research Plan Revision Needed** is reserved for poisoned-plan states and should not imply the real topic lacks evidence.

The planning boundary must also distinguish known-entity comparison from decision-oriented comparison. A request to "compare at least three architecture patterns" does not identify known **Compared Entities**. When comparison is a means to choose or recommend and the options are unnamed, the **Research Plan** should use a recommendation or decision-oriented report shape, discover candidate options as research work, and add comparison blocks only after those options are grounded.

Strict **Comparison Report Shape** requires at least two named, source-searchable **Compared Entities** before approval. Concrete products, vendors, jurisdictions, people, organizations, standards, versions, policies, and explicitly named approaches may qualify. Unnamed candidate categories do not qualify until research has grounded the actual options.

The first stabilization slice for this failure class should fix poisoned **Research Plan** generation before adding richer final rendering. In particular, abstract decision prompts should produce sane **Report Intent**, candidate-option discovery, and domain-appropriate key questions. The same slice should include a minimal **Plan Health Check** for high-reviewed-source, zero-topic-relevant runs so already-approved or slipped-through poisoned plans get a plan-revision recovery path instead of a plain insufficient-evidence memo. Limited-report rendering should build on that corrected plan state rather than masking plan pollution downstream.

Planner model output may draft the plan, but local normalization owns the trust boundary for **Report Intent**, **Compared Entities**, and fallback questions. Deterministic guardrails should reject imperative clauses, quantity placeholders, and unnamed option categories as compared entities even if the planner model returns them as syntactically valid strings.

Generic comparison fallback questions should be domain-neutral. Product, vehicle, procurement, legal, software, health, finance, and literature-review variants should be selected only when topic detection or the approved **Research Plan** justifies that domain. Product or vehicle terms such as trims, dealers, manufacturers, model years, and rider use cases must not leak into abstract software architecture comparisons.

When local normalization changes **Report Intent**, drops invalid **Compared Entities**, or converts unnamed option categories into candidate-discovery work, the **Research Plan** should show a compact **Plan Normalization Note** before approval. The note should explain the user-facing interpretation without exposing parser internals or blocking approval.

If a run reviews a meaningful number of sources and accepts zero topic-relevant sources, Deep Research should run a cheap **Plan Health Check** before presenting the outcome as insufficient evidence. When the check detects fake entities, imperative clauses treated as entities, domain-mismatched key questions, or other plan poisoning, the user-facing outcome should be **Research Plan Revision Needed** with a corrected plan or recovery path instead of implying the real topic lacks evidence.

When **Research Plan Revision Needed** fires and AlfyAI can infer the safe correction, it should create a corrected **Research Plan** draft automatically. It must not start another source-heavy run automatically. The user reviews the corrected draft through the same approve, edit, or cancel controls as any other plan. Rejected or off-topic source counts from the poisoned run should not be treated as evidence against the corrected topic.

The first UI slice should keep recovery inside the existing **Research Card** and **Research Plan** approval surface. The card should show that the plan needs revision, explain the plan-health reason briefly, and offer the corrected draft through approve, edit, and cancel controls. A new modal, wizard, or separate recovery surface is not part of the first slice.

Operationally, **Research Plan Revision Needed** should be stored as a completed **Deep Research Job** with a distinct plan-revision-needed stage or outcome, not as a failed job. It should not have a normal report artifact or create a **Report Boundary**. The corrected **Research Plan** remains available for approval, and the **Activity Timeline** explains the plan-health failure in user-facing terms.

When the user approves the corrected draft, AlfyAI should continue the same **Deep Research Job** with a new plan version rather than starting an unrelated job. The corrected run starts source-heavy work from clean execution state for the new plan. The poisoned run's timeline, source ledger, and usage remain available as diagnostic history, but its rejected sources, coverage gaps, tasks, and topic-relevance counts do not satisfy or block coverage for the corrected plan.

This decision does not loosen citation gates. Unsupported claims still must be repaired, removed, downgraded into limitations, or excluded. A **Limited Research Report** requires at least one useful, citation-supported **Central Synthesis Claim**, a narrower answerable version of the approved goal, and explicit **Report Limitations** for unsupported parts.

**Considered Options**

- Keep the binary outcome model: normal **Research Report** or **Evidence Limitation Memo**.
- Publish normal reports with more visible limitations when evidence is partial.
- Add **Limited Research Report** as a middle outcome while keeping **Evidence Limitation Memo** for no-useful-answer states.
- Add **Research Plan Revision Needed** for poisoned-plan states instead of reusing **Evidence Limitation Memo** wording.
- Treat any prompt containing "compare" as a strict **Comparison Report Shape**.
- Treat unnamed option-category comparisons as decision-oriented plans until candidate options are grounded.

We chose a three-grade evidence model because the user experience must return the best useful artifact the evidence can support without fabricating completeness. The binary model protects against bad reports but can turn partial success into an unhelpful memo. Publishing normal reports with limitations preserves flow but weakens the meaning of a completed **Research Report**. A middle **Limited Research Report** keeps the product useful while preserving the trust boundary. We chose **Research Plan Revision Needed** as a separate recovery outcome because a poisoned research plan is not the same as an evidence limitation.

We chose decision-oriented planning for unnamed option-category comparisons because syntactic comparison detection can manufacture fake **Compared Entities** from imperative clauses such as "identify failure modes" or "recommend one design." Candidate options should be grounded by research before they become comparison columns.

**Acceptance Scenarios**

- A prompt asking for a recommended architecture while comparing unnamed architecture patterns drafts a recommendation-oriented **Research Plan**, not a strict known-entity comparison plan.
- The planner does not turn instructions such as "identify failure modes" or "recommend one design" into **Compared Entities**.
- The abstract architecture recommendation baseline is covered as a golden regression fixture: no product or vehicle comparison language appears in its key questions, and no imperative clause becomes a compared entity.
- The abstract architecture recommendation baseline shows a compact **Plan Normalization Note** explaining that architecture patterns will be discovered during research rather than pre-filled as compared entities.
- A high-reviewed-source, zero-topic-relevant run whose approved plan contains fake compared entities completes as **Research Plan Revision Needed** rather than a plain insufficient-evidence memo.
- **Research Plan Revision Needed** creates a corrected draft plan automatically when the safe correction is clear, but does not auto-run a second research job.
- The first UI slice shows **Research Plan Revision Needed** inside the existing **Research Card** and corrected-plan approval surface.
- **Research Plan Revision Needed** is operationally completed with needs-attention card severity, not failed.
- Approving the corrected draft continues the same **Deep Research Job** with clean execution state for the new plan while preserving poisoned-run diagnostics.
- A prompt comparing explicitly named approaches, such as RAG, workflow graphs, and multi-agent research systems, may use **Comparison Report Shape**.
- Product or vehicle comparisons with named products can still use **Comparison Report Shape** and product-specific questions.
- A run with useful cited central claims but incomplete coverage can publish a **Limited Research Report** with narrowed scope and visible **Report Limitations**.
- A run with no useful topic-relevant synthesized claims publishes an **Evidence Limitation Memo**, not a padded report.
- **Research Report** and **Limited Research Report** create a **Report Boundary**; **Evidence Limitation Memo** and **Research Plan Revision Needed** do not.
