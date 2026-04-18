"""
File Generator Tool for Langflow Agents.

This component allows an AI agent to generate files (PDFs, spreadsheets, charts, etc.)
by executing Python code in a sandboxed environment. The generated files are stored
and can be downloaded by the user.

How it works:
1. The agent calls this tool with Python code that writes files to /output
2. The tool sends the code to the AlfyAI sandbox endpoint
3. The sandbox executes the code in an isolated Docker container
4. Generated files are stored and returned as metadata
5. Files only count as generated when the code writes them to /output
6. After generation, the user can download the file from chat or click Save to Vault

Usage in Langflow:
1. Add this component to your flow
2. Connect the "Tool" output to an Agent component's "Tools" input
3. The agent can now generate files when requested

Environment Variables:
- ALFYAI_API_URL: Base URL of the AlfyAI application (default: http://localhost:3000)
- ALFYAI_API_SIGNING_KEY: HMAC key for signed service assertions on `/api/chat/files/generate`

Example code the model might generate:
```python
with open('/output/example.txt', 'w', encoding='utf-8') as handle:
    handle.write('Hello from AlfyAI')
```

```javascript
const ExcelJS = require('exceljs');
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet('Report');
sheet.addRow(['Name', 'Value']);
sheet.addRow(['Alpha', 42]);
await workbook.xlsx.writeFile('/output/report.xlsx');
```

```javascript
// createPDF is pre-loaded -- no require needed
await createPDF({
  filename: 'example.pdf',
  title: 'Hello from AlfyAI',
  content: [
    { type: 'heading', text: 'Section 1', level: 1 },
    { type: 'paragraph', text: 'This is a paragraph with Unicode: \u010c, \u00f6, \u00fc, \u00f1.' },
    { type: 'table', headers: ['Name', 'Value'], rows: [['Alpha', '42']] },
    { type: 'list', items: ['Item 1', 'Item 2'], ordered: true },
    { type: 'image', src: '/workspace/assets/diagram.png', alt: 'Architecture diagram', style: 'full' },
  ],
});
```

For PDF generation, the `createPDF` helper is pre-loaded in the JavaScript runtime.
Do not require it; just call it directly. It handles Unicode, text wrapping, page breaks,
and page numbers automatically. Do not use `pdf-lib` directly.

Supported block types: heading (level 1-3), paragraph, list, table, code, separator, spacer, image.

Image blocks accept:
- src: Local file path (e.g., '/workspace/assets/diagram.webp') or base64 data URI
- alt: Caption text shown below the image
- width: Max width in points (default: content width)
- height: Max height in points (default: 400)
- style: 'full' (border + shadow), 'rounded' (border only), 'shadow' (shadow only)

Supported image formats: PNG, JPEG, GIF, WebP, AVIF, TIFF, BMP (auto-converted to PNG).
Images are styled with the AlfyAI brand theme (terracotta accents, shadows, captions).
Remote URLs are NOT supported (sandbox has no network access).

In JavaScript scripts, always use double quotes or backtick template literals for text
content. Never use single quotes for strings that may contain apostrophes.
Do not write fallback diagnostics (for example `error_log.txt`) to `/output`; `/output` should contain only
the final user-requested artifact files.
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
from lfx.inputs.inputs import DropdownInput, MultilineInput, StrInput
from lfx.io import Output
from lfx.log.logger import logger
from lfx.schema.data import Data


class FileGeneratorToolComponent(Component):
    """Tool component for generating files via sandboxed Python execution.

    This tool allows an AI agent to generate downloadable files by executing
    Python code in a secure sandbox environment. The sandbox has:
    - No network access
    - 60 second timeout
    - 1GB memory limit
    - Non-root execution

    Supported output formats depend on the selected runtime:
    - Python: txt, md, csv, json, html, xml, svg, rtf, css, js, py
    - JavaScript: xlsx via exceljs, pdf via create-pdf helper (with image block support), pptx via pptxgenjs, docx via docx, odt via jszip packaging
    - JavaScript runs under Node with CommonJS `require(...)`; write final files to `/output`
    - For PDF, `createPDF` is pre-loaded: `await createPDF({ filename, title, content: [...] });`
      Supports: heading, paragraph, list, table, code, separator, spacer, image blocks with brand styling.
    """

    display_name = "File Generator"
    description = "Generate files (PDFs, spreadsheets, charts) by executing Python code in a sandbox."
    documentation = "https://docs.langflow.org/tools"
    icon = "file-plus"
    name = "FileGeneratorTool"
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
            info="HMAC key for scoped signed assertions on file-generation calls",
            value=os.getenv("ALFYAI_API_SIGNING_KEY", ""),
            advanced=True,
        ),
        DropdownInput(
            name="language",
            display_name="Runtime Language",
            info="Choose the sandbox runtime. Use JavaScript for XLSX, PDF, PPTX, DOCX, and ODT generation. For PDF, use the built-in create-pdf helper which handles Unicode automatically.",
            options=["python", "javascript"],
            value="python",
            tool_mode=True,
        ),
        MultilineInput(
            name="source_code",
            display_name="Source Code",
            info="Source code to execute. Write only the final requested output files to /output (no fallback error logs).",
            value="",
            required=True,
            tool_mode=True,  # This enables the component as a tool
        ),
        StrInput(
            name="filename",
            display_name="Output Filename",
            info="Optional custom filename for the generated file",
            value="",
            advanced=True,
            tool_mode=True,
        ),
    ]

    outputs = [
        Output(
            display_name="Tool",
            name="tool_output",
            description="Tool output for agent use",
            method="generate_file",
        ),
    ]

    @staticmethod
    def _looks_like_component_source(value: str) -> bool:
        return (
            "from langchain_core._api.deprecation import" in value
            or "class FileGeneratorToolComponent(Component):" in value
            or "from lfx.custom.custom_component.component import Component" in value
        )

    def _resolve_source_code(self) -> str | None:
        source_code = str(getattr(self, "source_code", "") or "").strip()
        if source_code:
            return source_code

        python_code = str(getattr(self, "python_code", "") or "").strip()
        if python_code:
            return python_code

        legacy_code = str(getattr(self, "code", "") or "").strip()
        if not legacy_code:
            return None

        if self._looks_like_component_source(legacy_code):
            logger.error(
                "File Generator node is still resolving the reserved `code` field instead of the "
                "`source_code` tool argument. Refresh or re-add the node in Langflow so it reloads "
                "the updated schema."
            )
            return None

        return legacy_code

    def _resolve_language(self) -> str:
        language = str(getattr(self, "language", "") or "").strip().lower()
        if language in {"python", "javascript"}:
            return language
        return "python"

    def _get_conversation_id(self) -> str | None:
        """Get the conversation ID from the Langflow session.

        The session_id in Langflow corresponds to the conversationId in AlfyAI.
        """
        try:
            # Access the graph's session_id which maps to AlfyAI conversationId
            if hasattr(self, "graph") and self.graph is not None:
                return getattr(self.graph, "session_id", None)
        except Exception as e:
            logger.warning(f"Could not get conversation ID: {e}")
        return None

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

    def _execute_code(
        self,
        code: str,
        conversation_id: str,
        language: str,
        filename: str | None = None,
    ) -> dict[str, Any]:
        """Execute Python code in the sandbox and return the result.

        Args:
            code: Python code to execute
            conversation_id: AlfyAI conversation ID for file storage
            filename: Optional custom filename

        Returns:
            Dict with 'success', 'files', or 'error' keys
        """
        url = f"{self.alfyai_api_url.rstrip('/')}/api/chat/files/generate"

        headers = {
            "Content-Type": "application/json",
        }

        signed_assertion = self._build_service_assertion(conversation_id)
        if signed_assertion:
            headers["Authorization"] = f"Bearer {signed_assertion}"

        payload = {
            "conversationId": conversation_id,
            "code": code,
            "language": language,
        }

        if filename:
            payload["filename"] = filename

        try:
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=120,  # 2 minute timeout for sandbox execution
            )

            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "files": data.get("files", []),
                    "message": f"Successfully generated {len(data.get('files', []))} file(s)",
                }
            elif response.status_code == 401:
                return {
                    "success": False,
                    "error": "Authentication failed. Check ALFYAI_API_SIGNING_KEY on both Langflow and AlfyAI.",
                }
            elif response.status_code == 404:
                return {
                    "success": False,
                    "error": "Conversation not found. The session may have expired.",
                }
            elif response.status_code == 500:
                error_data = (
                    response.json()
                    if response.headers.get("content-type", "").startswith(
                        "application/json"
                    )
                    else {}
                )
                return {
                    "success": False,
                    "error": error_data.get("error", "Sandbox execution failed"),
                }
            elif response.status_code == 422:
                error_data = (
                    response.json()
                    if response.headers.get("content-type", "").startswith(
                        "application/json"
                    )
                    else {}
                )
                return {
                    "success": False,
                    "error": error_data.get(
                        "error",
                        "No files were created. Write the final output file to /output.",
                    ),
                }
            else:
                return {
                    "success": False,
                    "error": f"API error: {response.status_code} {response.text[:200]}",
                }

        except requests.exceptions.Timeout:
            return {
                "success": False,
                "error": "Request timed out. The sandbox execution may have taken too long.",
            }
        except requests.exceptions.ConnectionError:
            return {
                "success": False,
                "error": f"Could not connect to AlfyAI at {self.alfyai_api_url}. Check if the server is running.",
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Unexpected error: {type(e).__name__}: {str(e)}",
            }

    def generate_file(self) -> Data:
        """Tool function called by the agent via Langflow tool mode."""
        code = self._resolve_source_code()
        language = self._resolve_language()
        filename = str(getattr(self, "filename", "") or "")

        # Get conversation ID from session
        conversation_id = self._get_conversation_id()

        if not conversation_id:
            logger.error("No conversation ID available - cannot generate files")
            return Data(
                data={
                    "success": False,
                    "error": "No conversation context available. Cannot generate files outside of a chat session.",
                }
            )

        if not code or not code.strip():
            return Data(
                data={
                    "success": False,
                    "error": (
                        "No source code provided. If you just updated this node, refresh or re-add it in "
                        "Langflow so the tool sends the `source_code` argument."
                    ),
                }
            )

        # Log the generation attempt
        logger.info(
            "Generating file in conversation %s via %s",
            conversation_id[:8],
            self.alfyai_api_url.rstrip("/"),
        )

        # Execute the code
        result = self._execute_code(
            code=code,
            conversation_id=conversation_id,
            language=language,
            filename=filename if filename else None,
        )

        if result["success"]:
            files = result.get("files", [])
            file_info = []

            for f in files:
                file_info.append(
                    {
                        "filename": f.get("filename", "unknown"),
                        "size": f.get("size", 0),
                        "mimeType": f.get("mimeType", "application/octet-stream"),
                        "downloadUrl": f.get("downloadUrl", ""),
                    }
                )

            # Create a user-friendly summary
            if len(files) == 1:
                summary = (
                    f"Generated file: {files[0]['filename']} ({files[0]['size']} bytes)"
                )
            else:
                summary = f"Generated {len(files)} files: {', '.join(f['filename'] for f in files)}"

            logger.info(f"File generation successful: {summary}")

            return Data(
                data={
                    "success": True,
                    "message": summary,
                    "files": file_info,
                    "conversationId": conversation_id,
                }
            )
        else:
            error_msg = result.get("error", "Unknown error")
            logger.error(f"File generation failed: {error_msg}")

            return Data(
                data={
                    "success": False,
                    "error": error_msg,
                    "conversationId": conversation_id,
                }
            )

    def update_build_config(
        self,
        build_config: dict,
        field_value: Any,
        field_name: str | None = None,
    ) -> dict:
        """Update build configuration dynamically.

        This method is called when field values change in the Langflow UI.
        """
        # Ensure API URL has a sensible default
        if "alfyai_api_url" in build_config:
            current_value = build_config["alfyai_api_url"].get("value", "")
            if not current_value:
                build_config["alfyai_api_url"]["value"] = os.getenv(
                    "ALFYAI_API_URL", "http://localhost:3000"
                )

        return build_config
