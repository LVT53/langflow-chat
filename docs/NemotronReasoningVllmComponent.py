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
from lfx.inputs.inputs import BoolInput, DictInput, IntInput, SecretStrInput, SliderInput, StrInput
from lfx.log.logger import logger


class NemotronReasoningChatOpenAI(ChatOpenAI):
    """ChatOpenAI subclass for Nemotron reasoning via vLLM.

    Why this exists:
    - vLLM can emit separate reasoning chunks (`delta.reasoning`)
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

    def _merge_reasoning_body(self, payload: dict[str, Any]) -> dict[str, Any]:
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

    async def _astream(self, *args: Any, **kwargs: Any):
        """Stream model output while preserving reasoning in content tags."""
        kwargs["stream"] = True
        payload = self._get_request_payload(*args, **kwargs)
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
    display_name = "Nemotron vLLM Reasoning"
    description = "vLLM/OpenAI-compatible Nemotron model that preserves reasoning in tagged content."
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
            info="Optional extra body fields. Nemotron reasoning is forced on regardless.",
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
            advanced=False,
            info="The served model name exposed by vLLM.",
            value="nemotron-super",
        ),
        StrInput(
            name="api_base",
            display_name="vLLM API Base",
            advanced=False,
            info="The base URL of the vLLM API server.",
            value="http://localhost:8000/v1",
        ),
        SecretStrInput(
            name="api_key",
            display_name="API Key",
            info="The API key to use for the vLLM model.",
            advanced=False,
            value="",
            required=False,
        ),
        SliderInput(
            name="temperature",
            display_name="Temperature",
            value=0.1,
            range_spec=RangeSpec(min=0, max=1, step=0.01),
            show=True,
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

    def build_model(self) -> LanguageModel:  # type: ignore[type-var]
        logger.debug(f"Executing request with Nemotron reasoning model: {self.model_name}")

        user_extra_body = dict(self.extra_body or {})
        chat_template_kwargs = dict(user_extra_body.get("chat_template_kwargs") or {})
        chat_template_kwargs["enable_thinking"] = True
        user_extra_body["chat_template_kwargs"] = chat_template_kwargs

        parameters: dict[str, Any] = {
            "api_key": SecretStr(self.api_key).get_secret_value() if self.api_key else None,
            "model_name": self.model_name,
            "max_tokens": self.max_tokens or None,
            "model_kwargs": self.model_kwargs or {},
            "extra_body": user_extra_body,
            "base_url": self.api_base or "http://localhost:8000/v1",
            "temperature": self.temperature if self.temperature is not None else 0.1,
        }

        if self.seed is not None and self.seed != -1:
            parameters["seed"] = self.seed
        if self.timeout is not None and self.timeout != -1:
            parameters["timeout"] = self.timeout
        if self.max_retries is not None and self.max_retries != -1:
            parameters["max_retries"] = self.max_retries

        output: BaseChatModel = NemotronReasoningChatOpenAI(**parameters)

        if self.json_mode:
            output = output.bind(response_format={"type": "json_object"})

        return output

    def update_build_config(self, build_config: dict, field_value: Any, field_name: str | None = None) -> dict:  # noqa: ARG002
        return build_config

