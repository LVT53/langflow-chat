from __future__ import annotations

import json
from typing import Any

from langchain_core.callbacks import AsyncCallbackHandler

from lfx.schema.message import Message

# Import the custom AgentComponent from agent_node.py
from agent_node import AgentComponent


class ToolCallEmitterCallback(AsyncCallbackHandler):
    """Emits structured tool call markers into the Langflow token stream.

    Markers use STX/ETX control characters as delimiters — these will never
    appear in normal model output, making false-positive detection impossible.

    Format:
        Start: \x02TOOL_START\x1f<json>\x03
        End:   \x02TOOL_END\x1f<json>\x03
    """

    def __init__(self, event_manager: Any) -> None:
        super().__init__()
        self.event_manager = event_manager

    async def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        **kwargs: Any,
    ) -> None:
        name = serialized.get("name", "tool")

        # Parse input: LangChain may pass a JSON string or a plain string
        try:
            input_data: Any = json.loads(input_str)
        except (json.JSONDecodeError, TypeError):
            input_data = {"input": str(input_str)}

        payload = json.dumps({"name": name, "input": input_data}, ensure_ascii=False)
        marker = f"\x02TOOL_START\x1f{payload}\x03"
        await self.event_manager.on_token(token=marker)

    async def on_tool_end(
        self,
        output: Any,
        name: str | None = None,
        **kwargs: Any,
    ) -> None:
        tool_name = name or kwargs.get("name") or "tool"
        payload = json.dumps({"name": tool_name}, ensure_ascii=False)
        marker = f"\x02TOOL_END\x1f{payload}\x03"
        await self.event_manager.on_token(token=marker)


class NemotronAgentComponent(AgentComponent):
    """Agent component with real-time tool call streaming.

    Drop-in replacement for the standard AgentComponent. Injects a callback
    that emits STX/ETX-delimited markers into the token stream whenever a
    tool starts or ends. The app's stream server strips these markers and
    emits structured `tool_call` SSE events to the client.

    Works with any number of tools, including zero (Model 2 with no tools
    connected behaves identically to the base AgentComponent).
    """

    display_name: str = "Nemotron Agent"
    description: str = (
        "Agent with real-time tool call streaming for Nemotron models. "
        "Drop-in replacement for the standard Agent node."
    )
    name = "NemotronAgent"

    async def message_response(self) -> Message:
        llm_model, self.chat_history, self.tools = await self.get_agent_requirements()

        self.set(
            llm=llm_model,
            tools=self.tools or [],
            chat_history=self.chat_history,
            input_value=self.input_value,
            system_prompt=self.system_prompt,
        )

        agent = self.create_agent_runnable()

        # Inject tool call emitter only when the event manager is available
        # (it is always injected by Langflow, but we guard defensively)
        event_manager = getattr(self, "_event_manager", None)
        if event_manager is not None and self.tools:
            tool_callback = ToolCallEmitterCallback(event_manager)
            agent = agent.with_config(callbacks=[tool_callback])

        result = await self.run_agent(agent)
        self._agent_result = result
        return result
