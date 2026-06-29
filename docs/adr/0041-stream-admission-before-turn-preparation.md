# Stream Admission happens before heavy Turn Preparation

Accepted. Normal Chat streaming may return the browser stream after **Stream Admission** and run heavier **Turn Preparation** inside the already-open stream.

**Stream Admission** is the cheap server-side decision that a parsed, authenticated Normal Chat stream request may open a browser stream for this user and conversation. Admission must complete before the `Response` is returned, and it must still reject HTTP-level failures that should not become streamed assistant state: auth failures, parse or request-validation failures, unsupported Atlas stream starts, stream capacity rejection, and conversation ownership or nonexistence failures.

**Turn Preparation** is the heavier chat-turn work that makes an admitted stream request ready for a Normal Chat Model Run: attachment readiness, linked source persistence, pending skill availability, skill session start, Reasoning Depth metadata resolution, skill prompt context resolution, and related prompt appendix inputs. For the stream transport, this work may happen after the SSE/AI SDK UI stream prelude is open so the browser can leave "Preparing response" sooner and receive real progress while the server continues preparation.

If Turn Preparation fails after Stream Admission, the route cannot convert that failure into a JSON HTTP response because the stream has already been admitted. The failure is sent through the existing AI SDK UI stream terminal error path: `data-stream-error`, `finish` with `finishReason: "error"`, and `[DONE]`. This preserves ADR-0025's AI SDK UI stream contract and avoids adding route-local stream part names.

This decision does not move durable Normal Chat Turn Completion into the route or browser stream transport. ADR-0015 still applies: durable completion, response-facing Context Sources, message evidence, skill side effects, Honcho/task/memory continuity, and persisted assistant-message metadata belong in the chat-turn completion boundary. It also does not move browser-side waiting, retry, reconnect, stop, or queue semantics into the transport; ADR-0019 still applies, and the Normal Chat Client Turn Runtime consumes decoded stream errors through its existing adapters.

**Considered Options**

- Keep full Turn Preparation before returning the stream.
- Return the stream after auth and parse only, then discover capacity or conversation ownership failures inside the stream.
- Add a new post-admission request-error protocol separate from the AI SDK UI stream contract.
- Split Stream Admission from Turn Preparation and keep only cheap, security- and capacity-critical failures at HTTP level.

We chose the split because the slow preparation work is exactly what creates the user-visible pre-stream wait, while auth, request shape, unsupported Atlas streaming, capacity, and conversation ownership are still admission concerns. Returning a stream for an unauthorized, missing, unsupported, or over-capacity request would blur stable HTTP failures into runtime chat errors. Adding a second terminal-error protocol would duplicate the current AI SDK UI stream contract and make the browser runtime harder to reason about.

**Consequences**

- The stream route remains a transport adapter. It may parse, authenticate, reject unsupported Atlas stream starts, check capacity, and admit the conversation before returning a stream, but it should not wait on attachment readiness, linked-source persistence, skill prompt context, skill session start, or Reasoning Depth work in the HTTP response-start path.
- Stream orchestration owns the post-admission preparation lifecycle for Normal Chat streaming. It should emit the stream prelude before awaiting heavy Turn Preparation and then emit useful activity or terminal error frames through the shared stream framing boundary.
- Send and retry entrypoints may keep eager full preflight behavior unless a shared helper signature requires a mechanical adaptation; this ADR records the streaming contract, not a requirement to change every transport at once.
- Post-admission preparation errors are browser-visible stream failures, not route-local JSON responses. They must use existing AI SDK UI stream terminal semantics so reconnect, waiting, stop, queue, and error handling remain owned by the existing browser runtime and transport boundaries.
- **Stream Admission** and **Turn Preparation** are implementation contract terms. They do not require `CONTEXT.md` glossary entries unless they become user-facing product language later.
