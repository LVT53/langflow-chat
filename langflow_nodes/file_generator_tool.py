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
- ALFYAI_API_KEY: Optional bearer key for `/api/chat/files/generate`; set the same value on the AlfyAI server when calling outside a browser session

Example code the model might generate:
```python
with open("/output/example.txt", "w", encoding="utf-8") as handle:
    handle.write("Hello from AlfyAI")
```

```javascript
const ExcelJS = require("exceljs");
const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Report");
sheet.addRow(["Name", "Value"]);
sheet.addRow(["Alpha", 42]);
await workbook.xlsx.writeFile("/output/report.xlsx");
```
"""

from __future__ import annotations

import json
import os
from typing import Any

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
    - JavaScript: xlsx via exceljs, pdf via pdf-lib, pptx via pptxgenjs, docx via docx, odt via jszip packaging
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
            name="alfyai_api_key",
            display_name="AlfyAI API Key",
            info="Optional API key for authentication",
            value=os.getenv("ALFYAI_API_KEY", ""),
            advanced=True,
        ),
        DropdownInput(
            name="language",
            display_name="Runtime Language",
            info="Choose the sandbox runtime. Use JavaScript for XLSX, PDF, PPTX, DOCX, and ODT generation.",
            options=["python", "javascript"],
            value="python",
            tool_mode=True,
        ),
        MultilineInput(
            name="source_code",
            display_name="Source Code",
            info="Source code to execute. Write output files to /output directory.",
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

        # Add bearer auth when configured for out-of-browser Langflow calls.
        if self.alfyai_api_key:
            headers["Authorization"] = f"Bearer {self.alfyai_api_key}"
        
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
                    "error": "Authentication failed. Check ALFYAI_API_KEY on both Langflow and AlfyAI.",
                }
            elif response.status_code == 404:
                return {
                    "success": False,
                    "error": "Conversation not found. The session may have expired.",
                }
            elif response.status_code == 500:
                error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                return {
                    "success": False,
                    "error": error_data.get("error", "Sandbox execution failed"),
                }
            elif response.status_code == 422:
                error_data = (
                    response.json()
                    if response.headers.get("content-type", "").startswith("application/json")
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
            return Data(data={
                "success": False,
                "error": "No conversation context available. Cannot generate files outside of a chat session.",
            })
        
        if not code or not code.strip():
            return Data(data={
                "success": False,
                "error": (
                    "No source code provided. If you just updated this node, refresh or re-add it in "
                    "Langflow so the tool sends the `source_code` argument."
                ),
            })
        
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
                file_info.append({
                    "filename": f.get("filename", "unknown"),
                    "size": f.get("size", 0),
                    "mimeType": f.get("mimeType", "application/octet-stream"),
                    "downloadUrl": f.get("downloadUrl", ""),
                })
            
            # Create a user-friendly summary
            if len(files) == 1:
                summary = f"Generated file: {files[0]['filename']} ({files[0]['size']} bytes)"
            else:
                summary = f"Generated {len(files)} files: {', '.join(f['filename'] for f in files)}"
            
            logger.info(f"File generation successful: {summary}")
            
            return Data(data={
                "success": True,
                "message": summary,
                "files": file_info,
                "conversationId": conversation_id,
            })
        else:
            error_msg = result.get("error", "Unknown error")
            logger.error(f"File generation failed: {error_msg}")
            
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
        """Update build configuration dynamically.
        
        This method is called when field values change in the Langflow UI.
        """
        # Ensure API URL has a sensible default
        if "alfyai_api_url" in build_config:
            current_value = build_config["alfyai_api_url"].get("value", "")
            if not current_value:
                build_config["alfyai_api_url"]["value"] = os.getenv(
                    "ALFYAI_API_URL", 
                    "http://localhost:3000"
                )
        
        return build_config
