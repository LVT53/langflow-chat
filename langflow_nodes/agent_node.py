from __future__ import annotations

import ast
import json
import re
from typing import TYPE_CHECKING, Any

from pydantic import ValidationError

from lfx.components.models_and_agents.memory import MemoryComponent

if TYPE_CHECKING:
    from langchain_core.tools import Tool

from langchain_core.callbacks import AsyncCallbackHandler
from lfx.base.agents.agent import LCToolsAgentComponent
from lfx.base.agents.events import ExceptionWithMessageError
from lfx.base.models.unified_models import (
    apply_provider_variable_config_to_build_config,
    get_language_model_options,
    get_llm,
    get_provider_for_model_name,
    update_model_options_in_build_config,
)
from lfx.base.models.watsonx_constants import IBM_WATSONX_URLS
from lfx.components.helpers import CurrentDateComponent
from lfx.components.langchain_utilities.tool_calling import ToolCallingAgentComponent
from lfx.custom.custom_component.component import get_component_toolkit
from lfx.field_typing.range_spec import RangeSpec
from lfx.helpers.base_model import build_model_from_schema
from lfx.inputs.inputs import BoolInput, DropdownInput, ModelInput, StrInput
from lfx.io import IntInput, MessageTextInput, MultilineInput, Output, SecretStrInput, TableInput
from lfx.log.logger import logger
from lfx.schema.data import Data
from lfx.schema.dotdict import dotdict
from lfx.schema.message import Message
from lfx.schema.table import EditMode


def set_advanced_true(component_input):
    component_input.advanced = True
    return component_input


def _clip_text(value: Any, max_length: int = 240) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if len(text) <= max_length:
        return text
    return f"{text[: max(0, max_length - 1)].rstrip()}…"


def _tool_source_type(name: str) -> str:
    lowered = (name or "").lower()
    if any(token in lowered for token in ("search", "searx", "tavily", "fetch", "browse", "web", "url")):
        return "web"
    return "tool"


def _extract_candidates(value: Any, source_type: str, limit: int = 8) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add_candidate(title: Any, url: Any, snippet: Any = None) -> None:
        if len(candidates) >= limit:
            return
        if not isinstance(title, str) or not title.strip():
            return

        normalized_url = str(url).strip() if isinstance(url, str) and str(url).strip() else None
        dedupe_key = normalized_url or title.strip().lower()
        if dedupe_key in seen:
            return
        seen.add(dedupe_key)
        candidates.append(
            {
                "id": dedupe_key,
                "title": _clip_text(title, 160),
                "url": normalized_url,
                "snippet": _clip_text(snippet, 220) if snippet else None,
                "sourceType": source_type,
            }
        )

    def walk(node: Any) -> None:
        if len(candidates) >= limit or node is None:
            return

        if isinstance(node, dict):
            url = node.get("url") or node.get("link") or node.get("href")
            title = node.get("title") or node.get("name") or node.get("url")
            snippet = (
                node.get("snippet")
                or node.get("content")
                or node.get("body")
                or node.get("description")
                or node.get("text")
            )
            if title:
                add_candidate(title, url, snippet)
            for child in node.values():
                walk(child)
            return

        if isinstance(node, list):
            for item in node:
                walk(item)
            return

        if source_type == "web" and isinstance(node, str):
            urls = re.findall(r"https?://[^\s)>\]]+", node)
            for url in urls:
                add_candidate(url, url, None)

    walk(value)
    return candidates


# ---------------------------------------------------------------------------
# Tool call emitter — injects structured markers into the Langflow token
# stream so the app can surface real-time tool call activity in the UI.
#
# Markers use STX (\x02) / Unit Separator (\x1f) / ETX (\x03) as delimiters.
# These control characters never appear in normal model output, making
# false-positive detection impossible.
#
# The app's stream server detects and strips these markers, then emits a
# structured `tool_call` SSE event to the client for each one.
# ---------------------------------------------------------------------------

