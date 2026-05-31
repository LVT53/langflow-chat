# Langflow Model Run belongs to a dedicated execution boundary

Status: Accepted. The initial boundary landed in commit `13bbdcf6`; follow-up review fixes verified in the current worktree clarified abort propagation, payload-preparation ownership, rate-limit fallback abort handling, and control-model abort-listener cleanup.

Normal Chat prompt assembly stays in `src/lib/server/services/langflow.ts`, but outbound Langflow execution belongs in `src/lib/server/services/langflow-model-run.ts`.

The Langflow Model Run boundary owns already-assembled Langflow request execution: JSON and streaming HTTP transport, request and stream-connect timeouts, abort-signal merging and cleanup, caller abort propagation for active returned streams, HTTP error classification, rate-limit detection, provider/global failover target resolution, abort re-checks before retrying after async fallback resolution, failover logging, response text extraction, provider usage extraction, and compact run diagnostics.

`langflow.ts` remains the prompt-facing module. It resolves the selected model/provider, assembles the outbound system prompt, runs Context Selection and context compression, applies prompt budget rules, prefetches forced web research, builds Langflow tweaks, and passes the final request body to the Model Run boundary.

The control-model JSON path used by structured control tasks may continue to call OpenAI-compatible `/v1/chat/completions` directly. That path may own its own thin request-timeout and abort-listener cleanup because it is a separate control-model transport concern, and should not be used to pull Normal Chat Langflow run/failover behavior back into `langflow.ts`.

**Considered Options**

- Keep JSON and streaming attempt/failover logic duplicated in `langflow.ts`.
- Move prompt assembly, context fit, and model execution into one larger model-run module.
- Put upstream Langflow streaming behavior into the Browser SSE Protocol boundary.
- Own Langflow run attempts and failover in a dedicated Model Run boundary.

We chose the dedicated Model Run boundary because timeout and rate-limit failover rules must stay identical for JSON and streaming runs, while prompt construction and context selection have different ownership and risk. This gives one testable execution surface without making Langflow transport responsible for what context is selected or what a completed turn means durably.

**Consequences**

- Future Langflow request attempt, timeout, rate-limit, failover, and provider-usage changes should start in `src/lib/server/services/langflow-model-run.ts`.
- Prompt guards, date/search guidance, file-production guidance, context fit, and Langflow tweak construction should remain in `src/lib/server/services/langflow.ts` unless a separate prompt module is explicitly designed.
- Normal Chat Turn Completion remains owned by `src/lib/server/services/chat-turn/finalize.ts`; Model Run returns model output and run metadata only.
- Browser-facing SSE event names and payloads remain owned by `src/lib/services/stream-protocol.ts`; upstream Langflow stream connect/retry behavior is not Browser SSE grammar.
- Run diagnostics should use the existing compact `[LANGFLOW]` vocabulary and avoid duplicating Context Trace body text or creating parallel noisy logs.

Update this ADR when a future change intentionally moves one of these boundary responsibilities, introduces a separate prompt-assembly boundary, replaces Langflow transport, or changes the failover policy contract shared by JSON and streaming Normal Chat runs. Do not update it just because `langflow.ts` gains new prompt/context inputs or `langflow-model-run.ts` gains another transport detail that still fits this split.
