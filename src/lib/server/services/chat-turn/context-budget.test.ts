import { describe, expect, it } from "vitest";
import { deriveModelContextBudget } from "./context-budget";

describe("deriveModelContextBudget", () => {
	it("derives target and compaction defaults from usable model context", () => {
		expect(
			deriveModelContextBudget({
				maxModelContext: 1_000_000,
			}),
		).toMatchObject({
			maxModelContext: 1_000_000,
			usableModelContext: 1_000_000,
			targetConstructedContext: 900_000,
			compactionUiThreshold: 800_000,
		});
	});

	it("keeps explicit target and compaction overrides when present", () => {
		expect(
			deriveModelContextBudget({
				maxModelContext: 250_000,
				targetConstructedContext: 180_000,
				compactionUiThreshold: 150_000,
			}),
		).toMatchObject({
			maxModelContext: 250_000,
			targetConstructedContext: 180_000,
			compactionUiThreshold: 150_000,
		});
	});

	it("derives reserved, core, support, and awareness budgets from target context", () => {
		expect(
			deriveModelContextBudget({
				maxModelContext: 1_000_000,
				systemPromptTokens: 12_000,
				currentMessageTokens: 4_000,
				overheadReserveTokens: 512,
			}),
		).toMatchObject({
			targetConstructedContext: 900_000,
			reservedBudget: 90_000,
			coreBudget: 405_000,
			supportBudget: 283_500,
			awarenessBudget: 121_500,
		});
	});

	it("uses maxTokens as output reserve before deriving target and threshold", () => {
		expect(
			deriveModelContextBudget({
				maxModelContext: 1_000_000,
				maxTokens: 100_000,
				systemPromptTokens: 12_000,
				currentMessageTokens: 4_000,
				overheadReserveTokens: 512,
			}),
		).toMatchObject({
			outputReserve: 100_000,
			usableModelContext: 900_000,
			targetConstructedContext: 810_000,
			compactionUiThreshold: 720_000,
			outputReserveClamped: false,
		});
	});

	it("clamps output reserve against an explicit target override", () => {
		expect(
			deriveModelContextBudget({
				maxModelContext: 1_000_000,
				targetConstructedContext: 900_000,
				compactionUiThreshold: 800_000,
				maxTokens: 250_000,
				systemPromptTokens: 12_000,
				currentMessageTokens: 4_000,
				overheadReserveTokens: 512,
			}),
		).toMatchObject({
			outputReserve: 100_000,
			effectiveMaxTokens: 100_000,
			outputReserveClamped: true,
			targetConstructedContext: 900_000,
			compactionUiThreshold: 800_000,
		});
	});
});
