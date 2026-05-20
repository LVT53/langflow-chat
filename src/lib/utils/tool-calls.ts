import type { ThinkingSegment } from "$lib/types";

function normalizeForStableJson(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(normalizeForStableJson);
	}
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, normalizeForStableJson(entry)]),
		);
	}
	return value;
}

export function toolCallInputKey(input: Record<string, unknown> = {}): string {
	try {
		return JSON.stringify(normalizeForStableJson(input));
	} catch {
		return "";
	}
}

export function isFileProductionToolName(name: string): boolean {
	const normalized = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_");
	return (
		normalized === "produce_file" ||
		normalized === "producefile" ||
		normalized.includes("file_production")
	);
}

export function isVisibleThinkingToolCall(
	segment: ThinkingSegment,
): segment is ThinkingSegment & { type: "tool_call" } {
	return (
		segment.type === "tool_call" && !isFileProductionToolName(segment.name)
	);
}

export function isVisibleThinkingSegment(segment: ThinkingSegment): boolean {
	if (segment.type === "text") {
		return segment.content.trim().length > 0;
	}
	return isVisibleThinkingToolCall(segment);
}
