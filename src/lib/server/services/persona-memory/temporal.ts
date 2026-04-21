import type {
	PersonaMemoryClass,
	PersonaMemoryState,
	PersonaMemoryTemporalFreshness,
	PersonaMemoryTemporalInfo,
	PersonaMemoryTemporalKind,
	PersonaMemoryTopicStatus,
} from '$lib/types';
import { normalizeWhitespace } from '$lib/server/utils/text';
import type { HonchoPersonaMemoryRecord } from '../honcho';
import { normalizeMemoryText } from './classification';
import { DAY_MS } from '$lib/server/utils/constants';


function stripTrailingPunctuation(value: string): string {
	return normalizeWhitespace(value).replace(/[.!?]+$/, '');
}

const NUMBER_WORDS: Record<string, number> = {
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	eleven: 11,
	twelve: 12,
	couple: 2,
};

function parseNumberToken(value: string | undefined): number | null {
	if (!value) return null;
	const normalized = normalizeMemoryText(value);
	if (/^\d+$/.test(normalized)) {
		return Number(normalized);
	}
	return NUMBER_WORDS[normalized] ?? null;
}

function addDurationMs(base: number, amount: number, unit: string): number {
	const normalized = normalizeMemoryText(unit);
	if (normalized.startsWith('hour')) return base + amount * 60 * 60 * 1000;
	if (normalized.startsWith('week')) return base + amount * 7 * DAY_MS;
	if (normalized.startsWith('month')) return base + amount * 30 * DAY_MS;
	return base + amount * DAY_MS;
}

function formatIsoDate(timestamp: number): string {
	return new Date(timestamp).toISOString().slice(0, 10);
}

export { stripTrailingPunctuation };

/**
 * Detect whether text contains a resolved (completed/expired) temporal cue.
 */
export function hasResolvedTemporalCue(text: string): boolean {
	const normalized = normalizeMemoryText(text);
	return /\b(deadline passed|passed the deadline|finished|completed|submitted|done with|wrapped up|no longer|not time[- ]constrained anymore|got an extension|was extended)\b/.test(
		normalized
	);
}

/**
 * Parse relative expiry timing from text and compute an absolute expiry timestamp.
 */
export function resolveRelativeExpiryFromText(
	text: string,
	referenceTime: number,
): { expiresAt: number | null; relative: boolean } {
	const normalized = normalizeMemoryText(text);

	const durationMatch = normalized.match(
		/\b(?:in|within|for|next|only have|have|got|another)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple)(?:\s+more)?\s+(hours?|days?|weeks?|months?)\b/
	);
	if (durationMatch) {
		const amount = parseNumberToken(durationMatch[1]);
		if (amount) {
			return {
				expiresAt: addDurationMs(referenceTime, amount, durationMatch[2]),
				relative: true,
			};
		}
	}

	const remainingMatch = normalized.match(
		/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple)\s+(hours?|days?|weeks?|months?)\s+(?:left|remaining)\b/
	);
	if (remainingMatch) {
		const amount = parseNumberToken(remainingMatch[1]);
		if (amount) {
			return {
				expiresAt: addDurationMs(referenceTime, amount, remainingMatch[2]),
				relative: true,
			};
		}
	}

	if (/\btoday|tonight\b/.test(normalized)) {
		return { expiresAt: referenceTime + DAY_MS, relative: true };
	}
	if (/\btomorrow\b/.test(normalized)) {
		return { expiresAt: referenceTime + 2 * DAY_MS, relative: true };
	}
	if (/\bthis week\b/.test(normalized)) {
		return { expiresAt: referenceTime + 7 * DAY_MS, relative: true };
	}
	if (/\bnext week\b/.test(normalized)) {
		return { expiresAt: referenceTime + 14 * DAY_MS, relative: true };
	}

	return { expiresAt: null, relative: false };
}

/**
 * Compute temporal freshness category from expiry and resolution state.
 */
export function getTemporalFreshness(params: {
	expiresAt: number | null;
	resolved: boolean;
	now?: number;
}): PersonaMemoryTemporalFreshness {
	const now = params.now ?? Date.now();
	if (params.resolved) return 'historical';
	if (!params.expiresAt) return 'unknown';
	if (now >= params.expiresAt) return 'expired';
	if (params.expiresAt - now <= 2 * DAY_MS) return 'stale';
	return 'active';
}

/**
 * Build a historical phrasing for an expired temporal memory.
 */
export function buildHistoricalTemporalText(text: string, observedAt: number): string {
	return `As of ${formatIsoDate(observedAt)}, ${stripTrailingPunctuation(text)}.`;
}

/**
 * Derive topic status from memory class, state, and temporal metadata.
 */
export function deriveTopicStatus(params: {
	memoryClass: PersonaMemoryClass;
	state: PersonaMemoryState;
	temporal: PersonaMemoryTemporalInfo | null;
}): PersonaMemoryTopicStatus | null {
	if (
		params.temporal?.freshness === 'expired' ||
		params.temporal?.freshness === 'historical' ||
		params.state === 'archived'
	) {
		return 'historical';
	}
	if (
		params.memoryClass === 'short_term_constraint' ||
		params.memoryClass === 'active_project_context' ||
		params.memoryClass === 'situational_context'
	) {
		return params.state === 'dormant' ? 'dormant' : 'active';
	}
	return null;
}

/**
 * Derive temporal metadata from canonical text and records.
 */
export function derivePersonaMemoryTemporalInfo(params: {
	canonicalText: string;
	records: HonchoPersonaMemoryRecord[];
	memoryClass: PersonaMemoryClass;
	now?: number;
}): PersonaMemoryTemporalInfo | null {
	const now = params.now ?? Date.now();
	const latestRecordAt = Math.max(...params.records.map((record) => record.createdAt));
	const text = stripTrailingPunctuation(params.canonicalText);
	const resolved = hasResolvedTemporalCue(text);

	let kind: PersonaMemoryTemporalKind | null = null;
	if (params.memoryClass === 'short_term_constraint') {
		kind = 'deadline';
	} else if (params.memoryClass === 'active_project_context' || params.memoryClass === 'situational_context') {
		kind = 'project_window';
	} else if (params.memoryClass === 'perishable_fact') {
		kind = 'availability';
	}

	if (!kind) return null;

	const { expiresAt, relative } = resolveRelativeExpiryFromText(text, latestRecordAt);
	const freshness = getTemporalFreshness({ expiresAt, resolved, now });

	return {
		kind,
		freshness,
		observedAt: latestRecordAt,
		effectiveAt: latestRecordAt,
		expiresAt,
		relative,
		resolved,
	};
}

export type { PersonaMemoryTemporalInfo };