import { getConfig } from '$lib/server/config-store';

const STOP_REQUEST_TTL_MS = 30_000;

type ActiveChatStream = {
	userId: string;
	controller: AbortController;
};

const activeStreams = new Map<string, ActiveChatStream>();
const pendingStops = new Map<string, ReturnType<typeof setTimeout>>();

// Track per-user stream counts for limit enforcement
const userStreamCounts = new Map<string, number>();

// Track conversationId → streamId for orphan detection
const conversationStreams = new Map<string, string>();

// Stream token buffer for reconnection replay
interface StreamTokenBuffer {
	userMessage: string;
	tokens: string[];
	thinking: string[];
	toolCalls: Array<{
		name: string;
		input: Record<string, unknown>;
		status: 'running' | 'done';
		outputSummary?: string | null;
	}>;
	listeners: Set<(chunk: string) => void>;
}

const streamBuffers = new Map<string, StreamTokenBuffer>();
const BUFFER_MAX_TOKENS = 100_000;
const BUFFER_CLEANUP_MS = 5 * 60 * 1000;

let bufferCleanupTimer: ReturnType<typeof setInterval> | null = null;

function unrefTimer(timer: ReturnType<typeof setInterval> | ReturnType<typeof setTimeout>) {
	timer.unref?.();
}

function stopBufferCleanupTimer() {
	if (!bufferCleanupTimer) return;
	clearInterval(bufferCleanupTimer);
	bufferCleanupTimer = null;
}

function startBufferCleanupTimer() {
	if (bufferCleanupTimer) return;
	bufferCleanupTimer = setInterval(() => {
		if (streamBuffers.size === 0) {
			stopBufferCleanupTimer();
			return;
		}

		for (const [streamId, buffer] of streamBuffers) {
			void streamId;
			void buffer;
		}
	}, BUFFER_CLEANUP_MS);
	unrefTimer(bufferCleanupTimer);
}

export function getStreamBuffer(streamId: string): StreamTokenBuffer | null {
	return streamBuffers.get(streamId) ?? null;
}

export function getOrCreateStreamBuffer(streamId: string, userMessage: string): StreamTokenBuffer {
	let buffer = streamBuffers.get(streamId);
	if (!buffer) {
		buffer = { userMessage, tokens: [], thinking: [], toolCalls: [], listeners: new Set() };
		streamBuffers.set(streamId, buffer);
		startBufferCleanupTimer();
	}
	return buffer;
}

export function appendToStreamBuffer(
	streamId: string,
	event: 'token' | 'thinking' | 'tool_call',
	data: { text?: string; name?: string; input?: Record<string, unknown>; status?: 'running' | 'done'; outputSummary?: string | null }
) {
	const buffer = streamBuffers.get(streamId);
	if (!buffer) return;

	if (event === 'token' && data.text) {
		buffer.tokens.push(data.text);
		// Cap buffer size
		if (buffer.tokens.join('').length > BUFFER_MAX_TOKENS) {
			buffer.tokens = buffer.tokens.slice(-Math.floor(BUFFER_MAX_TOKENS / 10));
		}
	} else if (event === 'thinking' && data.text) {
		buffer.thinking.push(data.text);
		if (buffer.thinking.join('').length > BUFFER_MAX_TOKENS) {
			buffer.thinking = buffer.thinking.slice(-Math.floor(BUFFER_MAX_TOKENS / 10));
		}
	} else if (event === 'tool_call' && data.name) {
		if (data.status === 'running') {
			buffer.toolCalls.push({
				name: data.name,
				input: data.input ?? {},
				status: 'running',
			});
		} else {
			// Mark last matching tool_call as done
			for (let i = buffer.toolCalls.length - 1; i >= 0; i--) {
				if (buffer.toolCalls[i].name === data.name && buffer.toolCalls[i].status === 'running') {
					buffer.toolCalls[i] = {
						name: data.name,
						input: buffer.toolCalls[i].input,
						status: 'done',
						outputSummary: data.outputSummary ?? null,
					};
					break;
				}
			}
		}
	}
}

export function clearStreamBuffer(streamId: string) {
	streamBuffers.delete(streamId);
	if (streamBuffers.size === 0) {
		stopBufferCleanupTimer();
	}
}

export function subscribeToStream(streamId: string, listener: (chunk: string) => void) {
	const buffer = streamBuffers.get(streamId);
	if (buffer) {
		buffer.listeners.add(listener);
	}
}

export function unsubscribeFromStream(streamId: string, listener: (chunk: string) => void) {
	const buffer = streamBuffers.get(streamId);
	if (buffer) {
		buffer.listeners.delete(listener);
	}
}

