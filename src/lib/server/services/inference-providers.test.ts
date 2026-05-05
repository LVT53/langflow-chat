import { describe, expect, it } from "vitest";

import { validateProviderLimitOrdering } from "./inference-providers";

describe("validateProviderLimitOrdering", () => {
	it("allows model-scaled target and compaction percentages", () => {
		expect(
			validateProviderLimitOrdering({
				maxModelContext: 1_000_000,
				targetConstructedContext: 900_000,
				compactionUiThreshold: 800_000,
			}),
		).toBeNull();
	});

	it("rejects max token caps that are not smaller than the model context", () => {
		expect(
			validateProviderLimitOrdering({
				maxModelContext: 146_000,
				compactionUiThreshold: 131_400,
				targetConstructedContext: 102_200,
				maxTokens: 262_000,
			}),
		).toBe("Max tokens must be less than max model context");
	});
});
