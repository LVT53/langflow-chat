"""
Export Document Tool for Langflow Agents.

This component allows an AI agent to export Markdown content to PDF format.
The tool sends the markdown content to the AlfyAI export endpoint, which
generates a PDF file and returns the download URL.

How it works:
1. The agent calls this tool with markdown content and a filename
2. The tool sends the content to the AlfyAI export endpoint
3. The endpoint generates a PDF file and stores it in the conversation
4. The tool returns success message with file path

Usage in Langflow:
1. Add this component to your flow
2. Connect the "Tool" output to an Agent component's "Tools" input
3. The agent can now export markdown to PDF when requested

Environment Variables:
- ALFYAI_API_URL: Base URL of the AlfyAI application (default: http://localhost:3000)
- ALFYAI_API_SIGNING_KEY: HMAC key for signed service assertions

Example usage:
The agent might call this tool when a user asks:
- "Export this document as PDF"
- "Convert this markdown to a PDF file"
- "Save this as a PDF"
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
from lfx.inputs.inputs import MultilineInput, StrInput
from lfx.io import Output
from lfx.log.logger import logger
from lfx.schema.data import Data


class ExportDocumentToolComponent(Component):
    """Tool component for exporting markdown content to PDF.

    This tool allows an AI agent to export markdown content as a PDF file
    by calling the AlfyAI export endpoint. The generated PDF is stored in
    the conversation and can be downloaded by the user.
    """

    display_name = "Export Document"
    description = "Export markdown content to PDF format. If markdown_content is empty, the server fetches the active conversation context automatically."
    documentation = "https://docs.langflow.org/tools"
    icon = "file-text"
    name = "export_document"
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
            info="HMAC key for scoped signed assertions on export calls",
            value=os.getenv("ALFYAI_API_SIGNING_KEY", ""),
            advanced=True,
        ),
        MultilineInput(
            name="markdown_content",
            display_name="Markdown Content",
            info="Markdown content to export as PDF. Leave empty to trigger server-side content fetch from the active conversation context.",
            value="",
            required=False,
            advanced=False,
            tool_mode=True,
        ),
        StrInput(
            name="filename",
            display_name="Output Filename",
            info="Filename for the exported PDF (without extension)",
            value="document",
            tool_mode=True,
        ),
    ]

    outputs = [
        Output(
            display_name="Tool",
            name="tool_output",
            description="Tool output for agent use",
            method="export_document",
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

    def _export_document(
        self,
        markdown_content: str,
        filename: str,
        conversation_id: str,
    ) -> dict[str, Any]:
        """Execute document export via AlfyAI endpoint.

        Args:
            markdown_content: Markdown content to export
            filename: Output filename (without extension)
            conversation_id: AlfyAI conversation ID

        Returns:
            Dict with 'success', 'filePath', or 'error' keys
        """
        url = f"{self.alfyai_api_url.rstrip('/')}/api/chat/files/export"

        headers = {
            "Content-Type": "application/json",
        }

        signed_assertion = self._build_service_assertion(conversation_id)
        if signed_assertion:
            headers["Authorization"] = f"Bearer {signed_assertion}"

        payload = {
            "markdown": markdown_content,
            "filename": filename,
            "conversationId": conversation_id,
            "format": "pdf",
        }

        try:
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=60,
            )

            if response.status_code == 200:
                data = response.json()
                file_url = data.get("url", "")
                return {
                    "success": True,
                    "filePath": file_url,
                    "message": f"Document exported successfully: {file_url}",
                }
            elif response.status_code == 401:
                return {
                    "success": False,
                    "error": "Authentication failed. Check ALFYAI_API_SIGNING_KEY.",
                }
            elif response.status_code == 404:
                return {
                    "success": False,
                    "error": "Conversation not found. The session may have expired.",
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

    def _emit_tool_marker(self, marker_type: str, payload: dict[str, Any]) -> None:
        """Emit TOOL_START/TOOL_END markers into the Langflow stream.

        Args:
            marker_type: "TOOL_START" or "TOOL_END"
            payload: JSON-serializable payload for the marker
        """
        try:
            event_manager = getattr(self, "_event_manager", None)
            if event_manager is None:
                return
            marker_str = f"\x02{marker_type}\x1f{json.dumps(payload, ensure_ascii=False)}\x03"
            event_manager.on_token(data={"chunk": marker_str})
        except Exception as e:
            logger.warning(f"Failed to emit {marker_type} marker: {e}")

    def export_document(self) -> Data:
        """Tool function called by the agent via Langflow tool mode."""
        markdown_content = str(getattr(self, "markdown_content", "") or "").strip()
        filename = str(getattr(self, "filename", "") or "document").strip()

        conversation_id = self._get_conversation_id()

        if not conversation_id:
            logger.error("No conversation ID available - cannot export document")
            return Data(data={
                "success": False,
                "error": "No conversation context available.",
            })

        # Emit TOOL_START marker
        self._emit_tool_marker("TOOL_START", {
            "name": "export_document",
            "input": {
                "markdown_content": markdown_content[:200] + "..." if len(markdown_content) > 200 else markdown_content,
                "filename": filename,
            },
        })

        # Ensure filename doesn't have .pdf extension (will be added by backend)
        if filename.lower().endswith(".pdf"):
            filename = filename[:-4]

        logger.info(
            "Exporting document in conversation %s with filename: %s",
            conversation_id[:8],
            filename[:50],
        )

        result = self._export_document(
            markdown_content=markdown_content,
            filename=filename,
            conversation_id=conversation_id,
        )

        if result["success"]:
            file_path = result.get("filePath", "")
            logger.info(f"Document export successful: {file_path}")

            # Emit TOOL_END marker
            self._emit_tool_marker("TOOL_END", {
                "name": "export_document",
                "sourceType": "tool",
                "outputSummary": result.get("message", "Export completed"),
                "candidates": [{"filePath": file_path}] if file_path else [],
            })

            return Data(data={
                "success": True,
                "message": result.get("message", "Export completed"),
                "filePath": file_path,
                "conversationId": conversation_id,
            })
        else:
            error_msg = result.get("error", "Unknown error")
            logger.error(f"Document export failed: {error_msg}")

            # Emit TOOL_END marker even on error
            self._emit_tool_marker("TOOL_END", {
                "name": "export_document",
                "sourceType": "tool",
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
        """Update build configuration dynamically."""
        if "alfyai_api_url" in build_config:
            current_value = build_config["alfyai_api_url"].get("value", "")
            if not current_value:
                build_config["alfyai_api_url"]["value"] = os.getenv(
                    "ALFYAI_API_URL",
                    "http://localhost:3000"
                )

        return build_config
