"""
Image Search Tool for Langflow Agents.

This component allows an AI agent to search for images using the Brave Search API.
The tool returns image URLs with metadata (title, source, thumbnail).

How it works:
1. The agent calls this tool with a search query
2. The tool sends the query to the AlfyAI image search endpoint
3. The endpoint calls Brave Search API and returns top 3-5 image results
4. Results include URL, title, source, and optional thumbnail

Usage in Langflow:
1. Add this component to your flow
2. Connect the "Tool" output to an Agent component's "Tools" input
3. The agent can now search for images when requested

Environment Variables:
- ALFYAI_API_URL: Base URL of the AlfyAI application (default: http://localhost:3000)
- ALFYAI_API_SIGNING_KEY: HMAC key for signed service assertions
- BRAVE_SEARCH_API_KEY: Brave Search API key (configured in AlfyAI)

Example usage:
The agent might call this tool when a user asks:
- "Find me images of cats"
- "Show me pictures of the Eiffel Tower"
- "Search for sunset photos"
"""

from __future__ import annotations

import json
import os
import time
from typing import Any
import hmac
import hashlib
import base64

import requests

from lfx.custom.custom_component.component import Component
from lfx.inputs.inputs import StrInput
from lfx.io import Output
from lfx.log.logger import logger
from lfx.schema.data import Data


class ImageSearchToolComponent(Component):
    """Tool component for searching images via Brave Search API.

    This tool allows an AI agent to search for images by querying the
    AlfyAI image search endpoint, which integrates with Brave Search API.
    """

    display_name = "Image Search"
    description = "Search for images using Brave Search API."
    documentation = "https://docs.langflow.org/tools"
    icon = "image"
    name = "image_search"
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
            info="HMAC key for scoped signed assertions on image search calls",
            value=os.getenv("ALFYAI_API_SIGNING_KEY", ""),
            advanced=True,
        ),
        StrInput(
            name="query",
            display_name="Search Query",
            info="Search query for finding images",
            value="",
            required=True,
            tool_mode=True,
        ),
    ]

    outputs = [
        Output(
            display_name="Tool",
            name="tool_output",
            description="Tool output for agent use",
            method="search_images",
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
        """Get the conversation ID from the Langflow session."""
        try:
            if hasattr(self, "graph") and self.graph is not None:
                return getattr(self.graph, "session_id", None)
        except Exception as e:
            logger.warning(f"Could not get conversation ID: {e}")
        return None

    def _search_images(self, query: str, conversation_id: str) -> dict[str, Any]:
        """Execute image search via AlfyAI endpoint.

        Args:
            query: Search query string
            conversation_id: AlfyAI conversation ID

        Returns:
            Dict with 'success', 'results', or 'error' keys
        """
        url = f"{self.alfyai_api_url.rstrip('/')}/api/tools/image-search"

        headers = {
            "Content-Type": "application/json",
        }

        signed_assertion = self._build_service_assertion(conversation_id)
        if signed_assertion:
            headers["Authorization"] = f"Bearer {signed_assertion}"

        payload = {
            "query": query,
        }

        try:
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=30,
            )

            if response.status_code == 200:
                data = response.json()
                results = data.get("results", [])
                return {
                    "success": True,
                    "results": results,
                    "message": f"Found {len(results)} image(s)",
                }
            elif response.status_code == 401:
                return {
                    "success": False,
                    "error": "Authentication failed. Check ALFYAI_API_SIGNING_KEY.",
                }
            else:
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

    def search_images(self) -> Data:
        """Tool function called by the agent via Langflow tool mode."""
        query = str(getattr(self, "query", "") or "").strip()

        conversation_id = self._get_conversation_id()

        if not conversation_id:
            logger.error("No conversation ID available - cannot search images")
            return Data(data={
                "success": False,
                "error": "No conversation context available.",
            })

        if not query:
            return Data(data={
                "success": False,
                "error": "No search query provided.",
            })

        logger.info(
            "Searching images in conversation %s with query: %s",
            conversation_id[:8],
            query[:50],
        )

        result = self._search_images(
            query=query,
            conversation_id=conversation_id,
        )

        if result["success"]:
            results = result.get("results", [])
            logger.info(f"Image search successful: found {len(results)} result(s)")

            return Data(data={
                "success": True,
                "message": result.get("message", "Search completed"),
                "results": results,
                "conversationId": conversation_id,
            })
        else:
            error_msg = result.get("error", "Unknown error")
            logger.error(f"Image search failed: {error_msg}")

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
        """Update build configuration dynamically."""
        if "alfyai_api_url" in build_config:
            current_value = build_config["alfyai_api_url"].get("value", "")
            if not current_value:
                build_config["alfyai_api_url"]["value"] = os.getenv(
                    "ALFYAI_API_URL",
                    "http://localhost:3000"
                )

        return build_config
