# =============================================================================
# InputTranslator — Langflow Custom Component
# =============================================================================
# Conditionally translates the user's Hungarian message to English.
#
# INPUTS:
#   1. user_message     → the raw user message (from Chat Input)
#   2. source_language  → "hu" or "en" (from the Language Detector)
#
# OUTPUT:
#   English prompt → connect to the Agent component's input
#
# If source_language is "en", the message passes through unchanged.
# If source_language is "hu", the message is translated via TranslateGemma.
# =============================================================================

import re
import json
import logging

import httpx

from langflow.custom import Component
from langflow.io import (
    MessageInput,
    StrInput,
    IntInput,
    BoolInput,
    FloatInput,
    Output,
    SecretStrInput,
    MultilineInput,
)
from langflow.schema.message import Message

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Abbreviation sets (for sentence splitting of long inputs)
# ---------------------------------------------------------------------------
ABBREVIATIONS = {
    "dr.", "kb.", "pl.", "stb.", "ill.", "ld.", "vö.", "sz.", "tel.",
    "fax.", "bp.", "krt.", "u.", "br.", "özv.", "ifj.", "id.",
    "mr.", "mrs.", "ms.", "prof.", "jr.", "sr.", "st.", "vs.",
    "etc.", "i.e.", "e.g.", "a.m.", "p.m.", "u.s.", "u.k.", "no.",
    "vol.", "dept.", "approx.", "incl.", "corp.", "ltd.", "inc.",
}


# ============================= COMPONENT ====================================


