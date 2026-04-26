from __future__ import annotations

from langchain_core.tools import tool
from exa_py import Exa

from lfx.custom.custom_component.component import Component
from lfx.field_typing import Tool
from lfx.io import BoolInput, IntInput, Output, SecretStrInput, StrInput


class ExaSearchToolkit(Component):
    display_name = "Exa Search"
    description = "Search the web and retrieve page contents with the Exa API."
    documentation = "https://docs.exa.ai/reference/getting-started"
    beta = True
    name = "ExaSearch"
    icon = "ExaSearch"

    inputs = [
        SecretStrInput(
            name="exa_api_key",
            display_name="Exa API Key",
            password=True,
            info="Your Exa API key from https://dashboard.exa.ai/",
        ),
        StrInput(
            name="search_type",
            display_name="Search Type",
            value="auto",
            info="Search mode: 'auto', 'neural', or 'keyword'. Auto lets Exa decide.",
        ),
        BoolInput(
            name="include_text",
            display_name="Include Full Text",
            value=True,
            info="Return the full page text (up to max_characters) in search results.",
        ),
        BoolInput(
            name="include_summary",
            display_name="Include Summary",
            value=False,
            info="Return an AI-generated summary for each result.",
        ),
        IntInput(
            name="search_num_results",
            display_name="Search Number of Results",
            value=5,
        ),
        IntInput(
            name="similar_num_results",
            display_name="Similar Number of Results",
            value=5,
        ),
        IntInput(
            name="max_characters",
            display_name="Max Characters",
            value=10000,
            info="Maximum characters of page text to return per result.",
        ),
    ]

    outputs = [
        Output(name="tools", display_name="Tools", method="build_toolkit"),
    ]

    def build_toolkit(self) -> list[Tool]:
        client = Exa(api_key=self.exa_api_key)

        max_chars = max(1, int(self.max_characters or 10000))
        search_limit = max(1, int(self.search_num_results or 5))
        similar_limit = max(1, int(self.similar_num_results or 5))

        contents_opts: dict | None = None
        if self.include_text or self.include_summary:
            contents_opts = {}
            if self.include_text:
                contents_opts["text"] = {"max_characters": max_chars}
            if self.include_summary:
                contents_opts["summary"] = {"query": "auto"}

        @tool
        def search(query: str) -> list[dict]:
            """Search the web with a query and return a list of results.

            Each result includes title, url, id, score, and optionally
            full text and/or summary depending on the component settings.
            """
            try:
                response = client.search(
                    query,
                    num_results=search_limit,
                    type=self.search_type,
                    contents=contents_opts,
                )
            except Exception as exc:
                return [{"error": str(exc)}]

            formatted: list[dict] = []
            for result in response.results:
                item: dict = {
                    "title": result.title,
                    "url": result.url,
                    "id": result.id,
                    "score": result.score,
                }
                if result.text:
                    item["text"] = result.text[:max_chars]
                if result.summary:
                    item["summary"] = result.summary
                formatted.append(item)
            return formatted

        @tool
        def get_contents(urls: list[str]) -> list[dict]:
            """Fetch full contents of one or more URLs using Exa.

            Pass a list of URLs (strings) returned from `search`.
            """
            if not urls:
                return []
            try:
                response = client.get_contents(
                    urls,
                    text={"max_characters": max_chars},
                )
            except Exception as exc:
                return [{"error": str(exc)}]

            formatted: list[dict] = []
            for result in response.results:
                formatted.append({
                    "url": result.url,
                    "title": result.title,
                    "text": result.text[:max_chars] if result.text else None,
                })
            return formatted

        @tool
        def find_similar(url: str) -> list[dict]:
            """Find pages similar to a given URL and return results.

            The url should be one returned from a previous `search` call.
            """
            try:
                response = client.find_similar_and_contents(
                    url,
                    num_results=similar_limit,
                    text={"max_characters": max_chars} if self.include_text else None,
                    summary={"query": "auto"} if self.include_summary else None,
                )
            except Exception as exc:
                return [{"error": str(exc)}]

            formatted: list[dict] = []
            for result in response.results:
                item: dict = {
                    "title": result.title,
                    "url": result.url,
                    "id": result.id,
                    "score": result.score,
                }
                if result.text:
                    item["text"] = result.text[:max_chars]
                if result.summary:
                    item["summary"] = result.summary
                formatted.append(item)
            return formatted

        return [search, get_contents, find_similar]
