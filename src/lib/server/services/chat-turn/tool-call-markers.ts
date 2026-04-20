import type { EvidenceSourceType, ToolEvidenceCandidate } from '$lib/types';

const TOOL_CALL_START_RE = /\u0002TOOL_START\u001f([^\u0003]*)\u0003/g;
const TOOL_CALL_END_RE = /\u0002TOOL_END\u001f([^\u0003]*)\u0003/g;

export { TOOL_CALL_START_RE, TOOL_CALL_END_RE };

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

function normalizeToolCandidates(value: unknown): ToolEvidenceCandidate[] {
	if (!Array.isArray(value)) return [];

	return value
		.map((candidate, index) => {
			if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
				return null;
			const record = candidate as Record<string, unknown>;
			const id =
				typeof record.id === 'string' && record.id.trim()
					? record.id
					: `candidate-${index}`;
			const title =
				typeof record.title === 'string' && record.title.trim()
					? record.title.trim()
					: typeof record.url === 'string'
						? record.url
						: null;
			if (!title) return null;
			return {
				id,
				title,
				url: typeof record.url === 'string' ? record.url : null,
				snippet: typeof record.snippet === 'string' ? record.snippet : null,
				sourceType:
					record.sourceType === 'web' ||
					record.sourceType === 'tool' ||
					record.sourceType === 'document' ||
					record.sourceType === 'memory'
						? record.sourceType
						: 'tool',
			} as ToolEvidenceCandidate;
		})
		.filter((candidate): candidate is ToolEvidenceCandidate => Boolean(candidate));
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
		status: 'running' | 'done',
		details?: StreamToolCallDetails,
	) => void,
): string {
	let result = chunk;

	result = result.replace(TOOL_CALL_START_RE, (_, payload) => {
		try {
			const parsed = JSON.parse(payload) as StreamToolCallPayload;
			emit(parsed.name ?? 'tool', parsed.input ?? {}, 'running');
		} catch {
			emit('tool', {}, 'running');
		}
		return '';
	});

	result = result.replace(TOOL_CALL_END_RE, (_, payload) => {
		try {
			const parsed = JSON.parse(payload) as StreamToolCallPayload;
			emit(parsed.name ?? 'tool', {}, 'done', {
				outputSummary:
					typeof parsed.outputSummary === 'string'
						? parsed.outputSummary
						: null,
				sourceType:
					parsed.sourceType === 'web' ||
					parsed.sourceType === 'tool' ||
					parsed.sourceType === 'document' ||
					parsed.sourceType === 'memory'
						? parsed.sourceType
						: null,
				candidates: normalizeToolCandidates(parsed.candidates),
			});
		} catch {
			emit('tool', {}, 'done');
		}
		return '';
	});

	return result;
}