import { describe, expect, it } from "vitest";

import { validateProviderLimitOrdering } from "./inference-providers";

describe("validateProviderLimitOrdering", () => {
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
