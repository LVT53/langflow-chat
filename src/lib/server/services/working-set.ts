import type {
	ArtifactType,
	WorkingSetReasonCode,
	WorkingSetState,
} from '$lib/types';

export const WORKING_SET_ACTIVE_LIMIT = 6;
export const WORKING_SET_DOCUMENT_LIMIT = 4;
export const WORKING_SET_OUTPUT_LIMIT = 2;
export const WORKING_SET_PROMPT_LIMIT = 4;

export interface WorkingSetCandidate {
	artifactId: string;
	artifactType: Exclude<ArtifactType, 'work_capsule'>;
	name: string;
	summary: string | null;
	contentText: string | null;
	updatedAt: number;
	previousScore?: number;
	previousState?: WorkingSetState | null;
	isAttachedThisTurn?: boolean;
	isActiveDocumentFocus?: boolean;
	isCurrentGeneratedDocument?: boolean;
	isLatestGeneratedOutput?: boolean;
	isLinkedToLatestOutput?: boolean;
	messageMatchScore?: number;
}

export interface RankedWorkingSetItem {
	artifactId: string;
	artifactType: Exclude<ArtifactType, 'work_capsule'>;
	score: number;
	state: WorkingSetState;
	reasonCodes: WorkingSetReasonCode[];
	selected: boolean;
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

export function scoreMatch(query: string, haystack: string): number {
	const terms = query
		.toLowerCase()
		.split(/\s+/)
		.map((term) => term.trim())
		.filter((term) => term.length > 2);
	if (terms.length === 0) return 0;
	const target = haystack.toLowerCase();
	return terms.reduce((score, term) => score + (target.includes(term) ? 1 : 0), 0);
}

function scoreCandidate(candidate: WorkingSetCandidate): RankedWorkingSetItem {
	const reasonCodes: WorkingSetReasonCode[] = [];
	let score = Math.round((candidate.previousScore ?? 0) * 0.25);

	if ((candidate.previousScore ?? 0) > 0 && candidate.previousState === 'active') {
		score += 3;
		reasonCodes.push('persisted_from_previous_turn');
	}

	if (candidate.isAttachedThisTurn) {
		score += 100;
		reasonCodes.push('attached_this_turn');
	}

	if (candidate.isActiveDocumentFocus) {
		score += 92;
		reasonCodes.push('active_document_focus');
	}

	if (candidate.isCurrentGeneratedDocument) {
		score += 54;
		reasonCodes.push('current_generated_document');
	}

	if (candidate.isLatestGeneratedOutput) {
		score += 54;
		reasonCodes.push('latest_generated_output');
	}

	if (candidate.isLinkedToLatestOutput) {
		score += 34;
		reasonCodes.push('recently_used_in_output');
	}

	const matchBoost = clamp((candidate.messageMatchScore ?? 0) * 15, 0, 60);
	if (matchBoost > 0) {
		score += matchBoost;
		reasonCodes.push('matched_current_turn');
	}

	return {
		artifactId: candidate.artifactId,
		artifactType: candidate.artifactType,
		score,
		state: 'cooling',
		reasonCodes,
		selected: false,
	};
}

export function rankWorkingSetCandidates(candidates: WorkingSetCandidate[]): RankedWorkingSetItem[] {
	const ranked = candidates
		.map(scoreCandidate)
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return a.artifactId.localeCompare(b.artifactId);
		});

	const selectedIds = new Set<string>();
	let documentCount = 0;
	let outputCount = 0;

	for (const item of ranked) {
		if (selectedIds.size >= WORKING_SET_ACTIVE_LIMIT) break;
		if (item.score < 20) continue;

		if (item.artifactType === 'generated_output') {
			if (outputCount >= WORKING_SET_OUTPUT_LIMIT) continue;
			outputCount += 1;
		} else {
			if (documentCount >= WORKING_SET_DOCUMENT_LIMIT) continue;
			documentCount += 1;
		}

		selectedIds.add(item.artifactId);
	}

	return ranked.map((item) => ({
		...item,
		selected: selectedIds.has(item.artifactId),
		state: selectedIds.has(item.artifactId) ? 'active' : 'cooling',
	}));
}
