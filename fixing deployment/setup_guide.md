# Multilingual Agent Pipeline — Setup Guide (v3)

## Architecture

```
                        ┌──────────────────┐
             ┌─────────▶│ Language Detector │──┬────────────────────────────────┐
             │          │ (custom: lingua)  │  │ "hu" or "en"                  │
             │          └──────────────────┘  │                                │
             │                                 │                                │
┌────────┐   │          ┌──────────────────┐  │    ┌─────────┐                │   ┌──────────────┐   ┌────────┐
│  Chat   │──┼─────────▶│ Input Translator │◀─┘    │         │                └──▶│ Response     │──▶│  Chat  │
│  Input  │  │          │ (custom: HU→EN)  │──────▶│  Agent  │───────────────────▶│ Translator   │   │ Output │
└────────┘  │          └──────────────────┘       │ (native)│                    │ (custom:     │   └────────┘
             │                                     │         │                    │  EN→HU)      │
             │                                     └────┬────┘                    └──────────────┘
             │                                          │ Tools
             │                                     ┌────┴────┐
             │                                     │ SearXNG  │
             │                                     │ (custom) │
             │                                     │ URL fetch│
             │                                     │ (native) │
             │                                     │ etc.     │
             │                                     └─────────┘
```

**Component count: 4 custom + 3 native (base flow), more with additional tools**

| Component | Type | What you edit |
|---|---|---|
| Chat Input | Native | — |
| Language Detector | Custom | Short input threshold |
| Input Translator | Custom | Translation prompt, TranslateGemma URL/key, thresholds |
| Agent | Native | System prompt, model provider, base URL, temperature, tools |
| Response Translator | Custom | Translation prompt, TranslateGemma URL/key, buffer sizes |
| SearXNG Search | Custom | SearXNG URL, categories, max results |
| Chat Output | Native | — |
| Additional tools | Native or Custom | Per-tool configuration |

**Key design:** Chat Input fans out to both Language Detector and Input Translator.
Language Detector's single output fans out to both Input Translator and Response
Translator. Every custom component has exactly one output port — no dual-output
conflicts.

---

## Prerequisites

1. **Langflow 1.8+** running (Docker or native)
2. **vLLM** serving two models:
   - `nemotron-120b` at `http://192.168.1.96:30000/v1` (with `--enable-auto-tool-choice`)
   - `translategemma` at `http://192.168.1.96:30002/v1`

---

## Step 1: Install lingua dependency

```bash
docker exec -it <langflow_container> pip install lingua-language-detector
docker restart <langflow_container>
```

To make it persistent across container recreations, add to your docker-compose:

```yaml
services:
  langflow:
    entrypoint: >
      sh -c "pip install lingua-language-detector && langflow run --host 0.0.0.0"
```

Verify:

```bash
docker exec -it <langflow_container> python3 -c \
  "from lingua import Language, LanguageDetectorBuilder; print('OK')"
```

---

## Step 2: Create the flow

Open Langflow, create a new blank flow. You'll add 7+ nodes.

### 2.1 — Chat Input (native)

Drag a **Chat Input** component onto the canvas.


### 2.2 — Language Detector (custom)

1. Drag a **Custom Component** node onto the canvas.
2. Open the code editor, paste the **entire contents** of `language_detector.py`.
3. Save — you should see one input (User Message) and one output (Detected Language).

Configure:

| Field | Value |
|-------|-------|
| Short Input Threshold | `10` |


### 2.3 — Input Translator (custom)

1. Drag a **Custom Component** node onto the canvas.
2. Paste the **entire contents** of `input_translator.py`.
3. Save — you should see two inputs (User Message, Source Language) and one output (English Prompt).

Configure:

| Field | Value |
|-------|-------|
| TranslateGemma Base URL | `http://192.168.1.96:30002/v1` |
| TranslateGemma API Key | your key (or blank) |
| TranslateGemma Model Name | `translategemma` |
| HU → EN Translation Prompt | *(default is fine)* |
| Translation Max Tokens | `256` |
| Translation Temperature | `0.1` |
| Long Input Split Threshold | `500` |
| Preserve Code/URLs | `true` |


