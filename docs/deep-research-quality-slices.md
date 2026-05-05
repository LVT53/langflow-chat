# Deep Research Quality Slices

These are local `$to-issues` slices for the Deep Research reliability and readability work. They are not published tracker issues. Each slice should remain independently verifiable and should preserve English and Hungarian UI/system output.

## 1. Gate Reviewed Sources By Topic Relevance

**Type:** AFK

**Blocked by:** None

**User stories covered:** As a user, I should not receive a Research Report whose citations are unrelated to the approved Research Plan, even if source counts look high.

**What to build:** Count only Topic-Relevant Reviewed Sources toward report eligibility and key-question coverage. Source review should reject sources whose title/snippet/extracted text does not match the approved Research Plan topic anchors.

**Acceptance criteria**

- [ ] A high-scoring reviewer result for an off-topic source is persisted as rejected.
- [ ] Off-topic reviewed-source notes cannot satisfy coverage for approved key questions.
- [ ] The behavior works with Hungarian text and diacritic-insensitive matching.
- [ ] Deep Research service tests cover the off-topic citation failure mode.

## 2. Publish Evidence Limitation Memo Instead Of Bad Reports

**Type:** AFK

**Blocked by:** Slice 1

**User stories covered:** As a user, I should get a useful explanation when Deep Research cannot produce a credible report, not a polished but nonsensical report.

**What to build:** When source review exhausts the Research Budget without enough topic-relevant evidence, complete the job with an Evidence Limitation Memo artifact instead of a Research Report artifact.

**Acceptance criteria**

- [ ] The artifact is not labeled as a Research Report.
- [ ] The memo shows reviewed scope, topic-relevant count, rejected/off-topic count, and next research direction.
- [ ] The Research Card distinguishes the memo from successful report completion.
- [ ] English and Hungarian memo labels are localized.

## 3. Add Source Ledger Favicon Identity

**Type:** AFK

**Blocked by:** None

**User stories covered:** As a user, I should be able to scan cited websites quickly without reading every URL.

**What to build:** Show website favicons on cited source rows/cards where a stable hostname exists, with silent fallback to the existing source icon.

**Acceptance criteria**

- [ ] Cited source rows show a favicon for normal public web URLs.
- [ ] Missing or blocked favicons degrade to the current icon without layout shift.
- [ ] Tests cover favicon URL generation and fallback rendering.
- [ ] No external favicon dependency is required beyond deterministic URL construction or existing browser behavior.

## 4. Structure Reports Before Markdown Rendering

**Type:** AFK

**Blocked by:** Slice 1

**User stories covered:** As a user, I should receive a report that reads like a coherent research paper, not a repeated list of loosely connected bullets.

**What to build:** Make the report writer produce a Structured Research Report object before Markdown rendering, including title, scope, executive summary, comparison matrix where applicable, key findings, body sections, source list, and limitations.

**Acceptance criteria**

- [ ] The report pipeline validates required structured fields before Markdown output.
- [ ] Markdown rendering uses headings, tables, callouts, and source sections consistently.
- [ ] Citation audit repairs or limits claims without flattening the report into repeated bullet lists.
- [ ] English and Hungarian report skeletons are both supported.

## 5. Polish Research Card Interactions

**Type:** AFK

**Blocked by:** None

**User stories covered:** As a user, the Deep Research card should feel alive and compact while work is running.

**What to build:** Fix the depth popup dismissal, connect Activity Timeline lines through the final dot, and suppress repeated source-count chips unless counts changed or diagnostic context is useful.

**Acceptance criteria**

- [ ] The depth popup closes on outside pointer interaction and Escape.
- [ ] Timeline connector lines visually reach the final timeline marker.
- [ ] Repeated unchanged per-event source counts are hidden.
- [ ] Source-specific, citation-specific, changed, or warning events still show counts.
- [ ] Tests cover the popup and timeline behaviors.

## 6. Run Hungarian End-To-End Deep Research Pass

**Type:** AFK

**Blocked by:** Slices 2 and 4

**User stories covered:** As a Hungarian user, Deep Research should not mix English operational copy into the plan, timeline, report, or limitation states.

**What to build:** Add an end-to-end Hungarian verification pass for the Deep Research UI/system pipeline and fill missing i18n keys found by that pass.

**Acceptance criteria**

- [ ] Plan, Research Card, timeline, report headings, limitations, and memo labels render in Hungarian when the research language is Hungarian.
- [ ] Source titles and quoted source names may remain in their original language.
- [ ] Tests or fixtures assert that key UI strings are not hardcoded English.
- [ ] The result stays readable with Hungarian date and source-count phrasing.
