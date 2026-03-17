# Multilingual Agent Platform — UI Handoff Document

## What We Built

A multilingual AI assistant pipeline running entirely on local infrastructure
(Linux, 2× NVIDIA Blackwell GPUs) via Langflow. The system allows a Hungarian-
speaking user to converse naturally in Hungarian while the AI model (nemotron-120b)
thinks and reasons in English — where it performs best. Translation is transparent;
the user never sees English.

The pipeline also supports English-speaking users natively — when English input
is detected, the entire translation layer is bypassed with zero overhead.

---

## Architecture

```
┌────────┐   ┌──────────────┐   ┌──────────────────┐
│  Chat   │──▶│ Language      │──▶│ Input Translator │──▶ Agent ──▶ Response ──▶ Chat
│  Input  │──▶│ Detector     │──▶│ (HU→EN if needed)│         │   Translator │   Output
└────────┘   │ (lingua, CPU) │   └──────────────────┘         │   (EN→HU)    │
              └──────────────┘                                 │              │
                                                               ▼              │
                                                          ┌─────────┐         │
                                                          │  Tools  │         │
                                                          │ SearXNG │         │
                                                          │ URL     │         │
                                                          │ Date    │         │
                                                          │ Calc    │         │
                                                          └─────────┘
```

### Components

| Component | Type | What it does |
|---|---|---|
| Language Detector | Custom (Python) | Detects Hungarian vs English using the lingua library on CPU. Outputs "hu" or "en" as a flag. |
| Input Translator | Custom (Python) | If flag is "hu": translates the user's Hungarian message to English via TranslateGemma-12B. Protects code blocks, URLs, and raw pasted code from translation. If flag is "en": passes through unchanged. |
| Agent | Native Langflow | nemotron-120b via OpenAI-compatible API. Has a system prompt defining personality (AlfyAI), tool use behavior, and content preservation rules. Calls tools as needed. |
| Response Translator | Custom (Python) | If flag is "hu": translates the Agent's English response back to Hungarian sentence-by-sentence via TranslateGemma-12B. Extracts fenced code blocks (never translated), replaces inline code with opaque markers, validates for hallucination. If flag is "en": passes through unchanged. |
| SearXNG Search | Custom (Python) | Web search tool. Agent passes a query, gets formatted results. |
| URL fetch, Date/Time, Calculator | Native Langflow | Standard tools connected to the Agent. |

### Models (all local, all served via vLLM)

| Model | Purpose | Endpoint |
|---|---|---|
| nemotron-120b | Main AI reasoning model | `http://192.168.1.96:30000/v1` |
| nemotron-nano | Lightweight utility model (title generation) | `http://192.168.1.96:30001/v1` |
| TranslateGemma-12B | Translation (both directions) | `http://192.168.1.96:30002/v1` |

---

## What the Pipeline Can Do

- **Bilingual conversation**: Hungarian user types Hungarian, sees Hungarian responses. English user types English, sees English. Automatic detection, no user action needed.
- **Web search**: Agent can search via SearXNG, fetch web pages, and synthesize answers from results.
- **Date/time awareness**: Agent can check the current date and time.
- **Calculations**: Agent has a calculator tool.
- **Code assistance**: Agent can discuss code. Fenced code blocks are preserved through translation. Inline code references survive inside translated prose.
- **Email/letter drafting**: Agent writes content in English, wraps it in `<preserve>` tags, and the translation pipeline delivers it as-is alongside translated explanatory text.
- **URL preservation**: Links in both user input and Agent output survive translation intact.
- **Raw code detection**: If a user pastes code without backticks, the input translator auto-detects it and protects it from translation.

---

## What the Pipeline Cannot Do (Yet)

- **Stream responses** — the user waits 40–90 seconds for the full response. No progressive display.
- **Remember previous conversations** — no memory system. Each conversation starts fresh.
- **Handle file uploads** — no RAG, no document parsing.
- **Generate content in non-English languages directly** — the Agent only writes English. Translation is handled by the pipeline for Hungarian only.
- **Handle code-heavy explanations perfectly** — inline code marker artifacts occasionally leak through in heavily technical responses.

---

## The Langflow API

The UI communicates with Langflow exclusively via its REST API.

### Running a flow

