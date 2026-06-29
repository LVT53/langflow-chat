export const SERVER_STREAM_TIMELINE_MARKS = {
	ROUTE_PARSE: "route_parse",
	CAPACITY: "capacity",
	ADMISSION: "admission",
	PRELUDE: "prelude",
	TURN_PREPARATION: "turn_preparation",
	MODEL_STREAM_REQUEST: "model_stream_request",
	FIRST_UPSTREAM_EVENT: "first_upstream_event",
	FIRST_THINKING: "first_thinking",
	FIRST_VISIBLE_TOKEN: "first_visible_token",
	END: "end",
} as const;

export type ServerStreamTimelineMark =
	(typeof SERVER_STREAM_TIMELINE_MARKS)[keyof typeof SERVER_STREAM_TIMELINE_MARKS];

export const BROWSER_STREAM_TIMING_MARKS = {
	FETCH_START: "fetchStartMs",
	RESPONSE_HEADERS: "responseHeadersMs",
	FIRST_BYTE: "firstByteMs",
	FIRST_RESPONSE_ACTIVITY: "firstActivityMs",
	FIRST_THINKING: "firstThinkingMs",
	FIRST_TOOL_CALL: "firstToolCallMs",
	FIRST_TOKEN: "firstTokenMs",
	END: "endMs",
	STOP: "stopMs",
	ERROR: "errorMs",
} as const;

export type BrowserStreamTimingMark =
	(typeof BROWSER_STREAM_TIMING_MARKS)[keyof typeof BROWSER_STREAM_TIMING_MARKS];

export const RESPONSE_ACTIVITY_IDS = {
	DEPTH_SELECTED: "depth-selected",
	CONTEXT_PREPARING: "context-preparing",
	CONTEXT_READY: "context-ready",
	DRAFTING_ANSWER: "drafting-answer",
} as const;

export type StaticResponseActivityId =
	(typeof RESPONSE_ACTIVITY_IDS)[keyof typeof RESPONSE_ACTIVITY_IDS];
export type FallbackResponseActivityId = `fallback:${string}:${number}`;
export type ResponseActivityId =
	| StaticResponseActivityId
	| FallbackResponseActivityId;

export type StreamTimelineTimingRecord<Mark extends string = string> = Partial<
	Record<Mark, number>
>;

export type StreamTimelineTimingInput<Mark extends string = string> = Partial<
	Record<Mark, unknown>
>;

export type BrowserStreamTimingRecord = {
	fetchStartMs: number;
	responseHeadersMs?: number;
	firstByteMs?: number;
	firstActivityMs?: number;
	firstThinkingMs?: number;
	firstToolCallMs?: number;
	firstTokenMs?: number;
	endMs?: number;
	stopMs?: number;
	errorMs?: number;
};

export const STREAM_TIMELINE_PAYLOAD_VERSION = 1;

export type StreamTimelineTerminalPayload = {
	version: typeof STREAM_TIMELINE_PAYLOAD_VERSION;
	server: StreamTimelineTimingRecord;
};

export function createFallbackResponseActivityId(
	reason: string,
	attempt: number,
): FallbackResponseActivityId {
	return `fallback:${reason}:${attempt}` as FallbackResponseActivityId;
}

export function normalizeStreamTimelineDurationMs(
	value: unknown,
): number | undefined {
	const durationMs =
		typeof value === "number"
			? value
			: typeof value === "string" && value.trim()
				? Number(value)
				: undefined;

	if (durationMs === undefined) return undefined;
	if (!Number.isFinite(durationMs) || durationMs < 0) return undefined;
	return durationMs;
}

export function recordElapsedStreamTimelineMark<Mark extends string>(
	timings: StreamTimelineTimingRecord<Mark>,
	mark: Mark,
	timelineStartMs: number,
	nowMs: number,
): boolean {
	if (!Number.isFinite(timelineStartMs) || !Number.isFinite(nowMs)) {
		return false;
	}
	return recordDurationStreamTimelineMark(
		timings,
		mark,
		Math.max(0, nowMs - timelineStartMs),
	);
}

export function recordDurationStreamTimelineMark<Mark extends string>(
	timings: StreamTimelineTimingRecord<Mark>,
	mark: Mark,
	durationMs: unknown,
): boolean {
	if (timings[mark] !== undefined) return false;
	const normalizedDurationMs = normalizeStreamTimelineDurationMs(durationMs);
	if (normalizedDurationMs === undefined) return false;
	timings[mark] = normalizedDurationMs;
	return true;
}

export function normalizeStreamTimelineTimings<Mark extends string>(
	timings: StreamTimelineTimingInput<Mark>,
): StreamTimelineTimingRecord<Mark> {
	const normalized: StreamTimelineTimingRecord<Mark> = {};
	for (const [mark, durationMs] of Object.entries(timings) as Array<
		[Mark, unknown]
	>) {
		const normalizedDurationMs = normalizeStreamTimelineDurationMs(durationMs);
		if (normalizedDurationMs !== undefined) {
			normalized[mark] = normalizedDurationMs;
		}
	}
	return normalized;
}

export function formatServerTimingHeader(
	timings: StreamTimelineTimingInput,
): string {
	return Object.entries(timings)
		.filter(([, durationMs]) => {
			return normalizeStreamTimelineDurationMs(durationMs) !== undefined;
		})
		.map(([name, durationMs]) => {
			const normalizedDurationMs =
				normalizeStreamTimelineDurationMs(durationMs) ?? 0;
			return `${name};dur=${normalizedDurationMs.toFixed(1)}`;
		})
		.join(", ");
}

export function parseServerTimingHeader(
	header: string | null | undefined,
): StreamTimelineTimingRecord {
	if (!header?.trim()) return {};
	const timings: StreamTimelineTimingRecord = {};
	for (const metric of splitHeaderValue(header, ",")) {
		const [rawName, ...rawParameters] = splitHeaderValue(metric, ";");
		const name = rawName?.trim();
		if (!name || timings[name] !== undefined) continue;
		const durationMs = parseServerTimingDuration(rawParameters);
		if (durationMs !== undefined) {
			timings[name] = durationMs;
		}
	}
	return timings;
}

export function createTerminalStreamTimelinePayload(
	serverTimings: StreamTimelineTimingInput,
): StreamTimelineTerminalPayload {
	return {
		version: STREAM_TIMELINE_PAYLOAD_VERSION,
		server: normalizeStreamTimelineTimings(serverTimings),
	};
}

function parseServerTimingDuration(parameters: string[]): number | undefined {
	for (const parameter of parameters) {
		const equalsIndex = parameter.indexOf("=");
		if (equalsIndex < 0) continue;
		const key = parameter.slice(0, equalsIndex).trim().toLowerCase();
		if (key !== "dur") continue;
		return normalizeStreamTimelineDurationMs(
			parameter.slice(equalsIndex + 1).trim(),
		);
	}
	return undefined;
}

function splitHeaderValue(value: string, separator: "," | ";"): string[] {
	const parts: string[] = [];
	let current = "";
	let insideQuote = false;
	let escaping = false;

	for (const character of value) {
		if (escaping) {
			current += character;
			escaping = false;
			continue;
		}
		if (insideQuote && character === "\\") {
			current += character;
			escaping = true;
			continue;
		}
		if (character === '"') {
			insideQuote = !insideQuote;
			current += character;
			continue;
		}
		if (!insideQuote && character === separator) {
			parts.push(current);
			current = "";
			continue;
		}
		current += character;
	}
	parts.push(current);
	return parts;
}
