export interface ReconnectBuffer {
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

export interface ReconnectDeps {
	enqueueChunk: (chunk: string) => boolean;
	closeDownstream: () => void;
	downstreamAbortSignal: AbortSignal;
	getStreamBuffer: (streamId: string) => ReconnectBuffer | undefined;
	subscribeToStream: (
		streamId: string,
		listener: (chunk: string) => void,
	) => void;
	unsubscribeFromStream: (
		streamId: string,
		listener: (chunk: string) => void,
	) => void;
	createSsePreludeComment: () => string;
	createSseHeartbeatComment: () => string;
}

export function doReconnect(targetStreamId: string, deps: ReconnectDeps): void {
	const {
		enqueueChunk,
		closeDownstream,
		downstreamAbortSignal,
		getStreamBuffer,
		subscribeToStream,
		unsubscribeFromStream,
		createSsePreludeComment,
		createSseHeartbeatComment,
	} = deps;

	try {
		enqueueChunk(createSsePreludeComment());
		enqueueChunk(createSseHeartbeatComment());

		const buffer = getStreamBuffer(targetStreamId);
		if (buffer) {
			const hasContent =
				buffer.tokens.length > 0 ||
				buffer.thinking.length > 0 ||
				buffer.toolCalls.length > 0;
			console.info(
				"[CHAT_STREAM] Replaying buffer for stream",
				targetStreamId,
				{
					hasContent,
					tokens: buffer.tokens.length,
					thinking: buffer.thinking.length,
				},
			);
			if (hasContent) {
				enqueueChunk(
					`event: replay_start\ndata: ${JSON.stringify({
						tokenCount: buffer.tokens.length,
						thinkingCount: buffer.thinking.length,
						toolCallCount: buffer.toolCalls.length,
						userMessage: buffer.userMessage,
					})}\n\n`,
				);
				for (const token of buffer.tokens) {
					enqueueChunk(
						`event: token\ndata: ${JSON.stringify({ text: token })}\n\n`,
					);
				}
				for (const thinking of buffer.thinking) {
					enqueueChunk(
						`event: thinking\ndata: ${JSON.stringify({ text: thinking })}\n\n`,
					);
				}
				for (const toolCall of buffer.toolCalls) {
					enqueueChunk(
						`event: tool_call\ndata: ${JSON.stringify({
							name: toolCall.name,
							input: toolCall.input,
							status: toolCall.status,
							outputSummary: toolCall.outputSummary,
						})}\n\n`,
					);
				}
				enqueueChunk("event: replay_end\ndata: {}\n\n");
			}
		}

		let reconnectHeartbeatId: ReturnType<typeof setInterval>;
		const liveListener = (chunk: string) => {
			enqueueChunk(chunk);
			if (
				chunk.startsWith("event: end\n") ||
				chunk.startsWith("event: error\n")
			) {
				unsubscribeFromStream(targetStreamId, liveListener);
				clearInterval(reconnectHeartbeatId);
				closeDownstream();
			}
		};
		subscribeToStream(targetStreamId, liveListener);

		downstreamAbortSignal.addEventListener(
			"abort",
			() => {
				unsubscribeFromStream(targetStreamId, liveListener);
				clearInterval(reconnectHeartbeatId);
				closeDownstream();
			},
			{ once: true },
		);

		reconnectHeartbeatId = setInterval(() => {
			enqueueChunk(createSseHeartbeatComment());
		}, 10000);

		console.info(
			"[CHAT_STREAM] Reconnect done, subscribed to stream",
			targetStreamId,
		);
	} catch (err) {
		console.error("[CHAT_STREAM] doReconnect threw", { targetStreamId, err });
		closeDownstream();
	}
}