export function broadcastStreamChunk(streamId: string, chunk: string) {
	const buffer = streamBuffers.get(streamId);
	if (buffer) {
		for (const listener of buffer.listeners) {
			try {
				listener(chunk);
			} catch {
				buffer.listeners.delete(listener);
			}
		}
	}
}

function markPendingStop(streamId: string) {
	if (pendingStops.has(streamId)) {
		return;
	}

	const timeoutId = setTimeout(() => {
		pendingStops.delete(streamId);
	}, STOP_REQUEST_TTL_MS);
	unrefTimer(timeoutId);
	pendingStops.set(streamId, timeoutId);
}

function clearPendingStop(streamId: string) {
	const timeoutId = pendingStops.get(streamId);
	if (timeoutId) {
		clearTimeout(timeoutId);
	}
	pendingStops.delete(streamId);
}

export function registerActiveChatStream(params: {
	streamId: string;
	userId: string;
	controller: AbortController;
	conversationId: string;
}): boolean {
	const existingStreamId = conversationStreams.get(params.conversationId);
	if (existingStreamId && existingStreamId !== params.streamId) {
		return false;
	}

	activeStreams.set(params.streamId, {
		userId: params.userId,
		controller: params.controller,
	});

	conversationStreams.set(params.conversationId, params.streamId);

	if (pendingStops.has(params.streamId)) {
		params.controller.abort();
	}

	const currentCount = userStreamCounts.get(params.userId) ?? 0;
	userStreamCounts.set(params.userId, currentCount + 1);

	return true;
}

export function unregisterActiveChatStream(streamId: string, controller?: AbortController) {
	const activeStream = activeStreams.get(streamId);
	if (!activeStream) {
		clearPendingStop(streamId);
		return;
	}

	if (!controller || activeStream.controller === controller) {
		activeStreams.delete(streamId);

		for (const [convId, sid] of conversationStreams) {
			if (sid === streamId) {
				conversationStreams.delete(convId);
				break;
			}
		}

		const userId = activeStream.userId;
		const currentCount = userStreamCounts.get(userId) ?? 1;
		if (currentCount <= 1) {
			userStreamCounts.delete(userId);
		} else {
			userStreamCounts.set(userId, currentCount - 1);
		}
	}
	clearPendingStop(streamId);
}

export function getOrphanedStream(conversationId: string): string | null {
	return conversationStreams.get(conversationId) ?? null;
}

export function isStreamActive(streamId: string): boolean {
	return activeStreams.has(streamId);
}

export function requestActiveChatStreamStop(params: {
	streamId: string;
	userId: string;
}): boolean {
	const activeStream = activeStreams.get(params.streamId);

	if (!activeStream) {
		markPendingStop(params.streamId);
		return false;
	}

	if (activeStream.userId !== params.userId) {
		return false;
	}

	markPendingStop(params.streamId);
	activeStream.controller.abort();
	return true;
}

export function wasActiveChatStreamStopRequested(streamId: string | undefined): boolean {
	return Boolean(streamId) && pendingStops.has(streamId);
}

export interface StreamCapacityCheck {
	allowed: boolean;
	reason?: 'global_limit' | 'user_limit';
	retryAfterSeconds?: number;
	currentGlobalCount?: number;
	currentUserCount?: number;
}

export interface StreamStats {
	globalActiveCount: number;
	perUserCounts: Map<string, number>;
	maxGlobal: number;
	maxPerUser: number;
}

export function checkStreamCapacity(userId: string): StreamCapacityCheck {
	const config = getConfig();
	const maxGlobal = config.concurrentStreamLimit;
	const maxPerUser = config.perUserStreamLimit;

	const currentGlobalCount = activeStreams.size;
	const currentUserCount = userStreamCounts.get(userId) ?? 0;

	if (currentGlobalCount >= maxGlobal) {
		return {
			allowed: false,
			reason: 'global_limit',
			retryAfterSeconds: 10,
			currentGlobalCount,
			currentUserCount,
		};
	}

	if (currentUserCount >= maxPerUser) {
		return {
			allowed: false,
			reason: 'user_limit',
			retryAfterSeconds: 5,
			currentGlobalCount,
			currentUserCount,
		};
	}

	return {
		allowed: true,
		currentGlobalCount,
		currentUserCount,
	};
}

export function getStreamStats(): StreamStats {
	const config = getConfig();
	return {
		globalActiveCount: activeStreams.size,
		perUserCounts: new Map(userStreamCounts),
		maxGlobal: config.concurrentStreamLimit,
		maxPerUser: config.perUserStreamLimit,
	};
}
