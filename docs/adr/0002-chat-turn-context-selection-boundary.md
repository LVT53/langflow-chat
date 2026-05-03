# Chat turns own context selection

Normal Chat context selection will be owned by a dedicated chat-turn service rather than by Honcho, task-state, knowledge retrieval, or Langflow transport code. Those subsystems may supply available context and context signals, but the chat-turn context-selection boundary decides what becomes prompt context, at what inclusion level, and within what budget, so passive workspace state, memory, attachments, and retrieved evidence cannot independently stack into oversized prompts.

**Considered Options**

- Keep context assembly distributed across Honcho, task-state, knowledge, and Langflow.
- Make Honcho the central prompt-context assembler.
- Create a dedicated chat-turn context-selection boundary.

We chose the chat-turn boundary because context selection is per-turn Normal Chat behavior, while Honcho remains an integration adapter and knowledge/task services remain candidate suppliers rather than generic prompt engines.
