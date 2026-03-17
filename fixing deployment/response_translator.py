# =============================================================================
# ResponseTranslator — Langflow Custom Component (v4)
# =============================================================================
# Translates the Agent's English response back to Hungarian using a local
# TranslateGemma endpoint.
#
# ARCHITECTURE:
#   1. BLOCK EXTRACTION: Fenced code blocks and <preserve> tags are extracted
#      entirely — they never touch TranslateGemma.
#   2. TERM MARKERS: Inline code (`...`), [bracketed placeholders], and URLs
#      within translatable text are replaced with opaque markers [T1], [T2]
#      etc. TranslateGemma is told explicitly to preserve these markers.
#   3. SENTENCE BUFFERING: Translatable prose is split into sentences via
#      the SentenceBuffer for manageable translation units.
#   4. VALIDATION: After translation, all term markers are verified present.
#      Missing markers are restored. Hallucination patterns are detected
#      and rejected.
#   5. RESTORATION: Markers are replaced with original content. Blocks
#      are reinserted with proper newline boundaries.
#
# INPUTS:
#   1. agent_response  → the Agent's English output (Message)
#   2. source_language → "hu" or "en" (from the Language Detector)
#
# OUTPUT:
#   Translated response → connect to Chat Output
# =============================================================================

import re
import json
import logging
from typing import Optional

import httpx

from langflow.custom import Component
from langflow.io import (
    MessageInput,
    StrInput,
    IntInput,
    FloatInput,
    Output,
    SecretStrInput,
    MultilineInput,
)
from langflow.schema.message import Message

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Abbreviation set for the sentence boundary detector
# ---------------------------------------------------------------------------
ABBREVIATIONS = {
    "mr.", "mrs.", "ms.", "dr.", "prof.", "jr.", "sr.", "st.", "vs.",
    "etc.", "i.e.", "e.g.", "a.m.", "p.m.", "u.s.", "u.k.", "no.",
    "vol.", "dept.", "approx.", "incl.", "corp.", "ltd.", "inc.",
    "fig.", "eq.", "ref.", "sec.", "ch.", "pt.", "gen.", "gov.",
    "sgt.", "cpl.", "pvt.", "rev.", "hon.", "pres.",
}

# Known hallucination phrases TranslateGemma produces when confused
HALLUCINATION_PATTERNS = [
    "kérlek, add meg",
    "add meg a szöveget",
    "amit le kell fordítanom",
    "kérem a szöveget",
    "adja meg a szöveget",
    "rendben, kérem",
    "rendben, adja meg",
    "a fordítás a következő",
    "itt a fordítás",
    "kérem, adja meg",
]


# ===========================================================================
# Sentence-boundary buffer
# ===========================================================================

