import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock must be defined before imports
vi.mock("../db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => Promise.resolve([])),
		})),
	},
}));

vi.mock("../env", () => ({
	config: {
		workingSetDocumentTokenBudget: 4000,
		workingSetPromptTokenBudget: 20000,
		smallFileThresholdChars: 5000,
	},
	envConfig: {
		workingSetDocumentTokenBudget: 4000,
		workingSetPromptTokenBudget: 20000,
		smallFileThresholdChars: 5000,
	},
}));

// Import after mocks are defined
const {
	getDocumentTokenBudget,
	getWorkingSetPromptTokenBudget,
	getSmallFileThreshold,
	refreshConfig,
	getConfig,
} = await import("../config-store");

describe("Knowledge Store Config", () => {
	beforeEach(async () => {
		await refreshConfig();
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Default Values", () => {
		it("getDocumentTokenBudget() should return 4000 by default", () => {
			const budget = getDocumentTokenBudget();
			expect(budget).toBe(4000);
		});

		it("getWorkingSetPromptTokenBudget() should return 20000 by default", () => {
			const budget = getWorkingSetPromptTokenBudget();
			expect(budget).toBe(20000);
		});

		it("getSmallFileThreshold() should return 5000 by default", () => {
			const threshold = getSmallFileThreshold();
			expect(threshold).toBe(5000);
		});
	});

	describe("Config Object Access", () => {
		it("getConfig() should include workingSetDocumentTokenBudget", () => {
			const config = getConfig();
			expect(config.workingSetDocumentTokenBudget).toBe(4000);
		});

		it("getConfig() should include workingSetPromptTokenBudget", () => {
			const config = getConfig();
			expect(config.workingSetPromptTokenBudget).toBe(20000);
		});

		it("getConfig() should include smallFileThresholdChars", () => {
			const config = getConfig();
			expect(config.smallFileThresholdChars).toBe(5000);
		});
	});
});
