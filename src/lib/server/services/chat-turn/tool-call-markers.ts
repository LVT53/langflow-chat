import type { EvidenceSourceType, ToolEvidenceCandidate } from "$lib/types";

// biome-ignore lint/suspicious/noControlCharactersInRegex: Tool-call framing uses control characters as sentinels.
const TOOL_CALL_START_RE = /\u0002TOOL_START\u001f([^\u0003]*)\u0003/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Tool-call framing uses control characters as sentinels.
const TOOL_CALL_END_RE = /\u0002TOOL_END\u001f([^\u0003]*)\u0003/g;

export { TOOL_CALL_END_RE, TOOL_CALL_START_RE };

export type StreamToolCallDetails = {
	outputSummary?: string | null;
	sourceType?: EvidenceSourceType | null;
	candidates?: ToolEvidenceCandidate[];
};

type StreamToolCallPayload = {
	name?: string;
	input?: Record<string, unknown>;
	outputSummary?: string;
	sourceType?: string;
	candidates?: unknown;
};

function normalizeEvidenceSourceType(
	value: unknown,
): EvidenceSourceType | null {
	if (
		value === "web" ||
		value === "tool" ||
		value === "document" ||
		value === "memory"
	) {
		return value;
	}
	return null;
}

function normalizeToolCandidates(
	value: unknown,
	defaultSourceType: EvidenceSourceType | null = null,
): ToolEvidenceCandidate[] {
	if (!Array.isArray(value)) return [];

	return value
		.map((candidate, index) => {
			if (
				!candidate ||
				typeof candidate !== "object" ||
				Array.isArray(candidate)
			)
				return null;
			const record = candidate as Record<string, unknown>;
			const id =
				typeof record.id === "string" && record.id.trim()
					? record.id
					: `candidate-${index}`;
			const title =
				typeof record.title === "string" && record.title.trim()
					? record.title.trim()
					: typeof record.url === "string"
						? record.url
						: null;
			if (!title) return null;
			return {
				id,
				title,
				url: typeof record.url === "string" ? record.url : null,
				snippet: typeof record.snippet === "string" ? record.snippet : null,
				sourceType:
					normalizeEvidenceSourceType(record.sourceType) ??
					defaultSourceType ??
					"tool",
			} as ToolEvidenceCandidate;
		})
		.filter((candidate): candidate is ToolEvidenceCandidate =>
			Boolean(candidate),
		);
}

/**
 * Process tool call marker sequences within a chunk, emitting parsed tool call
 * events and returning the chunk with markers stripped.
 */
export function processToolCallMarkers(
	chunk: string,
	emit: (
		name: string,
		input: Record<string, unknown>,
		status: "running" | "done",
		details?: StreamToolCallDetails,
	) => void,
): string {
	let result = chunk;

	result = result.replace(TOOL_CALL_START_RE, (_, payload) => {
		try {
			const parsed = JSON.parse(payload) as StreamToolCallPayload;
			emit(parsed.name ?? "tool", parsed.input ?? {}, "running");
		} catch {
			emit("tool", {}, "running");
		}
		return "";
	});

	result = result.replace(TOOL_CALL_END_RE, (_, payload) => {
		try {
			const parsed = JSON.parse(payload) as StreamToolCallPayload;
			const sourceType = normalizeEvidenceSourceType(parsed.sourceType);
			emit(parsed.name ?? "tool", {}, "done", {
				outputSummary:
					typeof parsed.outputSummary === "string"
						? parsed.outputSummary
						: null,
				sourceType,
				candidates: normalizeToolCandidates(parsed.candidates, sourceType),
			});
		} catch {
			emit("tool", {}, "done");
		}
		return "";
	});

	return result;
}
