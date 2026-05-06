import { describe, expect, it } from "vitest";
import {
	deriveCurrentTurnAttachmentBudget,
	deriveExplicitSourceSetBudget,
	deriveModelContextBudget,
	deriveSessionHistoryBudget,
} from "./context-budget";

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

	it("scales current-turn attachment budget from model capacity", () => {
		const contextBudget = deriveModelContextBudget({
			maxModelContext: 1_000_000,
		});

		expect(
			deriveCurrentTurnAttachmentBudget({
				contextBudget,
				attachmentCount: 12,
				minTotalBudget: 6_000,
				minPerAttachmentBudget: 2_400,
			}),
		).toEqual({
			totalBudget: 364_500,
			taskPerAttachmentBudget: 30_375,
			excerptPerAttachmentBudget: 30_375,
		});
	});

	it("scales explicit source-set budgets to preserve breadth", () => {
		const contextBudget = deriveModelContextBudget({
			maxModelContext: 1_000_000,
		});

		expect(
			deriveExplicitSourceSetBudget({
				contextBudget,
				sourceCount: 12,
				minTotalBudget: 9_000,
				minPerSourceBudget: 1_600,
			}),
		).toEqual({
			totalBudget: 240_975,
			perSourceBudget: 20_081,
		});
	});

	it("scales session history budget from model capacity", () => {
		const contextBudget = deriveModelContextBudget({
			maxModelContext: 1_000_000,
		});

		expect(
			deriveSessionHistoryBudget({
				contextBudget,
				minTotalBudget: 2_000,
				minRecentTurnCount: 3,
				minUnmatchedRecentTurnTokens: 480,
			}),
		).toEqual({
			totalBudget: 103_275,
			recentTurnCount: 25,
			maxUnmatchedRecentTurnTokens: 2_065,
		});
	});
});