class SentenceBuffer:
    def __init__(self, max_length: int = 500, first_flush_max: int = 150):
        self.buffer: str = ""
        self.max_length = max_length
        self.first_flush_max = first_flush_max
        self.is_first_flush = True

    def add_token(self, token: str) -> list[str]:
        self.buffer += token
        return self._check_flush()

    def flush_remaining(self) -> Optional[str]:
        if self.buffer.strip():
            remaining = self.buffer
            self.buffer = ""
            return remaining
        return None

    def _check_flush(self) -> list[str]:
        segments: list[str] = []

        if len(self.buffer) >= self.max_length:
            segments.append(self.buffer)
            self.buffer = ""
            self.is_first_flush = False
            return segments

        if self.is_first_flush:
            sent = self._extract_sentence()
            if sent:
                segments.append(sent)
                self.is_first_flush = False
                return segments

            clause_match = re.search(r"[,;:\u2014]\s", self.buffer)
            if clause_match and clause_match.start() >= 10:
                split_pos = clause_match.end()
                segments.append(self.buffer[:split_pos])
                self.buffer = self.buffer[split_pos:]
                self.is_first_flush = False
                return segments

            if len(self.buffer) >= self.first_flush_max:
                last_space = self.buffer.rfind(" ", 0, self.first_flush_max)
                if last_space > 20:
                    segments.append(self.buffer[: last_space + 1])
                    self.buffer = self.buffer[last_space + 1:]
                else:
                    segments.append(self.buffer)
                    self.buffer = ""
                self.is_first_flush = False
                return segments

            return segments

        sent = self._extract_sentence()
        if sent:
            segments.append(sent)
        return segments

    def _extract_sentence(self) -> Optional[str]:
        for match in re.finditer(r"[.!?]", self.buffer):
            pos = match.start()
            char = self.buffer[pos]
            after_pos = pos + 1

            if after_pos < len(self.buffer) and not self.buffer[after_pos].isspace():
                continue

            if char == ".":
                words = self.buffer[: pos + 1].split()
                if words and words[-1].lower() in ABBREVIATIONS:
                    continue
                if pos > 0 and self.buffer[pos - 1].isdigit():
                    j = after_pos
                    while j < len(self.buffer) and self.buffer[j] == " ":
                        j += 1
                    if j < len(self.buffer) and self.buffer[j].isdigit():
                        continue

            split_pos = after_pos
            while split_pos < len(self.buffer) and self.buffer[split_pos].isspace():
                split_pos += 1

            sentence = self.buffer[:split_pos]
            self.buffer = self.buffer[split_pos:]
            return sentence

        return None


# ============================= COMPONENT ====================================


