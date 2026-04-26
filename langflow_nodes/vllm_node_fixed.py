from __future__ import annotations

from typing import Any, ClassVar

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk
from langchain_core.outputs import ChatGenerationChunk, ChatResult
from langchain_openai import ChatOpenAI
from pydantic.v1 import SecretStr

from lfx.base.models.model import LCModelComponent
from lfx.field_typing import LanguageModel
from lfx.field_typing.range_spec import RangeSpec
from lfx.inputs.inputs import BoolInput, DictInput, IntInput, MultilineInput, SecretStrInput, SliderInput, StrInput
from lfx.log.logger import logger

import requests


class NemotronReasoningChatOpenAI(ChatOpenAI):
    """ChatOpenAI subclass for OpenAI-compatible models with optional reasoning capture.

    Why this exists:
    - vLLM and some OpenAI-compatible providers can emit separate reasoning chunks
      (`delta.reasoning` or `delta.reasoning_content`)
    - Langflow's current Agent stream pipeline only forwards `AIMessageChunk.content`
    - to avoid patching Langflow core, this model injects streamed reasoning into the
      content stream using tagged text:

        <thinking>...</thinking>

    This preserves the reasoning signal through the current Langflow Agent pipeline.

    Important:
    - This does not magically create a separate reasoning field in Langflow's stream.
    - It preserves reasoning in a way that can later be parsed back out cleanly.
    """

    reasoning_open_tag: ClassVar[str] = "<thinking>"
    reasoning_close_tag: ClassVar[str] = "</thinking>"

    system_prompt: str = ""
    enable_thinking: bool = True

    def _merge_reasoning_body(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.enable_thinking:
            return payload

        extra_body = dict(payload.get("extra_body") or {})
        chat_template_kwargs = dict(extra_body.get("chat_template_kwargs") or {})
        chat_template_kwargs["enable_thinking"] = True
        extra_body["chat_template_kwargs"] = chat_template_kwargs
        payload["extra_body"] = extra_body
        return payload

    def _reasoning_to_tagged_content(self, reasoning: str) -> str:
        return f"{self.reasoning_open_tag}{reasoning}{self.reasoning_close_tag}"

    def _extract_reasoning_from_stream_chunk(self, raw_chunk: dict[str, Any]) -> str | None:
        choices = raw_chunk.get("choices") or []
        if not choices:
            return None

        first_choice = choices[0] or {}
        delta = first_choice.get("delta") or {}
        reasoning = delta.get("reasoning") or delta.get("reasoning_content")

        if isinstance(reasoning, str) and reasoning:
            return reasoning
        return None

    def _extract_reasoning_from_final_response(self, response: Any, index: int) -> str | None:
        choices = None
        if isinstance(response, dict):
            choices = response.get("choices")
        elif hasattr(response, "choices"):
            choices = response.choices

        if not choices or index >= len(choices):
            return None

        choice = choices[index]
        if isinstance(choice, dict):
            message = choice.get("message") or {}
        else:
            message = getattr(choice, "message", None) or {}

        if isinstance(message, dict):
            reasoning = message.get("reasoning") or message.get("reasoning_content")
        else:
            reasoning = getattr(message, "reasoning", None) or getattr(message, "reasoning_content", None)

        if isinstance(reasoning, str) and reasoning:
            return reasoning
        return None

    async def _astream(self, messages: Any, *args: Any, **kwargs: Any):
        """Stream model output while preserving reasoning in content tags."""
        if self.system_prompt:
            from langchain_core.messages import SystemMessage
            if not any(isinstance(m, SystemMessage) for m in messages):
                messages = [SystemMessage(content=self.system_prompt)] + list(messages)
        kwargs["stream"] = True
        payload = self._get_request_payload(messages, *args, **kwargs)
        payload = self._merge_reasoning_body(payload)

        logger.debug("Executing Nemotron reasoning stream request")

        response = await self.async_client.create(**payload)
        default_chunk_class = AIMessageChunk

        async for raw_chunk in response:
            if not isinstance(raw_chunk, dict):
                raw_chunk = raw_chunk.model_dump()

            reasoning = self._extract_reasoning_from_stream_chunk(raw_chunk)
            if reasoning:
                yield ChatGenerationChunk(
                    message=AIMessageChunk(content=self._reasoning_to_tagged_content(reasoning)),
                    generation_info={},
                )

            generation_chunk = self._convert_chunk_to_generation_chunk(
                raw_chunk,
                default_chunk_class,
                {},
            )
            if generation_chunk is None:
                continue

            default_chunk_class = generation_chunk.message.__class__
            yield generation_chunk

    def _generate(self, messages: Any, *args: Any, **kwargs: Any) -> ChatResult:
        """Inject system prompt for non-streaming calls."""
        if self.system_prompt:
            from langchain_core.messages import SystemMessage
            if not any(isinstance(m, SystemMessage) for m in messages):
                messages = [SystemMessage(content=self.system_prompt)] + list(messages)
        return super()._generate(messages, *args, **kwargs)

    def _create_chat_result(self, response: Any, generation_info: dict[str, Any] | None = None) -> ChatResult:
        """Preserve non-stream reasoning by prepending tagged reasoning to content."""
        result = super()._create_chat_result(response, generation_info=generation_info)

        for index, generation in enumerate(result.generations):
            reasoning = self._extract_reasoning_from_final_response(response, index)
            if not reasoning:
                continue

            message = generation.message
            current_content = getattr(message, "content", "") or ""
            tagged_reasoning = self._reasoning_to_tagged_content(reasoning)

            if tagged_reasoning in current_content:
                continue

            generation.message = AIMessage(
                content=f"{tagged_reasoning}{current_content}",
                additional_kwargs=dict(getattr(message, "additional_kwargs", {}) or {}),
                response_metadata=dict(getattr(message, "response_metadata", {}) or {}),
                tool_calls=list(getattr(message, "tool_calls", []) or []),
                invalid_tool_calls=list(getattr(message, "invalid_tool_calls", []) or []),
                usage_metadata=getattr(message, "usage_metadata", None),
            )

        return result


class NemotronReasoningVllmComponent(LCModelComponent):
    display_name = "OpenAI Compatible Reasoning"
    description = "OpenAI-compatible chat model for local and third-party providers that preserves reasoning in tagged content."
    icon = "vLLM"
    name = "NemotronReasoningVllmModel"

    inputs = [
        *LCModelComponent.get_base_inputs(),
        IntInput(
            name="max_tokens",
            display_name="Max Tokens",
            advanced=True,
            info="The maximum number of tokens to generate. Set to 0 for unlimited tokens.",
            range_spec=RangeSpec(min=0, max=128000),
        ),
        DictInput(
            name="model_kwargs",
            display_name="Model Kwargs",
            advanced=True,
            info="Additional top-level OpenAI-compatible keyword arguments.",
        ),
        DictInput(
            name="extra_body",
            display_name="Extra Body",
            advanced=True,
            info="Optional provider-specific extra_body fields.",
        ),
        BoolInput(
            name="json_mode",
            display_name="JSON Mode",
            advanced=True,
            info="If True, it will output JSON regardless of passing a schema.",
        ),
        StrInput(
            name="model_name",
            display_name="Model Name",
            advanced=True,
            info="The served model name. Populated automatically from app tweaks.",
            value="nemotron-super",
        ),
        StrInput(
            name="api_base",
            display_name="API Base",
            advanced=True,
            info="The OpenAI-compatible API base URL. Populated automatically from app tweaks.",
            value="http://localhost:8000/v1",
        ),
        MultilineInput(
            name="system_prompt",
            display_name="System Prompt",
            advanced=True,
            info="System prompt to set model behavior. Populated automatically from app config.",
            value="You are a helpful AI assistant.",
        ),
        SecretStrInput(
            name="api_key",
            display_name="API Key",
            info="The API key to use for the OpenAI-compatible model.",
            advanced=True,
            value="",
            required=False,
        ),
        BoolInput(
            name="enable_thinking",
            display_name="Enable Thinking",
            advanced=True,
            info="When true, sends vLLM chat_template_kwargs.enable_thinking and preserves reasoning chunks in <thinking> tags.",
            value=True,
        ),
        StrInput(
            name="reasoning_effort",
            display_name="Reasoning Effort",
            advanced=True,
            info="Optional provider reasoning_effort value. Leave empty to omit.",
            value="",
            required=False,
        ),
        StrInput(
            name="thinking_type",
            display_name="Thinking Type",
            advanced=True,
            info="Optional provider thinking.type value, for example enabled or disabled. Leave empty to omit.",
            value="",
            required=False,
        ),
        BoolInput(
            name="validate_model_on_build",
            display_name="Validate Model On Build",
            advanced=True,
            info="Call /models before each build. Usually leave off because AlfyAI validates providers in admin settings.",
            value=False,
        ),
        SliderInput(
            name="temperature",
            display_name="Temperature",
            value=0.1,
            range_spec=RangeSpec(min=0, max=1, step=0.01),
            show=True,
        ),
        SliderInput(
            name="top_p",
            display_name="Top P",
            value=1.0,
            range_spec=RangeSpec(min=0, max=1, step=0.01),
            advanced=True,
            info="Nucleus sampling: only tokens whose cumulative probability reaches top_p are considered. "
                 "1.0 disables filtering (default).",
        ),
        IntInput(
            name="top_k",
            display_name="Top K",
            value=-1,
            advanced=True,
            info="Limits sampling to the top-k most likely tokens at each step. "
                 "Set to -1 to disable (vLLM default).",
        ),
        IntInput(
            name="seed",
            display_name="Seed",
            info="Controls reproducibility. Set to -1 to disable.",
            advanced=True,
            value=-1,
            required=False,
        ),
        IntInput(
            name="max_retries",
            display_name="Max Retries",
            info="Max retries when generating. Set to -1 to disable.",
            advanced=True,
            value=-1,
            required=False,
        ),
        IntInput(
            name="timeout",
            display_name="Timeout",
            info="Timeout for requests to vLLM completion API. Set to -1 to disable.",
            advanced=True,
            value=-1,
            required=False,
        ),
    ]

    def _validate_model_exists(self, base_url: str, model_name: str, api_key: str | None = None) -> bool:
        """Validate that the model exists on the OpenAI-compatible server."""
        try:
            headers = {}
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
            
            response = requests.get(f"{base_url.rstrip('/')}/models", headers=headers, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            available_models = [m.get("id") for m in data.get("data", [])]
            
            logger.info(f"Available models on {base_url}: {available_models}")
            logger.info(f"Looking for model: {model_name}")
            
            if model_name not in available_models:
                logger.error(f"Model '{model_name}' not found. Available: {available_models}")
                return False
            
            return True
        except Exception as e:
            logger.error(f"Failed to validate model: {e}")
            return False

    def build_model(self) -> LanguageModel:  # type: ignore[type-var]
        # Debug: Log what values we received
        logger.info(f"=== OPENAI COMPATIBLE MODEL NODE DEBUG ===")
        logger.info(f"model_name field value: {self.model_name}")
        logger.info(f"api_base field value: {self.api_base}")
        logger.info(f"api_key is set: {bool(self.api_key)}")
        logger.info(f"system_prompt is set: {bool(self.system_prompt)}")
        
        # Optional: provider validation is normally handled by the AlfyAI admin UI.
        if self.validate_model_on_build and not self._validate_model_exists(self.api_base, self.model_name, self.api_key or None):
            raise ValueError(
                f"Model '{self.model_name}' does not exist on OpenAI-compatible server at {self.api_base}. "
                f"Check your provider settings and ensure the model is available."
            )
        
        logger.info(f"Building model with name={self.model_name}, base_url={self.api_base}")

        user_extra_body = dict(self.extra_body or {})
        if self.enable_thinking:
            chat_template_kwargs = dict(user_extra_body.get("chat_template_kwargs") or {})
            chat_template_kwargs["enable_thinking"] = True
            user_extra_body["chat_template_kwargs"] = chat_template_kwargs

        user_model_kwargs = dict(self.model_kwargs or {})
        thinking_type = str(getattr(self, "thinking_type", "") or "").strip()
        if thinking_type:
            user_model_kwargs["thinking"] = {"type": thinking_type}

        # top_k is vLLM-specific and not part of the OpenAI spec, so it goes in extra_body.
        # -1 is vLLM's default (no limit), so we only set it when the user has changed it.
        if self.top_k is not None and self.top_k != -1:
            user_extra_body["top_k"] = self.top_k

        parameters: dict[str, Any] = {
            "api_key": SecretStr(self.api_key).get_secret_value() if self.api_key else None,
            "model": self.model_name,
            "max_tokens": self.max_tokens or None,
            "model_kwargs": user_model_kwargs,
            "extra_body": user_extra_body,
            "base_url": self.api_base or "http://localhost:8000/v1",
            "temperature": self.temperature if self.temperature is not None else 0.1,
            "top_p": self.top_p if self.top_p is not None else 1.0,
            "system_prompt": self.system_prompt or "",
            "enable_thinking": bool(self.enable_thinking),
        }

        reasoning_effort = str(getattr(self, "reasoning_effort", "") or "").strip()
        if reasoning_effort:
            parameters["reasoning_effort"] = reasoning_effort

        if self.seed is not None and self.seed != -1:
            parameters["seed"] = self.seed
        if self.timeout is not None and self.timeout != -1:
            parameters["timeout"] = self.timeout
        if self.max_retries is not None and self.max_retries != -1:
            parameters["max_retries"] = self.max_retries

        logger.info(f"=== OPENAI COMPATIBLE MODEL PARAMETERS ===")
        logger.info(f"model: {parameters.get('model')}")
        logger.info(f"base_url: {parameters.get('base_url')}")
        logger.info(f"enable_thinking: {parameters.get('enable_thinking')}")
        logger.info(f"reasoning_effort set: {bool(parameters.get('reasoning_effort'))}")
        logger.info(f"thinking_type set: {bool(thinking_type)}")
        logger.info(f"========================")

        output: BaseChatModel = NemotronReasoningChatOpenAI(**parameters)

        if self.json_mode:
            output = output.bind(response_format={"type": "json_object"})

        return output

    def update_build_config(self, build_config: dict, field_value: Any, field_name: str | None = None) -> dict:  # noqa: ARG002
        return build_config
