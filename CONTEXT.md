# AlfyAI Product Context

AlfyAI is a conversational workspace where users can chat casually, use tools, work with files, and optionally start deeper background research tasks. This context captures product-domain language that should stay stable across implementation choices.

## Normal Chat Context

### Language

**Available Context**:
Conversation, workspace, memory, document, attachment, or task information that AlfyAI may consider for a **Normal Chat** turn.
_Avoid_: prompt, evidence, memory dump, active context

**Prompt Context**:
The subset of **Available Context** actually sent to the model for a specific **Normal Chat** turn.
_Avoid_: available context, all memory, workspace state

**Protected Context**:
Context that should survive budget pressure longer than ordinary context but still respects the **Context Budget**.
_Avoid_: essential context, mandatory context, unlimited context

**Context Selection**:
The per-turn process that chooses **Prompt Context** from **Available Context**.
_Avoid_: memory assembly, Honcho context, retrieval, prompt building

**Context Inclusion Level**:
The amount of an item of **Available Context** promoted into **Prompt Context** for a turn.
_Avoid_: mode, retrieval class, prompt size

**Reference Context**:
A **Context Inclusion Level** that includes only compact identifying details such as title, type, and relevance reason.
_Avoid_: metadata dump, citation, evidence

**Excerpt Context**:
A **Context Inclusion Level** that includes selected snippets relevant to the current turn.
_Avoid_: chunk dump, full document

**Task Context**:
A **Context Inclusion Level** that includes enough content to perform a requested document or workspace task.
_Avoid_: full context, unlimited context, entire file

**Omitted Context**:
Available information deliberately left out of **Prompt Context** for a turn.
_Avoid_: forgotten context, unavailable context

**Context Signal**:
A reason that an item of **Available Context** may be relevant to the current **Normal Chat** turn.
_Avoid_: guess, heuristic, vibe

**Weak Context Signal**:
A **Context Signal** that can help rank or break ties but should not promote context by itself.
_Avoid_: relevance, active context

**Strong Context Signal**:
A **Context Signal** strong enough to promote **Available Context** into **Prompt Context** when the turn budget allows.
_Avoid_: guarantee, always include

**Context Budget**:
The turn-specific ceiling for how much **Prompt Context** may be sent to the model.
_Avoid_: model limit, token dump

**Reserved Context Budget**:
The portion of **Context Budget** held for the current user message, system instructions, tool overhead, and response space.
_Avoid_: hidden budget, overhead

**Core Context Budget**:
The portion of **Context Budget** used for direct user-supplied or explicitly targeted context.
_Avoid_: essential budget, unlimited budget

**Support Context Budget**:
The portion of **Context Budget** used for relevant supporting context such as excerpts, recent turns, summaries, and retrieved evidence.
_Avoid_: extra context, filler

**Awareness Context Budget**:
The portion of **Context Budget** used for compact **Reference Context** about weaker but plausible items.
_Avoid_: metadata budget, weak context dump

**Context Trace**:
A structured operational diagnostic record of what became **Prompt Context** and why.
_Avoid_: debug log, chain of thought, hidden reasoning

**Context Diagnostics Debug**:
An explicit runtime setting that enables verbose context, retrieval, attachment, and TEI diagnostics beyond the compact **Context Trace**.
_Avoid_: trace on/off, noisy mode

**Context Limitation**:
A user-facing disclosure that an answer is based on partial or selected **Prompt Context**.
_Avoid_: error, apology, debug note

**Context Clarification**:
A user-facing question asked only when AlfyAI cannot choose usable **Prompt Context** automatically.
_Avoid_: context setup, retrieval prompt, settings question

**Context Selection Debt**:
Obsolete or duplicated context-selection behavior left behind after a newer **Context Selection** path replaces it.
_Avoid_: old code, junk, legacy stuff

**Context Selection Slice**:
An independently testable and verifiable increment that improves **Context Selection** behavior.
_Avoid_: phase, batch refactor, cleanup later

**Production Slice**:
A slice that is complete enough to operate reliably in production rather than only demonstrate a prototype path.
_Avoid_: demo slice, spike, partial path

### Relationships

