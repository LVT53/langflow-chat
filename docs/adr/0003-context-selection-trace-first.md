# Log context selection before changing selection behavior

Normal Chat context selection will first gain structured section- and item-level operational trace logs before major selection behavior changes. This trace-first slice also consolidates overlapping success-path context, attachment, and retrieval logs so production logging stays sparse. This lets us verify where oversized prompts come from in production without surfacing diagnostics in the UI or mirroring them to Honcho, gives later TDD slices an observable contract, and prevents cleanup from deleting old selection paths before replacement behavior is proven.

**Considered Options**

- Immediately tighten document, attachment, and memory selection behavior.
- Build the full new context-selection service before adding observability.
- Persist context traces in assistant-message metadata.
- Add structured context trace logs first, then migrate selection behavior in vertical slices.
- Add structured context trace logs without removing overlapping success-path diagnostics.

We chose structured logs first because the current failure is hard to diagnose from final token totals alone, the trace is operational diagnostics rather than a user-facing feature, and each later slice needs trace assertions to prove both behavior and cleanup. We reject parallel logging because it would make production behavior harder to inspect; the first slice should replace routine TEI/context/attachment success diagnostics with one compact trace while preserving warnings and errors.
