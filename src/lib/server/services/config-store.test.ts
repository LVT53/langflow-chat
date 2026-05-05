import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let adminConfigRows: Array<{ key: string; value: string }> = [];

// Mock must be defined before imports
vi.mock("../db", () => ({
	db: {
		select: vi.fn(() => ({
			from: vi.fn(() => Promise.resolve(adminConfigRows)),
		})),
	},
}));

vi.mock("../env", () => ({
	config: {
		workingSetDocumentTokenBudget: 4000,
		workingSetPromptTokenBudget: 20000,
		smallFileThresholdChars: 5000,
		deepResearchEnabled: false,
		deepResearchWorkerEnabled: false,
		deepResearchWorkerIntervalMs: 5000,
		deepResearchWorkerStaleTimeoutMs: 1800000,
		deepResearchWorkerGlobalConcurrency: 1,
		deepResearchWorkerUserConcurrency: 1,
	},
	envConfig: {
		workingSetDocumentTokenBudget: 4000,
		workingSetPromptTokenBudget: 20000,
		smallFileThresholdChars: 5000,
		deepResearchEnabled: false,
		deepResearchWorkerEnabled: false,
		deepResearchWorkerIntervalMs: 5000,
		deepResearchWorkerStaleTimeoutMs: 1800000,
		deepResearchWorkerGlobalConcurrency: 1,
		deepResearchWorkerUserConcurrency: 1,
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
		adminConfigRows = [];
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

		it("getConfig() should keep Deep Research disabled by default", () => {
			const config = getConfig();
			expect(config.deepResearchEnabled).toBe(false);
		});

		it("getConfig() should allow admin config to enable Deep Research", async () => {
			adminConfigRows = [{ key: "DEEP_RESEARCH_ENABLED", value: "true" }];

			await refreshConfig();

			expect(getConfig().deepResearchEnabled).toBe(true);
		});

		it("getConfig() should expose Deep Research worker defaults", () => {
			const config = getConfig();

			expect(config.deepResearchEnabled).toBe(false);
			expect(config.deepResearchWorkerEnabled).toBe(false);
			expect(config.deepResearchWorkerIntervalMs).toBe(5000);
			expect(config.deepResearchWorkerStaleTimeoutMs).toBe(1800000);
			expect(config.deepResearchWorkerGlobalConcurrency).toBe(1);
			expect(config.deepResearchWorkerUserConcurrency).toBe(1);
		});

		it("getConfig() should apply Deep Research worker admin overrides", async () => {
			adminConfigRows = [
				{ key: "DEEP_RESEARCH_ENABLED", value: "true" },
				{ key: "DEEP_RESEARCH_WORKER_ENABLED", value: "true" },
				{ key: "DEEP_RESEARCH_WORKER_INTERVAL_MS", value: "12000" },
				{ key: "DEEP_RESEARCH_WORKER_STALE_TIMEOUT_MS", value: "3600000" },
				{ key: "DEEP_RESEARCH_WORKER_GLOBAL_CONCURRENCY", value: "3" },
				{ key: "DEEP_RESEARCH_WORKER_USER_CONCURRENCY", value: "2" },
			];

			await refreshConfig();

			const config = getConfig();
			expect(config.deepResearchEnabled).toBe(true);
			expect(config.deepResearchWorkerEnabled).toBe(true);
			expect(config.deepResearchWorkerIntervalMs).toBe(12000);
			expect(config.deepResearchWorkerStaleTimeoutMs).toBe(3600000);
			expect(config.deepResearchWorkerGlobalConcurrency).toBe(3);
			expect(config.deepResearchWorkerUserConcurrency).toBe(2);
		});

		it("getConfig() should clamp small Deep Research worker overrides", async () => {
			adminConfigRows = [
				{ key: "DEEP_RESEARCH_WORKER_INTERVAL_MS", value: "250" },
				{ key: "DEEP_RESEARCH_WORKER_STALE_TIMEOUT_MS", value: "5000" },
				{ key: "DEEP_RESEARCH_WORKER_GLOBAL_CONCURRENCY", value: "-2" },
				{ key: "DEEP_RESEARCH_WORKER_USER_CONCURRENCY", value: "-1" },
			];

			await refreshConfig();

			const config = getConfig();
			expect(config.deepResearchWorkerIntervalMs).toBe(1000);
			expect(config.deepResearchWorkerStaleTimeoutMs).toBe(60000);
			expect(config.deepResearchWorkerGlobalConcurrency).toBe(0);
			expect(config.deepResearchWorkerUserConcurrency).toBe(0);
		});
	});
});
