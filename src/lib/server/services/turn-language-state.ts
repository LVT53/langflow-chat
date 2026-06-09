import { detectLanguage, type SupportedLanguage } from './language';

export type LanguageDetectionConfidence = 'high' | 'medium' | 'low';

export type TurnLanguageState = {
	userLanguage: SupportedLanguage;
	responseLanguage: SupportedLanguage;
	explicitResponseLanguage: SupportedLanguage | null;
	confidence: LanguageDetectionConfidence;
	detectionReasons: string[];
	retrievalQueries: {
		original: string;
		normalized?: string;
	};
};

const HUNGARIAN_QUERY_STOPWORDS = new Set([
	'a',
	'az',
	'ez',
	'ezt',
	'egy',
	'és',
	'vagy',
	'hogy',
	'de',
	'ha',
	'akkor',
	'mert',
	'nem',
	'van',
	'volt',
	'lesz',
	'mi',
	'mit',
	'milyen',
	'hogyan',
	'hol',
	'mikor',
	'melyik',
	'keress',
	'keres',
	'rá',
	'ra',
	'korábbi',
	'korabbi',
	'beszélgetéseimben',
	'beszelgeteseimben',
	'kérlek',
	'kerlek'
]);

const HUNGARIAN_RETRIEVAL_SUFFIXES = [
	'nak',
	'nek',
	'ban',
	'ben',
	'val',
	'vel',
	'ból',
	'ből',
	'rol',
	'ról',
	'ről',
	'tól',
	'től',
	'hoz',
	'hez',
	'höz',
	'ért',
	'ként',
	'ra',
	're',
	'nál',
	'nél',
	'ul',
	'ül'
];

const HUNGARIAN_MARKERS = /[áéíóöőúüű]/i;
const HUNGARIAN_SHORT_SIGNAL_RE = /\b(mi|ez|nem|jó|jo|kell|igen|szia|köszi|koszi|oké|oke)\b/iu;
const EXPLICIT_ENGLISH_RESPONSE_RE =
	/(\b(in|as)\s+english\b|\benglish\s+(email|message|reply|answer|version|translation|text)\b|\bangolul\b|\bangol\s+(emailt|levelet|választ|valaszt|szöveget|szoveget|verziót|verziot)\b)/iu;
const EXPLICIT_HUNGARIAN_RESPONSE_RE =
	/(\b(in|as)\s+hungarian\b|\bhungarian\s+(language|version|translation|text)\b|\bmagyarul\b|\bmagyar\s+(nyelven|emailt|levelet|választ|valaszt|szöveget|szoveget|verziót|verziot)\b)/iu;

function tokenizeWords(text: string): string[] {
	return (text.toLowerCase().match(/[\p{L}]+/gu) ?? []).filter(Boolean);
}

function stripHungarianRetrievalSuffix(token: string): string {
	for (const suffix of HUNGARIAN_RETRIEVAL_SUFFIXES) {
		if (token.length > suffix.length + 4 && token.endsWith(suffix)) {
			return token.slice(0, -suffix.length);
		}
	}
	return token;
}

export function detectShortHungarianFollowUp(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed || trimmed.length >= 10) return false;
	return HUNGARIAN_SHORT_SIGNAL_RE.test(trimmed) || HUNGARIAN_MARKERS.test(trimmed);
}

export function normalizeHungarianRetrievalTerms(text: string): string[] {
	const terms = new Set<string>();
	for (const token of tokenizeWords(text)) {
		if (token.length < 2 || HUNGARIAN_QUERY_STOPWORDS.has(token)) continue;
		terms.add(token);
		const stripped = stripHungarianRetrievalSuffix(token);
		if (stripped !== token && stripped.length >= 3 && !HUNGARIAN_QUERY_STOPWORDS.has(stripped)) {
			terms.add(stripped);
		}
	}
	return Array.from(terms);
}

export function resolveExplicitResponseLanguage(text: string): SupportedLanguage | null {
	if (EXPLICIT_ENGLISH_RESPONSE_RE.test(text)) return 'en';
	if (EXPLICIT_HUNGARIAN_RESPONSE_RE.test(text)) return 'hu';
	return null;
}

function resolveUserLanguage(input: string): SupportedLanguage {
	return detectShortHungarianFollowUp(input) ? 'hu' : detectLanguage(input);
}

export function buildTurnLanguageState(input: string): TurnLanguageState {
	const userLanguage = resolveUserLanguage(input);
	const explicitResponseLanguage = resolveExplicitResponseLanguage(input);
	const responseLanguage = explicitResponseLanguage ?? userLanguage;
	const retrievalTerms = userLanguage === 'hu' ? normalizeHungarianRetrievalTerms(input) : [];

	return {
		userLanguage,
		responseLanguage,
		explicitResponseLanguage,
		confidence: detectShortHungarianFollowUp(input) ? 'high' : 'medium',
		detectionReasons: detectShortHungarianFollowUp(input)
			? ['short_hungarian_follow_up']
			: ['detected_by_language_service'],
		retrievalQueries: {
			original: input,
			...(retrievalTerms.length > 0 ? { normalized: retrievalTerms.join(' ') } : {})
		}
	};
}