class ResponseTranslator(Component):
    display_name = "Response Translator"
    description = (
        "Translates the Agent's English response to Hungarian via "
        "TranslateGemma with code block protection, term markers, "
        "and hallucination detection."
    )
    icon = "languages"

    inputs = [
        MessageInput(
            name="agent_response",
            display_name="Agent Response",
            info="The Agent's English-language output.",
            required=True,
        ),
        MessageInput(
            name="source_language",
            display_name="Source Language",
            info='Message with text "hu" or "en" from the Language Detector.',
            required=True,
        ),
        StrInput(
            name="translategemma_base_url",
            display_name="TranslateGemma Base URL",
            value="http://192.168.1.96:30002/v1",
        ),
        SecretStrInput(
            name="translategemma_api_key",
            display_name="TranslateGemma API Key",
            value="",
        ),
        StrInput(
            name="translategemma_model_name",
            display_name="TranslateGemma Model Name",
            value="translategemma",
        ),
        MultilineInput(
            name="en_to_hu_prompt",
            display_name="EN → HU Translation Prompt",
            info=(
                "Base translation instruction. When technical terms are present, "
                "the component automatically appends marker-preservation instructions."
            ),
            value=(
                "You are a professional English (en) to Hungarian (hu) translator. "
                "Produce only the Hungarian translation, without any additional explanations."
            ),
        ),
        IntInput(
            name="translation_max_tokens",
            display_name="Translation Max Tokens",
            value=256,
        ),
        FloatInput(
            name="translation_temperature",
            display_name="Translation Temperature",
            value=0.1,
        ),
        IntInput(
            name="max_buffer_length",
            display_name="Max Buffer Length",
            info="Safety flush threshold for the sentence buffer (characters).",
            value=500,
        ),
        IntInput(
            name="first_flush_max_chars",
            display_name="First Flush Max Chars",
            info="Max chars before forcing the first buffer flush.",
            value=150,
        ),
        StrInput(
            name="webhook_sentence_url",
            display_name="Webhook Sentence URL",
            info="Full Langflow Chat webhook URL, e.g. https://chat.example.com/api/webhook/sentence",
            value="",
        ),
        SecretStrInput(
            name="webhook_secret",
            display_name="Webhook Secret",
            info="Shared secret sent as x-webhook-secret to Langflow Chat.",
            value="",
        ),
        FloatInput(
            name="webhook_timeout_seconds",
            display_name="Webhook Timeout Seconds",
            info="Timeout for each webhook POST.",
            value=10.0,
        ),
    ]

    outputs = [
        Output(
            display_name="Translated Response",
            name="translated_response",
            method="process",
        ),
    ]

    # ====================================================================
    # Main entry point
    # ====================================================================

    def process(self) -> Message:
        english_text = self.agent_response.text or ""
        lang = (
            self.source_language.text.strip().lower()
            if self.source_language.text
            else "en"
        )
        session_id = self._extract_session_id()
        stream_state = {"next_index": 0} if self._should_stream_to_webhook(lang, session_id) else None

        if not english_text.strip():
            return Message(text="")

        if lang != "hu":
            return Message(text=english_text)

        # ── Step 1: Extract block-level content ─────────────────────────
        blocks, text_with_block_placeholders = self._extract_blocks(english_text)

        # ── Step 2: Split around block placeholders and translate prose ──
        if blocks:
            hungarian_text = self._translate_around_blocks(
                text_with_block_placeholders, blocks, session_id, stream_state
            )
        else:
            hungarian_text = self._translate_prose(english_text, session_id, stream_state)

        self._emit_stream_complete(session_id, stream_state)

        return Message(text=hungarian_text)

    # ====================================================================
    # Step 1: Block-level extraction
    # ====================================================================

    def _extract_blocks(self, text: str) -> tuple[dict[str, str], str]:
        """
        Extract large non-translatable regions:
          1. <preserve>...</preserve> tags
          2. Markdown fenced code blocks (``` ... ```)

        Returns (block_dict, text_with_placeholders).
        Each placeholder is on its own line to prevent Markdown rendering issues.
        """
        blocks: dict[str, str] = {}
        counter = 0

        def _placeholder(content: str) -> str:
            nonlocal counter
            counter += 1
            key = f"__BLOCK_{counter}__"
            blocks[key] = content
            # Return placeholder with guaranteed newlines around it
            return f"\n{key}\n"

        # <preserve>...</preserve> — extract inner content
        text = re.sub(
            r"<preserve>(.*?)</preserve>",
            lambda m: _placeholder(m.group(1)),
            text,
            flags=re.DOTALL,
        )

        # Fenced code blocks — catch all variants:
        # ```python\n...\n```  or  ```\n...\n```  or  ```...```
        # The key insight: match from ``` to the NEXT ``` that is either
        # at start of line or preceded by a newline. This prevents matching
        # inline triple-backticks.
        text = re.sub(
            r"```[^\n]*\n.*?(?:\n```)(?=\s|$|[^\w`])",
            lambda m: _placeholder(m.group(0)),
            text,
            flags=re.DOTALL,
        )

        # Fallback for any remaining ``` pairs (e.g. no newline before closing)
        text = re.sub(
            r"```[^\n]*\n.*?```",
            lambda m: _placeholder(m.group(0)),
            text,
            flags=re.DOTALL,
        )

        # Clean up excessive blank lines from placeholder insertion
        text = re.sub(r"\n{3,}", "\n\n", text)

        return blocks, text

    # ====================================================================
    # Step 2: Translate around block placeholders
    # ====================================================================

    def _translate_around_blocks(
        self,
        text: str,
        blocks: dict[str, str],
        session_id: Optional[str] = None,
        stream_state: Optional[dict] = None,
    ) -> str:
        """
        Split text around __BLOCK_N__ placeholders. Translate each prose
        segment independently. Reinsert block content with proper newlines.
        """
        pattern = "|".join(re.escape(k) for k in blocks)
        parts = re.split(f"({pattern})", text)

        result: list[str] = []
        for part in parts:
            if part in blocks:
                block_parts: list[str] = []
                # Reinsert block content with guaranteed newline boundaries
                content = blocks[part]
                if result and not result[-1].endswith("\n"):
                    block_parts.append("\n")
                block_parts.append(content)
                block_parts.append("\n")
                block_text = "".join(block_parts)
                result.append(block_text)
                self._emit_stream_chunk(session_id, stream_state, block_text)
            elif part.strip():
                result.append(self._translate_prose(part, session_id, stream_state))
            else:
                result.append(part)

        return "".join(result)

    # ====================================================================
    # Step 3: Translate prose (with term markers)
    # ====================================================================

    def _translate_prose(
        self,
        english_text: str,
        session_id: Optional[str] = None,
        stream_state: Optional[dict] = None,
    ) -> str:
        """
        Translate a prose segment (no fenced code blocks) to Hungarian.
        Inline code, URLs, and bracket placeholders are replaced with
        opaque [T1], [T2] markers before translation and restored after.
        """
        buffer = SentenceBuffer(
            max_length=self.max_buffer_length,
            first_flush_max=self.first_flush_max_chars,
        )

        hungarian_parts: list[str] = []

        tokens = re.findall(r"\S+\s*", english_text)
        for token in tokens:
            for segment in buffer.add_token(token):
                translated = self._translate_sentence(segment)
                hungarian_parts.append(translated)
                self._emit_stream_chunk(session_id, stream_state, translated)

        remaining = buffer.flush_remaining()
        if remaining:
            translated = self._translate_sentence(remaining)
            hungarian_parts.append(translated)
            self._emit_stream_chunk(session_id, stream_state, translated)

        return "".join(hungarian_parts)

    def _should_stream_to_webhook(
        self, lang: str, session_id: Optional[str]
    ) -> bool:
        if lang != "hu":
            return False
        if not self.webhook_sentence_url.strip():
            return False
        if not session_id:
            logger.warning("ResponseTranslator could not determine session_id, disabling webhook streaming")
            return False
        return True

    def _extract_session_id(self) -> Optional[str]:
        for candidate in (
            getattr(self.agent_response, "session_id", None),
            self._find_session_id(getattr(self.agent_response, "properties", None)),
            self._find_session_id(getattr(self.agent_response, "data", None)),
            self._find_session_id(getattr(self.agent_response, "__dict__", None)),
        ):
            if isinstance(candidate, str) and candidate.strip():
                return candidate.strip()
        return None

    def _find_session_id(self, value) -> Optional[str]:
        if isinstance(value, dict):
            for key in ("session_id", "sessionId"):
                candidate = value.get(key)
                if isinstance(candidate, str) and candidate.strip():
                    return candidate.strip()
            for nested in value.values():
                candidate = self._find_session_id(nested)
                if candidate:
                    return candidate
        elif isinstance(value, list):
            for item in value:
                candidate = self._find_session_id(item)
                if candidate:
                    return candidate
        return None

    def _emit_stream_chunk(
        self,
        session_id: Optional[str],
        stream_state: Optional[dict],
        text: str,
    ) -> None:
        if not session_id or stream_state is None or not text:
            return

        payload = {
            "session_id": session_id,
            "sentence": text,
            "index": stream_state["next_index"],
            "is_final": False,
        }
        if self._post_webhook(payload):
            stream_state["next_index"] += 1

    def _emit_stream_complete(
        self,
        session_id: Optional[str],
        stream_state: Optional[dict],
    ) -> None:
        if not session_id or stream_state is None:
            return

        self._post_webhook(
            {
                "session_id": session_id,
                "index": stream_state["next_index"],
                "is_final": True,
            }
        )

    def _post_webhook(self, payload: dict) -> bool:
        if not self.webhook_sentence_url.strip():
            return False

        headers = {"Content-Type": "application/json"}
        if self.webhook_secret:
            headers["x-webhook-secret"] = self.webhook_secret

        try:
            with httpx.Client(timeout=self.webhook_timeout_seconds) as client:
                response = client.post(
                    self.webhook_sentence_url,
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                return True
        except httpx.HTTPError as exc:
            logger.error("Sentence webhook failed: %s", exc)
            return False

    # ====================================================================
    # Step 4: Per-sentence translation with term markers
    # ====================================================================

    def _translate_sentence(self, sentence: str) -> str:
        if not sentence.strip():
            return sentence

        # ── Extract terms into markers ──────────────────────────────────
        terms: dict[str, str] = {}
        protected = sentence
        counter = 0

        def _mark(match_text: str) -> str:
            nonlocal counter
            counter += 1
            key = f"[T{counter}]"
            terms[key] = match_text
            return key

        # Inline backtick code: `something`
        protected = re.sub(
            r"`[^`\n]+`",
            lambda m: _mark(m.group(0)),
            protected,
        )

        # Square-bracket placeholders: [University Name], [Your Name]
        protected = re.sub(
            r"\[[A-Z][^\]]*\]",
            lambda m: _mark(m.group(0)),
            protected,
        )

        # URLs
        protected = re.sub(
            r"https?://\S+",
            lambda m: _mark(m.group(0)),
            protected,
        )

        # ── Build translation prompt ────────────────────────────────────
        if terms:
            # Tell TranslateGemma about the markers
            marker_list = ", ".join(terms.keys())
            system = (
                f"{self.en_to_hu_prompt}\n"
                f"IMPORTANT: The text contains markers ({marker_list}). "
                f"Keep every marker exactly as-is in your translation. "
                f"Do not translate, remove, or modify any marker."
            )
        else:
            system = self.en_to_hu_prompt

        # ── Call TranslateGemma ─────────────────────────────────────────
        translated = self._call_translation(protected, system)

        if translated is None:
            return sentence

        # ── Validate: hallucination check ───────────────────────────────
        if self._is_hallucination(translated) or len(translated) > len(protected) * 3:
            logger.warning(
                "Hallucination or excessive length detected — retrying strict"
            )
            strict_system = (
                "Translate ONLY the following sentence from English to Hungarian. "
                "Output ONLY the translation. Do not add any extra content."
            )
            if terms:
                strict_system += (
                    f" Keep these markers exactly as-is: {marker_list}."
                )
            translated = self._call_translation(protected, strict_system)

            if (
                translated is None
                or self._is_hallucination(translated)
                or len(translated) > len(protected) * 3
            ):
                logger.warning("Retry failed — using original English")
                return sentence

        # ── Validate: all markers survived ──────────────────────────────
        for key in terms:
            if key not in translated:
                logger.warning("Marker %s missing in translation — reinserting", key)
                # Append the missing term at the end rather than lose it
                translated = translated.rstrip() + " " + key

        # ── Restore markers → original content ──────────────────────────
        for key, original in terms.items():
            translated = translated.replace(key, original)

        # Preserve trailing whitespace
        if sentence and sentence[-1].isspace():
            trailing = sentence[len(sentence.rstrip()):]
            return translated.rstrip() + trailing
        return translated + " "

    # ====================================================================
    # TranslateGemma API call
    # ====================================================================

    def _call_translation(self, text: str, system_instruction: str) -> Optional[str]:
        prompt = (
            "<bos><start_of_turn>user\n"
            f"{system_instruction}\n\n"
            f"{text.strip()}<end_of_turn>\n"
            "<start_of_turn>model\n"
        )

        headers = {"Content-Type": "application/json"}
        if self.translategemma_api_key:
            headers["Authorization"] = f"Bearer {self.translategemma_api_key}"

        payload = {
            "model": self.translategemma_model_name,
            "prompt": prompt,
            "max_tokens": self.translation_max_tokens,
            "temperature": self.translation_temperature,
            "stop": ["<end_of_turn>"],
            "stream": False,
        }

        try:
            with httpx.Client(timeout=60.0) as client:
                resp = client.post(
                    f"{self.translategemma_base_url}/completions",
                    headers=headers,
                    json=payload,
                )
                resp.raise_for_status()
                translated = resp.json()["choices"][0]["text"].strip()
                return translated if translated else None

        except httpx.HTTPError as exc:
            logger.error("TranslateGemma failed: %s", exc)
            return None
        except (KeyError, IndexError, json.JSONDecodeError) as exc:
            logger.error("TranslateGemma parse error: %s", exc)
            return None

    # ====================================================================
    # Hallucination detection
    # ====================================================================

    @staticmethod
    def _is_hallucination(text: str) -> bool:
        lower = text.lower()
        return any(p in lower for p in HALLUCINATION_PATTERNS)
