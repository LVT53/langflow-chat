# Langflow Nemotron Reasoning Investigation

## Goal

Show a separate thinking block in the chat UI when using vLLM Nemotron through Langflow.

## What the app already supports

- The app UI already supports thinking blocks.
- The app server extracts reasoning from streamed upstream events when it finds:
  - `reasoning`
  - `thinking`
  - `reasoning_content`
  - OpenAI/vLLM-style `choices[].delta.reasoning_content`
  - OpenAI/vLLM-style `choices[].message.reasoning_content`
- The frontend renders a thinking block only when `message.thinking` is populated.

Relevant files:

- [`src/routes/api/chat/stream/+server.ts`](/Users/lvt53/Desktop/langflow-design/src/routes/api/chat/stream/+server.ts)
- [`src/lib/services/streaming.ts`](/Users/lvt53/Desktop/langflow-design/src/lib/services/streaming.ts)
- [`src/lib/components/chat/ThinkingBlock.svelte`](/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/ThinkingBlock.svelte)
- [`src/lib/components/chat/MessageBubble.svelte`](/Users/lvt53/Desktop/langflow-design/src/lib/components/chat/MessageBubble.svelte)

## App-side fixes already made

### 1. vLLM/OpenAI reasoning field compatibility

The server stream bridge was updated to recognize:

- `choices[0].delta.reasoning_content`
- `choices[0].message.reasoning_content`

This fixed one likely mismatch with OpenAI-compatible reasoning streams.

### 2. SSE client parser fix

The frontend streaming client previously handled SSE incorrectly by treating `event:` lines like `data:` lines. That was fixed so token, thinking, end, and error events are parsed correctly.

### 3. Token metric corrections

The old code counted chunks, not tokens. It now exposes estimated token count and estimated token speed, with corrected UI labels.

## What direct testing proved

### App endpoint behavior

Direct calls to `/api/chat/stream` showed:

- successful streaming worked
- no `event: thinking` was emitted
- end metadata had `thinking: undefined`

So the app was not dropping reasoning that it had already received. It simply was not receiving any reasoning from Langflow.

### Direct Langflow stream behavior

Direct calls to the Langflow flow stream showed:

- normal `token` events
- `add_message` events with `content_blocks`
- `content_blocks` titled `"Agent Steps"`
- `Input` and `Output` blocks only
- no separate `reasoning`, `thinking`, or `reasoning_content`

So Langflow’s outbound stream did not expose separate reasoning.

### Direct vLLM behavior

Direct calls to vLLM itself did return separate reasoning and content, for example:

```json
{"choices":[{"delta":{"reasoning":"..."} }]}
{"choices":[{"delta":{"content":"..."} }]}
```

This proved:

- vLLM is capable of emitting reasoning
- the reasoning drop happens between vLLM and Langflow’s final streamed message model

## Key Langflow findings

### vLLM node config bug

The Langflow vLLM node originally passed the wrong body shape:

```python
extra_body={'enable_thinking': 'true'}
```

This was wrong because Nemotron via vLLM needs:

```python
extra_body={"chat_template_kwargs": {"enable_thinking": True}}
```

After hardcoding the correct shape, the runtime trace confirmed Langflow was finally calling the model with:

```python
extra_body={'chat_template_kwargs': {'enable_thinking': True}}
```

### Langflow agent/runtime still drops reasoning

Even after the request shape was corrected, Langflow Agent output still only contained:

- `AIMessageChunk.content`
- no visible reasoning field

That means the reasoning is no longer being lost in request configuration. It is being lost in LangChain/Langflow stream handling.

### Exact drop point identified

Inside Langflow container:

- file: `/app/.venv/lib/python3.12/site-packages/lfx/base/agents/events.py`
- function: `handle_on_chain_stream`

Current behavior:

```python
elif isinstance(data_chunk, AIMessageChunk):
    output_text = _extract_output_text(data_chunk.content)
    ...
    send_token_callback(data={"chunk": output_text, "id": str(message_id)})
```

This function only reads `data_chunk.content` and ignores any reasoning stored on the chunk in:

- `additional_kwargs`
- `response_metadata`
- other chunk metadata

That is the core Langflow-side reason separate reasoning never reaches the app.

## Why patching Langflow core is undesirable

- It creates upgrade debt.
- A Langflow update can overwrite the patch.
- It makes maintenance harder across deployments.

## Recommended path forward

Avoid patching Langflow core.

Instead, create a custom Nemotron model component that:

- talks to vLLM directly
- preserves streamed reasoning
- emits a combined stream shape that survives Langflow’s current Agent/event flattening

Because Langflow Agent currently only preserves `AIMessageChunk.content`, a custom model component can preserve reasoning by embedding it into the streamed content with explicit delimiters.

Example preservation pattern:

```text
<thinking>
...
</thinking>
<answer>
...
</answer>
```

This is not as clean as native separate reasoning fields, but it avoids modifying Langflow core and keeps the visual Agent flow usable.

## Current conclusion

- The app is ready to render separate reasoning if it receives it.
- vLLM Nemotron can emit separate reasoning.
- Langflow request config needed correction and that part is now understood.
- Langflow Agent/runtime still flattens streamed chunks to plain content and drops separate reasoning fields.
- The least fragile next step is a custom Nemotron model component rather than patching Langflow core.