- **Available Context** is broader than **Prompt Context**.
- **Prompt Context** is selected per **Normal Chat** turn.
- **Protected Context** is not unlimited context.
- **Protected Context** may be downgraded to a smaller **Context Inclusion Level** when needed to fit the **Context Budget**.
- The current user message is reserved rather than merely protected.
- A direct attachment or explicitly targeted document may become **Protected Context**.
- Passive workspace state alone does not create **Protected Context**.
- **Context Selection** is the source of truth for promoting **Available Context** into **Prompt Context**.
- **Context Selection** considers conversation, memory, attachment, workspace, task, generated-file, generated-document, and retrieval signals together.
- Individual subsystems may supply **Available Context** and **Context Signals**, but should not independently force large text into **Prompt Context**.
- Every promoted context item has a **Context Inclusion Level**.
- **Reference Context** preserves awareness without sending body content.
- **Excerpt Context** supports focused answers when only part of an item is relevant.
- **Task Context** is reserved for turns that require substantial document or workspace content.
- **Omitted Context** remains **Available Context** and may be promoted in a later turn.
- An open workspace document is **Available Context**.
- An open workspace document creates a **Weak Context Signal**.
- A **Weak Context Signal** may combine with user wording or explicit selection to become a **Strong Context Signal**.
- Passive workspace state alone should not promote a document into **Prompt Context**.
- Uncertainty should usually reduce the **Context Inclusion Level** rather than block the user.
- A **Context Clarification** is reserved for cases where the answer would materially depend on choosing between ambiguous context items.
- Attaching an item in the current turn is the strongest **Context Signal**.
- Explicitly naming an item is stronger than relying on workspace state.
- Deictic wording such as "this" or "it" is a **Strong Context Signal** only when paired with a clear available target.
- Correction or refinement wording can promote the current work item into **Prompt Context**.
- Pinned or preferred task evidence is stronger than ordinary retrieval but still subject to the **Context Budget**.
- Semantic or lexical retrieval alone should usually promote no more than **Excerpt Context**.
- An open workspace item alone should only break ties or produce **Reference Context**.
- Recency alone should rarely promote more than **Reference Context**.
- Pinned or preferred evidence is strongly preferred but still budgeted.
- Pinned or preferred evidence may become **Protected Context** when relevant to the turn.
- Pinned or preferred evidence still has a **Context Inclusion Level**.
- Irrelevant pinned evidence should not receive full body content.
- When multiple items are relevant, AlfyAI should preserve breadth before depth.
- Breadth means using **Reference Context** for plausible relevant items before spending large budget on any one item.
- Depth means using **Excerpt Context** or **Task Context** for the strongest item or explicitly requested comparison set.
- By default, only one primary item should receive **Task Context** in a turn.
- Multiple items may receive large context when the user explicitly asks to compare or jointly transform them.
- Attaching an item makes it explicitly relevant but does not override the **Context Budget**.
- Attached items should receive **Task Context** only when the user asks for work that requires substantial item content.
- Large attached items may receive **Excerpt Context** when the user asks a targeted question.
- Multiple attached items should preserve breadth unless the user explicitly asks for exhaustive joint analysis.
- **Context Limitation** should appear only when partial context materially affects trust in the answer.
- Routine answers should not narrate context-selection mechanics.
- High-impact judgments, exhaustive review requests, and whole-document claims require a **Context Limitation** when AlfyAI used only selected context.
- **Prompt Context** must fit inside the **Context Budget**.
- **Reserved Context Budget** is allocated before document, memory, or retrieval context.
- **Core Context Budget** is for direct attachments and explicitly targeted work items.
- **Support Context Budget** is for selected evidence, summaries, and recent conversation context.
- **Awareness Context Budget** preserves breadth through **Reference Context**.
- Recent conversation turns are **Support Context** by default.
- The immediately previous exchange may receive limited protection for conversational continuity.
- Older turns should compete through relevance and budget rather than transcript recency alone.
- Large previous outputs should not become **Prompt Context** only because they are recent.
- **Generated Files** and **Generated Documents** are **Available Context** but not automatically **Prompt Context**.
- Generated-output prompt inclusion must happen through **Context Selection**, not through a separate latest-file or file-generation prompt shortcut.
- A generated output may become **Protected Context** when the user clearly continues work on it.
- A recent or visible generated output alone should usually receive no more than **Reference Context**.
- A semantically relevant generated output may receive **Excerpt Context**.
- A directly targeted generated output may receive **Task Context**.
- Old generated outputs should decay unless pinned, selected, or part of an active document family.
- When context exceeds budget, AlfyAI should downgrade **Context Inclusion Level** before dropping useful items.
- When useful items must be dropped, lower-priority **Context Signals** drop before stronger ones.
- A **Context Trace** records promoted context and the **Context Signals** that caused promotion.
- A **Context Trace** records selection facts, not private model reasoning.
- A **Context Trace** may include item identity, inclusion level, signal reasons, token estimates, trimming, limitations, and budget totals.
- A production **Context Trace** should be versioned.
- A production **Context Trace** should identify the model, context source, budget, sections, source totals, limitations, warnings, and fallbacks.
- A production **Context Trace** should include correlation identifiers such as conversation id, stream or turn id, user id, model id, provider id, model name, message id when available, attempt, and phase.
- A production **Context Trace** should not store document or message body text.
- Failing to create a **Context Trace** should not block a chat turn.
- Fallback paths should still produce a **Context Trace** when possible.
- In v1, **Context Trace** should be emitted as structured server logs.
- **Context Trace** should be compact enough for production logs.
- In v1, compact **Context Trace** should be emitted for every Normal Chat turn attempt.
- New **Context Trace** logs should replace or consolidate overlapping debug logs instead of adding parallel noise.
- Production success-path logs should be event-based and sparse.
- Routine context diagnostics should collapse into one compact **Context Trace** per turn or attempt.
- Warnings and errors should remain visible by default.
- Verbose retrieval, attachment, TEI, and per-candidate diagnostics should require an explicit debug setting.
- **Context Diagnostics Debug** controls verbose diagnostics beyond the compact **Context Trace**.
- **Context Diagnostics Debug** should be configurable at runtime with an environment default.
- Routine TEI retrieval summaries should not be always-on production logs once the system is stable.
- **Context Trace** data should not be mirrored into external memory systems.
- External memory mirrors should receive conversational content and minimal role/session metadata, not local diagnostics.
- **Context Trace** is operational diagnostics, not a normal user-interface feature.
- Normal chat UI should not surface **Context Trace**.
- Normal Chat **Context Selection** happens before the model call by default.
- If selected context is insufficient, AlfyAI should use a **Context Clarification** or **Context Limitation** rather than a hidden context-expansion loop.
- **Context Selection** should evolve through **Context Selection Slices**.
- Each **Context Selection Slice** should be testable and verifiable on its own.
- **Context Selection Slices** should follow test-driven development: prove the behavior, implement it, then refactor.
- A **Context Selection Slice** changes one observable context-selection behavior.
- A **Context Selection Slice** includes the cleanup needed for the behavior it replaces.
- A valid **Context Selection Slice** should prove behavior, trace output, and relevant regression protection.
- Broad refactors are not valid **Context Selection Slices** unless they are tied to one observable behavior.
- Every v1 **Context Selection Slice** should be a **Production Slice**.
- A **Production Slice** includes fallback behavior, observability, tests, and cleanup appropriate to its scope.
- Replacing context-selection behavior should include removing **Context Selection Debt** once the replacement path owns the behavior.