```
POST /api/v1/run/{flow_id}
Content-Type: application/json

{
  "input_value": "user's message here",
  "input_type": "chat",
  "output_type": "chat",
  "session_id": "unique-session-id"
}
```

The response is a JSON object containing the full pipeline output (the
translated Hungarian text, or English if the user spoke English). The
relevant content is nested inside the response structure — the UI must
parse it to extract the message text.

### Session management

Langflow tracks conversation state via `session_id`. The UI controls this:
- Same `session_id` across requests = same conversation (Agent sees history)
- New `session_id` = new conversation
- The UI is responsible for generating, storing, and switching session IDs

### Streaming (current limitation)

Langflow supports `?stream=true` on the run endpoint, which returns SSE
with `token` events. However, this only streams the Agent's English output.
The Response Translator is a custom component that blocks the stream — it
accumulates the full Agent response before translating.

**For Hungarian users**, streaming requires a sidecar approach:
- The Response Translator can be extended with a webhook URL field
- After translating each sentence, it POSTs the sentence to the webhook
- The UI receives sentences in real time via this webhook
- When the full response completes, Langflow returns the final Message
  through the normal API response

**For English users**, streaming works natively via Langflow's `?stream=true`
because the Response Translator passes through without processing.

---

## What the UI Needs to Handle

### Core conversation interface

- **Message display area** with Markdown rendering. The responses contain:
  - Regular prose (in Hungarian or English)
  - Fenced code blocks with language specifiers (` ```python `, ` ```json `, etc.) — need syntax highlighting
  - Inline code in backticks — render as monospace
  - URLs — render as clickable links
  - Bold, italic, headings, bullet lists, numbered lists, tables — standard Markdown
  - Occasional `[placeholder]` text in square brackets (template fields the user fills in)

- **Message input** with:
  - Multi-line text support (users paste code, write long messages)
  - Send on Enter, Shift+Enter for new line (or configurable)
  - Character/line count is not needed but a visual indicator that the message was sent is

- **Conversation history** within the current session:
  - Show all messages in chronological order (user and assistant)
  - Auto-scroll to latest message
  - The history is managed by Langflow via `session_id` — the UI does not need to store message content, but should store session IDs and metadata (title, timestamp, user) locally

### Session and conversation management

- **Conversation list sidebar**:
  - List of past conversations with titles and timestamps
  - Click to switch between conversations (changes `session_id` in API calls)
  - Create new conversation button
  - Delete conversation
  - Manual rename by clicking the title

- **Auto-generated conversation titles**:
  - When the first assistant response arrives in a new conversation, the UI
    should automatically generate a short title (5–8 words) summarizing the
    conversation topic.
  - Use a lightweight local model for this: **nemotron-nano** served at
    `http://192.168.1.96:30001/v1` (OpenAI-compatible chat completions).
    This model is already running on the second GPU (port 30001).
  - The UI sends a single request with the user's first message and the
    assistant's first response, asking for a short title. Example prompt:
    `"Summarize this conversation in 5-8 words as a title. Output only the title, nothing else.\n\nUser: {first_user_message}\nAssistant: {first_assistant_response_truncated_to_200_chars}"`
  - This runs independently of the main pipeline — it's a fire-and-forget
    call from the UI directly to nemotron-nano. No Langflow involvement.
  - The title should be in the same language the user typed in (nemotron-nano
    will naturally match the language of the input).
  - Update the sidebar title as soon as the response comes back. Until then,
    show a placeholder like "New conversation" or the first few words of the
    user's message.

- **Session ID management**:
  - Generate a UUID for each new conversation
  - Store the mapping: `{session_id, title, created_at, user_id}`
  - Persist this in a local database (SQLite, PostgreSQL) or browser storage

### Multi-user support

- **Authentication**: login screen, user accounts
- **User isolation**: each user sees only their own conversations
- **User ID propagation**: the UI should be able to pass a user identifier through to Langflow (via tweaks or a custom header) for future per-user memory and personalization
- **Concurrent users**: multiple users hitting the same Langflow instance simultaneously. Langflow handles this via separate `session_id` values; the UI just needs to not share sessions

### Loading and status indicators

The pipeline takes 40–90 seconds for Hungarian responses. The UI must communicate
progress clearly to prevent the user from thinking it's broken.