### 2.4 — Agent (native)

Drag a native **Agent** component onto the canvas.

Configure:

| Field | Value |
|-------|-------|
| Language Model provider | **OpenAI** |
| OpenAI API Base | `http://192.168.1.96:30000/v1` |
| OpenAI API Key | your key (or any placeholder if vLLM doesn't require auth) |
| Model Name | `nemotron-120b` |
| System Message | See below |
| Temperature | `0.7` |
| Max Tokens | `4096` |

**System Message:**

```
You are a helpful assistant. When including any code, commands, file paths, or technical identifiers in your response, always wrap them in markdown backticks (` for inline, ``` for blocks). This applies to all code regardless of length.
```


### 2.5 — Response Translator (custom)

1. Drag a **Custom Component** node onto the canvas.
2. Paste the **entire contents** of `response_translator.py`.
3. Save — you should see two inputs (Agent Response, Source Language) and one output (Translated Response).

Configure:

| Field | Value |
|-------|-------|
| TranslateGemma Base URL | `http://192.168.1.96:30002/v1` |
| TranslateGemma API Key | your key (or blank) |
| TranslateGemma Model Name | `translategemma` |
| EN → HU Translation Prompt | *(default is fine)* |
| Translation Max Tokens | `256` |
| Translation Temperature | `0.1` |
| Max Buffer Length | `500` |
| First Flush Max Chars | `150` |
| Webhook Sentence URL | `https://chat.example.com/api/webhook/sentence` |
| Webhook Secret | same value as `LANGFLOW_WEBHOOK_SECRET` in Langflow Chat |
| Webhook Timeout Seconds | `10` |


### 2.6 — Chat Output (native)

Drag a **Chat Output** component onto the canvas.

---

## Step 3: Wire the connections

This is the critical step. Follow this exact wiring:

| # | From | Output port | → | To | Input port |
|---|------|-------------|---|-----|------------|
| 1 | **Chat Input** | Message | → | **Language Detector** | User Message |
| 2 | **Chat Input** | Message | → | **Input Translator** | User Message |
| 3 | **Language Detector** | Detected Language | → | **Input Translator** | Source Language |
| 4 | **Language Detector** | Detected Language | → | **Response Translator** | Source Language |
| 5 | **Input Translator** | English Prompt | → | **Agent** | (message/input) |
| 6 | **Agent** | Response | → | **Response Translator** | Agent Response |
| 7 | **Response Translator** | Translated Response | → | **Chat Output** | Message |

**Fan-out connections explained:**

- **Chat Input** has one output port, but you connect it to TWO nodes (connections 1 and 2). This is standard Langflow fan-out — one output to multiple inputs works natively.
- **Language Detector** has one output port, and you connect it to TWO nodes (connections 3 and 4). Same fan-out principle.

After wiring, every component has exactly one outgoing edge per output port, but some output ports have multiple edges. This is normal and supported.

---

## Step 4: Add tools (optional, all native)

### SearXNG search tool

1. Drag a **Custom Component** node onto the canvas.
2. Paste the **entire contents** of `searxng_search.py`.
3. Save — you should see one input (Search Query) and one output (Search Results).
4. Configure:
   - **SearXNG Base URL**: `http://your-searxng-host:8888`
   - **Categories**: `general` (or `general,news` etc.)
   - **Max Results**: `5`
   - **Timeout**: `15`
5. In the component header, click **Tool Mode** to enable it.
6. Connect the **Toolset** output to the **Agent**'s **Tools** input.

The Agent sees one clean action: "pass a search query, get formatted results."
The SearXNG URL, categories, and result count are configured once and never
exposed to the Agent.

### Web fetch tool

1. Drag a native **URL** component onto the canvas.
2. Enable **Tool Mode** in the header.
3. Connect the **Toolset** output to the **Agent**'s **Tools** input.

### Future tools

For simple tools (web fetch, calculators), use native Langflow components with
Tool Mode enabled. For tools that need custom API formatting (like SearXNG above),
build a small custom component with `tool_mode=True` on the input. Either way:
enable Tool Mode, connect to the Agent's Tools port, done.

---

## Step 5: Test

### Basic Hungarian test

```
Szia! Mesélj nekem a mesterséges intelligenciáról.
```

Expected: Response comes back in Hungarian.

### Streaming note

For real incremental Hungarian streaming, the **Response Translator** must be
configured with the Langflow Chat webhook URL and shared secret above. It will
POST each translated sentence to the chat app while translation is still in
progress, then send a final completion webhook when done.

### English pass-through

```
Hello! Tell me about artificial intelligence.
```

Expected: Response comes back in English (no translation overhead).

### Meta-test (verify the pipeline is translating)

```
Válaszolj angolul, milyen nyelven kaptad ezt az üzenetet?
```

Expected: nemotron should say it received the message in English.

### URL preservation test

```
Nézd meg ezt az oldalt: https://docs.langflow.org/getting-started és mondd el mit látsz.
```

Expected: URL survives translation intact.

### Tool test (if SearXNG is connected)

```
Keress rá az interneten, mi történt ma a világban.
```

Expected: The Agent calls the search tool, retrieves results, and responds in Hungarian.

---

## Troubleshooting

**"lingua-language-detector is not installed"**
→ Install it in Langflow's Python env (see Step 1).

**[Translation unavailable] tags in output**
→ Check the Translation Max Tokens field is set to `256` (not 2048) in both
  the Input Translator and Response Translator.
→ Check TranslateGemma API key matches in both translation components.
→ Run `docker logs <container>` to see the specific error.

**Agent doesn't call tools**
→ Make sure Tool Mode is enabled on each tool component (check header menu).
→ Make sure the tool's Toolset output is connected to the Agent's Tools input.
→ Verify nemotron's vLLM instance has `--enable-auto-tool-choice` enabled.

**Agent returns errors about function calling**
→ Some vLLM versions need `--tool-call-parser` flag. Check your vLLM docs for
nemotron-120b's supported tool call format.

**Input Translator shows "No Data Available"**
→ This is a Langflow UI display quirk with custom components. If the downstream
nodes receive data and produce output, the component is working. Check `docker logs`
for the actual Python output.

**Language Detector fans out incorrectly**
→ Verify that the Language Detector's Detected Language output has two edges:
one going to Input Translator's Source Language, one to Response Translator's
Source Language. Click the output port and drag to each target separately.

---

## File inventory

| File | Purpose |
|------|---------|
| `language_detector.py` | Custom component — lingua-based HU/EN detection (132 lines) |
| `input_translator.py` | Custom component — conditional HU→EN translation (283 lines) |
| `response_translator.py` | Custom component — sentence buffer + EN→HU translation (343 lines) |
| `searxng_search.py` | Custom component — SearXNG search tool for the Agent (118 lines) |
| `test_sentence_buffer.py` | Dev-only test suite for the sentence buffer (not needed in Langflow) |
| `SETUP.md` | This file |

---

## Future Work: True Token-by-Token Streaming to Custom UI

### Current Limitation

Langflow's custom component model is synchronous — the `process()` method must
return a complete `Message` object. This means the entire pipeline (Agent generation
→ sentence buffering → per-sentence translation) runs to completion before any text
is displayed. The user sees a loading indicator for the full duration, then the
complete Hungarian answer appears at once.

### Why Langflow's Built-in Streaming Doesn't Help Here

Langflow does expose a streaming endpoint:

```
POST /api/v1/run/{flow_id}?stream=true
```

This returns Server-Sent Events (SSE) with `token` events as the LLM generates.
However, this streaming only works for native LLM components (Agent, OpenAI Model,
etc.) that are the final output of the flow. In our pipeline, the Agent's output
feeds into the ResponseTranslator custom component before reaching Chat Output.
The custom component blocks the stream — it must fully accumulate the Agent's
response, run sentence buffering and translation, and only then return the
complete translated Message. Langflow's streaming infrastructure has no mechanism
for custom components to yield incremental output.

As of Langflow 1.8.x (and based on the custom component documentation), there
is no async generator or streaming callback interface for custom components.
The component lifecycle runs: `_pre_run_setup()` → `run()` → output methods,
all synchronous. The `self.status` field can be updated during execution for
progress indicators, but this does not stream content to the user.

### Recommended Approach: Webhook Sidecar

Since Langflow's component model does not support streaming from custom components,
the most practical approach for the custom UI is a webhook sidecar:

1. Keep the synchronous `ResponseTranslator` component structure as-is.
2. Add a configurable webhook URL field to the ResponseTranslator component.
3. Inside `_translate_sentence`, after each TranslateGemma call returns a
   translated sentence, POST that sentence to the webhook URL.
4. The custom UI subscribes to this webhook endpoint and appends each sentence
   to the display as it arrives in real time.
5. When `process()` finally returns the complete Message, Chat Output emits the
   full text — but the user has already been reading it sentence by sentence.

This means two data paths: the webhook for live progressive display, and the
normal Langflow return for the final complete message. The translation logic
stays identical — the webhook is purely additive.

### Alternative: Standalone FastAPI Translation Service

If the webhook sidecar feels too coupled, the translation pipeline can be
extracted into a standalone FastAPI service:

1. The Langflow flow handles everything up to and including the Agent — input
   translation, tool calling, AI model reasoning — all within Langflow.
2. Instead of the ResponseTranslator component, the flow outputs the raw English
   Agent response via Chat Output.
3. The custom UI receives the English response and sends it to a separate FastAPI
   endpoint that runs the SentenceBuffer + TranslateGemma pipeline with native
   Python SSE streaming (`StreamingResponse` with an async generator).
4. The user sees Hungarian tokens appearing in real time.

This is the cleanest separation — Langflow owns orchestration and tools, FastAPI
owns real-time translation streaming — but it adds a service to deploy and maintain.
The `SentenceBuffer` class and translation functions from `response_translator.py`
can be lifted directly into the FastAPI service with minimal changes.

### What to Preserve During Refactoring

- The `SentenceBuffer` class (tested: abbreviations, decimals, fast first flush)
- Conditional bypass for English input
- All error handling and fallback behaviour
- All configurable parameters (prompts, URLs, thresholds, buffer sizes)

The core logic doesn't change — only the transport layer between the translation
pipeline and the user's browser.

---

## Known Limitations

### Code-heavy response translation

When the Agent's response contains heavily interleaved code and prose (e.g.
explaining a code fix line by line with inline backtick references), the
translation quality degrades. Symptoms include:

- Leaked `[T1]`, `[T2]` term markers visible in the output alongside the
  restored original content (TranslateGemma duplicates the marker and its
  "guess" at what it means).
- Occasional hallucinated content where TranslateGemma generates code examples
  or translation-pair lists instead of translating the actual sentence.

**Root cause:** TranslateGemma-12B is a 12B parameter model being asked to
follow a complex instruction ("translate this sentence but keep opaque markers
exactly as-is"). It half-follows the instruction — sometimes keeping the marker,
sometimes expanding it, sometimes both. This is a fundamental model capability
limitation, not a pipeline bug.

**Impact:** Low for the primary use case (non-technical Hungarian user). Normal
conversations, web search results, emails, explanations, and general Q&A all
translate cleanly. The issue only manifests in code-heavy debugging responses.

**Mitigations in place:**
- Fenced code blocks are fully extracted and never touch TranslateGemma.
- Inline code is replaced with opaque `[T1]` markers that carry no semantic
  content, reducing (but not eliminating) hallucination triggers.
- Hallucination pattern detection rejects known bad outputs and retries.
- Length-based validation catches runaway generation.

**Future fix paths:**
- Upgrade to a larger or more instruction-following translation model.
- In the custom UI, post-process the response to strip orphaned markers.
- With streaming, code-heavy responses become less jarring because the user
  has context as text arrives incrementally.

### Response latency

The full pipeline (input translation → Agent generation → response translation)
takes 40–90 seconds for typical responses. The response translation alone adds
~25 seconds for a 15-sentence response due to sequential TranslateGemma calls.
The user sees no output until the entire pipeline completes.

**Future fix:** Streaming via custom UI (see Future Work section above).

### Single language pair

The pipeline currently supports Hungarian ↔ English only. The lingua detector,
short-word dictionary, translation prompts, and abbreviation sets are all
hardcoded for this pair.

**Future fix:** Multi-language expansion (see Future Improvements below).

---

## Future Improvements Roadmap

### Tier 1 — Custom UI and Streaming (prerequisite for everything else)

**Custom UI application** — a standalone frontend (React, Vue, or Svelte) that
communicates with Langflow via its API. This is the foundation that every other
improvement depends on.

Core features for v1:
- Conversation interface with message history
- Session management (create, switch, delete conversations)
- Multi-user authentication
- Streaming display via webhook sidecar or FastAPI translation service
- Status indicators for each pipeline phase (detecting language, translating,
  thinking, generating, translating response)
- Flow switcher — ability to select between different Langflow flows from the UI
- Markdown rendering with proper code block syntax highlighting

### Tier 2 — Memory and Personalization

**Short-term memory** — within a single conversation session. The Agent should
remember what was discussed earlier in the conversation. Langflow's Agent
component supports chat history natively; this needs to be wired through the
translation pipeline so the history is stored in English (post-input-translation)
and the user sees Hungarian.

**Long-term memory** — across conversations. Key facts, preferences, and
decisions the user has shared should persist. Implementation options:
- Vector database (Qdrant, Chroma, Weaviate) storing conversation summaries
  and extracted facts, queried at the start of each conversation.
- Structured user profile that the Agent can read and update.

**Cross-conversation memory** — the Agent should recall relevant context from
prior conversations when it would help. Requires a retrieval step at the start
of each turn that searches past conversation summaries for relevance.

**Multi-user isolation** — each user has their own memory space, conversation
history, and preferences. The UI authenticates users and passes a user ID
through the pipeline. Memory retrieval is scoped to the current user.

### Tier 3 — Production-grade RAG

**File upload and ingestion pipeline:**
- Support for PDF, DOCX, XLSX, CSV, TXT, Markdown, HTML, EPUB
- Automatic chunking with configurable chunk size and overlap
- Embedding generation via a local embedding model (e.g. BGE, E5, or
  NV-Embed served via vLLM or a dedicated endpoint)
- Vector storage in a persistent vector database (Qdrant recommended for
  local deployment — runs well on CPU alongside the GPU models)

**Retrieval pipeline:**
- Hybrid search: dense vector similarity + BM25 keyword matching
- Re-ranking with a cross-encoder model for precision
- Configurable top-k and similarity threshold
- Source attribution — the Agent cites which chunks it used

**Knowledge management UI:**
- Upload, browse, delete documents
- Per-user and shared knowledge bases
- Ingestion status and progress indicators
- Chunk preview and manual correction

**Advanced RAG features (later):**
- Parent-child chunking (retrieve the chunk, inject the parent for context)
- Multi-modal RAG (images in documents)
- Scheduled re-ingestion for documents that update (e.g. internal wikis)
- Graph-based RAG using knowledge graph extraction from documents

### Tier 4 — Deep Research Agent

**Multi-step research workflow:**
- User submits a research question
- A planner agent decomposes it into sub-questions
- Each sub-question is researched independently (web search, RAG, tool use)
- Results are synthesized into a structured report
- Status updates at each step displayed in the custom UI

**Implementation:**
- Separate Langflow flow for the research pipeline
- Connected to the main chat flow via Run Flow component or triggered
  directly from the UI
- Uses the same translation pipeline for Hungarian users

### Tier 5 — Integrations

**Nextcloud integration:**
- Browse, search, and retrieve files from a Nextcloud instance
- Upload generated documents (reports, emails) back to Nextcloud
- Calendar access for scheduling-aware responses
- Contacts access for personalized communication
- Implemented as a custom Langflow tool component with WebDAV/OCS API calls

**Audio mode (TTS and STT):**
- Speech-to-text input: user speaks in Hungarian, audio is transcribed,
  then enters the normal translation pipeline
- Text-to-speech output: the Hungarian response is synthesized and played back
- Tonal profiles: configurable voice characteristics (warm, professional,
  casual) via TTS model parameters
- Local models: Whisper (STT) and a local TTS model (Piper, Coqui, or XTTS)
  to keep everything on-premises
- The translation pipeline handles the text; audio is a UI-layer concern
  that wraps around the existing text flow

**Email integration:**
- Read and search emails (IMAP)
- Draft and send emails (SMTP) with Agent-generated content
- The Agent can summarize unread emails, draft replies, and manage threads
- Connected as Langflow tool components

### Tier 6 — Advanced Features

**Custom Excel-Python calculation workflow:**
- User uploads a spreadsheet or describes a calculation
- The Agent writes Python code to process it
- Code execution in a sandboxed environment (Docker container or
  Langflow's Python REPL tool)
- Results returned as formatted tables or downloadable files

**Multi-language expansion:**
- Extend beyond Hungarian ↔ English to support additional language pairs
- Language detector expanded with more lingua candidates
- Translation prompts made fully dynamic (source/target language as parameters)
- Per-user language preference stored in the user profile

**Model routing:**
- Different models for different task types: a fast small model for simple Q&A,
  the full nemotron-120b for complex reasoning, a code-specialized model for
  programming tasks
- A lightweight classifier at the start of the pipeline routes to the
  appropriate model
- Transparent to the user — the translation pipeline doesn't change

**Conversation features:**
- Conversation branching — fork a conversation to explore alternatives
- Shared conversations — multiple users collaborate in the same thread
- Conversation export (PDF, Markdown)
- Conversation templates — pre-built starting points for common tasks

**Quality and operations:**
- Translation quality monitoring — log source/target pairs for review
- Automated regression testing for the translation pipeline
- Usage analytics per user (token counts, response times, tool usage)
- Admin dashboard for monitoring vLLM instance health, queue depth,
  and GPU utilization
- Prompt versioning — track and roll back system prompt changes

**Image generation:**
- Local image generation model (Flux, SDXL) served via a compatible API
- Connected as a Langflow tool — the Agent can generate images on request
- Images embedded in the conversation in the custom UI

**On-demand translation as an Agent tool:**
- Currently, translation is handled transparently by the pipeline — the Agent
  never knows it's happening. This means the Agent cannot translate content
  into arbitrary languages on request (e.g. an English-speaking user asking
  for a Hungarian email, or a Hungarian user asking for a German summary).
- The fix: expose TranslateGemma as a Langflow tool component that the Agent
  can call directly, with source and target language as parameters.
- The Agent would decide when explicit translation is needed (user asks for
  content in a specific language) versus when the pipeline handles it
  transparently (normal conversation).
- This decouples "pipeline translation" (automatic, invisible) from "requested
  translation" (deliberate, tool-based), solving the conflict where the system
  prompt tells the Agent to only write English but the user wants non-English
  output.

---

## Design Decisions Reference

These decisions were made during development and should be preserved:

- **Model name**: `translategemma` (not `translategemma-12b`)
- **Prompt wording**: `"without any additional explanations"` (not `"explanations or commentary"`)
- **Translation max tokens**: `256` (TranslateGemma has a 2048 total context window)
- **TranslateGemma endpoint**: Uses `/v1/completions` (raw completions, not chat)
- **Prompt template**: `<bos><start_of_turn>user\n...<end_of_turn>\n<start_of_turn>model\n`
- **Language detection**: lingua-language-detector on CPU, restricted to HU/EN
- **Short input fallback**: Under 10 chars, dictionary lookup instead of lingua
- **System prompt includes**: Code-wrapping instruction for backtick preservation
- **Agent architecture**: Native Langflow Agent with OpenAI-compatible provider
- **Tools**: Native components with Tool Mode where possible; custom components with `tool_mode=True` when the API needs custom formatting (e.g. SearXNG)
- **SearXNG**: Custom component because the native API Request component's query parameters field requires a Data node input, making it impractical for Agent-driven dynamic queries
- **3-component split**: Language Detector separated from Input Translator to avoid Langflow's single-output-selection limitation on dual-output components