### Example dialogue

> **Dev:** "If a document is open and the user asks a general question, should the document go into the prompt?"
> **Domain expert:** "No. The open document is **Available Context**, but open by itself is only a **Weak Context Signal**."
>
> **Dev:** "If the document is open and the user says 'summarize this', should it be included?"
> **Domain expert:** "Yes. The open document plus the user's wording creates a **Strong Context Signal**, so it can become **Prompt Context** within the **Context Budget**."
>
> **Dev:** "If the system is unsure whether the open CV matters, should it include the whole CV or omit it?"
> **Domain expert:** "Neither by default. Use **Reference Context** or **Excerpt Context** unless the user asks for a task that needs **Task Context**."
>
> **Dev:** "Should users need to understand the context-selection process?"
> **Domain expert:** "No. AlfyAI should choose automatically and ask a **Context Clarification** only when ambiguity would materially change the answer."
>
> **Dev:** "Should every answer say which excerpts were used?"
> **Domain expert:** "No. Show a **Context Limitation** only when partial context materially changes how much the user should trust the answer."
>
> **Dev:** "If a turn sends too much context, should the UI show a context inspector?"
> **Domain expert:** "No. Emit a structured **Context Trace** in server logs so production behavior can be verified without surfacing diagnostics to users."
>
> **Dev:** "Should each subsystem add its own prompt text?"
> **Domain expert:** "No. Subsystems supply **Available Context** and **Context Signals**; **Context Selection** decides what becomes **Prompt Context**."

## Knowledge Library Context

### Language

**Library Document**:
A document the user has uploaded, imported, or otherwise stored in the Knowledge Library.
_Avoid_: artifact, file row, evidence item

**Uploaded Document**:
A **Library Document** created from a user-provided file.
_Avoid_: source artifact, original file

**Filename Conflict**:
A Knowledge Library upload whose filename is already used by another **Library Document** for the same user.
_Avoid_: duplicate version, overwrite candidate

**Auto-Renamed Upload**:
An **Uploaded Document** whose display name was changed to preserve both files after a **Filename Conflict**.
_Avoid_: new version, replacement, overwrite

**File Production Request**:
A user request for AlfyAI to create one or more downloadable **Generated Files**.
_Avoid_: export task, PDF tool call, sandbox job

**Generated File**:
A downloadable file produced by AlfyAI during chat.
_Avoid_: uploaded document, attachment, artifact

**Generated Document**:
A **Generated File** whose content is a document-like work item that can be opened, revised, or versioned.
_Avoid_: uploaded document, attachment, report, raw export