**Phase indicators** (the custom components emit status via `self.status`; these
can be polled from the Langflow API or received via the webhook sidecar):

| Phase | What the user should see | Approximate duration |
|---|---|---|
| Language detection | Instant, no indicator needed | <100ms |
| Input translation | "Translating your message..." | 0.5–1.5s |
| Agent thinking | "Thinking..." or typing indicator | 0.5–2s before first token |
| Agent generating | "Generating response..." or typing animation | 10–60s depending on response length |
| Response translation | "Translating response..." | 10–30s depending on length |
| Done | Response appears | — |

For English users, only the Agent phase is visible (no translation delays).

**Minimum viable indicator**: an animated typing/thinking indicator that stays
visible from the moment the user sends a message until the response appears.
Phase-specific labels are nice-to-have for v1.

### Streaming display (when implemented)

For the webhook sidecar approach:
- The UI runs a lightweight HTTP server (or WebSocket endpoint) that the
  Response Translator POSTs translated sentences to
- As each sentence arrives, it's appended to the message area
- The UI shows text appearing sentence-by-sentence with a typing cursor
  at the end
- When the final Langflow API response arrives, the UI reconciles (the
  full text should match what was received via webhook)

For English pass-through:
- Use Langflow's native `?stream=true` SSE endpoint
- Parse `token` events and append chunks to the display
- Standard SSE consumption pattern

The UI should abstract the streaming transport so both paths (webhook for
Hungarian, SSE for English) feed into the same display logic.

### File upload placeholder

No file processing exists yet, but the UI should have:
- A file attachment button in the message input area (grayed out / "coming soon" is fine)
- The UI-side infrastructure to accept a file, read it, and include it in
  the API request (Langflow supports file attachments on Chat Input)
- This avoids a UI redesign when RAG is added later

### Error handling

- **Flow failed**: Langflow returns an error — show a user-friendly message
  like "Something went wrong. Please try again." with an option to retry.
- **Timeout**: the pipeline can take 90+ seconds. The UI should have a
  generous timeout (at least 120s) and not abort prematurely.
- **Translation unavailable**: if the response contains `[Translation unavailable]`
  prefixes, the UI could optionally strip them and show a subtle indicator
  that parts of the response are in English.
- **Network errors**: handle disconnection gracefully, offer retry.

### Copy and export

- **Copy message**: button to copy a single assistant message to clipboard
  (as Markdown or plain text)
- **Copy code block**: a copy button on each fenced code block
- **Export conversation**: download the full conversation as Markdown or PDF
  (nice-to-have for v1)

### Responsive design

- Desktop-first (this is a work/productivity tool), but usable on tablet
- The conversation area should use the full available width on desktop
- Code blocks should have horizontal scroll, not wrap

### Dark/light mode

- Support both themes
- Code syntax highlighting should adapt to the theme
- Default to system preference

---

## Responsibility Boundaries

### What NOT to build in the UI

- **Translation logic** — this is entirely in Langflow. The UI never touches TranslateGemma.
- **Tool execution** — the Agent decides when to use tools. The UI just shows the final result.
- **Language detection** — handled in the pipeline. The UI sends the raw message as-is.
- **Session history storage** — Langflow maintains conversation history internally via session_id. The UI only stores session metadata (title, timestamp, user).

### What IS built in the UI (not in Langflow)

- **Title generation** — the UI calls nemotron-nano directly. This is intentionally outside Langflow because it's a UI concern (sidebar label), not a pipeline concern. It runs in parallel with the main flow and doesn't block the conversation.

---

## Configuration the UI Needs

| Setting | Purpose | Default |
|---|---|---|
| Langflow API base URL | Where to send requests | `http://localhost:7860` |
| Langflow API key | Authentication with Langflow | (from environment) |
| Flow ID | Which Langflow flow to run | (from Langflow UI) |
| Nemotron-nano URL | For auto-generating conversation titles | `http://192.168.1.96:30001/v1` |
| Nemotron-nano model name | Model name in the completions request | `nemotron-nano` |
| Webhook listen port | For receiving streaming sentences | `8090` |
| Request timeout | How long to wait for a response | `120s` |
| Max message length | Input validation | `10000 chars` |