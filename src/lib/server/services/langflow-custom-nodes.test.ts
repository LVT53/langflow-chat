import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const nodeSource = (filename: string) =>
	readFileSync(resolve(process.cwd(), "langflow_nodes", filename), "utf8");

describe("Langflow custom model node", () => {
	it("routes GPT-OSS recovered tool-call reasoning through the Chat Completions reasoning field", () => {
		const source = nodeSource("vllm_node_fixed.py");

		expect(source).toContain("_uses_gpt_oss_reasoning_field(self.model_name)");
		expect(source).toContain('parameters["reasoning_payload_field"] = "reasoning"');
		expect(source).toContain("msg[self.reasoning_payload_field] = reasoning_text");
		expect(source).toContain('if self.reasoning_payload_field == "reasoning":');
		expect(source).toContain('msg.pop("reasoning_content", None)');
	});

	it("applies configured reasoning request body fields to streaming and non-streaming calls", () => {
		const source = nodeSource("vllm_node_fixed.py");
		const mergeCallCount =
			source.match(/payload = self\._merge_reasoning_body\(payload\)/g)
				?.length ?? 0;

		expect(mergeCallCount).toBeGreaterThanOrEqual(2);
		expect(source).toContain("response = self.client.create(**payload)");
	});

	it("preserves structured content parts when tagging non-stream reasoning", () => {
		const source = nodeSource("vllm_node_fixed.py");

		expect(source).toContain("_prepend_reasoning_to_content");
		expect(source).toContain("if isinstance(content, list):");
		expect(source).toContain('{"type": "text", "text": tagged_reasoning}');
		expect(source).toContain("return f\"{tagged_reasoning}{content or ''}\"");
		expect(source).toContain(
			"content=self._prepend_reasoning_to_content(current_content, tagged_reasoning)",
		);
		expect(source).not.toContain('content=f"{tagged_reasoning}{current_content}"');
	});

	it("keeps generic reasoning_content recovery for non-GPT-OSS providers", () => {
		const source = nodeSource("vllm_node_fixed.py");

		expect(source).toContain('reasoning_payload_field: str = "reasoning_content"');
		expect(source).toContain("return \"reasoning_content\" in msg");
		expect(source).toContain('message_dict["reasoning_content"] = reasoning');
		expect(source).toContain(
			"if has_tool_calls and self._last_reasoning_content:",
		);
	});

	it("keeps tool-call marker callbacks single-sourced per tool", () => {
		const source = nodeSource("agent_node.py");

		expect(source).toContain(
			"if not isinstance(callback, ToolCallEmitterCallback)",
		);
		expect(source).toContain("next_callbacks = existing + [cb]");
		expect(source).toContain('"callId": call_id');
	});
});
