import { describe, expect, it, vi } from "vitest";
import { runNonStreamFallback } from "./stream-fallback";

describe("runNonStreamFallback", () => {
	const mockSendMessage = vi.fn();
	const mockAttachContinuity = vi.fn();
	const mockEmitText = vi.fn();
	const mockFlushPendingThinking = vi.fn();
	const mockFlushInlineThinking = vi.fn();
	const mockFlushPreserve = vi.fn();
	const mockCompleteSuccess = vi.fn();
	const mockOnContextStatus = vi.fn();
	const mockOnTaskState = vi.fn();
	const mockOnContextDebug = vi.fn();
	const mockOnHonchoContext = vi.fn();
	const mockOnHonchoSnapshot = vi.fn();
	const mockOnProviderUsage = vi.fn();

	const defaultSendParams = {
		upstreamMessage: "test message",
		conversationId: "conv-1",
		modelId: "model-1",
		attachmentIds: ["att-1"],
		activeDocumentArtifactId: "doc-1",
		attachmentTraceId: "trace-1",
	};

	const defaultUser = {
		id: "user-1",
		displayName: "Test User",
		email: "test@example.com",
	};

	const defaultFallbackResponse = {
		text: "fallback response",
		contextStatus: { active: true } as Record<string, unknown>,
		taskState: { id: "task-1" } as Record<string, unknown>,
		contextDebug: { debug: true } as Record<string, unknown>,
		honchoContext: { peer: "peer-1" } as Record<string, unknown>,
		honchoSnapshot: { snap: "snap-1" } as Record<string, unknown>,
		providerUsage: { tokens: 100 } as Record<string, unknown>,
	};

	function callFallback(overrides: Record<string, unknown> = {}) {
		return runNonStreamFallback({
			sendMessage: mockSendMessage,
			sendParams: defaultSendParams,
			user: defaultUser,
			attachContinuityToTaskState: mockAttachContinuity,
			emitResolvedAssistantText: mockEmitText,
			flushPendingThinking: mockFlushPendingThinking,
			flushInlineThinkingBuffer: mockFlushInlineThinking,
			flushPreserveBuffer: mockFlushPreserve,
			completeSuccess: mockCompleteSuccess,
			signal: new AbortController().signal,
			systemPromptAppendix: undefined,
			onContextStatus: mockOnContextStatus,
			onTaskState: mockOnTaskState,
			onContextDebug: mockOnContextDebug,
			onHonchoContext: mockOnHonchoContext,
			onHonchoSnapshot: mockOnHonchoSnapshot,
			onProviderUsage: mockOnProviderUsage,
			...overrides,
		});
	}

	beforeEach(() => {
		vi.resetAllMocks();
		mockSendMessage.mockResolvedValue(defaultFallbackResponse);
		mockEmitText.mockResolvedValue(true);
		mockFlushInlineThinking.mockReturnValue(true);
		mockFlushPreserve.mockReturnValue(true);
		mockAttachContinuity.mockImplementation(
			(_userId: string, taskState: unknown) => Promise.resolve(taskState),
		);
	});

	it("calls sendMessage with correct parameters", async () => {
		await callFallback();

		expect(mockSendMessage).toHaveBeenCalledWith(
			"test message",
			"conv-1",
			"model-1",
			{ id: "user-1", displayName: "Test User", email: "test@example.com" },
			expect.objectContaining({
				attachmentIds: ["att-1"],
				activeDocumentArtifactId: "doc-1",
				attachmentTraceId: "trace-1",
			}),
		);
	});

	it("updates context status from fallback response", async () => {
		const status = { active: true };
		mockSendMessage.mockResolvedValue({
			...defaultFallbackResponse,
			contextStatus: status,
		});

		await callFallback();

		expect(mockSendMessage).toHaveBeenCalled();
	});

	it("attaches continuity to task state", async () => {
		await callFallback();

		expect(mockAttachContinuity).toHaveBeenCalledWith("user-1", {
			id: "task-1",
		});
	});

	it("emits resolved assistant text", async () => {
		await callFallback();

		expect(mockEmitText).toHaveBeenCalledWith("fallback response");
	});

	it("flushes thinking buffers after emitting text", async () => {
		await callFallback();

		expect(mockFlushPendingThinking).toHaveBeenCalled();
		expect(mockFlushInlineThinking).toHaveBeenCalled();
		expect(mockFlushPreserve).toHaveBeenCalled();
	});

	it("calls completeSuccess after successful fallback", async () => {
		await callFallback();

		expect(mockCompleteSuccess).toHaveBeenCalled();
	});

	it("returns early if emitResolvedAssistantText returns false", async () => {
		mockEmitText.mockResolvedValue(false);

		await callFallback();

		expect(mockFlushPendingThinking).not.toHaveBeenCalled();
		expect(mockCompleteSuccess).not.toHaveBeenCalled();
	});

	it("returns early if flushInlineThinkingBuffer returns false", async () => {
		mockFlushInlineThinking.mockReturnValue(false);

		await callFallback();

		expect(mockFlushPreserve).not.toHaveBeenCalled();
		expect(mockCompleteSuccess).not.toHaveBeenCalled();
	});

	it("returns early if flushPreserveBuffer returns false", async () => {
		mockFlushPreserve.mockReturnValue(false);

		await callFallback();

		expect(mockCompleteSuccess).not.toHaveBeenCalled();
	});

	it("handles null taskState gracefully", async () => {
		mockSendMessage.mockResolvedValue({
			...defaultFallbackResponse,
			taskState: null,
		});

		await callFallback();

		expect(mockAttachContinuity).toHaveBeenCalledWith("user-1", null);
	});

	it("handles null contextDebug gracefully", async () => {
		mockSendMessage.mockResolvedValue({
			...defaultFallbackResponse,
			contextDebug: null,
		});

		await callFallback();
	});

	it("handles null honchoContext and honchoSnapshot gracefully", async () => {
		mockSendMessage.mockResolvedValue({
			...defaultFallbackResponse,
			honchoContext: null,
			honchoSnapshot: null,
		});

		await callFallback();
	});

	it("handles null text gracefully", async () => {
		mockSendMessage.mockResolvedValue({
			...defaultFallbackResponse,
			text: null,
		});
		mockEmitText.mockResolvedValue(true);

		await callFallback();

		expect(mockEmitText).toHaveBeenCalledWith(null);
	});
});
