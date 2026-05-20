# Deep Research Stabilization Review

DRSS-08 reviewer pass, 2026-05-20.

## Fixed In Pass

- Corrected-plan recovery now scopes synthesis resume keys by Research Plan version and filters report-eligibility Evidence Notes and Synthesis Claims to records created for the active plan. This prevents accepted claims from a poisoned run from satisfying corrected-plan report publication.
- Hungarian abstract architecture recommendation plans now keep recommendation-oriented framing, detect "hasonlíts össze legalább három ..." option-category comparisons, and render the Plan Normalization Note in Hungarian.

## Follow-Ups

- Plan Health Check currently targets the architecture poisoned-plan failure class. Future slices should add fixtures for other abstract option-category prompts, especially legal, health, finance, and procurement prompts where false positives would be costly.
- The Plan Health Check threshold is fixed at 20 reviewed sources. Keep it conservative for now, but calibrate against real source-review telemetry before broad rollout so small focused runs do not over-trigger and large noisy runs do not wait too long.
- Corrected-plan recovery retires tasks, pass checkpoints, coverage gaps, and now active evidence/claims by plan timestamp. A future persistence cleanup could explicitly mark old Evidence Notes, Synthesis Claims, and resume points as diagnostic history for easier operator inspection.
- Limited Research Report rendering is covered at Markdown/card level, but a browser-level route/view test for the full report viewer would catch regressions in provenance placement and visible limitations outside the card component.
- Hungarian copy is present for new card labels and the abstract-plan normalization path, but longer generated limitation strings still rely on templated translations in the report writer. Add richer Hungarian fixtures for limited reports with unsupported-claim limitations.
