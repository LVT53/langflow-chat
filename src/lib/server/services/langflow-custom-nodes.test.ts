import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const nodeSource = (filename: string) =>
	readFileSync(resolve(process.cwd(), "langflow_nodes", filename), "utf8");

describe("Langflow custom model node", () => {
	it("normalizes Mistral tool-call history without reasoning_content payloads", () => {
		const source = nodeSource("vllm_node_fixed.py");

		expect(source).toContain(
			"if has_tool_calls and self.mistral_reasoning_compat:",
		);
		expect(source).toContain('msg["content"] = None');
		expect(source).toContain('msg.pop("reasoning_content", None)');
		expect(source).toContain(
			"if has_tool_calls and self._last_reasoning_content:",
		);
		expect(source).not.toContain(
			'if msg.get("tool_calls") and hasattr(self, "_last_reasoning_content")',
		);
	});
});
