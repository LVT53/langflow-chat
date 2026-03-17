# =============================================================================
# LanguageDetector — Langflow Custom Component
# =============================================================================
# Detects whether the user's message is Hungarian or English.
#
# INPUT:  User message (from Chat Input)
# OUTPUT: A Message with text "hu" or "en"
#
# This single output fans out to both the InputTranslator and
# ResponseTranslator via standard Langflow fan-out (one output port
# connected to multiple input ports).
#
# Install dependency:  pip install lingua-language-detector
# =============================================================================

import logging

from langflow.custom import Component
from langflow.io import MessageInput, IntInput, Output
from langflow.schema.message import Message

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Language-detection singleton — initialised once, reused across requests
# ---------------------------------------------------------------------------
_lingua_detector = None


def _get_detector():
    """Lazily build the lingua detector (CPU only, ~50 MB RAM)."""
    global _lingua_detector
    if _lingua_detector is None:
        try:
            from lingua import Language, LanguageDetectorBuilder

            _lingua_detector = (
                LanguageDetectorBuilder.from_languages(
                    Language.HUNGARIAN, Language.ENGLISH
                )
                .with_preloaded_language_models()
                .build()
            )
            logger.info("Lingua detector initialised (HU/EN)")
        except ImportError:
            logger.error(
                "lingua-language-detector is not installed. "
                "Run: pip install lingua-language-detector"
            )
            raise
    return _lingua_detector


# ---------------------------------------------------------------------------
# Common Hungarian short words for the under-threshold fallback
# ---------------------------------------------------------------------------
HUNGARIAN_SHORT_WORDS = {
    "igen", "nem", "köszönöm", "köszi", "szia", "helló", "kérem",
    "jó", "rossz", "miért", "hogyan", "hol", "mi", "ki",
    "na", "hát", "nos", "oké", "persze", "talán", "nincs",
    "van", "volt", "lesz", "kell", "tudok", "hé",
}


# ============================= COMPONENT ====================================


class LanguageDetector(Component):
    display_name = "Language Detector"
    description = (
        'Detects whether the input is Hungarian or English. Outputs "hu" '
        'or "en" as a Message. Connect this output to both the Input '
        "Translator and the Response Translator."
    )
    icon = "scan-search"

    inputs = [
        MessageInput(
            name="user_message",
            display_name="User Message",
            info="The raw user message from Chat Input.",
            required=True,
        ),
        IntInput(
            name="short_input_threshold",
            display_name="Short Input Threshold",
            info=(
                "Inputs shorter than this (chars) use a hardcoded Hungarian "
                "word list instead of lingua. Set to 0 to always use lingua."
            ),
            value=10,
        ),
    ]

    outputs = [
        Output(
            display_name="Detected Language",
            name="detected_language",
            method="detect",
        ),
    ]

    def detect(self) -> Message:
        raw_text = self.user_message.text.strip() if self.user_message.text else ""

        if not raw_text:
            return Message(text="en")

        lang = self._detect_language(raw_text)
        logger.info("Detected language: %s (input length: %d)", lang, len(raw_text))
        return Message(text=lang)

    def _detect_language(self, text: str) -> str:
        # Short-input fallback: dictionary lookup
        if len(text) < self.short_input_threshold:
            normalised = text.lower().strip().rstrip("?!.,")
            if normalised in HUNGARIAN_SHORT_WORDS:
                return "hu"
            return "en"

        # Full lingua detection
        try:
            from lingua import Language

            detector = _get_detector()
            detected = detector.detect_language_of(text)
            if detected == Language.HUNGARIAN:
                return "hu"
            return "en"
        except Exception as exc:
            logger.warning("Lingua failed: %s — defaulting to English", exc)
            return "en"