**Generated Document Source**:
The normalized semantic structure AlfyAI uses to render a **Generated Document**.
_Avoid_: PDF code, layout script, binary file bytes, raw HTML

**Generated Document Family**:
A set of **Generated Documents** that are iterations of the same AI-created work item.
_Avoid_: duplicate upload group, file history

**Generated Document Version**:
One member of a **Generated Document Family**.
_Avoid_: uploaded duplicate, library version

**Generated Document Template**:
A reusable presentation policy for rendering a **Generated Document Source**.
_Avoid_: generated document source, PDF script, style prompt

**Working Document**:
A **Library Document** or **Generated Document** that the user has opened, selected, or clearly continued working on.
_Avoid_: active file, current artifact

### Relationships

- A **Library Document** may be an **Uploaded Document**.
- A **Generated Document** is a **Generated File**.
- A **Generated File** is not an **Uploaded Document**.
- A **Generated File** does not automatically become a **Generated Document**.
- A **File Production Request** may produce one or more **Generated Files**.
- A **File Production Request** is one user-facing capability even when AlfyAI uses different internal production methods.
- A **Generated Document** may have a **Generated Document Source**.
- A **Generated Document Source** is **Available Context**.
- The rendered binary file is the downloadable **Generated File**.
- A **Generated Document Template** renders a **Generated Document Source** into one or more downloadable formats.
- A **File Production Request** may name a **Generated Document Template**.
- When no template is named, AlfyAI chooses an appropriate **Generated Document Template**.
- AlfyAI owns document layout and rendering; the assistant supplies semantic content, not PDF layout code.
- Non-document outputs such as raw data files, code files, images, or bundles may remain **Generated Files** without entering generated-document version history.
- A **Filename Conflict** creates an **Auto-Renamed Upload**.
- A **Filename Conflict** does not create a **Generated Document Version**.
- An **Auto-Renamed Upload** remains a separate **Uploaded Document**.
- Uploaded documents do not form user-visible version history in v1.
- A **Generated Document Family** may contain one or more **Generated Document Versions**.
- A **Working Document** may point to either a **Library Document** or a **Generated Document**.
- Opening a document can make it a **Working Document**, but it does not by itself make the whole body **Prompt Context**.

### Example dialogue

> **Dev:** "If the user uploads `report.pdf` twice, is the second file version 2?"
> **Domain expert:** "No. That is a **Filename Conflict**, so the second file becomes an **Auto-Renamed Upload** such as `report_1.pdf`."
>
> **Dev:** "When do we show version history?"
> **Domain expert:** "Only for a **Generated Document Family**, where each generated iteration is a **Generated Document Version**."
>
> **Dev:** "If AlfyAI creates `data.csv`, is that a **Generated Document**?"
> **Domain expert:** "No. It is a **Generated File**. It becomes a **Generated Document** only if the user treats it as a work item to open, revise, or version."
>
> **Dev:** "Should the assistant choose between a PDF export feature and a sandbox file generator?"
> **Domain expert:** "No. The user made one **File Production Request**. AlfyAI chooses the internal production path."
>
> **Dev:** "Should the assistant write PDF styling code?"
> **Domain expert:** "No. The assistant provides a **Generated Document Source**; AlfyAI applies a **Generated Document Template** when rendering."
>
> **Dev:** "Can an uploaded PDF be the **Working Document**?"
> **Domain expert:** "Yes. A **Working Document** can be uploaded or generated, but upload duplicates still stay separate documents."

## Deep Research Context

### Language

**Deep Research Job**:
A user-started background research task that plans, gathers sources, synthesizes findings, and produces a cited report.
_Avoid_: agent, flow, chat turn, automatic search, standard report generation

**Normal Chat**:
The default conversational mode where the user can ask questions and the assistant may use available tools within the ordinary chat turn.
_Avoid_: shallow chat, basic mode

**Deep Research Mode**:
An explicit chat composer setting that causes the next user request to start a **Deep Research Job** instead of a **Normal Chat** turn.
_Avoid_: auto research, agent mode, report mode

**Report Boundary**:
The point after a **Deep Research Job** completes where its conversation becomes read-only and further discussion must start from the completed report in a new conversation.
_Avoid_: finished chat, dead chat, context lock, archive

**Report Action**:
An allowed interaction with a completed report after a **Report Boundary**, such as opening, inspecting sources, exporting, or starting a new conversation from it.
_Avoid_: follow-up turn, continued chat

**Discuss Report**:
A **Report Action** that starts a new **Normal Chat** using the completed report as context.
_Avoid_: reopen chat, continue chat

**Research Further**:
A **Report Action** that starts a new **Deep Research Job** using the completed report as context.
_Avoid_: follow-up turn, continue research