class InputTranslator(Component):
    display_name = "Input Translator"
    description = (
        "Translates Hungarian input to English via TranslateGemma. "
        "Passes English input through unchanged. Reads the language "
        "flag from the Language Detector component."
    )
    icon = "languages"

    inputs = [
        MessageInput(
            name="user_message",
            display_name="User Message",
            info="The raw user message from Chat Input.",
            required=True,
        ),
        MessageInput(
            name="source_language",
            display_name="Source Language",
            info='Message with text "hu" or "en" from the Language Detector.',
            required=True,
        ),
        # --- TranslateGemma connection ---
        StrInput(
            name="translategemma_base_url",
            display_name="TranslateGemma Base URL",
            info="Base URL of the TranslateGemma vLLM instance (include /v1).",
            value="http://192.168.1.96:30002/v1",
        ),
        SecretStrInput(
            name="translategemma_api_key",
            display_name="TranslateGemma API Key",
            info="API key for TranslateGemma (leave blank if none).",
            value="",
        ),
        StrInput(
            name="translategemma_model_name",
            display_name="TranslateGemma Model Name",
            value="translategemma",
        ),
        # --- translation prompt ---
        MultilineInput(
            name="hu_to_en_prompt",
            display_name="HU → EN Translation Prompt",
            info="System instruction for TranslateGemma when translating Hungarian to English.",
            value=(
                "You are a professional Hungarian (hu) to English (en) translator. "
                "Produce only the English translation, without any additional explanations."
            ),
        ),
        # --- translation params ---
        IntInput(
            name="translation_max_tokens",
            display_name="Translation Max Tokens",
            info="Max tokens per TranslateGemma call (must fit within 2048-token context).",
            value=256,
        ),
        FloatInput(
            name="translation_temperature",
            display_name="Translation Temperature",
            value=0.1,
        ),
        # --- behaviour toggles ---
        IntInput(
            name="long_input_split_threshold",
            display_name="Long Input Split Threshold",
            info="Hungarian inputs longer than this (chars) are sentence-split before translation.",
            value=500,
        ),
        BoolInput(
            name="enable_placeholder_preservation",
            display_name="Preserve Code/URLs",
            info="Extract code blocks and URLs before translation, restore after.",
            value=True,
        ),
    ]

    outputs = [
        Output(
            display_name="English Prompt",
            name="english_prompt",
            method="process",
        ),
    ]

    # ====================================================================
    # Main entry point
    # ====================================================================

    def process(self) -> Message:
        raw_text = self.user_message.text.strip() if self.user_message.text else ""
        lang = self.source_language.text.strip().lower() if self.source_language.text else "en"

        if not raw_text or lang != "hu":
            return Message(text=raw_text)

        # Hungarian path: clean → translate → restore
        cleaned, placeholders = self._extract_placeholders(raw_text)
        english = self._translate_hu_to_en(cleaned)
        if placeholders:
            english = self._restore_placeholders(english, placeholders)

        return Message(text=english)

    # ====================================================================
    # Placeholder extraction & restoration
    # ====================================================================

    def _extract_placeholders(self, text: str) -> tuple[str, dict]:
        if not self.enable_placeholder_preservation:
            return text, {}

        placeholders: dict[str, str] = {}
        counter = {"n": 0}

        def _make_key(prefix: str) -> str:
            counter["n"] += 1
            return f"__{prefix}_{counter['n']}__"

        # ── Pass 1: Fenced code blocks (```...```) ─────────────────────
        def _replace_fenced(match):
            key = _make_key("CODE")
            placeholders[key] = match.group(0)
            return key

        text = re.sub(r"```[\s\S]*?```", _replace_fenced, text)

        # ── Pass 2: Inline backtick code (`...`) ───────────────────────
        def _replace_inline(match):
            key = _make_key("CODE")
            placeholders[key] = match.group(0)
            return key

        text = re.sub(r"`[^`\n]+`", _replace_inline, text)

        # ── Pass 3: URLs ───────────────────────────────────────────────
        def _replace_url(match):
            key = _make_key("URL")
            placeholders[key] = match.group(0)
            return key

        text = re.sub(r"https?://\S+", _replace_url, text)

        # ── Pass 4: Raw code detection (no backticks) ──────────────────
        # Detect multi-line blocks that look like code and protect them.
        # This catches code pasted without backticks by non-technical users.
        text = self._detect_and_protect_raw_code(text, placeholders, counter)

        return text, placeholders

    # ---------------------------------------------------------------------------
    # Raw code detection heuristic
    # ---------------------------------------------------------------------------

    # Patterns that strongly indicate code (one match = likely code line)
    _CODE_LINE_PATTERNS = re.compile(
        r"(?:"
        # Python
        r"^\s*(?:def |class |import |from \w+ import |if __name__|print\(|return |yield |raise |async def |await )"
        r"|"
        # JavaScript / TypeScript
        r"^\s*(?:function |const |let |var |=>|module\.exports|export (?:default |const |function ))"
        r"|"
        # C / C++ / Java / C#
        r"^\s*(?:#include|using namespace|public |private |protected |void |int |float |double |char |bool |string )"
        r"|"
        # SQL
        r"^\s*(?:SELECT |INSERT INTO |UPDATE |DELETE FROM |CREATE TABLE |ALTER TABLE |DROP TABLE |FROM |WHERE |JOIN )"
        r"|"
        # Shell
        r"^\s*(?:#!/bin/|echo \$|export |chmod |mkdir |cd |ls |grep |awk |sed )"
        r"|"
        # HTML / XML
        r"^\s*(?:<html|<div|<span|<head|<body|<!DOCTYPE|<\?php|<\?xml)"
        r"|"
        # Rust / Go
        r"^\s*(?:fn |pub fn |let mut |impl |func |fmt\.Print|package main)"
        r"|"
        # Ruby
        r"^\s*(?:require ['\"]|puts |def \w+|end$)"
        r"|"
        # General structural patterns
        r"^\s*(?:try:|except |catch\s*\(|finally:|else:|elif |switch\s*\(|case .+:)"
        r"|"
        # Assignment with function-like RHS
        r"^\s*\w+\s*=\s*(?:\[|\{|lambda |\w+\()"
        r"|"
        # Lines ending with { or }; or })
        r".*[{};]\s*$"
        r"|"
        # Comment-only lines
        r"^\s*(?://|/\*|\*|#(?!!))\s*\S"
        r")",
        re.MULTILINE,
    )

    def _detect_and_protect_raw_code(
        self, text: str, placeholders: dict, counter: dict
    ) -> str:
        """
        Scan for contiguous blocks of lines that look like raw code.
        A block must have at least 2 code-like lines to be protected.
        """
        lines = text.split("\n")
        result_lines: list[str] = []
        code_block: list[str] = []
        code_score = 0

        def _flush_code():
            nonlocal code_score
            if code_score >= 2 and len(code_block) >= 2:
                # This block is likely code — protect it
                counter["n"] += 1
                key = f"__CODE_{counter['n']}__"
                placeholders[key] = "\n".join(code_block)
                result_lines.append(key)
            else:
                # Not enough evidence — keep as regular text
                result_lines.extend(code_block)
            code_block.clear()
            code_score = 0

        for line in lines:
            is_code_line = bool(self._CODE_LINE_PATTERNS.match(line))
            is_indented = line.startswith("    ") or line.startswith("\t")
            is_empty = not line.strip()

            if is_code_line or (is_indented and code_block):
                code_block.append(line)
                if is_code_line:
                    code_score += 1
            elif is_empty and code_block:
                # Empty line inside a code block — keep accumulating
                code_block.append(line)
            else:
                if code_block:
                    _flush_code()
                result_lines.append(line)

        if code_block:
            _flush_code()

        return "\n".join(result_lines)
        return text, placeholders

    def _restore_placeholders(self, text: str, placeholders: dict) -> str:
        for key, original in placeholders.items():
            if key in text:
                text = text.replace(key, original)
            else:
                logger.warning("Placeholder %s missing — appending", key)
                text = text + "\n" + original
        return text

    # ====================================================================
    # Translation HU → EN
    # ====================================================================

    def _translate_hu_to_en(self, text: str) -> str:
        if len(text) > self.long_input_split_threshold:
            sentences = self._split_sentences(text)
            return " ".join(
                self._call_translategemma(s.strip()) for s in sentences
            )
        return self._call_translategemma(text)

    def _call_translategemma(self, text: str) -> str:
        prompt = (
            f"<bos><start_of_turn>user\n"
            f"{self.hu_to_en_prompt}\n\n"
            f"{text}<end_of_turn>\n"
            f"<start_of_turn>model\n"
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

                if not translated:
                    logger.warning("Empty translation — using original")
                    return text
                if len(translated) > len(text) * 5:
                    logger.warning("Translation too long — truncating")
                    return translated[: len(text) * 3] + "…"
                return translated

        except httpx.HTTPError as exc:
            logger.error("TranslateGemma failed: %s — passing original", exc)
            return text

    # ====================================================================
    # Sentence splitter (for long Hungarian inputs)
    # ====================================================================

    def _split_sentences(self, text: str) -> list[str]:
        sentences: list[str] = []
        current = ""
        i = 0
        while i < len(text):
            current += text[i]
            if text[i] in ".!?":
                next_is_boundary = (i + 1 >= len(text) or text[i + 1].isspace())
                if next_is_boundary and text[i] == ".":
                    words = current.rstrip().split()
                    if words and words[-1].lower() in ABBREVIATIONS:
                        i += 1
                        continue
                    if i > 0 and text[i - 1].isdigit():
                        j = i + 1
                        while j < len(text) and text[j].isspace():
                            j += 1
                        if j < len(text) and text[j].isdigit():
                            i += 1
                            continue
                if next_is_boundary:
                    while i + 1 < len(text) and text[i + 1].isspace():
                        i += 1
                        current += text[i]
                    sentences.append(current)
                    current = ""
            i += 1
        if current.strip():
            sentences.append(current)
        return sentences if sentences else [text]
