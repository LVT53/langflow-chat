import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getConfig: vi.fn(),
}));

vi.mock("../config-store", () => ({
	getConfig: mocks.getConfig,
}));

import {
	determineTeiWinningMode,
	logTeiRetrievalSummary,
} from "./tei-observability";

const summary = {
	scope: "documents" as const,
	userId: "user-1",
	conversationId: "conv-1",
	queryLength: 12,
	candidateCount: 3,
	winningMode: "rerank" as const,
	winnerId: "artifact-1",
	semantic: {
		queryLength: 12,
		inputCount: 3,
		storedEmbeddingCount: 3,
		matchCount: 2,
		latencyMs: 15,
		fallbackReason: null,
	},
	rerank: {
		queryLength: 12,
		inputCount: 2,
		limitedCount: 2,
		outputCount: 2,
		latencyMs: 21,
		fallbackReason: null,
		confidence: 82,
	},
};

describe("TEI observability", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getConfig.mockReturnValue({ contextDiagnosticsDebug: false });
	});

	it("suppresses routine retrieval summaries by default", () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

		logTeiRetrievalSummary(summary);

		expect(info).not.toHaveBeenCalled();
	});

	it("logs retrieval summaries when Context Diagnostics Debug is enabled", () => {
		mocks.getConfig.mockReturnValue({ contextDiagnosticsDebug: true });
		const info = vi.spyOn(console, "info").mockImplementation(() => undefined);

		logTeiRetrievalSummary(summary);

		expect(info).toHaveBeenCalledWith(
			"[TEI] Retrieval summary",
			expect.objectContaining({
				scope: "documents",
				userId: "user-1",
				conversationId: "conv-1",
				winningMode: "rerank",
			}),
		);
	});

	it("prefers deterministic authority over ranking signals", () => {
		expect(
			determineTeiWinningMode({
				deterministic: true,
				lexicalScore: 9,
				semanticScore: 0.8,
				rerankScore: 0.7,
			}),
		).toBe("deterministic");
	});

	it("orders rerank above semantic above lexical", () => {
		expect(determineTeiWinningMode({ lexicalScore: 4 })).toBe("lexical");
		expect(
			determineTeiWinningMode({ lexicalScore: 0, semanticScore: 0.4 }),
		).toBe("semantic");
		expect(
			determineTeiWinningMode({
				lexicalScore: 0,
				semanticScore: 0.4,
				rerankScore: 0.5,
			}),
		).toBe("rerank");
	});
});
