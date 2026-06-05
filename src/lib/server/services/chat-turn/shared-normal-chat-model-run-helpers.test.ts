import { describe, expect, it } from "vitest";
import type { RuntimeConfig } from "$lib/server/config-store";
import { resolvePromptContextLimits } from "./shared-normal-chat-model-run-helpers";

const runtimeConfig = {
	model1MaxModelContext: 1_000_000,
	model1CompactionUiThreshold: 800_000,
	model1TargetConstructedContext: 900_000,
	model2MaxModelContext: 250_000,
	model2CompactionUiThreshold: 200_000,
	model2TargetConstructedContext: 225_000,
} as RuntimeConfig;

describe("resolvePromptContextLimits", () => {
	it("derives provider-specific limits from a provider max context", () => {
		expect(
			resolvePromptContextLimits({
				modelId: "provider:provider-1:model-1",
				provider: { maxModelContext: 200_000 },
				runtimeConfig,
			}),
		).toEqual({
			maxModelContext: 200_000,
			compactionUiThreshold: 160_000,
			targetConstructedContext: 180_000,
		});
	});

	it("keeps built-in runtime config limits for built-in models", () => {
		expect(
			resolvePromptContextLimits({
				modelId: "model2",
				provider: {},
				runtimeConfig,
			}),
		).toEqual({
			maxModelContext: 250_000,
			compactionUiThreshold: 200_000,
			targetConstructedContext: 225_000,
		});
	});
});