class ToolCallEmitterCallback(AsyncCallbackHandler):
    """Emits TOOL_START / TOOL_END markers into the Langflow SSE token stream.

    EventManager.on_token signature (confirmed from logs):
        on_token(*, event_type: str = 'token', data: LoggableType)

    We pass data as {"chunk": marker} so the server's getTextContent() picks it
    up via the standard 'chunk' key, matching the format of every other token
    event in the stream.  Control characters in the marker are JSON-encoded in
    transit (→ \\u0002 etc.) and decoded back server-side before regex matching.
    """

    def __init__(self, event_manager: Any) -> None:
        super().__init__()
        self.event_manager = event_manager

    async def _emit(self, marker: str) -> None:
        try:
            # on_token is synchronous — do NOT await it
            self.event_manager.on_token(data={"chunk": marker})
        except Exception as e:
            print(f"[TOOL_CALLBACK] emit failed: {type(e).__name__}: {e}", flush=True)

    async def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        **kwargs: Any,
    ) -> None:
        name = serialized.get("name", "tool")
        try:
            input_data: Any = json.loads(input_str)
        except (json.JSONDecodeError, TypeError):
            # LangChain may pass a Python dict repr like "{'query': '...'}"
            # with single quotes — json.loads fails on those, so try ast.literal_eval
            try:
                input_data = ast.literal_eval(input_str)
            except Exception:
                input_data = {"input": str(input_str)}
        payload = json.dumps({"name": name, "input": input_data}, ensure_ascii=False)
        await self._emit(f"\x02TOOL_START\x1f{payload}\x03")

    async def on_tool_end(
        self,
        output: Any,
        name: str | None = None,
        **kwargs: Any,
    ) -> None:
        tool_name = name or kwargs.get("name") or "tool"
        source_type = _tool_source_type(tool_name)
        payload = json.dumps(
            {
                "name": tool_name,
                "sourceType": source_type,
                "outputSummary": _clip_text(output, 280) if output is not None else None,
                "candidates": _extract_candidates(output, source_type),
            },
            ensure_ascii=False,
        )
        await self._emit(f"\x02TOOL_END\x1f{payload}\x03")


