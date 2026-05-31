# Deepen Langflow Model Run Slices

**Status:** Implemented
**Last reviewed:** 2026-05-31

Source: `/private/var/folders/6c/llmb9__97ngcxtc26hvg8jzh0000gn/T/architecture-review-20260529-195600.html`, section `Deepen Langflow Model Run`.

## Implementation Status

The Langflow Model Run boundary is implemented in `src/lib/server/services/langflow-model-run.ts`.

- `langflow.ts` still owns model/provider resolution, outbound prompt assembly, context fit, context compression, forced web prefetch, Langflow tweaks, and final request-body construction.
- `langflow-model-run.ts` owns JSON and streaming Langflow HTTP execution, request/connect timeout handling, HTTP and rate-limit classification, provider/global failover resolution, failover logging, response extraction, provider usage extraction, and compact `[LANGFLOW]` run diagnostics.
- `sendMessage` and `sendMessageStream` both use `runLangflowModelRunWithFailover` so timeout and rate-limit retry policy has one implementation.
- Focused coverage now lives in `src/lib/server/services/langflow-model-run.test.ts`, with compatibility coverage retained in `src/lib/server/services/langflow.test.ts`.

## Context

`src/lib/server/services/langflow.ts` currently owns both prompt assembly and model execution. The architecture review asks to keep Langflow prompt assembly in place, but deepen model execution behind a focused Model Run module so JSON and stream requests share attempt, timeout, rate-limit fallback, and run-diagnostic behavior.

Docs checked before planning:

- Context7 Vitest v4.1.6 docs for ESM module mocks, `vi.mock`, fake timers, and mock reset patterns.
- Context7 SvelteKit docs for `+server.ts` request handlers returning `json(...)`; no route behavior is expected to change in this refactor.

## Done Criteria

- `langflow.ts` keeps outbound prompt assembly, context fit, context compression, forced web prefetch, and Langflow request body construction.
- A deep model-run module owns outbound Langflow HTTP execution for both JSON and stream runs.
- Timeout handling, connect-timeout handling, HTTP error classification, rate-limit detection, failover target resolution, failover logging, and result diagnostics live in that model-run boundary.
- `sendMessage` and `sendMessageStream` share one retry/failover policy instead of duplicating timeout and rate-limit retry orchestration.
- Existing public `sendMessage`, `sendMessageStream`, `sendJsonControlMessage`, `isLangflowTimeoutError`, `isLangflowRateLimitError`, and failover result shapes remain compatible.
- Stale helper code and tests left behind by the extraction are removed rather than kept as duplicate paths.
- Focused tests prove JSON and streaming behavior across success, non-stream fallback, timeout failover, connect timeout, rate-limit provider fallback, and non-rate-limit errors.

## Slice 1: Extract Model Run Transport

Type: AFK

Blocked by: None

What to build:

Create a Langflow Model Run module that accepts an already-built request body plus run metadata and executes either a JSON request or a streaming request. It should own request URLs, headers, abort signal merging, body serialization, timeout timers, HTTP error creation, stream content-type handling, provider usage extraction for JSON responses, and compact attempt diagnostics. `langflow.ts` should call this boundary after prompt construction.

Acceptance criteria:

- JSON chat execution uses the new module and preserves response text extraction, provider usage, and existing returned metadata.
- Streaming execution uses the same module and preserves text-event-stream success, non-stream JSON fallback, missing-body errors, and provider usage on JSON fallback.
- Request and connect timeouts are created and cleared inside the model-run boundary.
- User-supplied abort signals still bypass automatic failover.
- Existing tests that inspect Langflow request bodies keep passing.

Suggested verification:

- `npx vitest run src/lib/server/services/langflow.test.ts`
- Add focused model-run tests for timeout, HTTP error, and non-stream JSON fallback if the extracted module can be tested directly.

## Slice 2: Centralize Failover Policy

Type: AFK

Blocked by: Slice 1

What to build:

Move duplicated send/stream retry orchestration behind one Model Run failover policy. The policy should resolve timeout failover once, choose the shortened first-attempt timeout, retry on Langflow timeout errors when configured, retry on rate-limit errors with provider-specific fallback first and global fallback second, and emit the existing `[LANGFLOW] ... switching to failover model` log line.

Acceptance criteria:

- JSON and streaming runs use one shared failover orchestration function.
- Timeout failover still returns `timeoutFailover: { fromModelId, toModelId, reason: "timeout" }`.
- Provider rate-limit fallback still keeps `modelId` as the original provider id while changing model config and display name to the fallback endpoint.
- Global rate-limit fallback still switches to the configured target model when provider endpoint fallback is unavailable.
- Non-rate-limit HTTP failures are not retried.
- The model-run module, not prompt assembly, owns `isLangflowTimeoutError`, `isLangflowRateLimitError`, HTTP status extraction, and failover target resolution.

Suggested verification:

- Focused timeout/rate-limit tests for both JSON and stream entrypoints.
- `npx vitest run src/lib/server/services/langflow.test.ts`

## Slice 3: Clean Stale Surfaces And Document The Boundary

Type: AFK

Blocked by: Slice 2

What to build:

Remove obsolete helper code, duplicate test fixtures, and stale TDD scaffolding left behind by the extraction. Update engineering docs so future agents know prompt assembly belongs in `langflow.ts` and model execution/failover belongs in the Model Run boundary.

Acceptance criteria:

- No duplicate timeout, rate-limit, HTTP error, or failover helpers remain in `langflow.ts`.
- No stale tests assert internals that moved out of `langflow.ts`; tests either cover the public API or the new model-run boundary directly.
- `CONTEXT.md` defines the Langflow Model Run boundary in Normal Chat vocabulary.
- A related ADR records why the Model Run boundary owns run attempts/failover while Normal Chat Turn Completion and Browser SSE Protocol remain separate boundaries.
- The architecture review HTML marks `Deepen Langflow Model Run` as finished with implementation status.

Suggested verification:

- `rg "createLangflowTimeoutError|createLangflowHttpError|resolveRateLimitFailoverTarget|sendMessageAttempt|sendMessageStreamAttempt" src/lib/server/services/langflow.ts src/lib/server/services`
- `npm run check`
- `npm run test:unit`

## Final Verification

Run after the slices are integrated:

- `npm run check`
- `npm run test:unit`
- Targeted live smoke after deployment: health, authenticated chat send/stream, and recent `langflow-chat.service` journal inspection for `[LANGFLOW]` errors or failed failover paths.
