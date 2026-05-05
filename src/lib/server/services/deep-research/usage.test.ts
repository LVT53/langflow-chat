import { describe, expect, it } from "vitest";
import { buildPlanGenerationResearchUsageRecord } from "./usage";

describe("buildPlanGenerationResearchUsageRecord", () => {
	it("maps provider usage to research-specific usage without requiring a fake message id", () => {
		const usage = buildPlanGenerationResearchUsageRecord({
			jobId: "job-1",
			taskId: null,
			conversationId: "conversation-1",
			userId: "user-1",
			modelId: "provider:openrouter",
			modelDisplayName: "Research Planner",
			providerId: "openrouter",
			providerDisplayName: "OpenRouter",
			occurredAt: new Date("2026-05-05T10:20:00.000Z"),
			runtimeMs: 1234,
			providerUsage: {
				promptTokens: 1200,
				cachedInputTokens: 200,
				cacheHitTokens: 150,
				cacheMissTokens: 50,
				completionTokens: 300,
				reasoningTokens: 80,
				source: "provider",
			},
			costUsdMicros: 42,
		});

		expect(usage).toEqual({
			jobId: "job-1",
			taskId: null,
			conversationId: "conversation-1",
			userId: "user-1",
			stage: "plan_generation",
			operation: "plan_generation",
			modelId: "provider:openrouter",
			modelDisplayName: "Research Planner",
			providerId: "openrouter",
			providerDisplayName: "OpenRouter",
			billingMonth: "2026-05",
			occurredAt: "2026-05-05T10:20:00.000Z",
			promptTokens: 1200,
			cachedInputTokens: 200,
			cacheHitTokens: 150,
			cacheMissTokens: 50,
			completionTokens: 300,
			reasoningTokens: 80,
			totalTokens: 1580,
			usageSource: "provider",
			runtimeMs: 1234,
			costUsdMicros: 42,
		});
		expect("messageId" in usage).toBe(false);
	});
});
