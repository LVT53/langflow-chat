const STOP_REQUEST_TTL_MS = 30_000;

type ActiveChatStream = {
	userId: string;
	controller: AbortController;
};

const activeStreams = new Map<string, ActiveChatStream>();
const pendingStops = new Map<string, ReturnType<typeof setTimeout>>();

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
}) {
	activeStreams.set(params.streamId, {
		userId: params.userId,
		controller: params.controller,
	});

	if (pendingStops.has(params.streamId)) {
		params.controller.abort();
	}
}

export function unregisterActiveChatStream(streamId: string, controller?: AbortController) {
	const activeStream = activeStreams.get(streamId);
	if (!activeStream) {
		clearPendingStop(streamId);
		return;
	}

	if (!controller || activeStream.controller === controller) {
		activeStreams.delete(streamId);
	}
	clearPendingStop(streamId);
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
