import type {
	KnowledgeMemoryOverviewSource,
	KnowledgeMemoryOverviewStatus,
} from "$lib/types";

export interface BuildKnowledgeMemoryOverviewInput {
	rawOverview: string | null;
	rawOverviewSource?: Exclude<
		KnowledgeMemoryOverviewSource,
		"persona_fallback" | null
	>;
	personaFallbackTexts?: string[];
	durablePersonaCount: number;
	honchoEnabled: boolean;
	updatedAt?: number | null;
	attemptedAt: number | null;
	overviewUnavailable?: boolean;
}

export interface KnowledgeMemoryOverviewContract {
	overview: string | null;
	overviewBullets: string[];
	overviewSource: KnowledgeMemoryOverviewSource;
	overviewStatus: KnowledgeMemoryOverviewStatus;
	overviewUpdatedAt: number | null;
	overviewLastAttemptAt: number | null;
	durablePersonaCount: number;
}

const MEMORY_OVERVIEW_BULLET_LIMIT = 40;
const MEMORY_OVERVIEW_TIMESTAMP_RE = /\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\]/g;
const MEMORY_OVERVIEW_SECTION_LABEL_RE =
	/^(?:#{1,6}\s*)?(?:explicit\s+observations?|observations?|memory\s+overview|memory\s+profile|scoped\s+user\s+memory\s+from\s+honcho\s+conclusions?)\s*[:\-–—]?\s*/i;
const PHONE_LIKE_VALUE_RE = /(^|[^\w/])(\+?\d[\d\s().-]{7,}\d)(?=$|[^\w/])/g;
const EMAIL_VALUE_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const SENSITIVE_NAMED_VALUE_RE =
	/\b(api[_-]?key|token|secret|password|credential)(\s*(?:is|=|:)\s*)["']?[A-Za-z0-9._~+/=-]{8,}["']?/gi;

function stripMemoryOverviewSectionLabel(value: string): string {
	let cleaned = value.trim();
	for (let index = 0; index < 3; index += 1) {
		const next = cleaned.replace(MEMORY_OVERVIEW_SECTION_LABEL_RE, "").trim();
		if (next === cleaned) break;
		cleaned = next;
	}
	return cleaned;
}

function normalizeMemoryOverviewBullet(value: string): string | null {
	const cleaned = softenSensitiveMemoryValues(
		stripMemoryOverviewSectionLabel(
			value
				.trim()
				.replace(/^["“”]+|["“”]+$/g, "")
				.replace(MEMORY_OVERVIEW_TIMESTAMP_RE, "")
				.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, "")
				.replace(/^\s*#{1,6}\s*/, ""),
		).replace(/\s+/g, " "),
	).trim();

	return cleaned ? cleaned : null;
}

function softenSensitiveMemoryValues(value: string): string {
	return value
		.replace(EMAIL_VALUE_RE, "[email address]")
		.replace(SENSITIVE_NAMED_VALUE_RE, "$1$2[redacted]")
		.replace(
			PHONE_LIKE_VALUE_RE,
			(match, prefix: string, phoneValue: string) => {
				const digitCount = phoneValue.replace(/\D/g, "").length;
				if (digitCount < 8 || digitCount > 15) return match;
				return `${prefix}[phone number]`;
			},
		);
}

function normalizeKnowledgeMemoryOverviewBullets(raw: string | null): string[] {
	const source = stripMemoryOverviewSectionLabel(
		(raw ?? "").replace(/\r/g, "\n"),
	).trim();
	if (!source) return [];

	const hasTimestampedObservations = Boolean(
		source.match(MEMORY_OVERVIEW_TIMESTAMP_RE),
	);
	const segments = hasTimestampedObservations
		? source.split(/(?=\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\])/g)
		: source.split(/\n+/g);
	const bullets: string[] = [];
	const seen = new Set<string>();

	for (const segment of segments) {
		const bullet = normalizeMemoryOverviewBullet(segment);
		if (!bullet || seen.has(bullet)) continue;
		seen.add(bullet);
		bullets.push(bullet);
		if (bullets.length >= MEMORY_OVERVIEW_BULLET_LIMIT) break;
	}

	return bullets;
}

export function buildKnowledgeMemoryOverview(
	input: BuildKnowledgeMemoryOverviewInput,
): KnowledgeMemoryOverviewContract {
	if (!input.honchoEnabled) {
		return {
			overview: null,
			overviewBullets: [],
			overviewSource: null,
			overviewStatus: "disabled",
			overviewUpdatedAt: null,
			overviewLastAttemptAt: null,
			durablePersonaCount: input.durablePersonaCount,
		};
	}

	const overviewBullets = normalizeKnowledgeMemoryOverviewBullets(
		input.rawOverview,
	);
	const personaFallbackBullets =
		overviewBullets.length > 0 || !input.overviewUnavailable
			? []
			: normalizeKnowledgeMemoryOverviewBullets(
					(input.personaFallbackTexts ?? []).join("\n"),
				);
	const appReadyBullets =
		overviewBullets.length > 0 ? overviewBullets : personaFallbackBullets;
	const isPersonaFallback =
		overviewBullets.length === 0 && personaFallbackBullets.length > 0;
	const overview =
		appReadyBullets.length > 0 ? appReadyBullets.join("\n") : null;
	const overviewStatus = overview
		? input.overviewUnavailable
			? "temporarily_unavailable"
			: "ready"
		: input.overviewUnavailable
			? "temporarily_unavailable"
			: "not_enough_durable_memory";

	return {
		overview,
		overviewBullets: appReadyBullets,
		overviewSource: overview
			? isPersonaFallback
				? "persona_fallback"
				: (input.rawOverviewSource ?? "honcho_scoped")
			: null,
		overviewStatus,
		overviewUpdatedAt:
			overview && !isPersonaFallback
				? (input.updatedAt ?? input.attemptedAt)
				: null,
		overviewLastAttemptAt: input.honchoEnabled ? input.attemptedAt : null,
		durablePersonaCount: input.durablePersonaCount,
	};
}
