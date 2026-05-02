"""
Web Research Tool for Langflow Agents.

This component routes web research through AlfyAI's server-side research endpoint
instead of letting each agent improvise provider calls. The endpoint plans
multiple queries, searches Exa plus Brave when configured, fetches page content
for quote-sensitive answers, deduplicates sources, and reranks evidence chunks.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any

import requests

from lfx.custom.custom_component.component import Component
from lfx.inputs.inputs import BoolInput, DropdownInput, StrInput
from lfx.io import Output
from lfx.log.logger import logger
from lfx.schema.data import Data


class WebResearchToolComponent(Component):
    """Tool component for source-ranked web research via AlfyAI."""

    display_name = "Web Research"
    description = "Search the web with Exa and Brave, fetch relevant pages, and return ranked evidence with source URLs."
    documentation = "https://docs.langflow.org/tools"
    icon = "search"
    name = "research_web"
    beta = False

    inputs = [
        StrInput(
            name="alfyai_api_url",
            display_name="AlfyAI API URL",
            info="Base URL of the AlfyAI application (e.g., http://localhost:3000)",
            value=os.getenv("ALFYAI_API_URL", "http://localhost:3000"),
            advanced=True,
        ),
        StrInput(
            name="alfyai_api_signing_key",
            display_name="AlfyAI API Signing Key",
            info="HMAC key for scoped signed assertions on web research calls",
            value=os.getenv("ALFYAI_API_SIGNING_KEY", ""),
            advanced=True,
        ),
        StrInput(
            name="query",
            display_name="Research Query",
            info="The exact question or topic to research.",
            value="",
            required=True,
            tool_mode=True,
        ),
        DropdownInput(
            name="mode",
            display_name="Research Mode",
            info="Use exact for prices, specs, dates, policies, and other claims that need page-backed quotes.",
            options=["auto", "quick", "research", "exact"],
            value="auto",
            tool_mode=True,
        ),
        DropdownInput(
            name="freshness",
            display_name="Freshness",
            info="Use live for current prices, availability, today's news, or other volatile facts.",
            options=["auto", "live", "recent", "cache"],
            value="auto",
            tool_mode=True,
        ),
        DropdownInput(
            name="source_policy",
            display_name="Source Policy",
            info="Choose the source authority profile that best matches the request.",
            options=["auto", "general", "technical", "news", "commerce", "medical_legal_financial"],
            value="auto",
            tool_mode=True,
        ),
        StrInput(
            name="max_sources",
            display_name="Max Sources",
            info="Optional source cap from 1 to 12.",
            value="8",
            tool_mode=True,
        ),
        BoolInput(
            name="quote_required",
            display_name="Quote Required",
            info="Fetch page text and return evidence snippets before answering.",
            value=False,
            tool_mode=True,
        ),
    ]

    outputs = [
        Output(
            display_name="Tool",
            name="tool_output",
            description="Tool output for agent use",
            method="research_web",
        ),
    ]

    @staticmethod
    def _base64url_encode(payload: bytes) -> str:
        return base64.urlsafe_b64encode(payload).decode("utf-8").rstrip("=")

    def _build_service_assertion(self, conversation_id: str) -> str | None:
        signing_key = str(getattr(self, "alfyai_api_signing_key", "") or "").strip()
        if not signing_key:
            return None

        payload = {
            "conversationId": conversation_id,
            "userId": str(getattr(self, "user_id", "") or "").strip() or "service",
            "exp": int(time.time() * 1000) + 5 * 60 * 1000,
        }
        payload_json = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        payload_part = self._base64url_encode(payload_json)
        signature = hmac.new(
            signing_key.encode("utf-8"),
            payload_part.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        signature_part = self._base64url_encode(signature)
        return f"{payload_part}.{signature_part}"

    def _get_conversation_id(self) -> str | None:
        try:
            if hasattr(self, "graph") and self.graph is not None:
                return getattr(self.graph, "session_id", None)
        except Exception as e:
            logger.warning(f"Could not get conversation ID: {e}")
        return None

    def _request_payload(self, query: str, conversation_id: str) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "query": query,
            "conversationId": conversation_id,
        }

        mode = str(getattr(self, "mode", "") or "").strip()
        if mode and mode != "auto":
            payload["mode"] = mode

        freshness = str(getattr(self, "freshness", "") or "").strip()
        if freshness and freshness != "auto":
            payload["freshness"] = freshness

        source_policy = str(getattr(self, "source_policy", "") or "").strip()
        if source_policy and source_policy != "auto":
            payload["sourcePolicy"] = source_policy

        try:
            max_sources = int(str(getattr(self, "max_sources", "") or "").strip())
            if max_sources > 0:
                payload["maxSources"] = min(12, max_sources)
        except ValueError:
            pass

        if bool(getattr(self, "quote_required", False)):
            payload["quoteRequired"] = True

        return payload

    def _research_web(self, payload: dict[str, Any], conversation_id: str) -> dict[str, Any]:
        url = f"{self.alfyai_api_url.rstrip('/')}/api/tools/research-web"
        headers = {"Content-Type": "application/json"}

        signed_assertion = self._build_service_assertion(conversation_id)
        if signed_assertion:
            headers["Authorization"] = f"Bearer {signed_assertion}"

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=90)

            if response.status_code == 200:
                data = response.json()
                sources = data.get("sources", [])
                evidence = data.get("evidence", [])
                answer_brief = data.get("answerBrief", {})
                return {
                    "success": True,
                    "query": data.get("query", payload.get("query")),
                    "queries": data.get("queries", []),
                    "sources": sources,
                    "evidence": evidence,
                    "answerBrief": answer_brief,
                    "diagnostics": data.get("diagnostics", {}),
                    "message": f"Found {len(sources)} source(s) and {len(evidence)} evidence snippet(s)",
                }

            if response.status_code == 401:
                return {
                    "success": False,
                    "error": "Authentication failed. Check ALFYAI_API_SIGNING_KEY on both Langflow and AlfyAI.",
                }

            error_data = (
                response.json()
                if response.headers.get("content-type", "").startswith("application/json")
                else {}
            )
            return {
                "success": False,
                "error": error_data.get("error", f"API error: {response.status_code}"),
            }

        except requests.exceptions.Timeout:
            return {
                "success": False,
                "error": "Request timed out.",
            }
        except requests.exceptions.ConnectionError:
            return {
                "success": False,
                "error": f"Could not connect to AlfyAI at {self.alfyai_api_url}.",
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Unexpected error: {type(e).__name__}: {str(e)}",
            }

    def _emit_tool_marker(self, marker_type: str, payload: dict[str, Any]) -> None:
        try:
            event_manager = getattr(self, "_event_manager", None)
            if event_manager is None:
                return
            marker_str = f"\x02{marker_type}\x1f{json.dumps(payload, ensure_ascii=False)}\x03"
            event_manager.on_token(data={"chunk": marker_str})
        except Exception as e:
            logger.warning(f"Failed to emit {marker_type} marker: {e}")

    def research_web(self) -> Data:
        query = str(getattr(self, "query", "") or "").strip()
        conversation_id = self._get_conversation_id()

        if not conversation_id:
            logger.error("No conversation ID available - cannot research web")
            return Data(data={
                "success": False,
                "error": "No conversation context available.",
            })

        if not query:
            return Data(data={
                "success": False,
                "error": "No research query provided.",
            })

        payload = self._request_payload(query, conversation_id)
        self._emit_tool_marker("TOOL_START", {
            "name": "research_web",
            "input": {
                "query": query,
                "mode": payload.get("mode", "auto"),
                "freshness": payload.get("freshness", "auto"),
                "sourcePolicy": payload.get("sourcePolicy", "auto"),
            },
        })

        logger.info(
            "Researching web in conversation %s with query: %s",
            conversation_id[:8],
            query[:80],
        )

        result = self._research_web(payload=payload, conversation_id=conversation_id)

        if result["success"]:
            sources = result.get("sources", [])
            evidence = result.get("evidence", [])
            answer_brief = result.get("answerBrief", {})
            if not isinstance(answer_brief, dict):
                answer_brief = {}
            logger.info(
                "Web research successful: found %s source(s), %s evidence snippet(s)",
                len(sources),
                len(evidence),
            )
            self._emit_tool_marker("TOOL_END", {
                "name": "research_web",
                "sourceType": "web",
                "outputSummary": result.get("message", "Research completed"),
                "candidates": sources,
            })

            return Data(data={
                "success": True,
                "name": "research_web",
                "sourceType": "web",
                "message": result.get("message", "Research completed"),
                "answerBrief": answer_brief,
                "answerBriefMarkdown": answer_brief.get("markdown", ""),
                "query": result.get("query", query),
                "queries": result.get("queries", []),
                "sources": sources,
                "evidence": evidence,
                "diagnostics": result.get("diagnostics", {}),
                "instructions": (
                    "Read answerBriefMarkdown first. Answer only from the returned answerBrief, sources, "
                    "and evidence. Use markdown links for citations with the listed source URLs. "
                    "For exact values, quote or paraphrase an evidence snippet from the cited URL; "
                    "if the evidence does not contain the value, say it was not found. "
                    "Never cite URLs outside the returned source list."
                ),
                "conversationId": conversation_id,
            })

        error_msg = result.get("error", "Unknown error")
        logger.error(f"Web research failed: {error_msg}")
        self._emit_tool_marker("TOOL_END", {
            "name": "research_web",
            "sourceType": "web",
            "outputSummary": None,
            "candidates": [],
        })

        return Data(data={
            "success": False,
            "error": error_msg,
            "conversationId": conversation_id,
        })

    def update_build_config(
        self,
        build_config: dict,
        field_value: Any,
        field_name: str | None = None,
    ) -> dict:
        if "alfyai_api_url" in build_config:
            current_value = build_config["alfyai_api_url"].get("value", "")
            if not current_value:
                build_config["alfyai_api_url"]["value"] = os.getenv(
                    "ALFYAI_API_URL",
                    "http://localhost:3000",
                )
        return build_config
