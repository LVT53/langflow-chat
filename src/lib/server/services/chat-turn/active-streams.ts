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

function markPendingStop(streamId: string) {
	if (pendingStops.has(streamId)) {
		return;
	}

	const timeoutId = setTimeout(() => {
		pendingStops.delete(streamId);
	}, STOP_REQUEST_TTL_MS);
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
