import type { ChatTurnRequestError } from './types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const SSE_HEADERS = {
	'Content-Type': 'text/event-stream',
	'Cache-Control': 'no-cache',
	Connection: 'keep-alive',
};

export function createStreamJsonErrorResponse(error: ChatTurnRequestError): Response {
	return new Response(JSON.stringify(stripUndefined(error)), {
		status: error.status,
		headers: JSON_HEADERS,
	});
}

export function createEventStreamResponse(stream: ReadableStream): Response {
	return new Response(stream, { headers: SSE_HEADERS });
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
	return Object.fromEntries(
		Object.entries(value).filter(([, entry]) => entry !== undefined)
	) as T;
}
