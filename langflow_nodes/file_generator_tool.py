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

Usage in Langflow:
1. Add this component to your flow
2. Connect the "Tool" output to an Agent component's "Tools" input
3. The agent can now generate files when requested

Environment Variables:
- ALFYAI_API_URL: Base URL of the AlfyAI application (default: http://localhost:3000)
- ALFYAI_API_KEY: Optional bearer key for `/api/chat/files/generate`; set the same value on the AlfyAI server when calling outside a browser session

Example code the model might generate:
```python
import pandas as pd
import matplotlib.pyplot as plt

# Create a simple chart
df = pd.DataFrame({'x': [1, 2, 3, 4, 5], 'y': [10, 20, 15, 25, 30]})
plt.figure(figsize=(8, 6))
plt.plot(df['x'], df['y'], marker='o')
plt.title('Sample Chart')
plt.xlabel('X Axis')
plt.ylabel('Y Axis')
plt.savefig('/output/chart.png')
plt.close()
```
"""

from __future__ import annotations

import json
import os
from typing import Any

import requests

from lfx.custom.custom_component.component import Component
from lfx.inputs.inputs import MultilineInput, StrInput
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
    
    Supported output formats:
    - PDF documents (reportlab, fpdf)
    - Excel spreadsheets (pandas, openpyxl)
    - Charts and images (matplotlib, plotly)
    - CSV files
    - Any format that can be written to /output in Python
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
        MultilineInput(
            name="code",
            display_name="Python Code",
            info="Python code to execute. Write output files to /output directory.",
            value="",
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
            method="build_tool",
        ),
    ]

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

    def _execute_code(self, code: str, conversation_id: str, filename: str | None = None) -> dict[str, Any]:
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
            "language": "python",
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

    def generate_file(self, code: str, filename: str = "") -> Data:
        """Tool function called by the agent.
        
        This is the main entry point when the agent uses this tool.
        
        Args:
            code: Python code to execute in the sandbox
            filename: Optional custom filename for the output
            
        Returns:
            Data object with success status and file information
        """
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
                "error": "No code provided. Please provide Python code to generate the file.",
            })
        
        # Log the generation attempt
        logger.info(f"Generating file in conversation {conversation_id[:8]}...")
        
        # Execute the code
        result = self._execute_code(
            code=code,
            conversation_id=conversation_id,
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
            })
        else:
            error_msg = result.get("error", "Unknown error")
            logger.error(f"File generation failed: {error_msg}")
            
            return Data(data={
                "success": False,
                "error": error_msg,
            })

    async def build_tool(self) -> list:
        """Build the tool for use by an agent.
        
        This method is called by Langflow to convert the component
        into a tool that can be used by an Agent component.
        
        Returns:
            List containing the StructuredTool for the agent
        """
        from langchain_core.tools import StructuredTool
        from pydantic import BaseModel, Field
        from typing import Optional
        
        # Define the input schema for the tool
        class FileGeneratorInput(BaseModel):
            """Input schema for the file generator tool."""
            code: str = Field(
                ...,
                description=(
                    "Python code to execute in the sandbox. "
                    "Write output files to the /output directory. "
                    "Available libraries: pandas, matplotlib, reportlab, openpyxl, numpy, etc. "
                    "Example: "
                    "import pandas as pd; "
                    "df = pd.DataFrame({'a': [1, 2, 3]}); "
                    "df.to_excel('/output/data.xlsx', index=False)"
                ),
            )
            filename: Optional[str] = Field(
                default=None,
                description="Optional custom filename for the generated file (e.g., 'report.pdf')",
            )
        
        # Create the tool
        tool = StructuredTool(
            name="generate_file",
            description=(
                "Generate downloadable files (PDFs, Excel spreadsheets, charts, images, CSVs) "
                "by executing Python code in a secure sandbox. "
                "Use this tool when the user asks for a document, report, spreadsheet, chart, "
                "or any file that needs to be created and downloaded. "
                "The code runs in an isolated environment with no network access. "
                "Write output files to /output directory. "
                "Common libraries available: pandas, matplotlib, reportlab, openpyxl, numpy, Pillow."
            ),
            func=lambda code, filename=None: self.generate_file(code, filename or ""),
            args_schema=FileGeneratorInput,
        )
        
        return [tool]

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
