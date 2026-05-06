import { describe, expect, it } from "vitest";
import { inferModelContextWindow } from "./model-context";

describe("inferModelContextWindow", () => {
	it("infers the 1M context window for GPT-4.1 model ids and snapshots", () => {
		expect(inferModelContextWindow("gpt-4.1")).toBe(1_047_576);
		expect(inferModelContextWindow("gpt-4.1-mini")).toBe(1_047_576);
		expect(inferModelContextWindow("gpt-4.1-nano-2025-04-14")).toBe(1_047_576);
	});

	it("does not infer unrelated model names", () => {
		expect(inferModelContextWindow("gpt-4o")).toBeNull();
		expect(inferModelContextWindow("my-gpt-4.1-wrapper")).toBeNull();
		expect(inferModelContextWindow("")).toBeNull();
	});
});
