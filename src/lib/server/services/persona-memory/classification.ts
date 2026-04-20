import type { PersonaMemoryClass, PersonaMemoryDomain } from '$lib/types';
import { normalizeWhitespace } from '$lib/server/utils/text';

/**
 * Normalize text for memory classification matching.
 */
export function normalizeMemoryText(value: string): string {
	return normalizeWhitespace(value).toLowerCase();
}

function stripTrailingPeriod(value: string): string {
	return normalizeWhitespace(value).replace(/[.]+$/, '');
}

export { stripTrailingPeriod };

/**
 * Map a memory class to its domain category.
 */
export function getPersonaMemoryDomain(memoryClass: PersonaMemoryClass): PersonaMemoryDomain {
	if (memoryClass === 'stable_preference') return 'preference';
	if (
		memoryClass === 'short_term_constraint' ||
		memoryClass === 'active_project_context' ||
		memoryClass === 'situational_context' ||
		memoryClass === 'perishable_fact'
	) {
		return 'temporal';
	}
	return 'persona';
}

/**
 * Detect text patterns that indicate a short-term time constraint.
 */
export function hasShortTermConstraintCue(text: string): boolean {
	const normalized = normalizeMemoryText(text);
	return (
		/\b(deadline|due|time[- ]constrained|only have|time pressure|urgent|due date|must finish|need to finish|need to submit|submission)\b/.test(
			normalized
		) ||
	(/\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|couple)(?:\s+more)?\s+(hours?|days?|weeks?|months?)\b/.test(
				normalized
			) &&
			/\b(in|within|left|remaining|have|got|more|another)\b/.test(normalized))
	);
}

/**
 * Detect text patterns that indicate an active project context.
 */
export function hasActiveProjectCue(text: string): boolean {
	const normalized = normalizeMemoryText(text);
	return /\b(currently|right now|working on|building|preparing|writing|drafting|applying|shipping|finishing|completing)\b/.test(
		normalized
	);
}

/**
 * Classify a memory text into a persona memory class using deterministic
 * pattern matching. Used as a fallback when LLM classification is unavailable.
 */
export function classifyMemoryTextDeterministically(text: string): PersonaMemoryClass {
	const normalized = normalizeMemoryText(text);

	if (
		/\b(fridge|pantry|freezer|leftovers?|meal prep|grocery|groceries|available|today|tonight|this week|for dinner|for lunch|for breakfast|in stock|expir(?:e|es|ing))\b/.test(
			normalized
		) ||
		/\b(have|has)\b.+\b(fridge|pantry|freezer|leftovers?)\b/.test(normalized)
	) {
		return 'perishable_fact';
	}

	if (hasShortTermConstraintCue(normalized)) {
		return 'short_term_constraint';
	}

	if (hasActiveProjectCue(normalized)) {
		return 'active_project_context';
	}

	if (
		/\b(plan|planning|currently|right now|this month|this week|temporary|working on|applying|preparing)\b/.test(
			normalized
		)
	) {
		return 'situational_context';
	}

	if (
		/\b(prefers?|preferences?|likes|dislikes|favorite|usually|communication style|tone|writing style|framework|stack|toolchain|tooling)\b/.test(
			normalized
		)
	) {
		return 'stable_preference';
	}

	if (
		/\b(name is|i am|works as|studies|lives in|birthday|born|identity|profession|occupation)\b/.test(
			normalized
		)
	) {
		return 'identity_profile';
	}

	return 'long_term_context';
}

/**
 * Normalize memory class during dream synthesis — upgrade situational_context
 * to more specific temporal classes when cues are present.
 */
export function normalizeDreamMemoryClass(
	canonicalText: string,
	memoryClass: PersonaMemoryClass,
): PersonaMemoryClass {
	if (memoryClass !== 'situational_context') return memoryClass;
	if (hasShortTermConstraintCue(normalizeMemoryText(canonicalText))) return 'short_term_constraint';
	if (hasActiveProjectCue(normalizeMemoryText(canonicalText))) return 'active_project_context';
	return memoryClass;
}