**Research Plan**:
A user-reviewable outline of the questions, source scope, and expected report shape for a **Deep Research Job**.
_Avoid_: hidden prompt, agent thoughts, execution plan

**Plan Edit**:
A freeform user instruction that asks AlfyAI to revise a **Research Plan** before research starts.
_Avoid_: advanced plan form, parameter editor

**Focused Deep Research**:
A Deep Research depth for narrow questions that need a cited brief without broad source exploration.
_Avoid_: short, quick, shallow

**Standard Deep Research**:
The default Deep Research depth for serious multi-source synthesis.
_Avoid_: normal chat, regular chat

**Max Deep Research**:
The highest Deep Research depth for broad or high-stakes investigations that may inspect hundreds of sources.
_Avoid_: exhaustive mode, unlimited research

**Planning Context**:
Relevant user or workspace context used to draft a better **Research Plan** before research starts.
_Avoid_: source, evidence, citation

**Research Source**:
A source that a **Deep Research Job** may read, analyze, cite, or use as evidence in the final report.
_Avoid_: context, memory, hint

**Research Report**:
The completed, cited output produced by a **Deep Research Job**.
_Avoid_: assistant answer, generated file, summary, chat response

**Discovered Source**:
A candidate source found during research but not necessarily read.
_Avoid_: used source, citation

**Reviewed Source**:
A source opened, extracted, summarized, or otherwise analyzed by a **Deep Research Job**.
_Avoid_: search result, cited source

**Cited Source**:
A **Research Source** cited in a **Research Report**.
_Avoid_: discovered source, reviewed source

**Research Budget**:
The depth-dependent ceiling for source discovery, review, synthesis passes, and runtime effort in a **Deep Research Job**.
_Avoid_: source quota, guaranteed source count

**Research Effort Estimate**:
A coarse pre-approval disclosure of expected time, source review scale, and relative cost for a **Deep Research Job**.
_Avoid_: guaranteed runtime, exact quote

**Activity Timeline**:
A user-visible record of major **Deep Research Job** steps, source progress, assumptions, and stage changes.
_Avoid_: thinking, chain of thought, debug log

**Research Language**:
The language used for user-facing **Deep Research** plan, progress, and report prose.
_Avoid_: source language, UI language

**Research Card**:
The chat-visible representation of a **Deep Research Job** or **Research Report**.
_Avoid_: assistant message, placeholder, report body

**Research Workspace**:
The structured working state of a **Deep Research Job**, including plan versions, source ledger, extracted notes, synthesis drafts, citation records, and activity events.
_Avoid_: filesystem, scratchpad, hidden memory

**Coverage Assessment**:
A checkpoint where AlfyAI decides whether the **Reviewed Sources** sufficiently answer the approved **Research Plan**.
_Avoid_: vibes check, confidence guess

**Research Usage**:
Cost, token, model, provider, and runtime measurements produced by Deep Research planning, research, synthesis, and audit work.
_Avoid_: message analytics, hidden cost

**Coverage Gap**:
An unanswered or weakly supported part of an approved **Research Plan** identified during **Coverage Assessment**.
_Avoid_: todo, missing info, uncertainty

**Research Task**:
A bounded unit of research work inside a **Deep Research Job**, assigned to a key question, **Coverage Gap**, source group, or synthesis step.
_Avoid_: subagent, autonomous worker

**Pass Barrier**:
A synchronization point where required **Research Tasks** for a research pass must complete, fail, or be explicitly skipped before **Coverage Assessment** or synthesis can proceed.
_Avoid_: race, loose parallelism

**Report Limitation**:
A disclosed weakness, missing answer, source constraint, or uncertainty in a **Research Report**.
_Avoid_: failure, excuse, hidden caveat

**Citation Audit**:
A verification step that checks whether **Research Report** claims are supported by cited **Reviewed Sources**.
_Avoid_: source formatting, citation cleanup

### Relationships

