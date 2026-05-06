# Render Deep Research reports from structured report blocks

Deep Research reports must be readable decision artifacts, not source-note dumps or model-authored Markdown blobs. We will render completed Deep Research Markdown deterministically from app-owned Structured Report Blocks selected by Report Intent. The report-writing model may help produce concise language inside structured fields, but AlfyAI owns the report shape, block ordering, appendix placement, citations, and Markdown rendering.

The default reading shape is a Decision Brief: answer first, then the strongest supported findings, then intent-specific structure such as a comparison matrix, recommendation rubric, timeline, shortlist, evidence table, or limitation memo shape. Source ledger, audit notes, detailed limitations, and evidence basis belong in appendix-style sections so provenance remains durable without dominating the main reading path.

This applies to all Deep Research outcomes, not only comparison reports. Initial upgraded Markdown shapes are comparison, recommendation, investigation, market/product scan, evidence review, and evidence limitation memo. Charts are reserved for genuinely quantitative patterns; two-entity comparisons should usually use a comparison matrix with comparison axes as rows, compared entities as columns, and decision meaning where the report supports a choice.

**Considered Options**

- Ask the report-writing model to emit better freeform Markdown.
- Keep the current generic Markdown skeleton and improve CSS/renderer polish.
- Extend the Structured Research Report model with intent-specific Structured Report Blocks and render Markdown from those blocks.

We chose structured report blocks because prompt-only Markdown polish will drift, and renderer polish cannot turn weak structure into a human-readable report. App-owned rendering keeps report readability, citation placement, appendix detail, and visual aids predictable while still allowing the model to improve wording inside grounded fields.
