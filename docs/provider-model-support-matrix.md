# Provider Model Support Matrix

Generated: 2026-06-29

This matrix summarizes the model families now recognized by the Normal Chat provider compatibility registry. Evidence and uncertainty notes live in `docs/provider-model-api-evidence.md`.

| Family | Supported model names and aliases | Request profile | Stream status |
| --- | --- | --- | --- |
| DeepSeek V4 | `deepseek-v4-flash`, `deepseek-v4-pro`; legacy aliases `deepseek-chat`, `deepseek-reasoner` | OpenAI-compatible chat, `max_tokens`, `thinking.type`, V4 tool-compatible reasoning | Fixture-covered for reasoning, text, tools, usage, `[DONE]` |
| Xiaomi MiMo | `mimo-v2.5-pro`, `mimo-v2.5`, `mimo-v2-flash`, `mimo-v2-pro`, `mimo-v2-omni` | OpenAI-compatible chat, `max_completion_tokens`, MiMo thinking, auto-only tool choice | Fixture-covered for documented reasoning/tool deltas; sentinel still needs live confirmation |
| Kimi K2.x | `kimi-k2.7-code`, `kimi-k2.7-code-highspeed`, `kimi-k2.6`, `kimi-k2.5` | OpenAI-compatible chat, `max_completion_tokens`, K2.7 Code always-thinking, reasoning preserved through tools | Fixture-covered |
| GLM 5.x | `glm-5.2`, `glm-5.2[1m]`, `glm-5.1`, `glm-5`, `glm-5-turbo` | OpenAI-compatible chat, `max_tokens`, `thinking.type`, GLM-5.2 `reasoning_effort`, `tool_stream` for streamed tools | Fixture-covered |
| Qwen 3.x | `qwen3.7-max`, `qwen3.7-plus`, `qwen3.6-max-preview`, `qwen3.6-plus`, `qwen3.6-flash`, `qwen3.6-35b-a3b`, `qwen-plus`, `qwen-max`, `qwen-flash`, `qwen-turbo` | DashScope/OpenAI-compatible chat, `max_tokens`, Qwen thinking controls where configured | Fixture-covered for reasoning/content/usage; streamed tools require per-model confirmation |
| Mistral current gen | `mistral-medium-3-5`, `mistral-small-latest`, `mistral-large-latest`, `mistral-large-2512`, `mistral-small-2603`, `ministral-3-*` | OpenAI-compatible chat, `max_tokens`, `reasoning_effort` | Request policy supported; stream fixture needs manual/live capture |
| NVIDIA Nemotron 3 | `nvidia/nemotron-3-ultra-550b-a55b`, `nvidia/nemotron-3-super-120b-a12b`, `nvidia/nemotron-3-nano-30b-a3b` | NVIDIA NIM OpenAI-compatible chat, `max_tokens`, tiered reasoning/chat-template thinking | Request policy supported; stream fixture needs manual/live capture |
| MiniMax M2.7-M3 | `MiniMax-M3`, `MiniMax-M2.7`, `MiniMax-M2.7-highspeed`, `MiniMax-M2.5`, `MiniMax-M2.5-highspeed`, `MiniMax-M2.1`, `MiniMax-M2` | OpenAI-compatible chat, `max_completion_tokens`, M3 adaptive/disabled thinking, `reasoning_split` | Fixture-covered for content/usage only |
| Gemma 4 | `google/gemma-4-E2B-it`, `google/gemma-4-E4B-it`, `google/gemma-4-12B-it`, `google/gemma-4-31B-it`, `google/gemma-4-26B-A4B-it`, `google/gemma-4-31b-it` | Provider-host specific; NVIDIA NIM OpenAI-compatible chat uses `max_tokens` and chat-template thinking | Request policy supported for hosted chat-template shape; stream fixture needs manual/live capture |
| GPT-OSS | `gpt-oss-120b`, `gpt-oss-20b`, `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `gpt-oss:120b`, `gpt-oss:20b` | OpenAI-compatible chat gateway profile plus separately documented Responses API shape | Chat request policy supported; stream fixture needs manual/live capture |

Admin-managed aliases are provider-scoped. The canonical provider model `name` remains the outbound `model` string, while aliases participate in provider-family detection for official hosts and gateway providers such as Fireworks AI.