- A **Deep Research Job** is optional and explicitly started by the user.
- A **Deep Research Job** extends **Normal Chat** without replacing it.
- **Normal Chat** may use tools casually; a **Deep Research Job** is a deliberate background task.
- **Deep Research Mode** must be switched on by the user; AlfyAI does not automatically convert a **Normal Chat** request into a **Deep Research Job**.
- Successful **Deep Research Job** completion creates a **Report Boundary**.
- Cancelling a **Deep Research Job** does not create a **Report Boundary**.
- After a **Report Boundary**, users may take **Report Actions** but may not send new turns into the same conversation.
- Starting from a completed report creates a new conversation; it does not reopen the sealed conversation.
- **Discuss Report** starts a new **Normal Chat**.
- **Research Further** starts a new **Deep Research Job**.
- A **Discuss Report** conversation may still use casual tools, but it does not become a **Deep Research Job** unless the user explicitly chooses **Deep Research Mode** again.
- A sealed conversation cannot start another **Deep Research Job** directly.
- A conversation may have at most one active or uncompleted **Deep Research Job**.
- A cancelled or failed **Deep Research Job** does not prevent starting another **Deep Research Job** in the same unsealed conversation.
- Every **Deep Research Job** creates a **Research Plan** before source-heavy research begins.
- The user may approve, edit, add to, or cancel a **Research Plan**.
- Source-heavy research does not begin until the user approves the **Research Plan**.
- Cancelling before **Research Plan** approval does not create a **Report Boundary**.
- Editing a **Research Plan** produces a revised **Research Plan**; it does not start source-heavy research.
- After a **Research Plan** is revised, the user is again offered approval or further editing.
- A **Research Plan** includes a goal, key questions, source scope, depth, report shape, constraints, and deliverables.
- A **Plan Edit** is freeform; AlfyAI synthesizes the user's edit into a revised **Research Plan**.
- The Deep Research planning flow avoids exposing advanced structured controls beyond approval, cancellation, and freeform editing.
- Deep Research depth levels are **Focused Deep Research**, **Standard Deep Research**, and **Max Deep Research**.
- No Deep Research depth is selected by default; the user explicitly chooses **Focused Deep Research**, **Standard Deep Research**, or **Max Deep Research**.
- AlfyAI may recommend a different depth in the **Research Plan**, but it must not automatically change the user's selected depth.
- The knowledge library may contribute **Planning Context**.
- **Planning Context** is not automatically a **Research Source**.
- The **Research Plan** must disclose source scope before approval.
- Knowledge-library items become **Research Sources** only when the approved **Research Plan** includes them.
- Files attached to the **Deep Research Job** request may be **Research Sources** because attachment is an explicit user action.
- Current conversation context may be **Planning Context**, but is not automatically cited as a **Research Source** unless the approved **Research Plan** says the report is based on it.
- When private or workspace material influences a **Research Plan**, the plan may show a compact "context considered" disclosure.
- A "context considered" disclosure summarizes **Planning Context** by type, count, or title; it is not evidence or citation.
- Every successful **Deep Research Job** produces exactly one **Research Report**.
- A **Research Report** creates the **Report Boundary** for its conversation.
- A **Research Report** is durable and reusable; it is not only assistant message text.
- A **Research Report** includes citations and a user-facing source list.
- A full source ledger or activity history may be attached to the **Research Report** as metadata.
- A **Research Source** may be tracked as a **Discovered Source**, **Reviewed Source**, or **Cited Source**.
- Only **Reviewed Sources** may become **Cited Sources**.
- **Discovered Sources** may appear in a source ledger or activity history, but they are not evidence for report claims.
- Source counts should distinguish discovered, reviewed, and cited sources instead of presenting one inflated total.
- Deep Research depth sets a **Research Budget**.
- A **Research Budget** is a ceiling, not a promised source count.
- A **Research Plan** should show a **Research Effort Estimate** before approval.
- A **Research Effort Estimate** is coarse and not a promise.
- A **Deep Research Job** may stop before reaching its **Research Budget** when coverage is sufficient or source quality drops.
- A **Deep Research Job** must not pad weak sources to satisfy a **Research Budget**.
- Clarifying questions are allowed before **Research Plan** approval.
- After **Research Plan** approval, a **Deep Research Job** should run to completion without blocking for more user input.
- If ambiguity appears after approval, the **Deep Research Job** should make and disclose a reasonable assumption instead of pausing indefinitely.
- While a **Deep Research Job** is running, the user may view progress or cancel it.
- A **Research Plan** cannot be edited after approval in v1.
- To change direction after approval, the user cancels and starts a new **Deep Research Job**.
- A running **Deep Research Job** shows an **Activity Timeline** rather than only a spinner.
- The **Activity Timeline** is persisted and remains attached to the **Research Report** after completion.
- The **Activity Timeline** shows user-facing stage progress, source counts, brief summaries, assumptions, and warnings.
- The **Activity Timeline** does not expose private model reasoning or chain-of-thought.
- Deep Research user-facing text must support English and Hungarian.
- **Research Language** defaults to the latest user request language unless the user explicitly asks for another output language.
- **Research Sources** may be in languages other than the **Research Language**.
- Source titles, quotes, and citations may remain in their original source language.
- Deep Research prose should not mix English and Hungarian except for source material, product names, file names, URLs, citations, and quotes.
- A **Research Card** presents the **Research Plan**, running **Activity Timeline**, source progress, completion state, and **Report Actions** inside chat.
- A **Research Card** is not the full **Research Report**.
- After a **Report Boundary**, the **Research Card** remains visible in the read-only conversation.
- The full **Research Report** opens in the workspace/report viewing surface rather than inline as chat content.
- The **Research Report** view exposes the report body, source list, and **Activity Timeline**.
- A **Research Report** is a durable workspace document.
- A **Research Report** is not automatically persona memory.
- A **Research Report** should influence future conversations only through explicit or strongly relevant retrieval signals.
- A **Deep Research Job** uses a **Research Workspace** for predictable, inspectable working state.
- A **Research Workspace** is structured; it is not a generic agent filesystem.
- **Research Usage** is tracked for internal Deep Research model calls, tool calls, and workflow stages.
- **Research Usage** belongs to the **Deep Research Job** or **Research Task** that produced it, not fake chat messages.
- Deep Research cost should roll up into user, conversation, model, provider, and billing-month analytics.
- User-facing **Research Usage** may show runtime, source counts, and actual or estimated cost after completion.
- Internal token/model/provider details belong in analytics, not the main **Research Report** UI.
- Deep Research uses iterative discovery and review passes.
- A **Coverage Assessment** happens after each review pass.
- A **Coverage Assessment** may trigger another discovery and review pass when coverage is insufficient and **Research Budget** remains.
- A **Coverage Assessment** considers key-question coverage, source quality, source diversity, conflicts, freshness, and remaining **Research Budget**.
- **Coverage Assessment** is a separate structured evaluator step rather than the report writer's implicit judgment.
- **Coverage Assessment** returns whether coverage is sufficient and any **Coverage Gaps**.
- When coverage is insufficient and **Research Budget** remains, **Coverage Gaps** guide targeted discovery.
- If **Research Budget** is exhausted before coverage is strong, the **Research Report** must disclose limitations.
- **Coverage Assessment** decisions should be summarized in the **Activity Timeline**.
- **Research Tasks** may run in parallel, but each task has a narrow assignment.
- **Research Tasks** write structured outputs into the **Research Workspace**.
- The orchestrator decides whether to continue discovery, synthesize, or complete; individual **Research Tasks** do not.
- A **Pass Barrier** prevents **Coverage Assessment** or synthesis from running on incomplete required work.
- Parallelism is bounded by depth, user, and system limits.
- A failed **Research Task** records its reason in the **Research Workspace**.
- Transient **Research Task** failures may be retried.
- Failed **Research Tasks** become **Coverage Gaps** when they affect critical questions and cannot be replaced within budget.
- A **Deep Research Job** does not fail only because some non-critical **Research Tasks** fail.
- A **Deep Research Job** may complete with **Report Limitations** when it can still produce a useful, citation-supported **Research Report**.
- A **Deep Research Job** should fail only when no credible **Research Report** can be produced, core claims cannot be supported, required source pools are inaccessible, infrastructure repeatedly fails, or cancellation is requested.
- **Report Limitations** must be visible in the **Research Report** rather than hidden in internal logs.
- Every **Research Report** goes through **Citation Audit**.
- **Citation Audit** verifies claim support, not only citation formatting.
- Unsupported core claims must be repaired, removed, or disclosed as **Report Limitations**.
- **Citation Audit** may trigger one repair pass before completion or failure.
- A **Research Report** has a semi-fixed structure: title, executive summary, key findings, main body organized by the **Research Plan**, citations, source list, and **Report Limitations** when applicable.
- A **Research Report** may add plan-specific sections such as recommendations, comparison matrices, timelines, methodology, appendices, or next steps.
- Deep Research should be built in independently testable and verifiable vertical slices.
- Deep Research slices should follow test-driven development: prove the behavior, implement it, then refactor.
- Deep Research v1 slices should be production-capable rather than prototype-only.
- A production-capable Deep Research slice includes fallback behavior, observability, tests, and cleanup appropriate to its scope.
- Deep Research cleanup should be part of replacement slices so obsolete paths do not remain as parallel behavior.

