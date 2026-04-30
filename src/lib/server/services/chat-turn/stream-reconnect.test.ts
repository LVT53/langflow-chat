import { beforeEach, describe, expect, it, vi } from "vitest";
import { doReconnect } from "./stream-reconnect";

interface ReconnectBuffer {
	userMessage: string | null;
	tokens: string[];
	thinking: string[];
	toolCalls: Array<{
		name: string;
		input: Record<string, unknown>;
		status: "running" | "done";
		outputSummary?: string | null;
	}>;
}

describe("doReconnect", () => {
	let enqueueChunk: ReturnType<typeof vi.fn>;
	let closeDownstream: ReturnType<typeof vi.fn>;
	let getStreamBuffer: ReturnType<typeof vi.fn>;
	let subscribeToStream: ReturnType<typeof vi.fn>;
	let unsubscribeFromStream: ReturnType<typeof vi.fn>;
	let createSsePreludeComment: ReturnType<typeof vi.fn>;
	let createSseHeartbeatComment: ReturnType<typeof vi.fn>;
	let abortController: AbortController;
	let intervalIds: number[];
	let clearedIntervalIds: number[];

	beforeEach(() => {
		enqueueChunk = vi.fn().mockReturnValue(true);
		closeDownstream = vi.fn();
		getStreamBuffer = vi.fn().mockReturnValue(undefined);
		subscribeToStream = vi.fn();
		unsubscribeFromStream = vi.fn();
		createSsePreludeComment = vi.fn().mockReturnValue(": prelude\n\n");
		createSseHeartbeatComment = vi.fn().mockReturnValue(": heartbeat\n\n");
		abortController = new AbortController();
		intervalIds = [];
		clearedIntervalIds = [];
		vi.spyOn(global, "setInterval").mockImplementation(
			(_cb: () => void, _ms?: number) => {
				const id = intervalIds.length + 1;
				intervalIds.push(id);
				return id as unknown as ReturnType<typeof setInterval>;
			},
		);
		vi.spyOn(global, "clearInterval").mockImplementation((id: unknown) => {
			clearedIntervalIds.push(id as number);
		});
	});

	function callDoReconnect(targetStreamId = "test-stream") {
		doReconnect(targetStreamId, {
			enqueueChunk,
			closeDownstream,
			downstreamAbortSignal: abortController.signal,
			getStreamBuffer,
			subscribeToStream,
			unsubscribeFromStream,
			createSsePreludeComment,
			createSseHeartbeatComment,
		});
	}

	function makeBuffer(
		overrides: Partial<ReconnectBuffer> = {},
	): ReconnectBuffer {
		return {
			tokens: [],
			thinking: [],
			toolCalls: [],
			userMessage: null,
			...overrides,
		};
	}

	it("enqueues SSE prelude and heartbeat comments on start", () => {
		callDoReconnect();

		expect(createSsePreludeComment).toHaveBeenCalledOnce();
		expect(createSseHeartbeatComment).toHaveBeenCalledOnce();
		expect(enqueueChunk).toHaveBeenCalledWith(": prelude\n\n");
		expect(enqueueChunk).toHaveBeenCalledWith(": heartbeat\n\n");
	});

	it("replays buffered tokens, thinking, and tool_calls with replay_start/replay_end framing", () => {
		const buffer = makeBuffer({
			tokens: ["Hello", " world"],
			thinking: ["reasoning"],
			toolCalls: [
				{
					name: "search",
					input: { q: "test" },
					status: "done" as const,
					outputSummary: "found",
				},
			],
		});
		getStreamBuffer.mockReturnValue(buffer);

		callDoReconnect();

		expect(enqueueChunk).toHaveBeenCalledWith(
			expect.stringContaining("event: replay_start"),
		);

		expect(enqueueChunk).toHaveBeenCalledWith(
			expect.stringContaining("event: token"),
		);
		expect(enqueueChunk).toHaveBeenCalledWith(
			expect.stringContaining('"text":"Hello"'),
		);
		expect(enqueueChunk).toHaveBeenCalledWith(
			expect.stringContaining('"text":" world"'),
		);

		expect(enqueueChunk).toHaveBeenCalledWith(
			expect.stringContaining("event: thinking"),
		);
		expect(enqueueChunk).toHaveBeenCalledWith(
			expect.stringContaining('"text":"reasoning"'),
		);

		expect(enqueueChunk).toHaveBeenCalledWith(
			expect.stringContaining("event: tool_call"),
		);
		expect(enqueueChunk).toHaveBeenCalledWith(
			expect.stringContaining('"name":"search"'),
		);

		expect(enqueueChunk).toHaveBeenCalledWith(
			expect.stringContaining("event: replay_end"),
		);
	});

	it("subscribes to live stream events after replay", () => {
		callDoReconnect();

		expect(subscribeToStream).toHaveBeenCalledWith(
			"test-stream",
			expect.any(Function),
		);
	});

	it("forwards live stream chunks to enqueueChunk", () => {
		callDoReconnect();

		const listener = subscribeToStream.mock.calls[0][1] as (
			chunk: string,
		) => void;
		listener('event: token\ndata: {"text":"live"}\n\n');

		expect(enqueueChunk).toHaveBeenCalledWith(
			'event: token\ndata: {"text":"live"}\n\n',
		);
	});

	it('closes downstream and unsubscribes on "event: end" live chunk', () => {
		callDoReconnect();

		const listener = subscribeToStream.mock.calls[0][1] as (
			chunk: string,
		) => void;
		listener("event: end\ndata: {}\n\n");

		expect(unsubscribeFromStream).toHaveBeenCalledWith("test-stream", listener);
		expect(clearInterval).toHaveBeenCalled();
		expect(closeDownstream).toHaveBeenCalled();
	});

	it('closes downstream and unsubscribes on "event: error" live chunk', () => {
		callDoReconnect();

		const listener = subscribeToStream.mock.calls[0][1] as (
			chunk: string,
		) => void;
		listener('event: error\ndata: {"code":"timeout"}\n\n');

		expect(unsubscribeFromStream).toHaveBeenCalledWith("test-stream", listener);
		expect(clearInterval).toHaveBeenCalled();
		expect(closeDownstream).toHaveBeenCalled();
	});

	it("cleans up on abort signal", () => {
		callDoReconnect();

		const listener = subscribeToStream.mock.calls[0][1] as (
			chunk: string,
		) => void;
		abortController.abort();

		expect(unsubscribeFromStream).toHaveBeenCalledWith("test-stream", listener);
		expect(clearInterval).toHaveBeenCalled();
		expect(closeDownstream).toHaveBeenCalled();
	});

	it("does not replay buffer when empty", () => {
		getStreamBuffer.mockReturnValue(
			makeBuffer({ tokens: [], thinking: [], toolCalls: [] }),
		);

		callDoReconnect();

		const calls = enqueueChunk.mock.calls.flat() as string[];
		const replayStartCall = calls.find((c: string) =>
			c.includes("event: replay_start"),
		);
		const replayEndCall = calls.find((c: string) =>
			c.includes("event: replay_end"),
		);
		expect(replayStartCall).toBeUndefined();
		expect(replayEndCall).toBeUndefined();
	});

	it("closes downstream when getStreamBuffer throws", () => {
		getStreamBuffer.mockImplementation(() => {
			throw new Error("buffer error");
		});

		callDoReconnect();

		expect(closeDownstream).toHaveBeenCalled();
	});

	it("sets up a 10-second heartbeat interval for reconnect", () => {
		callDoReconnect();

		expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 10000);
	});
});