class AgentComponent(ToolCallingAgentComponent):
    display_name: str = "Agent"
    description: str = "Define the agent's instructions, then enter a task to complete using tools."
    documentation: str = "https://docs.langflow.org/agents"
    icon = "bot"
    beta = False
    name = "Agent"

    memory_inputs = [set_advanced_true(component_input) for component_input in MemoryComponent().inputs]

    inputs = [
        ModelInput(
            name="model",
            display_name="Language Model",
            info="Select your model provider",
            real_time_refresh=True,
            required=True,
        ),
        SecretStrInput(
            name="api_key",
            display_name="API Key",
            info="Model Provider API key",
            real_time_refresh=True,
            advanced=True,
        ),
        DropdownInput(
            name="base_url_ibm_watsonx",
            display_name="watsonx API Endpoint",
            info="The base URL of the API (IBM watsonx.ai only)",
            options=IBM_WATSONX_URLS,
            value=IBM_WATSONX_URLS[0],
            show=False,
            real_time_refresh=True,
        ),
        StrInput(
            name="project_id",
            display_name="watsonx Project ID",
            info="The project ID associated with the foundation model (IBM watsonx.ai only)",
            show=False,
            required=False,
        ),
        MultilineInput(
            name="system_prompt",
            display_name="Agent Instructions",
            info="System Prompt: Initial instructions and context provided to guide the agent's behavior.",
            value="You are a helpful assistant that can use tools to answer questions and perform tasks.",
            advanced=False,
        ),
        MessageTextInput(
            name="context_id",
            display_name="Context ID",
            info="The context ID of the chat. Adds an extra layer to the local memory.",
            value="",
            advanced=True,
        ),
        IntInput(
            name="n_messages",
            display_name="Number of Chat History Messages",
            value=100,
            info="Number of chat history messages to retrieve.",
            advanced=True,
            show=True,
        ),
        IntInput(
            name="max_tokens",
            display_name="Max Tokens",
            info="Maximum number of tokens to generate. Field name varies by provider.",
            advanced=True,
            range_spec=RangeSpec(min=1, max=32768, step=1, step_type="int"),
        ),
        MultilineInput(
            name="format_instructions",
            display_name="Output Format Instructions",
            info="Generic Template for structured output formatting. Valid only with Structured response.",
            value=(
                "You are an AI that extracts structured JSON objects from unstructured text. "
                "Use a predefined schema with expected types (str, int, float, bool, dict). "
                "Extract ALL relevant instances that match the schema - if multiple patterns exist, capture them all. "
                "Fill missing or ambiguous values with defaults: null for missing values. "
                "Remove exact duplicates but keep variations that have different field values. "
                "Always return valid JSON in the expected format, never throw errors. "
                "If multiple objects can be extracted, return them all in the structured format."
            ),
            advanced=True,
        ),
        TableInput(
            name="output_schema",
            display_name="Output Schema",
            info=(
                "Schema Validation: Define the structure and data types for structured output. "
                "No validation if no output schema."
            ),
            advanced=True,
            required=False,
            value=[],
            table_schema=[
                {
                    "name": "name",
                    "display_name": "Name",
                    "type": "str",
                    "description": "Specify the name of the output field.",
                    "default": "field",
                    "edit_mode": EditMode.INLINE,
                },
                {
                    "name": "description",
                    "display_name": "Description",
                    "type": "str",
                    "description": "Describe the purpose of the output field.",
                    "default": "description of field",
                    "edit_mode": EditMode.POPOVER,
                },
                {
                    "name": "type",
                    "display_name": "Type",
                    "type": "str",
                    "edit_mode": EditMode.INLINE,
                    "description": ("Indicate the data type of the output field (e.g., str, int, float, bool, dict)."),
                    "options": ["str", "int", "float", "bool", "dict"],
                    "default": "str",
                },
                {
                    "name": "multiple",
                    "display_name": "As List",
                    "type": "boolean",
                    "description": "Set to True if this output field should be a list of the specified type.",
                    "default": "False",
                    "edit_mode": EditMode.INLINE,
                },
            ],
        ),
        *LCToolsAgentComponent.get_base_inputs(),
        # removed memory inputs from agent component
        # *memory_inputs,
        BoolInput(
            name="add_current_date_tool",
            display_name="Current Date",
            advanced=True,
            info="If true, will add a tool to the agent that returns the current date.",
            value=True,
        ),
    ]
    outputs = [
        Output(name="response", display_name="Response", method="message_response"),
    ]

    def _get_max_tokens_value(self):
        """Return the user-supplied max_tokens or None when unset/zero."""
        val = getattr(self, "max_tokens", None)
        if val in {"", 0}:
            return None
        return val

    def _get_llm(self):
        """Override parent to include max_tokens from the Agent's input field."""
        return get_llm(
            model=self.model,
            user_id=self.user_id,
            api_key=getattr(self, "api_key", None),
            max_tokens=self._get_max_tokens_value(),
            watsonx_url=getattr(self, "base_url_ibm_watsonx", None),
            watsonx_project_id=getattr(self, "project_id", None),
        )

    @staticmethod
    def _tool_names(tools: Any) -> list[str]:
        names: list[str] = []
        if not isinstance(tools, list):
            return names
        for tool in tools:
            name = str(getattr(tool, "name", "") or "").strip()
            if name and name not in names:
                names.append(name)
        return names

    def _system_prompt_with_runtime_tools(self, system_prompt: str, tools: Any) -> str:
        tool_names = self._tool_names(tools)
        if tool_names:
            tool_list = ", ".join(f"`{name}`" for name in tool_names)
            runtime_tools = (
                "Runtime tool inventory:\n"
                f"- The tools currently registered on this Agent node are: {tool_list}.\n"
                "- Use only these exact tool names. If prompt examples mention another tool name, treat that example as unavailable."
            )
        else:
            runtime_tools = (
                "Runtime tool inventory:\n"
                "- No tools are currently registered on this Agent node. Do not claim to use search, fetch, file, or other tools."
            )

        base_prompt = str(system_prompt or "").strip()
        if not base_prompt:
            return runtime_tools
        return f"{base_prompt}\n\n{runtime_tools}"

    async def get_agent_requirements(self):
        """Get the agent requirements for the agent."""
        from langchain_core.tools import StructuredTool

        llm_model = self._get_llm()
        if llm_model is None:
            msg = "No language model selected. Please choose a model to proceed."
            raise ValueError(msg)

        # Get memory data
        self.chat_history = await self.get_memory_data()
        await logger.adebug(f"Retrieved {len(self.chat_history)} chat history messages")
        if isinstance(self.chat_history, Message):
            self.chat_history = [self.chat_history]

        # Add current date tool if enabled
        if self.add_current_date_tool:
            if not isinstance(self.tools, list):  # type: ignore[has-type]
                self.tools = []
            current_date_tool = (await CurrentDateComponent(**self.get_base_args()).to_toolkit()).pop(0)

            if not isinstance(current_date_tool, StructuredTool):
                msg = "CurrentDateComponent must be converted to a StructuredTool"
                raise TypeError(msg)
            # Only append if it's not already in the list to prevent accumulation across runs
            if not any(getattr(t, "name", "") == getattr(current_date_tool, "name", "") for t in self.tools):
                self.tools.append(current_date_tool)


        # Ensure all tool names are unique to prevent LangChain provider crashes (e.g. OpenAI "Tool names must be unique" BadRequestError)
        if isinstance(self.tools, list):
            seen_names = set()
            for tool in self.tools:
                name = str(getattr(tool, "name", "") or "").strip()
                if not name:
                    continue
                original_name = name
                counter = 1
                while name in seen_names:
                    name = f"{original_name}_{counter}"
                    counter += 1
                if name != original_name:
                    tool.name = name
                seen_names.add(name)

        # Set shared callbacks for tracing the tools used by the agent
        self.set_tools_callbacks(self.tools, self._get_shared_callbacks())
        registered_tools = ", ".join(self._tool_names(self.tools)) or "none"
        logger.info("Agent runtime tools registered: %s", registered_tools)
        print(f"[ALFYAI_AGENT] Agent runtime tools registered: {registered_tools}", flush=True)

        return llm_model, self.chat_history, self.tools

    async def message_response(self) -> Message:
        try:
            llm_model, self.chat_history, self.tools = await self.get_agent_requirements()
            system_prompt = self._system_prompt_with_runtime_tools(self.system_prompt, self.tools)
            # Set up and run agent
            self.set(
                llm=llm_model,
                tools=self.tools or [],
                chat_history=self.chat_history,
                input_value=self.input_value,
                system_prompt=system_prompt,
            )
            # Inject tool call emitter directly onto each tool's `callbacks` list.
            # with_config() is NOT used — the parent's run_agent() passes its own
            # callback config, which replaces any with_config binding.
            # BaseTool.arun() always merges tool.callbacks with caller-supplied
            # callbacks, so attaching here guarantees on_tool_start/end fire.
            event_manager = getattr(self, "_event_manager", None)
            if event_manager is not None and self.tools:
                cb = ToolCallEmitterCallback(event_manager)
                for tool in self.tools:
                    existing = list(getattr(tool, "callbacks", None) or [])
                    try:
                        tool.callbacks = existing + [cb]
                    except Exception:
                        # Frozen Pydantic model — bypass via object.__setattr__
                        try:
                            object.__setattr__(tool, "callbacks", existing + [cb])
                        except Exception:
                            pass

            agent = self.create_agent_runnable()
            result = await self.run_agent(agent)

            # Store result for potential JSON output
            self._agent_result = result

        except (ValueError, TypeError, KeyError) as e:
            await logger.aerror(f"{type(e).__name__}: {e!s}")
            raise
        except ExceptionWithMessageError as e:
            await logger.aerror(f"ExceptionWithMessageError occurred: {e}")
            raise
        # Avoid catching blind Exception; let truly unexpected exceptions propagate
        except Exception as e:
            await logger.aerror(f"Unexpected error: {e!s}")
            raise
        else:
            return result

    def _preprocess_schema(self, schema):
        """Preprocess schema to ensure correct data types for build_model_from_schema."""
        processed_schema = []
        for field in schema:
            processed_field = {
                "name": str(field.get("name", "field")),
                "type": str(field.get("type", "str")),
                "description": str(field.get("description", "")),
                "multiple": field.get("multiple", False),
            }
            # Ensure multiple is handled correctly
            if isinstance(processed_field["multiple"], str):
                processed_field["multiple"] = processed_field["multiple"].lower() in [
                    "true",
                    "1",
                    "t",
                    "y",
                    "yes",
                ]
            processed_schema.append(processed_field)
        return processed_schema

    async def build_structured_output_base(self, content: str):
        """Build structured output with optional BaseModel validation."""
        json_pattern = r"\{.*\}"
        schema_error_msg = "Try setting an output schema"

        # Try to parse content as JSON first
        json_data = None
        try:
            json_data = json.loads(content)
        except json.JSONDecodeError:
            json_match = re.search(json_pattern, content, re.DOTALL)
            if json_match:
                try:
                    json_data = json.loads(json_match.group())
                except json.JSONDecodeError:
                    return {"content": content, "error": schema_error_msg}
            else:
                return {"content": content, "error": schema_error_msg}

        # If no output schema provided, return parsed JSON without validation
        if not hasattr(self, "output_schema") or not self.output_schema or len(self.output_schema) == 0:
            return json_data

        # Use BaseModel validation with schema
        try:
            processed_schema = self._preprocess_schema(self.output_schema)
            output_model = build_model_from_schema(processed_schema)

            # Validate against the schema
            if isinstance(json_data, list):
                # Multiple objects
                validated_objects = []
                for item in json_data:
                    try:
                        validated_obj = output_model.model_validate(item)
                        validated_objects.append(validated_obj.model_dump())
                    except ValidationError as e:
                        await logger.aerror(f"Validation error for item: {e}")
                        # Include invalid items with error info
                        validated_objects.append({"data": item, "validation_error": str(e)})
                return validated_objects

            # Single object
            try:
                validated_obj = output_model.model_validate(json_data)
                return [validated_obj.model_dump()]  # Return as list for consistency
            except ValidationError as e:
                await logger.aerror(f"Validation error: {e}")
                return [{"data": json_data, "validation_error": str(e)}]

        except (TypeError, ValueError) as e:
            await logger.aerror(f"Error building structured output: {e}")
            # Fallback to parsed JSON without validation
            return json_data

    async def json_response(self) -> Data:
        """Convert agent response to structured JSON Data output with schema validation."""
        # Always use structured chat agent for JSON response mode for better JSON formatting
        try:
            system_components = []

            # 1. Agent Instructions (system_prompt)
            agent_instructions = getattr(self, "system_prompt", "") or ""
            if agent_instructions:
                system_components.append(f"{agent_instructions}")

            # 2. Format Instructions
            format_instructions = getattr(self, "format_instructions", "") or ""
            if format_instructions:
                system_components.append(f"Format instructions: {format_instructions}")

            # 3. Schema Information from BaseModel
            if hasattr(self, "output_schema") and self.output_schema and len(self.output_schema) > 0:
                try:
                    processed_schema = self._preprocess_schema(self.output_schema)
                    output_model = build_model_from_schema(processed_schema)
                    schema_dict = output_model.model_json_schema()
                    schema_info = (
                        "You are given some text that may include format instructions, "
                        "explanations, or other content alongside a JSON schema.\n\n"
                        "Your task:\n"
                        "- Extract only the JSON schema.\n"
                        "- Return it as valid JSON.\n"
                        "- Do not include format instructions, explanations, or extra text.\n\n"
                        "Input:\n"
                        f"{json.dumps(schema_dict, indent=2)}\n\n"
                        "Output (only JSON schema):"
                    )
                    system_components.append(schema_info)
                except (ValidationError, ValueError, TypeError, KeyError) as e:
                    await logger.aerror(f"Could not build schema for prompt: {e}", exc_info=True)

            # Combine all components
            combined_instructions = "\n\n".join(system_components) if system_components else ""
            llm_model, self.chat_history, self.tools = await self.get_agent_requirements()
            combined_instructions = self._system_prompt_with_runtime_tools(
                combined_instructions,
                self.tools,
            )
            self.set(
                llm=llm_model,
                tools=self.tools or [],
                chat_history=self.chat_history,
                input_value=self.input_value,
                system_prompt=combined_instructions,
            )

            # Create and run structured chat agent
            try:
                structured_agent = self.create_agent_runnable()
            except (NotImplementedError, ValueError, TypeError) as e:
                await logger.aerror(f"Error with structured chat agent: {e}")
                raise
            try:
                result = await self.run_agent(structured_agent)
            except (
                ExceptionWithMessageError,
                ValueError,
                TypeError,
                RuntimeError,
            ) as e:
                await logger.aerror(f"Error with structured agent result: {e}")
                raise
            # Extract content from structured agent result
            if hasattr(result, "content"):
                content = result.content
            elif hasattr(result, "text"):
                content = result.text
            else:
                content = str(result)

        except (
            ExceptionWithMessageError,
            ValueError,
            TypeError,
            NotImplementedError,
            AttributeError,
        ) as e:
            await logger.aerror(f"Error with structured chat agent: {e}")
            # Fallback to regular agent
            content_str = "No content returned from agent"
            return Data(data={"content": content_str, "error": str(e)})

        # Process with structured output validation
        try:
            structured_output = await self.build_structured_output_base(content)

            # Handle different output formats
            if isinstance(structured_output, list) and structured_output:
                if len(structured_output) == 1:
                    return Data(data=structured_output[0])
                return Data(data={"results": structured_output})
            if isinstance(structured_output, dict):
                return Data(data=structured_output)
            return Data(data={"content": content})

        except (ValueError, TypeError) as e:
            await logger.aerror(f"Error in structured output processing: {e}")
            return Data(data={"content": content, "error": str(e)})

    async def get_memory_data(self):
        # TODO: This is a temporary fix to avoid message duplication. We should develop a function for this.
        messages = (
            await MemoryComponent(**self.get_base_args())
            .set(
                session_id=self.graph.session_id,
                context_id=self.context_id,
                order="Ascending",
                n_messages=self.n_messages,
            )
            .retrieve_messages()
        )
        return [
            message for message in messages if getattr(message, "id", None) != getattr(self.input_value, "id", None)
        ]

    def update_input_types(self, build_config: dotdict) -> dotdict:
        """Update input types for all fields in build_config."""
        for key, value in build_config.items():
            if isinstance(value, dict):
                if value.get("input_types") is None:
                    build_config[key]["input_types"] = []
            elif hasattr(value, "input_types") and value.input_types is None:
                value.input_types = []
        return build_config

    async def update_build_config(
        self,
        build_config: dotdict,
        field_value: list[dict],
        field_name: str | None = None,
    ) -> dotdict:
        # Update model options with caching (for all field changes)
        # Agents require tool calling, so filter for only tool-calling capable models
        def get_tool_calling_model_options(user_id=None):
            return get_language_model_options(user_id=user_id, tool_calling=True)

        build_config = update_model_options_in_build_config(
            component=self,
            build_config=dict(build_config),
            cache_key_prefix="language_model_options_tool_calling",
            get_options_func=get_tool_calling_model_options,
            field_name=field_name,
            field_value=field_value,
        )
        build_config = dotdict(build_config)

        if field_name == "model":
            build_config = self.update_input_types(build_config)

        current_model_value = field_value if field_name == "model" else build_config.get("model", {}).get("value")
        provider = ""
        if isinstance(current_model_value, list) and current_model_value:
            selected_model = current_model_value[0]
            provider = (selected_model.get("provider") or "").strip()
            if not provider and selected_model.get("name"):
                provider = get_provider_for_model_name(str(selected_model["name"]))

        if provider:
            build_config = apply_provider_variable_config_to_build_config(build_config, provider)

        if field_name == "model":
            default_keys = [
                "code",
                "_type",
                "model",
                "tools",
                "input_value",
                "add_current_date_tool",
                "system_prompt",
                "agent_description",
                "max_iterations",
                "handle_parsing_errors",
                "verbose",
            ]
            missing_keys = [key for key in default_keys if key not in build_config]
            if missing_keys:
                msg = f"Missing required keys in build_config: {missing_keys}"
                raise ValueError(msg)
        return dotdict({k: v.to_dict() if hasattr(v, "to_dict") else v for k, v in build_config.items()})

    async def _get_tools(self) -> list[Tool]:
        component_toolkit = get_component_toolkit()
        tools_names = self._build_tools_names()
        agent_description = self.get_tool_description()
        # TODO: Agent Description Depreciated Feature to be removed
        description = f"{agent_description}{tools_names}"

        tools = component_toolkit(component=self).get_tools(
            tool_name="Call_Agent",
            tool_description=description,
            # here we do not use the shared callbacks as we are exposing the agent as a tool
            callbacks=self.get_langchain_callbacks(),
        )
        if hasattr(self, "tools_metadata"):
            tools = component_toolkit(component=self, metadata=self.tools_metadata).update_tools_metadata(tools=tools)

        return tools