### Example dialogue

> **Dev:** "Should every report request become a **Deep Research Job**?"
> **Domain expert:** "No. **Normal Chat** can still answer, search, and generate files. A **Deep Research Job** only starts when the user explicitly switches it on."
>
> **Dev:** "If the user cancels research midway, is that conversation now read-only?"
> **Domain expert:** "No. Only successful completion creates a **Report Boundary**."
>
> **Dev:** "Can the user ask a follow-up in the same conversation after the report is done?"
> **Domain expert:** "No. They can start a new conversation from the report, or start another **Deep Research Job**, but the completed report conversation stays read-only."
>
> **Dev:** "Should asking about a completed report automatically start deeper research?"
> **Domain expert:** "No. **Discuss Report** starts **Normal Chat**. **Research Further** is the explicit deep research path."
>
> **Dev:** "Can a deep research request immediately start browsing because the prompt seems clear?"
> **Domain expert:** "No. It first creates a **Research Plan** that the user can edit or approve."
>
> **Dev:** "If the user edits the plan, does that count as starting research?"
> **Domain expert:** "No. Editing produces a revised **Research Plan** and asks again whether to approve or edit."
>
> **Dev:** "Should users edit plans through a complex form?"
> **Domain expert:** "No. A **Plan Edit** is freeform, and AlfyAI turns it into a revised **Research Plan**."
>
> **Dev:** "Can AlfyAI silently upgrade a focused task to max depth?"
> **Domain expert:** "No. It can recommend a depth change in the **Research Plan**, but the user decides."
>
> **Dev:** "Can private library material help AlfyAI understand what the user likely means?"
> **Domain expert:** "Yes, as **Planning Context**. It only becomes a **Research Source** if the approved **Research Plan** includes it."
>
> **Dev:** "Should the user see why the plan seems personalized?"
> **Domain expert:** "Yes, the plan can show a compact context-considered disclosure without turning that context into report evidence."
>
> **Dev:** "Is the final deep research output just another assistant message?"
> **Domain expert:** "No. It is a durable **Research Report** that can be opened, reused, and inspected."
>
> **Dev:** "Can we say Max used 600 sources if most were only search candidates?"
> **Domain expert:** "No. Say 600 **Discovered Sources**, then separately count **Reviewed Sources** and **Cited Sources**."
>
> **Dev:** "Did Max fail if it reviewed fewer than 100 sources for a narrow topic?"
> **Domain expert:** "No. The **Research Budget** is a ceiling, not a quota."
>
> **Dev:** "Can approved research stop midway to ask the user what they meant?"
> **Domain expert:** "No. After approval, it should continue and disclose any assumptions it had to make."
>
> **Dev:** "Can the user add 'exclude Reddit' after approved research is already running?"
> **Domain expert:** "Not in v1. They can cancel and start a new **Deep Research Job** with a revised **Research Plan**."
>
> **Dev:** "Should running research just show a spinner?"
> **Domain expert:** "No. It should show a persisted **Activity Timeline** with meaningful research stages and source progress."
>
> **Dev:** "If the user asks in Hungarian for research using English sources, what language is the report?"
> **Domain expert:** "The **Research Language** is Hungarian, while **Research Sources** may remain English."
>
> **Dev:** "Should the completed report render inline as a huge chat message?"
> **Domain expert:** "No. The **Research Card** stays compact, and the full **Research Report** opens separately."
>
> **Dev:** "Where should users inspect a long Max report and its sources?"
> **Domain expert:** "In the workspace/report viewing surface, not by scrolling through chat."
>
> **Dev:** "Does completing a sensitive report mean future casual chats should remember it automatically?"
> **Domain expert:** "No. A **Research Report** is a workspace document, not automatic persona memory."
>
> **Dev:** "Should deep research rely on a hidden agent filesystem?"
> **Domain expert:** "No. It should use a structured **Research Workspace** so progress, sources, notes, and citations are inspectable."
>
> **Dev:** "Does deep research search once and then write?"
> **Domain expert:** "No. It repeats discovery and review until **Coverage Assessment** says coverage is sufficient or the **Research Budget** is exhausted."
>
> **Dev:** "If the report writer wants to proceed but a key question lacks evidence, what happens?"
> **Domain expert:** "A separate **Coverage Assessment** identifies the **Coverage Gap** and drives another targeted discovery pass if budget remains."
>
> **Dev:** "Can parallel search workers synthesize as soon as they individually finish?"
> **Domain expert:** "No. **Research Tasks** write to the **Research Workspace**, and a **Pass Barrier** waits for required tasks before assessment or synthesis."
>
> **Dev:** "Should Max fail because three reviewed pages could not be fetched?"
> **Domain expert:** "No, unless those failures prevent a credible report and cannot be replaced or disclosed as **Coverage Gaps**."
>
> **Dev:** "If two vendors hide pricing behind sales forms, should the whole report fail?"
> **Domain expert:** "No. Complete with **Report Limitations** and avoid unsupported pricing claims."
>
> **Dev:** "Can the report claim SOC 2 certification from a vague security marketing page?"
> **Domain expert:** "No. **Citation Audit** must reject or repair unsupported claims."
>
> **Dev:** "Should every report use exactly the same section template?"
> **Domain expert:** "No. The structure is semi-fixed: core trust sections are always present, while plan-specific sections adapt."

## Flagged ambiguities

- "canonical" means the preferred term inside the Deep Research subdomain, not the default format for all AlfyAI answers or reports.
- "finished chat" means a conversation after a **Report Boundary**, not cancellation, deletion, or archival.
